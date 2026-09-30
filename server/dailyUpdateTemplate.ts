/**
 * The update (daily, weekly or monthly), as one content model rendered two
 * ways: a Telegram message (HTML parse mode) and an email (HTML + plain
 * text). Both say the same three things, in this order, and nothing more:
 *
 *   📌 This week       late tasks first, then what's due in the next 7 days
 *   🆕 New events      found in the calendar since the last update (name + date)
 *   🗓 Pending sync    plans with tasks not in the calendar yet (one line)
 *
 * Short on purpose: the update points to the app, it doesn't repeat it.
 * Pure functions: no I/O, everything the template needs arrives in the model.
 */

export interface UpdateTask {
  title: string;
  eventTitle: string;
  dueDate: string; // YYYY-MM-DD
}

export interface UpdatePrepStep {
  date: string; // YYYY-MM-DD
  title: string;
}

export interface UpdateNewEvent {
  title: string;
  eventDate: string; // YYYY-MM-DD
  /** Kept for the in-app notice; the update itself shows name and date only. */
  steps: UpdatePrepStep[];
}

export interface UpdatePendingSync {
  plans: number;
  tasks: number;
}

export type UpdateFrequency = 'daily' | 'weekly' | 'monthly';

export interface DailyUpdateModel {
  /** Today, YYYY-MM-DD (used for "3 days late" / "tomorrow"). */
  today: string;
  frequency?: UpdateFrequency;
  overdue: UpdateTask[];
  dueThisWeek: UpdateTask[];
  newEvents: UpdateNewEvent[];
  /** Plans with tasks not in the user's calendar yet; null when they don't sync to Google. */
  pendingSync?: UpdatePendingSync | null;
  /** Public base URL, e.g. https://aheadoftime.app ('' when unknown/not https). */
  appUrl: string;
}

// Brand colours (see index.css): navy page background, logo sage.
const NAVY = '#182A42';
const SAGE = '#95BFB5';

const CAPS = {
  telegram: { tasks: 6, events: 3 },
  email: { tasks: 8, events: 5 },
};

/** Believable placeholder content for a test send when the user has nothing real to report yet. */
export function sampleUpdateModel(today: string, appUrl: string): DailyUpdateModel {
  const addDays = (n: number) => new Date(dayNumber(today) * 86_400_000 + n * 86_400_000).toISOString().substring(0, 10);
  return {
    today,
    appUrl,
    overdue: [{ title: 'Send invites', eventTitle: 'Sample: birthday party', dueDate: addDays(-2) }],
    dueThisWeek: [
      { title: 'Order the cake', eventTitle: 'Sample: birthday party', dueDate: addDays(1) },
      { title: 'Buy drinks and ice', eventTitle: 'Sample: birthday party', dueDate: addDays(4) },
    ],
    newEvents: [{ title: 'Sample: weekend in Amsterdam', eventDate: addDays(21), steps: [] }],
    pendingSync: { plans: 1, tasks: 3 },
  };
}

export function hasUpdateContent(m: DailyUpdateModel): boolean {
  return m.overdue.length + m.dueThisWeek.length + m.newEvents.length + (m.pendingSync?.tasks || 0) > 0;
}

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

const dayNumber = (dateStr: string): number => Math.floor(Date.parse(`${dateStr.substring(0, 10)}T00:00:00Z`) / 86_400_000);

function dateLabel(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${dateStr.substring(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}
const longDate = (d: string) => dateLabel(d, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (d: string) => dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short' });

export function lateLabel(today: string, dueDate: string): string {
  const days = dayNumber(today) - dayNumber(dueDate);
  return days <= 1 ? '1 day late' : `${days} days late`;
}

export function dueLabel(today: string, dueDate: string): string {
  const days = dayNumber(dueDate) - dayNumber(today);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return dateLabel(dueDate, { weekday: 'short' });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TITLES: Record<UpdateFrequency, string> = { daily: 'Your daily update', weekly: 'Your week ahead', monthly: 'Your monthly update' };
const titleOf = (m: DailyUpdateModel) => TITLES[m.frequency || 'daily'];

export function updateSubject(m: DailyUpdateModel): string {
  const parts: string[] = [];
  if (m.overdue.length) parts.push(`${m.overdue.length} late`);
  if (m.dueThisWeek.length) parts.push(`${m.dueThisWeek.length} this week`);
  if (m.newEvents.length) parts.push(plural(m.newEvents.length, 'new event', 'new events'));
  if (m.pendingSync?.tasks) parts.push(`${m.pendingSync.tasks} pending sync`);
  return parts.length ? `${titleOf(m)}: ${parts.join(' · ')}` : titleOf(m);
}

const link = (m: DailyUpdateModel, path: string) => (m.appUrl.startsWith('https://') ? `${m.appUrl}${path}` : '');
const weekUrl = (m: DailyUpdateModel) => link(m, '/dashboard');
const planNewUrl = (m: DailyUpdateModel) => link(m, '/dashboard?scan=true');
const syncUrl = (m: DailyUpdateModel) => link(m, '/dashboard?sync=pending');
const settingsUrl = (m: DailyUpdateModel) => link(m, '/settings/updates');

/** This week's tasks in one list: late first (oldest first), then by due date. */
function weekTasks(m: DailyUpdateModel): Array<UpdateTask & { late: boolean; label: string }> {
  return [
    ...m.overdue.map((t) => ({ ...t, late: true, label: lateLabel(m.today, t.dueDate) })),
    ...m.dueThisWeek.map((t) => ({ ...t, late: false, label: dueLabel(m.today, t.dueDate) })),
  ];
}

const pendingLine = (p: UpdatePendingSync) =>
  `${plural(p.plans, 'plan', 'plans')} · ${plural(p.tasks, 'task', 'tasks')} not in your calendar yet`;

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

export interface TelegramUpdate {
  text: string;
  parse_mode: 'HTML';
  buttons: Array<{ text: string; url: string }>;
}

export function renderTelegramUpdate(m: DailyUpdateModel): TelegramUpdate {
  const cap = CAPS.telegram;
  const lines: string[] = [`☀️ <b>${titleOf(m)}</b> · ${esc(shortDate(m.today))}`];

  const tasks = weekTasks(m);
  if (tasks.length) {
    const lateNote = m.overdue.length ? ` · ${m.overdue.length} late` : '';
    lines.push('', `📌 <b>This week (${tasks.length}${lateNote})</b>`);
    for (const t of tasks.slice(0, cap.tasks)) {
      lines.push(`${t.late ? '⚠️' : '•'} ${esc(t.title)} <i>- ${esc(t.eventTitle)} · ${esc(t.label)}</i>`);
    }
    if (tasks.length > cap.tasks) lines.push(`…and ${tasks.length - cap.tasks} more in the app`);
  }

  if (m.newEvents.length) {
    const sorted = [...m.newEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    lines.push('', `🆕 <b>New in your calendar (${sorted.length})</b>`);
    lines.push(...sorted.slice(0, cap.events).map((e) => `• ${esc(e.title)} <i>- ${esc(shortDate(e.eventDate))}</i>`));
    if (sorted.length > cap.events) lines.push(`…and ${sorted.length - cap.events} more`);
  }

  if (m.pendingSync?.tasks) {
    lines.push('', `🗓 <b>Pending sync:</b> ${esc(pendingLine(m.pendingSync))}`);
  }

  const buttons: Array<{ text: string; url: string }> = [];
  if (weekUrl(m)) buttons.push({ text: '📋 Open my week', url: weekUrl(m) });
  if (m.newEvents.length && planNewUrl(m)) buttons.push({ text: '🆕 Plan new events', url: planNewUrl(m) });
  if (m.pendingSync?.tasks && syncUrl(m)) buttons.push({ text: '🗓 Sync now', url: syncUrl(m) });

  return { text: lines.join('\n'), parse_mode: 'HTML', buttons };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailUpdate {
  subject: string;
  html: string;
  text: string;
}

export function renderEmailUpdate(m: DailyUpdateModel): EmailUpdate {
  const cap = CAPS.email;
  const subject = updateSubject(m);
  const tasks = weekTasks(m);
  const shownTasks = tasks.slice(0, cap.tasks);
  const events = [...m.newEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const shownEvents = events.slice(0, cap.events);
  const pending = m.pendingSync?.tasks ? m.pendingSync : null;

  // ---- plain text ----
  const text: string[] = [`${titleOf(m)} - ${longDate(m.today)}`, ''];
  if (shownTasks.length) {
    text.push(`THIS WEEK (${tasks.length}${m.overdue.length ? `, ${m.overdue.length} late` : ''})`);
    text.push(...shownTasks.map((t) => `  ${t.late ? '!' : '•'} ${t.title} - ${t.eventTitle} (${t.label})`));
    if (tasks.length > shownTasks.length) text.push(`  …and ${tasks.length - shownTasks.length} more in the app`);
    if (weekUrl(m)) text.push(`  Open my week: ${weekUrl(m)}`);
    text.push('');
  }
  if (shownEvents.length) {
    text.push(`NEW IN YOUR CALENDAR (${events.length})`);
    text.push(...shownEvents.map((e) => `  • ${e.title} - ${shortDate(e.eventDate)}`));
    if (events.length > shownEvents.length) text.push(`  …and ${events.length - shownEvents.length} more`);
    if (planNewUrl(m)) text.push(`  Plan them: ${planNewUrl(m)}`);
    text.push('');
  }
  if (pending) {
    text.push(`PENDING SYNC: ${pendingLine(pending)}`);
    if (syncUrl(m)) text.push(`  Sync now: ${syncUrl(m)}`);
    text.push('');
  }
  if (settingsUrl(m)) text.push(`Change how you get this update, or turn it off: ${settingsUrl(m)}`);

  // ---- html ----
  const section = (title: string, body: string) => `
<tr><td style="padding:22px 28px 0">
  <div style="font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${NAVY}">${title}</div>
  ${body}
</td></tr>`;

  const button = (href: string, label: string, primary = false) =>
    href
      ? `<div style="margin-top:14px"><a href="${esc(href)}" style="display:inline-block;background:${primary ? SAGE : '#ffffff'};color:${NAVY};border:1.5px solid ${
          primary ? SAGE : NAVY
        };font-weight:800;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:12px">${label}</a></div>`
      : '';

  const taskRows = shownTasks
    .map(
      (t) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>
    <td style="font-size:15px;color:#223;line-height:1.35"><strong>${esc(t.title)}</strong><br><span style="font-size:13px;color:#667">${esc(t.eventTitle)}</span></td>
    <td align="right" valign="top" style="white-space:nowrap"><span style="display:inline-block;background:${t.late ? '#fde6ea' : '#eef2f1'};color:${
          t.late ? '#9f1239' : '#334'
        };font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px">${esc(t.label)}</span></td>
  </tr></table>`
    )
    .join('');
  const moreTasks = tasks.length > shownTasks.length ? `<div style="margin-top:8px;font-size:13px;color:#667">…and ${tasks.length - shownTasks.length} more in the app</div>` : '';

  const eventRows = shownEvents
    .map(
      (e) =>
        `<div style="margin-top:10px;font-size:15px;color:#223"><strong>${esc(e.title)}</strong> <span style="font-size:13px;color:#667">· ${esc(shortDate(e.eventDate))}</span></div>`
    )
    .join('');
  const moreEvents = events.length > shownEvents.length ? `<div style="margin-top:8px;font-size:13px;color:#667">…and ${events.length - shownEvents.length} more</div>` : '';

  const sections = [
    shownTasks.length
      ? section(`📌 This week (${tasks.length}${m.overdue.length ? ` · ${m.overdue.length} late` : ''})`, taskRows + moreTasks + button(weekUrl(m), 'Open my week', true))
      : '',
    shownEvents.length ? section(`🆕 New in your calendar (${events.length})`, eventRows + moreEvents + button(planNewUrl(m), 'Plan new events')) : '',
    pending
      ? section('🗓 Pending sync', `<div style="margin-top:8px;font-size:15px;color:#223">${esc(pendingLine(pending))}</div>${button(syncUrl(m), 'Sync now')}`)
      : '',
  ].join('');

  const logo = m.appUrl.startsWith('https://')
    ? `<img src="${esc(m.appUrl)}/assets/logo-small.png" width="40" height="40" alt="" style="vertical-align:middle;border-radius:10px;margin-right:10px">`
    : '';
  const footer = settingsUrl(m)
    ? `<a href="${esc(settingsUrl(m))}" style="color:#889">Change how you get this update, or turn it off</a>`
    : 'You can change or turn this off in Settings.';

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef2f1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif">
  <tr><td style="background:${NAVY};padding:20px 28px">
    ${logo}<span style="font-size:20px;color:#ffffff;vertical-align:middle"><strong style="color:${SAGE};font-weight:900">Ahead</strong> <span style="font-weight:600">Of Time</span></span>
  </td></tr>
  <tr><td style="padding:26px 28px 0">
    <div style="font-size:22px;font-weight:800;color:${NAVY}">${titleOf(m)}</div>
    <div style="font-size:14px;color:#667;margin-top:2px">${esc(longDate(m.today))}</div>
  </td></tr>
  ${sections}
  <tr><td style="padding:26px 28px 26px;font-size:12px;color:#889">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text: text.join('\n') };
}
