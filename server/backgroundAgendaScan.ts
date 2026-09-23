import { query } from './db.js';
import {
  getValidAccessToken,
  ensureBackgroundSyncSchema,
  prefsFromRow,
  type NotifyChannel,
  type NotifyPrefsColumns,
} from './googleOAuthTokenStore.js';
import { isUpdateDue, lookbackMs } from './notifySchedule.js';
import { recordFindings, markFindingsNotified } from './agendaFindingsStore.js';
import { isEmailConfigured, sendEmail } from './emailService.js';
import { TelegramSessionStore } from './telegramStore.js';
import { TelegramService } from './telegramService.js';
import { listTasksNeedingAttention, listOpenDecisions } from './dailyDigestData.js';
import { hasUpdateContent, renderEmailUpdate, renderTelegramUpdate, type DailyUpdateModel } from './dailyUpdateTemplate.js';
import { detectEventCategory } from '../src/utils/tminusRules.js';
import { generateDeterministicMilestones } from '../src/utils/deterministicMilestoneGenerator.js';
import type { CalendarEvent } from '../src/types.js';

/**
 * Daily background agenda scan ("Auto Sync & Notify").
 *
 * For every user who linked background sync (server-held Google refresh
 * token): look at the calendar events created since the last pass, keep the
 * ones that look like they need prep, and tell the user ONCE, over the
 * channel they picked - Telegram, a daily email with each event's prep plan,
 * or (the fallback for everyone else) a notice in the app, which reads the
 * findings this scan records. Nothing is written to the user's calendar or
 * event list here - the user reviews and imports in the app, exactly like a
 * manual scan.
 *
 * Triggered once a day by Vercel Cron (api/cron/[job].ts).
 */

export interface GoogleCalendarItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  eventType?: string;
  created?: string;
  start?: { date?: string; dateTime?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

export interface PrepStep {
  date: string; // YYYY-MM-DD
  title: string;
}

export interface ScanCandidate {
  googleEventId: string;
  title: string;
  eventDate: string; // YYYY-MM-DD
  prepSteps: number;
  steps: PrepStep[];
}

export interface AgendaScanSummary {
  dryRun: boolean;
  usersChecked: number;
  /** Skipped because their chosen day/time has not come round yet. */
  usersNotDue: number;
  /** Told over Telegram or email. */
  usersNotified: number;
  /** Findings left as an in-app notice (no external channel available/chosen). */
  usersInAppOnly: number;
  eventsReported: number;
  skippedNoToken: number;
  failed: number;
  timedOut: boolean;
  /** Dry run only: what each user WOULD have received. */
  previews?: string[];
}

// Same routine-entry rules as ScanAgendaModal.tsx's manual scan, minus the
// onboarding-profile calibration (the profile lives in the browser, which a
// cron can't read).
const WORK_ROUTINE = /standup|1:1|sync|weekly|daily|scrum|catchup|status check|office hours|all hands|retrospective|retro\b/i;
const PERSONAL_ROUTINE = /dentist|cleaning|doctor|vet\b|haircut|dry clean/i;
// Google's own non-plans: working-location markers, OOO, focus blocks and
// the automatic contact-birthday entries.
const SKIPPED_EVENT_TYPES = new Set(['workingLocation', 'outOfOffice', 'focusTime', 'birthday']);

const MIN_DAYS_AHEAD = 2;
const SCAN_WINDOW_MONTHS = 6;
const MAX_PAGES = 4;

function toDateOnly(item: GoogleCalendarItem): string {
  return (item.start?.dateTime || item.start?.date || '').substring(0, 10);
}

function daysBetween(fromIso: string, toDateStr: string): number {
  const from = Date.parse(`${fromIso.substring(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toDateStr}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Whether a calendar entry looks like something worth prepping for. */
export function isPrepWorthy(item: GoogleCalendarItem, now: Date): boolean {
  const title = (item.summary || '').trim();
  if (!title) return false;
  if (item.status === 'cancelled') return false;
  if (item.eventType && SKIPPED_EVENT_TYPES.has(item.eventType)) return false;
  if (item.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return false;

  const eventDate = toDateOnly(item);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return false;
  if (daysBetween(now.toISOString(), eventDate) < MIN_DAYS_AHEAD) return false;

  if (WORK_ROUTINE.test(title) || PERSONAL_ROUTINE.test(title)) return false;
  return true;
}

export function toCandidate(item: GoogleCalendarItem): ScanCandidate {
  const title = (item.summary || '').trim();
  const eventDate = toDateOnly(item);
  const startStr = item.start?.dateTime || '';
  let steps: PrepStep[] = [];
  try {
    const tempEvent: CalendarEvent = {
      id: `scan-${item.id}`,
      title,
      eventDate,
      eventTime: startStr.includes('T') ? startStr.substring(11, 16) : '10:00',
      category: detectEventCategory(title, item.description || ''),
      status: 'milestones_active',
      needsRefinement: true,
      location: item.location || '',
      context: {},
      milestones: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    steps = generateDeterministicMilestones({
      eventId: tempEvent.id,
      title: tempEvent.title,
      eventDate: tempEvent.eventDate,
      eventTime: tempEvent.eventTime,
      location: tempEvent.location,
      category: tempEvent.category,
      context: tempEvent.context,
    })
      .map((m) => ({ date: m.calculatedDate.substring(0, 10), title: m.title }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    // The plan preview is a nicety in the message, never a reason to drop the event.
  }
  return { googleEventId: item.id, title, eventDate, prepSteps: steps.length, steps };
}

async function fetchNewCalendarItems(accessToken: string, since: Date, now: Date): Promise<GoogleCalendarItem[]> {
  const timeMax = new Date(now);
  timeMax.setMonth(timeMax.getMonth() + SCAN_WINDOW_MONTHS);

  const collected: GoogleCalendarItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      // updatedMin keeps the response small; the created check below is what
      // decides "new" (an old event someone merely edited must not count).
      updatedMin: since.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google Calendar list failed with ${res.status}`);
    }
    const data = await res.json();
    for (const item of (data.items || []) as GoogleCalendarItem[]) {
      if (item.created && Date.parse(item.created) > since.getTime()) collected.push(item);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return collected;
}

interface LinkedUserRow extends NotifyPrefsColumns {
  user_id: string;
  email: string;
  linked_at: string;
  last_agenda_scan_at: string | null;
  last_update_sent_at: string | null;
}

export interface ResolvedChannels {
  /** External channels that can actually deliver right now. */
  deliver: Array<'telegram' | 'email'>;
  /** Also (or only) show new events as a notice in the app. */
  inApp: boolean;
}

/**
 * The user's chosen channels (any combination), narrowed to what can deliver
 * right now: Telegram needs a paired chat, email needs the deployment set up.
 * Nothing chosen means "automatic" - Telegram if paired, else the app. If none
 * of the chosen external channels can deliver, the app notice takes over
 * rather than the news being dropped.
 */
export function resolveChannels(
  chosen: NotifyChannel[],
  telegramChatId: string | number | undefined,
  emailAvailable: boolean
): ResolvedChannels {
  const wanted: NotifyChannel[] = chosen.length > 0 ? chosen : [telegramChatId ? 'telegram' : 'in_app'];
  const deliver = wanted.filter((c): c is 'telegram' | 'email' =>
    c === 'telegram' ? Boolean(telegramChatId) : c === 'email' ? emailAvailable : false
  );
  return { deliver, inApp: wanted.includes('in_app') || deliver.length === 0 };
}

export async function runBackgroundAgendaScan(
  options: { now?: Date; appUrl?: string; dryRun?: boolean; budgetMs?: number } = {}
): Promise<AgendaScanSummary> {
  const started = Date.now();
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  // Vercel Hobby functions default to a 10s limit: stop cleanly before it and
  // let the users we did not reach go first next run (their timestamp is
  // untouched, so nothing is lost).
  const budgetMs = options.budgetMs ?? 8000;
  const appUrl = (options.appUrl || '').replace(/\/+$/, '');

  await ensureBackgroundSyncSchema();

  const users = await query<LinkedUserRow>(
    `SELECT t.user_id, u.email, t.linked_at, t.last_agenda_scan_at, t.last_update_sent_at,
            t.notify_channel, t.notify_channels, t.notify_frequency, t.notify_hour, t.notify_weekday, t.notify_timezone
       FROM google_oauth_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.revoked_at IS NULL
      ORDER BY t.last_update_sent_at ASC NULLS FIRST`
  );

  const summary: AgendaScanSummary = {
    dryRun,
    usersChecked: 0,
    usersNotDue: 0,
    usersNotified: 0,
    usersInAppOnly: 0,
    eventsReported: 0,
    skippedNoToken: 0,
    failed: 0,
    timedOut: false,
    ...(dryRun ? { previews: [] as string[] } : {}),
  };

  for (const user of users) {
    if (Date.now() - started > budgetMs) {
      summary.timedOut = true;
      break;
    }
    summary.usersChecked++;

    try {
      // Each user picked how often and at what local time. The job may run
      // once a day or hourly; a user is only handled when their slot has
      // arrived and nothing went out since (a dry run previews everyone).
      const { prefs } = prefsFromRow(user);
      const lastSent = user.last_update_sent_at ? Date.parse(user.last_update_sent_at) : null;
      if (!dryRun && !isUpdateDue(now.getTime(), prefs, lastSent)) {
        summary.usersNotDue++;
        continue;
      }

      const accessToken = await getValidAccessToken(user.user_id);
      if (!accessToken) {
        summary.skippedNoToken++;
        continue;
      }

      const lastPass = Date.parse(user.last_agenda_scan_at || user.linked_at);
      const since = new Date(Math.max(lastPass, now.getTime() - lookbackMs(prefs.frequency)));

      const items = await fetchNewCalendarItems(accessToken, since, now);
      const candidates = items.filter((item) => isPrepWorthy(item, now)).map(toCandidate);

      const session = await TelegramSessionStore.getLinkedSessionForWebUser(user.email);
      const { deliver, inApp } = resolveChannels(prefs.channels, session?.chatId, isEmailConfigured());

      // The update also carries the user's own overdue / due-this-week tasks
      // (from the synced event list). Those only go out over Telegram or email
      // - the in-app notice is about NEW calendar events alone.
      const tasks =
        deliver.length === 0 ? { overdue: [], dueThisWeek: [] } : await listTasksNeedingAttention(user.user_id, now.toISOString());
      const openDecisions = deliver.length === 0 ? [] : await listOpenDecisions(user.user_id, now.toISOString());
      const model: DailyUpdateModel = {
        today: now.toISOString().substring(0, 10),
        overdue: tasks.overdue,
        dueThisWeek: tasks.dueThisWeek,
        openDecisions,
        newEvents: candidates,
        appUrl,
      };
      const shouldSend = deliver.length === 0 ? candidates.length > 0 : hasUpdateContent(model);

      if (shouldSend) {
        if (dryRun) {
          for (const channel of deliver) {
            if (channel === 'email') {
              const mail = renderEmailUpdate(model);
              summary.previews!.push(`[email] ${mail.subject}\n\n${mail.text}`);
            } else {
              summary.previews!.push(`[telegram]\n${renderTelegramUpdate(model).text}`);
            }
          }
          if (deliver.length === 0) summary.usersInAppOnly++;
          else summary.usersNotified++;
          summary.eventsReported += candidates.length;
          continue;
        }

        // Always record new events: the in-app notice reads these, and skips
        // the ones an external channel delivered (notified_via below) unless
        // the user also asked for the app notice.
        if (candidates.length > 0) {
          await recordFindings(
            user.user_id,
            candidates.map((c) => ({
              googleEventId: c.googleEventId,
              title: c.title,
              eventDate: c.eventDate,
              prepSteps: c.prepSteps,
            }))
          );
        }
        const candidateIds = candidates.map((c) => c.googleEventId);

        let delivered: 'telegram' | 'email' | null = null;
        for (const channel of deliver) {
          let ok = false;
          if (channel === 'telegram') {
            const update = renderTelegramUpdate(model);
            const sent = await TelegramService.sendMessage(session!.chatId, update.text, {
              parse_mode: update.parse_mode,
              reply_markup: update.buttons.length
                ? { inline_keyboard: update.buttons.map((b) => [{ text: b.text, url: b.url }]) }
                : undefined,
              disable_web_page_preview: true,
            });
            ok = sent.ok;
          } else {
            const mail = renderEmailUpdate(model);
            ok = (await sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text })).ok;
          }
          if (ok) delivered = delivered ?? channel;
        }

        if (deliver.length > 0 && !delivered) {
          // Nothing got through: leave the timestamps alone so the next run retries.
          summary.failed++;
          continue;
        }
        if (delivered && !inApp && candidateIds.length > 0) {
          await markFindingsNotified(user.user_id, candidateIds, delivered);
        }
        if (delivered) summary.usersNotified++;
        else summary.usersInAppOnly++;
        summary.eventsReported += candidates.length;
      }

      if (!dryRun) {
        await query(
          `UPDATE google_oauth_tokens SET last_agenda_scan_at = $2, last_update_sent_at = $2 WHERE user_id = $1`,
          [user.user_id, now.toISOString()]
        );
      }
    } catch (err) {
      summary.failed++;
      console.warn('Background agenda scan failed for one user (non-fatal):', err);
    }
  }

  return summary;
}
