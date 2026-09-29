import crypto from 'crypto';
import { query } from './db.js';
import { ensureEventSyncSchema } from './eventSyncSchema.js';

/**
 * Calendar feed: a private link any calendar app can subscribe to (Apple
 * Calendar, Outlook, Google, ...). It lists the user's open and recently
 * done tasks as all-day entries; each entry carries a one-tap "Mark done"
 * link, so tasks can be ticked off from the calendar without signing in.
 *
 * Nothing secret is stored: the feed link and the done links are HMACs
 * (NOTIFY_LINK_SECRET) over the user id and a per-user version. "Reset
 * link" bumps the version, which kills the old feed and every done link
 * in it at once; turning the feed off deletes the row.
 */

const DAY_MS = 86_400_000;
const PAST_DAYS = 14;

function secret(): string | null {
  return process.env.NOTIFY_LINK_SECRET?.trim() || null;
}

function hmac(payload: string, key: string): string {
  return crypto.createHmac('sha256', key).update(payload).digest('base64url').slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- tokens ---------------------------------------------------------------

export function signFeedToken(userId: string, version: number): string | null {
  const key = secret();
  if (!key) return null;
  return `${userId}.${version}.${hmac(`feed.${userId}.${version}`, key)}`;
}

export function parseFeedToken(token: string): { userId: string; version: number } | null {
  const key = secret();
  const m = /^([0-9a-f-]{36})\.(\d{1,9})\.([A-Za-z0-9_-]{32})$/i.exec(token || '');
  if (!key || !m || !UUID_RE.test(m[1])) return null;
  const version = Number(m[2]);
  return safeEqual(m[3], hmac(`feed.${m[1]}.${version}`, key)) ? { userId: m[1], version } : null;
}

export function signDoneToken(userId: string, version: number, milestoneId: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${userId}.${version}.${milestoneId}.${hmac(`done.${userId}.${version}.${milestoneId}`, key)}`;
}

export function parseDoneToken(token: string): { userId: string; version: number; milestoneId: string } | null {
  const key = secret();
  const m = /^([0-9a-f-]{36})\.(\d{1,9})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/i.exec(token || '');
  if (!key || !m || !UUID_RE.test(m[1]) || !UUID_RE.test(m[3])) return null;
  const version = Number(m[2]);
  return safeEqual(m[4], hmac(`done.${m[1]}.${version}.${m[3]}`, key)) ? { userId: m[1], version, milestoneId: m[3] } : null;
}

// ---- storage --------------------------------------------------------------

let ready: Promise<void> | null = null;
export function ensureCalendarFeedSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await ensureEventSyncSchema();
      await query(
        `CREATE TABLE IF NOT EXISTS calendar_feeds (
           user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
           version         INTEGER NOT NULL DEFAULT 1,
           created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
           last_fetched_at TIMESTAMPTZ
         )`
      );
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export async function getFeedVersion(userId: string): Promise<number | null> {
  await ensureCalendarFeedSchema();
  const rows = await query<{ version: number }>(`SELECT version FROM calendar_feeds WHERE user_id = $1`, [userId]);
  return rows[0]?.version ?? null;
}

/** Turns the feed on (keeping the current link) or, with reset, issues a new link. */
export async function enableFeed(userId: string, reset = false): Promise<number> {
  await ensureCalendarFeedSchema();
  const rows = await query<{ version: number }>(
    `INSERT INTO calendar_feeds (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET version = calendar_feeds.version + CASE WHEN $2 THEN 1 ELSE 0 END
     RETURNING version`,
    [userId, reset]
  );
  return rows[0].version;
}

export async function disableFeed(userId: string): Promise<void> {
  await ensureCalendarFeedSchema();
  await query(`DELETE FROM calendar_feeds WHERE user_id = $1`, [userId]);
}

export interface FeedTask {
  id: string;
  title: string;
  description: string | null;
  date: string;
  status: string;
  eventTitle: string;
  eventDate: string;
  eventPublicId: string;
  updatedAt: string;
}

async function loadFeedTasks(userId: string, now: Date): Promise<FeedTask[]> {
  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS).toISOString().slice(0, 10);
  const rows = await query<any>(
    `SELECT m.id, m.title, m.description, m.calculated_date, m.status, m.confirmed_at,
            e.title AS event_title, e.event_date, COALESCE(e.client_id, e.id::text) AS event_public_id,
            COALESCE(e.client_updated_at, e.updated_at) AS event_updated_at
       FROM milestones m JOIN events e ON e.id = m.event_id
      WHERE e.user_id = $1 AND e.deleted_at IS NULL
        AND COALESCE(m.is_active, true) AND m.status IN ('pending', 'completed')
        AND m.calculated_date >= $2::date
      ORDER BY m.calculated_date
      LIMIT 500`,
    [userId, from]
  );
  const day = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : now.toISOString());
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    date: day(r.calculated_date),
    status: r.status,
    eventTitle: r.event_title,
    eventDate: day(r.event_date),
    eventPublicId: r.event_public_id,
    updatedAt: iso(r.confirmed_at || r.event_updated_at),
  }));
}

/** Marks a task done (or not done) the way the app does, so every device picks it up. */
export async function setTaskDoneFromFeed(userId: string, milestoneId: string, done: boolean): Promise<{ title: string; eventTitle: string; eventPublicId: string } | null> {
  await ensureCalendarFeedSchema();
  const rows = await query<{ title: string; event_id: string; event_title: string; event_public_id: string }>(
    `UPDATE milestones m
        SET status = $3, confirmed_at = CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
            confirmed_via = CASE WHEN $3 = 'completed' THEN 'calendar' ELSE NULL END,
            client_payload = CASE WHEN m.client_payload IS NULL THEN NULL
                                  ELSE m.client_payload || jsonb_build_object('status', $3::text) END
       FROM events e
      WHERE m.id = $2 AND e.id = m.event_id AND e.user_id = $1 AND e.deleted_at IS NULL
      RETURNING m.title, e.id AS event_id, e.title AS event_title, COALESCE(e.client_id, e.id::text) AS event_public_id`,
    [userId, milestoneId, done ? 'completed' : 'pending']
  );
  const row = rows[0];
  if (!row) return null;
  // Newer than any device's copy, so the change wins and every device pulls it.
  await query(`UPDATE events SET updated_at = now(), client_updated_at = now() WHERE id = $1`, [row.event_id]);
  return { title: row.title, eventTitle: row.event_title, eventPublicId: row.event_public_id };
}

// ---- ICS ------------------------------------------------------------------

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded (RFC 5545 3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (size + n > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (day: string) => day.replace(/-/g, '');
const stamp = (isoString: string) => isoString.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function buildFeedIcs(input: { tasks: FeedTask[]; appUrl: string; doneUrl: (taskId: string) => string | null; now?: Date }): string {
  const now = input.now || new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ahead Of Time//Task feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Ahead Of Time tasks',
    'X-WR-CALDESC:Your preparation tasks from Ahead Of Time',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const t of input.tasks) {
    const done = t.status === 'completed';
    const doneUrl = done ? null : input.doneUrl(t.id);
    const planUrl = `${input.appUrl}/events/${encodeURIComponent(t.eventPublicId)}`;
    const notes = [
      `Part of ${t.eventTitle} (${longDate(t.eventDate)}).`,
      t.description || '',
      done ? '✓ Done.' : doneUrl ? `✓ Mark done: ${doneUrl}` : '',
      `Open the plan: ${planUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@aheadoftime.app`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `LAST-MODIFIED:${stamp(t.updatedAt)}`,
      `DTSTART;VALUE=DATE:${compactDate(t.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(t.date))}`,
      `SUMMARY:${icsEscape(`${done ? '✓ ' : ''}${t.title} · ${t.eventTitle}`)}`,
      `DESCRIPTION:${icsEscape(notes)}`,
      `URL:${doneUrl || planUrl}`,
      'TRANSP:TRANSPARENT',
      `STATUS:CONFIRMED`,
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---- routes ---------------------------------------------------------------

function appUrlFor(req: any): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'localhost:3000';
  const proto = req.headers?.['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function feedUrlFor(appUrl: string, userId: string, version: number): string | null {
  const token = signFeedToken(userId, version);
  return token ? `${appUrl}/api/calendar/feed/${token}.ics` : null;
}

/** GET /api/calendar/feed/<token>.ics - the subscription itself (no sign-in; the link is the key). */
export async function handleCalendarFeed(req: any, res: any, rawToken: string) {
  const parsed = parseFeedToken(String(rawToken || '').replace(/\.ics$/i, ''));
  const version = parsed ? await getFeedVersion(parsed.userId) : null;
  if (!parsed || version !== parsed.version) {
    res.status(404).send('This calendar link is no longer active.');
    return;
  }
  const appUrl = appUrlFor(req);
  const tasks = await loadFeedTasks(parsed.userId, new Date());
  const ics = buildFeedIcs({
    tasks,
    appUrl,
    doneUrl: (taskId) => {
      const token = signDoneToken(parsed.userId, version, taskId);
      return token ? `${appUrl}/api/calendar/done?t=${token}` : null;
    },
  });
  query(`UPDATE calendar_feeds SET last_fetched_at = now() WHERE user_id = $1`, [parsed.userId]).catch(() => undefined);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="ahead-of-time-tasks.ics"');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.status(200).send(ics);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function donePage(input: { title: string; body: string; token?: string; state?: 'confirm' | 'done' | 'undone'; planUrl?: string }): string {
  const button =
    input.token && input.state
      ? `<form method="post" id="f"><input type="hidden" name="t" value="${escapeHtml(input.token)}">
           <input type="hidden" name="done" value="${input.state === 'done' ? '0' : '1'}">
           <button class="${input.state === 'done' ? 'ghost' : ''}">${input.state === 'done' ? 'Undo' : '✓ Mark done'}</button></form>`
      : '';
  const plan = input.planUrl ? `<a class="link" href="${escapeHtml(input.planUrl)}">Open the plan</a>` : '';
  // A page load marks nothing by itself: link previews and scanners fetch
  // pages too. The confirm page submits itself in a real browser, so a tap
  // on the link is still one tap.
  const auto = input.state === 'confirm' ? `<script>document.getElementById('f').submit()</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Ahead Of Time</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#182A42;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;color:#182A42;border-radius:24px;padding:28px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.3)}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;font-size:14px;margin:0 0 20px;line-height:1.5}
button{width:100%;padding:14px;border-radius:14px;border:0;background:#182A42;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
button.ghost{background:#f1f5f9;color:#182A42}.link{display:block;margin-top:14px;color:#182A42;font-weight:600;font-size:14px}
.brand{font-weight:900;color:#95BFB5;margin-bottom:16px;font-size:14px}</style></head>
<body><div class="card"><div class="brand">Ahead Of Time</div><h1>${escapeHtml(input.title)}</h1><p>${input.body}</p>${button}${plan}</div>${auto}</body></html>`;
}

/**
 * /api/calendar/done?t=<token>
 * GET shows the task and (in a browser) submits itself; POST marks it done
 * (done=1) or not done (done=0). The token names one task of one user.
 */
export async function handleCalendarDone(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};
  const token = String((req.method === 'POST' ? body.t : req.query?.t) || '');
  const parsed = parseDoneToken(token);
  const version = parsed ? await getFeedVersion(parsed.userId) : null;
  if (!parsed || version !== parsed.version) {
    res.status(404).send(donePage({ title: 'Link no longer active', body: 'Open Ahead Of Time to update this task.' }));
    return;
  }

  if (req.method !== 'POST') {
    res.status(200).send(donePage({ title: 'Marking as done…', body: 'One moment.', token, state: 'confirm' }));
    return;
  }

  const done = String(body.done ?? '1') !== '0';
  const task = await setTaskDoneFromFeed(parsed.userId, parsed.milestoneId, done);
  if (!task) {
    res.status(404).send(donePage({ title: 'Task not found', body: 'It may have been removed from the plan.' }));
    return;
  }
  const planUrl = `${appUrlFor(req)}/events/${encodeURIComponent(task.eventPublicId)}`;
  res.status(200).send(
    donePage({
      title: done ? `✓ ${task.title}` : task.title,
      body: done
        ? `Done, nice work. Part of <b>${escapeHtml(task.eventTitle)}</b>. Your calendar shows it as done at its next refresh.`
        : `Back on your list for <b>${escapeHtml(task.eventTitle)}</b>.`,
      token,
      state: done ? 'done' : 'undone',
      planUrl,
    })
  );
}

/**
 * /api/auth/calendar-feed (signed in)
 * GET  -> { enabled, url }
 * POST { action: 'enable' | 'reset' | 'disable' } -> { enabled, url }
 */
export async function handleCalendarFeedSettings(req: any, res: any, userId: string) {
  res.setHeader('Cache-Control', 'no-store');
  if (!secret()) {
    res.status(503).json({ ok: false, error: 'The calendar feed is not available right now.' });
    return;
  }
  const appUrl = appUrlFor(req);
  if (req.method === 'GET') {
    const version = await getFeedVersion(userId);
    res.status(200).json({ ok: true, enabled: version !== null, url: version !== null ? feedUrlFor(appUrl, userId, version) : null });
    return;
  }
  if (req.method === 'POST') {
    const action = req.body?.action;
    if (action === 'disable') {
      await disableFeed(userId);
      res.status(200).json({ ok: true, enabled: false, url: null });
      return;
    }
    if (action === 'enable' || action === 'reset') {
      const version = await enableFeed(userId, action === 'reset');
      res.status(200).json({ ok: true, enabled: true, url: feedUrlFor(appUrl, userId, version) });
      return;
    }
  }
  res.status(400).json({ ok: false, error: 'Unknown request' });
}
