import crypto from 'crypto';
import { query } from './db.js';
import { appOrigin } from './appOrigin.js';
import { verifyRequestUser } from './requestAuth.js';
import { findOrCreateUserByEmail } from './telegramStore.js';
import { icsEscape, fold } from './calendarFeed.js';
import { pollClientHash } from './calendarPollStore.js';
import { cleanReminderPrefs, fixedMoments, type FixedMoment, type PlanLinkSettings, type ReminderPrefs, type ShareAudience } from '../src/utils/planLink.js';

/**
 * A plan link: one plan, on its own, outside the account.
 *
 * - A read-only public page (/p/<token>) for a partner, a group or a team:
 *   the plan's steps, dates and ideas. Shared with guests, it shows only
 *   the day and the steps marked "Everyone"; shared with a co-organiser,
 *   every step.
 * - A calendar feed for the people it's shared with (the same token), and
 *   one for the owner's own calendar (feed_token: every step, as tasks or
 *   as timed reminders, as they chose).
 * - The picture a chat app shows under the link, drawn in the owner's
 *   browser when they share (planPreviewImage.ts).
 *
 * Each link stores a SNAPSHOT of just those fields (never notes, locations,
 * the owner's name or email, or any other plan), refreshed whenever the
 * owner's app saves a change. No account needed: a link made without one
 * is managed with an edit key that only the owner's device holds (stored
 * here as a hash). "Stop sharing" turns the public page off; the owner's
 * own feed keeps working. Example plans made by the weekly content drafter
 * are shares without an owner (user_id NULL, no edit key).
 */

export interface SharedPlanStep {
  /** The milestone's id; present on links made by the app. */
  id?: string;
  title: string;
  date: string;
  ideas: string[];
  done: boolean;
  /** Shown to guests (the "Everyone" toggle). */
  everyone?: boolean;
}

export interface SharedPlanSnapshot {
  title: string;
  eventDate: string;
  endDate?: string;
  eventTime?: string;
  category?: string;
  steps: SharedPlanStep[];
  /** The plan's events (the day itself; a trip's departure and return). */
  fixed?: FixedMoment[];
  /** Who the public page is for; missing on older links (= every step). */
  audience?: ShareAudience;
}

export type ShareSettings = PlanLinkSettings;

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS shared_plans (
           token       TEXT PRIMARY KEY,
           user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
           event_key   TEXT NOT NULL,
           snapshot    JSONB NOT NULL,
           created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
           updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
           revoked_at  TIMESTAMPTZ
         )`
      );
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS shared_plans_owner_event ON shared_plans (user_id, event_key) WHERE user_id IS NOT NULL`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS edit_key_hash TEXT`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS feed_token TEXT`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS guest_shared BOOLEAN NOT NULL DEFAULT true`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS settings JSONB`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS preview_jpeg BYTEA`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS preview_version INTEGER NOT NULL DEFAULT 0`);
      await query(`ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS client_hash TEXT`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS shared_plans_feed_token ON shared_plans (feed_token) WHERE feed_token IS NOT NULL`);
      await query(`CREATE INDEX IF NOT EXISTS shared_plans_edit_key ON shared_plans (edit_key_hash, event_key) WHERE edit_key_hash IS NOT NULL`);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const day = (v: unknown): string => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

/**
 * Only what a shared plan shows, trimmed - whatever the client sent. With
 * the owner's settings, each step also carries its id and whether guests
 * see it, and the plan its fixed moments and audience.
 */
export function snapshotFromEvent(event: any, settings?: Pick<ShareSettings, 'audience' | 'everyone'>): SharedPlanSnapshot | null {
  if (!event || typeof event !== 'object') return null;
  const title = text(event.title, 160);
  const eventDate = day(event.eventDate);
  if (!title || !eventDate) return null;
  const everyone = new Set(settings?.everyone || []);
  const steps: SharedPlanStep[] = (Array.isArray(event.milestones) ? event.milestones : [])
    .filter((m: any) => m && m.isActive !== false && m.status !== 'skipped' && text(m.title, 140))
    .map((m: any) => {
      const id = text(m.id, 120);
      return {
        ...(settings && id ? { id } : {}),
        title: text(m.title, 140),
        date: day(m.calculatedDate),
        ideas: (Array.isArray(m.deliverables) ? m.deliverables : [])
          .map((d: any) => text(typeof d === 'string' ? d : d?.title, 160))
          .filter(Boolean)
          .slice(0, 3),
        done: m.status === 'completed',
        ...(settings ? { everyone: Boolean(id && everyone.has(id)) } : {}),
      };
    })
    .filter((s: SharedPlanStep) => s.date)
    .sort((a: SharedPlanStep, b: SharedPlanStep) => a.date.localeCompare(b.date))
    .slice(0, 40);
  const endDate = day(event.endDate);
  const time = text(event.eventTime, 5);
  const category = text(event.category, 40);
  return {
    title,
    eventDate,
    ...(endDate && endDate !== eventDate ? { endDate } : {}),
    ...(/^\d{2}:\d{2}$/.test(time) ? { eventTime: time } : {}),
    ...(category ? { category } : {}),
    steps,
    ...(settings
      ? {
          fixed: fixedMoments({
            title,
            category: category as any,
            eventDate,
            endDate: endDate || undefined,
            eventTime: time,
            context: { returnTime: text(event.context?.returnTime, 5) },
          }),
          audience: settings.audience,
        }
      : {}),
  };
}

/** What the public page and the guests' feed show: guests see only the steps marked for everyone. */
export function publicView(snapshot: SharedPlanSnapshot): SharedPlanSnapshot {
  if (snapshot.audience !== 'guests') return snapshot;
  return { ...snapshot, steps: snapshot.steps.filter((s) => s.everyone) };
}

export function cleanSettings(raw: any, previous?: ShareSettings | null): ShareSettings {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    audience: r.audience === 'all' ? 'all' : r.audience === 'guests' ? 'guests' : previous?.audience || 'guests',
    everyone: Array.isArray(r.everyone)
      ? r.everyone.map((v: unknown) => text(v, 120)).filter(Boolean).slice(0, 60)
      : previous?.everyone || [],
    reminders: r.reminders ? cleanReminderPrefs(r.reminders) : previous?.reminders || cleanReminderPrefs(null),
  };
}

const newToken = () => crypto.randomBytes(12).toString('base64url');
const newEditKey = () => crypto.randomBytes(24).toString('base64url');
const hashKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');
export const sharedPlanUrl = (appUrl: string, token: string) => `${appUrl}/p/${token}`;
export const planFeedUrl = (appUrl: string, token: string) => `${appUrl}/api/plan/feed/${token}.ics`;
const planImageUrl = (appUrl: string, token: string, version: number) => `${appUrl}/api/plan/image/${token}.jpg?v=${version}`;

/** Creates or refreshes an example plan (no owner); returns its token. */
export async function sharePlan(userId: string | null, eventKey: string, snapshot: SharedPlanSnapshot): Promise<string> {
  await ensureSchema();
  if (userId) {
    const existing = await query<{ token: string }>(`SELECT token FROM shared_plans WHERE user_id = $1 AND event_key = $2`, [userId, eventKey]);
    if (existing[0]) {
      await query(`UPDATE shared_plans SET snapshot = $2::jsonb, updated_at = now(), revoked_at = NULL, guest_shared = true WHERE token = $1`, [existing[0].token, JSON.stringify(snapshot)]);
      return existing[0].token;
    }
  }
  const token = newToken();
  await query(`INSERT INTO shared_plans (token, user_id, event_key, snapshot) VALUES ($1, $2, $3, $4::jsonb)`, [token, userId, eventKey, JSON.stringify(snapshot)]);
  return token;
}

// A plan its owner deleted isn't shown any more either.
const NOT_DELETED = `NOT EXISTS (
  SELECT 1 FROM events e
   WHERE e.user_id = sp.user_id AND COALESCE(e.client_id, e.id::text) = sp.event_key AND e.deleted_at IS NOT NULL
)`;

const TOKEN_RE = /^[A-Za-z0-9_-]{8,40}$/;

export async function getSharedPlan(token: string): Promise<{ snapshot: SharedPlanSnapshot; updatedAt: string } | null> {
  if (!TOKEN_RE.test(token)) return null;
  await ensureSchema();
  const rows = await query<{ snapshot: SharedPlanSnapshot; updated_at: string | Date }>(
    `SELECT sp.snapshot, sp.updated_at FROM shared_plans sp
      WHERE sp.token = $1 AND sp.revoked_at IS NULL AND sp.guest_shared AND ${NOT_DELETED}`,
    [token]
  );
  if (!rows[0]) return null;
  return { snapshot: publicView(rows[0].snapshot), updatedAt: new Date(rows[0].updated_at).toISOString() };
}

interface PlanRow {
  token: string;
  feed_token: string | null;
  user_id: string | null;
  event_key: string;
  guest_shared: boolean;
  revoked_at: string | Date | null;
  settings: ShareSettings | null;
  preview_version: number;
}

interface Owner {
  userId: string | null;
  keyHash: string | null;
}

const ROW_COLUMNS = `token, feed_token, user_id, event_key, guest_shared, revoked_at, settings, preview_version`;

/** The owner's link for this plan: by account first, then by the device's edit key. */
async function findRow(owner: Owner, eventKey: string): Promise<PlanRow | null> {
  if (owner.userId) {
    const rows = await query<PlanRow>(`SELECT ${ROW_COLUMNS} FROM shared_plans WHERE user_id = $1 AND event_key = $2`, [owner.userId, eventKey]);
    if (rows[0]) return rows[0];
  }
  if (owner.keyHash) {
    const rows = await query<PlanRow>(`SELECT ${ROW_COLUMNS} FROM shared_plans WHERE edit_key_hash = $1 AND event_key = $2`, [owner.keyHash, eventKey]);
    const row = rows[0];
    if (!row) return null;
    if (row.user_id && row.user_id !== owner.userId) return null;
    // Made before signing in: the link joins the account.
    if (!row.user_id && owner.userId) {
      await query(`UPDATE shared_plans SET user_id = $2 WHERE token = $1`, [row.token, owner.userId]);
      row.user_id = owner.userId;
    }
    return row;
  }
  return null;
}

/** New links per network (IP) per day without an account: keeps one person from filling the table. */
const MAX_ANONYMOUS_LINKS_PER_DAY = 30;

class LinkLimitError extends Error {}

async function createRow(owner: Owner, eventKey: string, snapshot: SharedPlanSnapshot, settings: ShareSettings, guestShared: boolean, clientHash: string | null): Promise<{ row: PlanRow; editKey?: string }> {
  let editKey: string | undefined;
  let keyHash = owner.keyHash;
  if (!owner.userId) {
    if (clientHash) {
      const rows = await query<{ n: string }>(
        `SELECT count(*) AS n FROM shared_plans WHERE client_hash = $1 AND user_id IS NULL AND created_at > now() - interval '24 hours'`,
        [clientHash]
      );
      if (Number(rows[0]?.n || 0) >= MAX_ANONYMOUS_LINKS_PER_DAY) throw new LinkLimitError('Too many new links from this network today. Try again tomorrow, or sign in.');
    }
    if (!keyHash) {
      editKey = newEditKey();
      keyHash = hashKey(editKey);
    }
  }
  const row: PlanRow = {
    token: newToken(),
    feed_token: newToken(),
    user_id: owner.userId,
    event_key: eventKey,
    guest_shared: guestShared,
    revoked_at: null,
    settings,
    preview_version: 0,
  };
  await query(
    `INSERT INTO shared_plans (token, feed_token, user_id, event_key, snapshot, settings, guest_shared, edit_key_hash, client_hash)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
    [row.token, row.feed_token, row.user_id, eventKey, JSON.stringify(snapshot), JSON.stringify(settings), guestShared, keyHash, owner.userId ? null : clientHash]
  );
  return { row, editKey };
}

/** A JPEG the owner's browser drew, as base64; null when missing or not a JPEG. */
function decodePreview(raw: unknown): Buffer | null {
  if (typeof raw !== 'string') return null;
  const b64 = raw.replace(/^data:image\/jpeg;base64,/, '');
  if (b64.length > 700_000 || !b64.startsWith('/9j/')) return null;
  const buf = Buffer.from(b64, 'base64');
  return buf.length > 0 ? buf : null;
}

async function savePreview(row: PlanRow, image: Buffer | null): Promise<void> {
  if (!image) return;
  await query(`UPDATE shared_plans SET preview_jpeg = $2, preview_version = preview_version + 1 WHERE token = $1`, [row.token, image]);
  row.preview_version += 1;
}

function ownerResponse(row: PlanRow | null, appUrl: string, editKey?: string) {
  const live = Boolean(row && !row.revoked_at);
  return {
    ok: true,
    shared: Boolean(live && row!.guest_shared),
    url: live && row!.guest_shared ? sharedPlanUrl(appUrl, row!.token) : null,
    feedUrl: live && row!.feed_token ? planFeedUrl(appUrl, row!.feed_token) : null,
    settings: row?.settings || null,
    ...(editKey ? { k: editKey } : {}),
  };
}

// ---- calendar feed ------------------------------------------------------------

const compact = (d: string) => d.replace(/-/g, '');
const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Floating local time ("20261220T190000"): shown at that hour wherever the calendar is. */
function localStamp(date: string, hhmm: string, plusMinutes = 0): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ms = Date.parse(`${date}T00:00:00Z`) + (h * 60 + m + plusMinutes) * 60_000;
  return new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '');
}

const uidPart = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

/**
 * One plan as a calendar. The fixed moments are events; the prep steps are
 * all-day tasks, or - in the owner's feed, when they chose events - timed
 * reminders at their hour and length.
 */
export function buildPlanIcs(input: {
  snapshot: SharedPlanSnapshot;
  token: string;
  /** Where each entry links to. */
  planUrl: string;
  reminders?: ReminderPrefs;
  now?: Date;
}): string {
  const { snapshot, token, planUrl } = input;
  const now = stamp((input.now || new Date()).toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ahead Of Time//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(snapshot.title)}`,
    'X-WR-CALDESC:Planned with Ahead Of Time',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const fixed = snapshot.fixed?.length
    ? snapshot.fixed
    : [{ key: 'event' as const, title: snapshot.title, date: snapshot.eventDate, endDate: snapshot.endDate, time: snapshot.eventTime }];
  for (const f of fixed) {
    lines.push('BEGIN:VEVENT', `UID:${f.key}-${token}@aheadoftime.app`, `DTSTAMP:${now}`);
    if (f.time) {
      lines.push(`DTSTART:${localStamp(f.date, f.time)}`, `DTEND:${localStamp(f.date, f.time, f.key === 'event' ? 120 : 60)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(f.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(f.endDate || f.date))}`);
    }
    lines.push(`SUMMARY:${icsEscape(f.title)}`, `DESCRIPTION:${icsEscape(`The plan: ${planUrl}`)}`, `URL:${planUrl}`, 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  const timed = input.reminders?.style === 'events';
  for (const s of snapshot.steps) {
    const notes = [s.ideas.length ? s.ideas.map((i) => `• ${i}`).join('\n') : '', `Part of ${snapshot.title}.`, `The plan: ${planUrl}`].filter(Boolean).join('\n\n');
    lines.push('BEGIN:VEVENT', `UID:step-${uidPart(s.id || `${s.title}${s.date}`)}-${token}@aheadoftime.app`, `DTSTAMP:${now}`);
    if (timed && input.reminders) {
      lines.push(`DTSTART:${localStamp(s.date, input.reminders.time)}`, `DTEND:${localStamp(s.date, input.reminders.time, input.reminders.minutes)}`, 'TRANSP:OPAQUE');
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(s.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(s.date))}`, 'TRANSP:TRANSPARENT');
    }
    lines.push(`SUMMARY:${icsEscape(`${s.done ? '✓ ' : ''}${s.title}`)}`, `DESCRIPTION:${icsEscape(notes)}`, `URL:${planUrl}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

async function handleFeed(req: any, res: any, rawToken: string) {
  const token = String(rawToken || '').replace(/\.ics$/i, '');
  if (!TOKEN_RE.test(token)) return res.status(404).send('This calendar link is not active.');
  await ensureSchema();
  const rows = await query<{ token: string; feed_token: string | null; snapshot: SharedPlanSnapshot; settings: ShareSettings | null; guest_shared: boolean; user_id: string | null; event_key: string }>(
    `SELECT sp.token, sp.feed_token, sp.snapshot, sp.settings, sp.guest_shared, sp.user_id, sp.event_key FROM shared_plans sp
      WHERE (sp.feed_token = $1 OR sp.token = $1) AND sp.revoked_at IS NULL AND ${NOT_DELETED}`,
    [token]
  );
  const row = rows[0];
  const ownerFeed = Boolean(row && row.feed_token === token);
  if (!row || (!ownerFeed && !row.guest_shared)) return res.status(404).send('This calendar link is not active.');
  const appUrl = appOrigin(req);
  const ics = buildPlanIcs({
    snapshot: ownerFeed ? row.snapshot : publicView(row.snapshot),
    token: row.token,
    planUrl: ownerFeed && row.user_id ? `${appUrl}/events/${encodeURIComponent(row.event_key)}` : sharedPlanUrl(appUrl, row.token),
    reminders: ownerFeed ? cleanReminderPrefs(row.settings?.reminders) : undefined,
  });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="plan.ics"');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).send(ics);
}

async function handleImage(res: any, rawToken: string) {
  const token = String(rawToken || '').replace(/\.jpg$/i, '');
  if (!TOKEN_RE.test(token)) return res.status(404).end();
  await ensureSchema();
  const rows = await query<{ preview_jpeg: Buffer | null }>(
    `SELECT sp.preview_jpeg FROM shared_plans sp WHERE sp.token = $1 AND sp.revoked_at IS NULL AND sp.guest_shared AND ${NOT_DELETED}`,
    [token]
  );
  const image = rows[0]?.preview_jpeg;
  if (!image) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  // The URL carries the version, so a new picture is a new URL.
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).send(image);
}

// ---- the page's link preview ----------------------------------------------------

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function setMeta(html: string, attr: 'property' | 'name', key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+content=")[^"]*(")`, 'i');
  return re.test(html) ? html.replace(re, `$1${escapeAttr(value)}$2`) : html.replace('</head>', `  <meta ${attr}="${key}" content="${escapeAttr(value)}" />\n  </head>`);
}

/**
 * The app's page for /p/<token>, with the tags a chat app reads for its
 * preview: the picture of the plan carries the information, the text stays
 * neutral (the message itself carries the call to action).
 */
export function withPlanPreviewTags(html: string, input: { title: string; pageUrl: string; imageUrl: string | null }): string {
  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(`${input.title} - shared plan - Ahead Of Time`)}</title>`);
  out = setMeta(out, 'name', 'description', '');
  out = setMeta(out, 'property', 'og:title', 'Shared plan · Ahead Of Time');
  out = setMeta(out, 'property', 'og:description', '');
  out = setMeta(out, 'property', 'og:url', input.pageUrl);
  out = setMeta(out, 'name', 'twitter:title', 'Shared plan · Ahead Of Time');
  out = setMeta(out, 'name', 'twitter:description', '');
  if (input.imageUrl) {
    out = setMeta(out, 'property', 'og:image', input.imageUrl);
    out = setMeta(out, 'property', 'og:image:alt', `You are invited to: ${input.title}`);
    out = setMeta(out, 'name', 'twitter:image', input.imageUrl);
  }
  return out;
}

async function handlePage(req: any, res: any, rawToken: string, loadShell: () => Promise<string>) {
  let shell: string;
  try {
    shell = await loadShell();
    if (!/<\/head>/i.test(shell)) throw new Error('No app shell');
  } catch (err: any) {
    // Without the shell, the same page at an address the static app serves.
    console.error('Shared plan page shell:', err?.message || err);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `/shared/${encodeURIComponent(String(rawToken || ''))}`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const token = String(rawToken || '');
  let html = shell;
  try {
    if (TOKEN_RE.test(token)) {
      await ensureSchema();
      const rows = await query<{ snapshot: SharedPlanSnapshot; preview_version: number; has_image: boolean }>(
        `SELECT sp.snapshot, sp.preview_version, (sp.preview_jpeg IS NOT NULL) AS has_image FROM shared_plans sp
          WHERE sp.token = $1 AND sp.revoked_at IS NULL AND sp.guest_shared AND ${NOT_DELETED}`,
        [token]
      );
      const row = rows[0];
      if (row) {
        const appUrl = appOrigin(req);
        html = withPlanPreviewTags(shell, {
          title: row.snapshot.title,
          pageUrl: sharedPlanUrl(appUrl, token),
          imageUrl: row.has_image ? planImageUrl(appUrl, token, row.preview_version) : null,
        });
      }
    }
  } catch (err: any) {
    // The page still works without its preview tags.
    console.error('Shared plan page tags:', err?.message || err);
  }
  return res.status(200).send(html);
}

// ---- routes -----------------------------------------------------------------------

async function ownerFrom(req: any, k: unknown): Promise<Owner> {
  let userId: string | null = null;
  try {
    const verified = await verifyRequestUser(req);
    if (verified) userId = await findOrCreateUserByEmail(verified.email);
  } catch {
    userId = null;
  }
  const key = text(k, 64);
  return { userId, keyHash: key ? hashKey(key) : null };
}

/** Loads the app's HTML shell over HTTP (Vercel: the static app.html next to the function). */
async function fetchShell(req: any): Promise<string> {
  const r = await fetch(`${appOrigin(req)}/app.html`);
  return r.text();
}

/**
 * /api/plan/shared
 *   GET  ?token=...                          - the public plan (anyone with the link)
 *   GET  ?eventKey=...&k=...                 - my link for this plan: shared? urls, settings
 *   POST {action:'share', eventKey, event, settings, image?, k?}   - share with people / update what they see
 *   POST {action:'feed', eventKey, event, settings, k?}            - the owner's own calendar feed for this plan
 *   POST {action:'refresh', eventKey, event, image?, k?}           - the plan changed: update the link
 *   POST {action:'stop', eventKey, k?}                             - stop sharing (the owner's feed stays)
 * Also reached by rewrites:
 *   ?feed=<token>   - a plan's calendar (/api/plan/feed/<token>.ics)
 *   ?image=<token>  - its link preview picture (/api/plan/image/<token>.jpg)
 *   ?page=<token>   - the app's page with the preview tags (/p/<token>)
 * No sign-in needed: without one, the edit key (k) the first share returned
 * proves the link is yours.
 */
export async function handleSharedPlans(req: any, res: any, opts?: { loadShell?: () => Promise<string> }) {
  const q = req.query || {};
  try {
    if (req.method === 'GET' && typeof q.page === 'string') {
      return await handlePage(req, res, q.page, opts?.loadShell || (() => fetchShell(req)));
    }
    if (req.method === 'GET' && typeof q.feed === 'string') return await handleFeed(req, res, q.feed);
    if (req.method === 'GET' && typeof q.image === 'string') return await handleImage(res, q.image);

    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && typeof q.token === 'string') {
      // Not cached: "Stop sharing" must take effect at once.
      res.setHeader('X-Robots-Tag', 'noindex');
      const plan = await getSharedPlan(q.token);
      if (!plan) return res.status(404).json({ ok: false, error: 'This shared plan is no longer available.' });
      return res.status(200).json({ ok: true, plan: plan.snapshot, updatedAt: plan.updatedAt, feedUrl: planFeedUrl(appOrigin(req), q.token) });
    }

    await ensureSchema();
    const appUrl = appOrigin(req);

    if (req.method === 'GET' && typeof q.eventKey === 'string') {
      const owner = await ownerFrom(req, q.k);
      const row = owner.userId || owner.keyHash ? await findRow(owner, text(q.eventKey, 120)) : null;
      return res.status(200).json(ownerResponse(row, appUrl));
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const eventKey = text(body.eventKey || body.event?.id, 120);
      if (!eventKey) return res.status(400).json({ ok: false, error: 'Which plan?' });
      const owner = await ownerFrom(req, body.k);
      const existing = owner.userId || owner.keyHash ? await findRow(owner, eventKey) : null;

      if (body.action === 'stop') {
        if (existing) await query(`UPDATE shared_plans SET guest_shared = false, updated_at = now() WHERE token = $1`, [existing.token]);
        return res.status(200).json(ownerResponse(existing ? { ...existing, guest_shared: false } : null, appUrl));
      }

      if (body.action === 'share' || body.action === 'feed' || body.action === 'refresh') {
        if (JSON.stringify(body.event || {}).length > 200_000) return res.status(413).json({ ok: false, error: 'That plan is too large to share.' });
        if (body.action === 'refresh' && (!existing || existing.revoked_at)) return res.status(200).json(ownerResponse(existing, appUrl));
        const settings = body.action === 'refresh' ? cleanSettings(null, existing?.settings) : cleanSettings(body.settings, existing?.settings);
        const snapshot = snapshotFromEvent(body.event, settings);
        if (!snapshot) return res.status(400).json({ ok: false, error: 'This plan needs a title and a date to be shared.' });
        const image = decodePreview(body.image);

        if (!existing) {
          const { row, editKey } = await createRow(owner, eventKey, snapshot, settings, body.action === 'share', pollClientHash(req));
          await savePreview(row, image);
          return res.status(200).json(ownerResponse(row, appUrl, editKey));
        }
        const guestShared = body.action === 'share' ? true : existing.guest_shared;
        await query(
          `UPDATE shared_plans SET snapshot = $2::jsonb, settings = $3::jsonb, guest_shared = $4, revoked_at = NULL, updated_at = now(),
                  feed_token = COALESCE(feed_token, $5)
            WHERE token = $1`,
          [existing.token, JSON.stringify(snapshot), JSON.stringify(settings), guestShared, newToken()]
        );
        const fresh = (await findRow(owner, eventKey)) || existing;
        await savePreview(fresh, image);
        return res.status(200).json(ownerResponse(fresh, appUrl));
      }
    }
    return res.status(400).json({ ok: false, error: 'Unknown request' });
  } catch (err: any) {
    if (err instanceof LinkLimitError) return res.status(429).json({ ok: false, error: err.message });
    console.error('Shared plans error:', err?.message || err);
    return res.status(503).json({ ok: false, error: 'Sharing is not available right now.' });
  }
}
