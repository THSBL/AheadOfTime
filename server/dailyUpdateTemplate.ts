/**
 * The daily update, as one content model rendered two ways: a Telegram message
 * (HTML parse mode, compact) and an email (HTML + plain-text, roomier, with
 * each new event's prep plan). Keeping both in this one file means the wording,
 * order and section names never drift apart.
 *
 *   ⚠️ Needs attention   overdue tasks
 *   📌 This week          tasks due in the next 7 days
 *   📅 New on calendar    events added since the last update, with a prep plan
 *
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
  steps: UpdatePrepStep[];
}

export interface DailyUpdateModel {
  /** Today, YYYY-MM-DD (used for "3 days late" / "tomorrow"). */
  today: string;
  overdue: UpdateTask[];
  dueThisWeek: UpdateTask[];
  newEvents: UpdateNewEvent[];
  /** Public base URL, e.g. https://aheadoftime.app ('' when unknown/not https). */
  appUrl: string;
}

// Brand colours (see index.css): navy page background, logo sage.
const NAVY = '#182A42';
const SAGE = '#95BFB5';

const CAPS = {
  telegram: { overdue: 5, week: 6, events: 4, stepsPerEvent: 2 },
  email: { overdue: 8, week: 10, events: 6, stepsPerEvent: 8 },
};

export function hasUpdateContent(m: DailyUpdateModel): boolean {
  return m.overdue.length + m.dueThisWeek.length + m.newEvents.length > 0;
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
const fullShortDate = (d: string) => dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

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

export function updateSubject(m: DailyUpdateModel): string {
  const parts: string[] = [];
  if (m.overdue.length) parts.push(`${m.overdue.length} overdue`);
  if (m.dueThisWeek.length) parts.push(`${m.dueThisWeek.length} due this week`);
  if (m.newEvents.length) parts.push(plural(m.newEvents.length, 'new event', 'new events'));
  return parts.length ? `Your daily update: ${parts.join(', ')}` : 'Your daily update';
}

const dashboardUrl = (m: DailyUpdateModel) => (m.appUrl.startsWith('https://') ? `${m.appUrl}/dashboard` : '');
const reviewUrl = (m: DailyUpdateModel) => (m.appUrl.startsWith('https://') ? `${m.appUrl}/dashboard?scan=true` : '');
const settingsUrl = (m: DailyUpdateModel) => (m.appUrl.startsWith('https://') ? `${m.appUrl}/settings/credentials` : '');

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
  const lines: string[] = [`☀️ <b>Your daily update</b> · ${esc(shortDate(m.today))}`];

  const taskLine = (t: UpdateTask, suffix: string) => `• ${esc(t.title)} <i>- ${esc(t.eventTitle)} · ${esc(suffix)}</i>`;

  if (m.overdue.length) {
    lines.push('', `⚠️ <b>Needs attention (${m.overdue.length})</b>`);
    lines.push(...m.overdue.slice(0, cap.overdue).map((t) => taskLine(t, lateLabel(m.today, t.dueDate))));
    if (m.overdue.length > cap.overdue) lines.push(`…and ${m.overdue.length - cap.overdue} more`);
  }

  if (m.dueThisWeek.length) {
    lines.push('', `📌 <b>This week (${m.dueThisWeek.length})</b>`);
    lines.push(...m.dueThisWeek.slice(0, cap.week).map((t) => taskLine(t, dueLabel(m.today, t.dueDate))));
    if (m.dueThisWeek.length > cap.week) lines.push(`…and ${m.dueThisWeek.length - cap.week} more`);
  }

  if (m.newEvents.length) {
    const sorted = [...m.newEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    lines.push('', `📅 <b>New on your calendar (${sorted.length})</b>`);
    for (const e of sorted.slice(0, cap.events)) {
      const steps = e.steps.length > 0 ? ` · ${plural(e.steps.length, 'prep step', 'prep steps')}` : '';
      lines.push(`• <b>${esc(e.title)}</b> - ${esc(shortDate(e.eventDate))}${steps}`);
      for (const s of e.steps.slice(0, cap.stepsPerEvent)) {
        lines.push(`   ↳ ${esc(s.title)} <i>· ${esc(shortDate(s.date))}</i>`);
      }
    }
    if (sorted.length > cap.events) lines.push(`…and ${sorted.length - cap.events} more`);
  }

  const buttons: Array<{ text: string; url: string }> = [];
  if (m.newEvents.length && reviewUrl(m)) buttons.push({ text: '🔍 Review new events', url: reviewUrl(m) });
  if (dashboardUrl(m)) buttons.push({ text: '📋 Open my week', url: dashboardUrl(m) });

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
  const overdue = m.overdue.slice(0, cap.overdue);
  const week = m.dueThisWeek.slice(0, cap.week);
  const events = [...m.newEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate)).slice(0, cap.events);

  // ---- plain text ----
  const text: string[] = [`Good morning - your daily update for ${longDate(m.today)}`, ''];
  if (overdue.length) {
    text.push(`NEEDS ATTENTION (${m.overdue.length})`);
    text.push(...overdue.map((t) => `  • ${t.title} - ${t.eventTitle} (${lateLabel(m.today, t.dueDate)})`));
    if (m.overdue.length > overdue.length) text.push(`  …and ${m.overdue.length - overdue.length} more`);
    text.push('');
  }
  if (week.length) {
    text.push(`THIS WEEK (${m.dueThisWeek.length})`);
    text.push(...week.map((t) => `  • ${t.title} - ${t.eventTitle} (${dueLabel(m.today, t.dueDate)})`));
    if (m.dueThisWeek.length > week.length) text.push(`  …and ${m.dueThisWeek.length - week.length} more`);
    text.push('');
  }
  if (events.length) {
    text.push(`NEW ON YOUR CALENDAR (${m.newEvents.length})`);
    for (const e of events) {
      text.push(`  ${e.title} - ${fullShortDate(e.eventDate)}`);
      const shown = e.steps.slice(0, cap.stepsPerEvent);
      text.push(...shown.map((s) => `     • ${shortDate(s.date)}: ${s.title}`));
      if (e.steps.length > shown.length) text.push(`     …and ${e.steps.length - shown.length} more steps`);
    }
    if (m.newEvents.length > events.length) text.push(`  …and ${m.newEvents.length - events.length} more events`);
    text.push('');
  }
  const openLink = m.newEvents.length && reviewUrl(m) ? reviewUrl(m) : dashboardUrl(m);
  text.push(openLink ? `Open Ahead Of Time: ${openLink}` : 'Open Ahead Of Time to see everything.');
  if (settingsUrl(m)) text.push('', `Change how you get this update, or turn it off: ${settingsUrl(m)}`);

  // ---- html ----
  const section = (title: string, tone: string, body: string) => `
<tr><td style="padding:22px 28px 0">
  <div style="font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${tone}">${title}</div>
  ${body}
</td></tr>`;

  const taskRows = (tasks: UpdateTask[], label: (t: UpdateTask) => string, pillBg: string, pillFg: string) =>
    tasks
      .map(
        (t) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>
    <td style="font-size:15px;color:#223;line-height:1.35"><strong>${esc(t.title)}</strong><br><span style="font-size:13px;color:#667">${esc(t.eventTitle)}</span></td>
    <td align="right" valign="top" style="white-space:nowrap"><span style="display:inline-block;background:${pillBg};color:${pillFg};font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px">${esc(label(t))}</span></td>
  </tr></table>`
      )
      .join('');
  const more = (n: number, noun: string) => (n > 0 ? `<div style="margin-top:8px;font-size:13px;color:#667">…and ${n} more ${noun}</div>` : '');

  const eventBlocks = events
    .map((e) => {
      const shown = e.steps.slice(0, cap.stepsPerEvent);
      const items = shown
        .map(
          (s) =>
            `<tr><td style="padding:3px 0;font-size:14px;color:#223"><span style="color:#667;display:inline-block;width:96px">${esc(shortDate(s.date))}</span>${esc(s.title)}</td></tr>`
        )
        .join('');
      return `
  <div style="margin-top:14px;padding:14px 16px;border:1px solid #e2e8e6;border-radius:14px;background:#f7faf9">
    <div style="font-size:16px;font-weight:800;color:${NAVY}">${esc(e.title)}</div>
    <div style="font-size:13px;color:#667;margin-bottom:6px">${esc(fullShortDate(e.eventDate))}${e.steps.length ? ` · ${plural(e.steps.length, 'prep step', 'prep steps')}` : ''}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${items}</table>
    ${e.steps.length > shown.length ? `<div style="font-size:13px;color:#667;margin-top:4px">…and ${e.steps.length - shown.length} more steps</div>` : ''}
  </div>`;
    })
    .join('');

  const sections = [
    overdue.length
      ? section(`⚠️ Needs attention (${m.overdue.length})`, '#b4234a', taskRows(overdue, (t) => lateLabel(m.today, t.dueDate), '#fde6ea', '#9f1239') + more(m.overdue.length - overdue.length, 'tasks'))
      : '',
    week.length
      ? section(`📌 This week (${m.dueThisWeek.length})`, '#8a5a00', taskRows(week, (t) => dueLabel(m.today, t.dueDate), '#fdf1d6', '#92400e') + more(m.dueThisWeek.length - week.length, 'tasks'))
      : '',
    events.length
      ? section(`📅 New on your calendar (${m.newEvents.length})`, '#2f6b5c', eventBlocks + more(m.newEvents.length - events.length, 'events'))
      : '',
  ].join('');

  const button = openLink
    ? `<tr><td style="padding:26px 28px 6px"><a href="${esc(openLink)}" style="display:inline-block;background:${SAGE};color:${NAVY};font-weight:800;font-size:15px;text-decoration:none;padding:13px 22px;border-radius:12px">${
        m.newEvents.length ? 'Review &amp; build my plans' : 'Open my week'
      }</a></td></tr>`
    : '';
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
    <div style="font-size:22px;font-weight:800;color:${NAVY}">Good morning</div>
    <div style="font-size:14px;color:#667;margin-top:2px">Your daily update for ${esc(longDate(m.today))}</div>
  </td></tr>
  ${sections}
  ${button}
  <tr><td style="padding:22px 28px 26px;font-size:12px;color:#889;border-top:1px solid #eef2f1;margin-top:18px">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject, html, text: text.join('\n') };
}
