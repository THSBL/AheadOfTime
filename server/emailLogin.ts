import crypto from 'crypto';
import { appOrigin } from './appOrigin.js';
import { query } from './db.js';
import { findOrCreateUserByEmail } from './telegramStore.js';
import { createSession, revokeSession, readSessionCookie, buildSessionCookie, verifySession } from './sessionStore.js';
import { isEmailConfigured, sendEmail } from './emailService.js';

/**
 * Sign in without Google: an email with a one-time link.
 *
 *   POST /api/auth/email-link { email }  -> sends the link (same answer whether
 *        or not the address has an account, so it can't be used to probe).
 *   GET  /api/auth/email-link?t=...      -> a page that signs in on a button
 *        (mail scanners open links too; they must not use up the link).
 *   POST /api/auth/email-link  t=...     -> checks and uses the link, starts
 *        the same session a Google sign-in starts, and opens the app.
 *
 * Only a hash of the token is stored; a link works once, for 15 minutes.
 * At most 3 links per address and 10 per network address per 15 minutes.
 */

const LINK_TTL_MIN = 15;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

let ready: Promise<void> | null = null;
export function ensureEmailLoginSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS email_login_links (
           token_hash  TEXT PRIMARY KEY,
           email       TEXT NOT NULL,
           ip          TEXT,
           created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
           expires_at  TIMESTAMPTZ NOT NULL,
           used_at     TIMESTAMPTZ
         )`
      );
      await query(`CREATE INDEX IF NOT EXISTS idx_email_login_links_email ON email_login_links (email, created_at)`);
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

export function normalizeEmail(input: unknown): string | null {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return EMAIL_RE.test(email) ? email : null;
}

function clientIp(req: any): string {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

const appUrlFor = (req: any): string => appOrigin(req);

/** Creates a link for this address, or says why not. Returns the raw token (sent by email, never stored). */
export async function createLoginLink(email: string, ip: string): Promise<{ token?: string; error?: 'rate_limited' }> {
  await ensureEmailLoginSchema();
  const recent = await query<{ by_email: string; by_ip: string }>(
    `SELECT count(*) FILTER (WHERE email = $1) AS by_email, count(*) FILTER (WHERE ip = $2) AS by_ip
       FROM email_login_links WHERE created_at > now() - make_interval(mins => $3)`,
    [email, ip, LINK_TTL_MIN]
  );
  if (Number(recent[0]?.by_email) >= MAX_PER_EMAIL || Number(recent[0]?.by_ip) >= MAX_PER_IP) return { error: 'rate_limited' };
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO email_login_links (token_hash, email, ip, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [hash(token), email, ip, LINK_TTL_MIN]
  );
  // Old rows are only needed for the rate limit.
  query(`DELETE FROM email_login_links WHERE created_at < now() - interval '1 day'`).catch(() => undefined);
  return { token };
}

/** Uses a link: its email when the link is valid, unused and not expired; null otherwise. */
export async function consumeLoginLink(token: string): Promise<string | null> {
  if (!token || token.length > 100) return null;
  await ensureEmailLoginSchema();
  const rows = await query<{ email: string }>(
    `UPDATE email_login_links SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING email`,
    [hash(token)]
  );
  return rows[0]?.email || null;
}

/** What became of a link, without using it: for a clear page instead of a bare "expired". */
export async function loginLinkStatus(token: string): Promise<{ state: 'valid' | 'used' | 'expired' | 'unknown'; email?: string }> {
  if (!token || token.length > 100) return { state: 'unknown' };
  await ensureEmailLoginSchema();
  const rows = await query<{ email: string; used_at: string | null; expired: boolean }>(
    `SELECT email, used_at, expires_at <= now() AS expired FROM email_login_links WHERE token_hash = $1`,
    [hash(token)]
  );
  const row = rows[0];
  if (!row) return { state: 'unknown' };
  if (row.used_at) return { state: 'used', email: row.email };
  return { state: row.expired ? 'expired' : 'valid', email: row.email };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** The one place besides the dashboard an email link may return to. */
const CALENDAR_SETUP = 'calendar-setup';
/** Which calendar's steps the setup page shows - one of a fixed few, else none. */
const setupCalendar = (v: unknown): string => (v === 'outlook' || v === 'apple' || v === 'other' ? v : '');

// Styles and the one-tap script are files (public/signin.*): the site's
// Content-Security-Policy blocks inline <style> and <script>.
function page(inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Sign in · Ahead Of Time</title>
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/signin.css"></head>
<body><main class="card"><div class="brand"><img src="/icon-96.png" alt="">Ahead Of Time</div>${inner}</main><script src="/signin.js" defer></script></body></html>`;
}

function emailBody(link: string): { html: string; text: string } {
  const safe = escapeHtml(link);
  return {
    text: `Sign in to Ahead Of Time:\n\n${link}\n\nThe link works once, for ${LINK_TTL_MIN} minutes. Didn't ask for it? Ignore this email; nobody can sign in without the link.`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#182A42">
<p style="font-weight:900;color:#447463;margin:0 0 16px">Ahead Of Time</p>
<h1 style="font-size:20px;margin:0 0 12px">Sign in to Ahead Of Time</h1>
<p style="color:#475569;font-size:14px;line-height:1.5;margin:0 0 20px">Tap the button to sign in. The link works once, for ${LINK_TTL_MIN} minutes.</p>
<a href="${safe}" style="display:inline-block;background:#182A42;color:#fff;font-weight:700;padding:12px 22px;border-radius:12px;text-decoration:none">Sign in</a>
<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:24px 0 0">Didn't ask for this? Ignore this email; nobody can sign in without the link.</p></div>`,
  };
}

/**
 * A link that can't sign in (any more). Opened again in the browser it
 * already signed in - a second tap, or the email opened twice - it simply
 * goes on to the app; otherwise a page that says what happened.
 */
async function unusableLink(req: any, res: any, status: { state: string; email?: string }, destination: string) {
  const appUrl = escapeHtml(appUrlFor(req));
  if (status.state === 'used' && status.email) {
    const current = await verifySession(readSessionCookie(req)).catch(() => null);
    if (current && current.email.toLowerCase() === status.email) {
      res.statusCode = 303;
      res.setHeader('Location', destination);
      return res.end();
    }
    return res
      .status(400)
      .send(page(`<h1>This link was already used</h1><p>Each sign-in link works once. Already signed in on this device? Open the app. Otherwise ask for a new link.</p><a class="btn" href="${appUrl}/dashboard">Open Ahead Of Time</a><a class="btn secondary" href="${appUrl}/?signin=email">Get a new link</a>`));
  }
  if (status.state === 'valid') {
    // Only when the database didn't answer.
    return res.status(503).send(page(`<h1>Sign-in is not available right now</h1><p>Try the link again in a minute. It still works for ${LINK_TTL_MIN} minutes from when it was sent.</p>`));
  }
  return res
    .status(400)
    .send(page(`<h1>This link has expired</h1><p>Sign-in links work for ${LINK_TTL_MIN} minutes. Ask for a new one; it arrives within a minute.</p><a class="btn" href="${appUrl}/?signin=email">Get a new link</a>`));
}

export async function handleEmailLink(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};

  // 1. Ask for a link (JSON from the app).
  if (req.method === 'POST' && body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!email) return res.status(400).json({ ok: false, error: 'That email address doesn\'t look right.' });
    if (!isEmailConfigured()) return res.status(503).json({ ok: false, error: 'Email sign-in is not available right now. Try Google, or try again later.' });
    try {
      const created = await createLoginLink(email, clientIp(req));
      if (created.error) return res.status(429).json({ ok: false, error: 'Too many sign-in emails. Wait a few minutes and try again.' });
      // Only one fixed place to return to (never a free URL): the calendar
      // setup page for Outlook / Apple users, otherwise the dashboard.
      const next = body.next === CALENDAR_SETUP ? `&next=${CALENDAR_SETUP}${setupCalendar(body.cal) ? `&cal=${setupCalendar(body.cal)}` : ''}` : '';
      const link = `${appUrlFor(req)}/api/auth/email-link?t=${created.token}${next}`;
      const sent = await sendEmail({ to: email, subject: 'Your sign-in link for Ahead Of Time', ...emailBody(link) });
      if (!sent.ok) {
        console.warn('Email sign-in: sending failed:', sent.error);
        return res.status(502).json({ ok: false, error: "We couldn't send the email. Try again in a moment." });
      }
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error('Email sign-in error:', err?.message || err);
      return res.status(503).json({ ok: false, error: 'Sign-in is not available right now.' });
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const token = String((req.method === 'POST' ? body.t : req.query?.t) || '');

  const next = (req.method === 'POST' ? body.next : req.query?.next) === CALENDAR_SETUP ? CALENDAR_SETUP : '';
  const cal = next ? setupCalendar(req.method === 'POST' ? body.cal : req.query?.cal) : '';
  const appUrl = appUrlFor(req);
  const destination = next ? `${appUrl}/setup/calendar?signed_in=email${cal ? `&cal=${cal}` : ''}` : `${appUrl}/dashboard?signed_in=email`;

  // 2. The link from the email: a page with a Sign in button. It waits for a
  // tap on purpose - Outlook's link scanner (Safe Links) opens links in
  // emails before the person does, and must not use up the one-time link.
  if (req.method === 'GET') {
    if (!token) return res.status(400).send(page(`<h1>Link incomplete</h1><p>Open the link from your email again, or ask for a new one.</p>`));
    const status = await loginLinkStatus(token).catch(() => ({ state: 'valid' as const, email: undefined }));
    if (status.state !== 'valid') return unusableLink(req, res, status, destination);
    return res
      .status(200)
      .send(
        page(
          `<h1>Sign in to Ahead Of Time</h1><p>${next ? 'Tap to sign in and finish connecting your calendar.' : 'Tap to sign in.'}</p><form method="post" id="f"><input type="hidden" name="t" value="${escapeHtml(token)}">${next ? `<input type="hidden" name="next" value="${CALENDAR_SETUP}">` : ''}${cal ? `<input type="hidden" name="cal" value="${cal}">` : ''}<button>Sign in</button></form>`,
        ),
      );
  }

  // 3. Use the link and start the session.
  if (req.method === 'POST') {
    const email = await consumeLoginLink(token).catch(() => null);
    if (!email) {
      const status = await loginLinkStatus(token).catch(() => ({ state: 'unknown' as const, email: undefined }));
      return unusableLink(req, res, status, destination);
    }
    await revokeSession(readSessionCookie(req)).catch(() => {});
    const userId = await findOrCreateUserByEmail(email);
    const session = await createSession(userId, email, req.headers?.['user-agent']);
    res.setHeader('Set-Cookie', buildSessionCookie(session));
    res.statusCode = 303;
    res.setHeader('Location', destination);
    return res.end();
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
