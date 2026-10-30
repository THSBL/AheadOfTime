import type { CalendarEvent } from '../types';
import { aiJsonHeaders } from './aiRequest';
import { activeSteps, nextUpStep, shortDay, upcomingSteps, type PlanLinkSettings, type ReminderPrefs } from '../utils/planLink';
import { drawPlanPreview } from '../utils/planPreviewImage';

/**
 * The app's side of a plan link (server/sharedPlans.ts): share a plan with
 * people, give the owner a calendar feed of just this plan, and keep both
 * up to date when the plan changes. Works without an account: the edit key
 * the server hands out on the first call stays on this device.
 */

export interface PlanLinkState {
  /** The public page is on. */
  shared: boolean;
  url: string | null;
  /** The owner's own calendar feed for this plan. */
  feedUrl: string | null;
  settings: PlanLinkSettings | null;
}

interface LocalLink {
  /** Edit key, for a link made without an account. */
  k?: string;
  /** What the link showed when it was last brought up to date (linkSignature). */
  at?: string;
  settings?: PlanLinkSettings;
}

/** A short fingerprint of what a link shows: changes when the plan's title, dates or steps do. */
export function linkSignature(event: CalendarEvent): string {
  const shown = JSON.stringify([
    event.title,
    event.eventDate,
    event.endDate || '',
    event.eventTime || '',
    event.context?.returnTime || '',
    activeSteps(event).map((m) => [m.id, m.title, m.calculatedDate.slice(0, 10), m.status, (m.deliverables || []).map((d) => d?.title).slice(0, 3)]),
  ]);
  let h = 5381;
  for (let i = 0; i < shown.length; i++) h = ((h << 5) + h + shown.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const STORE = 'aot_plan_links';

function readStore(): Record<string, LocalLink> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocal(eventId: string, patch: LocalLink) {
  try {
    const all = readStore();
    all[eventId] = { ...all[eventId], ...patch };
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // Storage blocked: the link still works, it just won't refresh on its own.
  }
}

export function hasLocalPlanLink(eventId: string): boolean {
  return Boolean(readStore()[eventId]);
}

async function call(body: Record<string, unknown>): Promise<PlanLinkState & { k?: string }> {
  const r = await fetch('/api/plan/shared', { method: 'POST', headers: aiJsonHeaders(), body: JSON.stringify(body), cache: 'no-store' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) throw new Error(data?.error || 'That did not work. Try again.');
  return data;
}

/** Keep this link up to date from this device too (a link opened here, made elsewhere). */
export function rememberPlanLink(event: CalendarEvent, data: PlanLinkState & { k?: string }) {
  if (data.url || data.feedUrl) remember(event, data);
}

function remember(event: CalendarEvent, data: PlanLinkState & { k?: string }) {
  writeLocal(event.id, { ...(data.k ? { k: data.k } : {}), at: linkSignature(event), ...(data.settings ? { settings: data.settings } : {}) });
}

export async function loadPlanLink(eventId: string): Promise<PlanLinkState> {
  const k = readStore()[eventId]?.k;
  const r = await fetch(`/api/plan/shared?eventKey=${encodeURIComponent(eventId)}${k ? `&k=${encodeURIComponent(k)}` : ''}`, {
    headers: aiJsonHeaders(),
    cache: 'no-store',
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) throw new Error(data?.error || 'Could not load this plan link.');
  return data;
}

/** "Sat 20 Dec", "Fri 19 Dec – Sun 28 Dec", "Sat 20 Dec · 19:00" */
export function planDateLine(event: Pick<CalendarEvent, 'eventDate' | 'endDate' | 'eventTime'>): string {
  const range = event.endDate && event.endDate !== event.eventDate ? `${shortDay(event.eventDate)} – ${shortDay(event.endDate)}` : shortDay(event.eventDate);
  return event.eventTime && !(event.endDate && event.endDate !== event.eventDate) ? `${range} · ${event.eventTime}` : range;
}

/** The steps the people it's shared with see, as the link shows them. */
export function stepsForPeople(event: CalendarEvent, settings: Pick<PlanLinkSettings, 'audience' | 'everyone'>) {
  const everyone = new Set(settings.everyone);
  return activeSteps(event)
    .filter((m) => settings.audience === 'all' || everyone.has(m.id))
    .map((m) => ({ id: m.id, title: m.title, date: m.calculatedDate.slice(0, 10), done: m.status === 'completed' }));
}

const today = () => new Date().toISOString().slice(0, 10);

/** "Wishlists in by Sat 22 Nov" - the next step for the people it's shared with. */
export function nextUpLine(event: CalendarEvent, settings: Pick<PlanLinkSettings, 'audience' | 'everyone'>): string | null {
  const next = nextUpStep(stepsForPeople(event, settings), today());
  return next ? `${next.title} by ${shortDay(next.date)}` : null;
}

/** How many reminders the people it's shared with can still add, besides the event. */
export function reminderCountForPeople(event: CalendarEvent, settings: Pick<PlanLinkSettings, 'audience' | 'everyone'>): number {
  return upcomingSteps(stepsForPeople(event, settings), today()).length;
}

function previewFor(event: CalendarEvent, settings: Pick<PlanLinkSettings, 'audience' | 'everyone'>): string | null {
  try {
    return drawPlanPreview({ title: event.title, dateLine: planDateLine(event), nextUp: nextUpLine(event, settings) });
  } catch {
    return null;
  }
}

/** Share with people, or update what they see. */
export async function sharePlanWithPeople(event: CalendarEvent, settings: Pick<PlanLinkSettings, 'audience' | 'everyone'>): Promise<PlanLinkState> {
  const local = readStore()[event.id];
  const data = await call({ action: 'share', eventKey: event.id, event, settings, image: previewFor(event, settings), k: local?.k });
  remember(event, data);
  return data;
}

/** The owner's own calendar feed of this plan, with prep steps shown their way. */
export async function savePlanFeed(event: CalendarEvent, reminders: ReminderPrefs): Promise<PlanLinkState> {
  const local = readStore()[event.id];
  const data = await call({ action: 'feed', eventKey: event.id, event, settings: { reminders }, k: local?.k });
  remember(event, data);
  return data;
}

export async function stopSharingPlan(eventId: string): Promise<PlanLinkState> {
  const k = readStore()[eventId]?.k;
  return call({ action: 'stop', eventKey: eventId, k });
}

/**
 * The plan changed: bring its link (page, feeds, picture) up to date.
 * Only for links this device made or opened; quiet on failure.
 */
export async function refreshPlanLinkIfChanged(event: CalendarEvent): Promise<void> {
  const local = readStore()[event.id];
  const signature = linkSignature(event);
  if (!local || local.at === signature) return;
  writeLocal(event.id, { at: signature });
  const settings = local.settings || { audience: 'guests' as const, everyone: [], reminders: { style: 'tasks' as const, time: '19:00', minutes: 30 } };
  try {
    const data = await call({ action: 'refresh', eventKey: event.id, event, image: previewFor(event, settings), k: local.k });
    if (data.settings) writeLocal(event.id, { settings: data.settings });
  } catch {
    // Next change tries again.
    writeLocal(event.id, { at: local.at });
  }
}
