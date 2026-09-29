import crypto from 'crypto';
import { appOrigin } from './appOrigin.js';
import { query } from './db.js';
import { findOrCreateUserByEmail } from './telegramStore.js';
import { createSession, revokeSession, readSessionCookie, buildSessionCookie } from './sessionStore.js';
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

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function page(inner: string, autoSubmit = false): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Sign in · Ahead Of Time</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#182A42;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;color:#182A42;border-radius:24px;padding:28px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.3)}
h1{font-size:20px;margin:0 0 8px}p{color:#475569;font-size:14px;margin:0 0 20px;line-height:1.5}
button,a.btn{display:block;width:100%;box-sizing:border-box;padding:14px;border-radius:14px;border:0;background:#182A42;color:#fff;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none}
.brand{font-weight:900;color:#95BFB5;margin-bottom:16px;font-size:14px}</style></head>
<body><div class="card"><div class="brand">Ahead Of Time</div>${inner}</div>${autoSubmit ? `<script>document.getElementById('f').submit()</script>` : ''}</body></html>`;
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
      const link = `${appUrlFor(req)}/api/auth/email-link?t=${created.token}`;
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

  // 2. The link from the email: sign in on a button (submitted by the browser itself).
  if (req.method === 'GET') {
    if (!token) return res.status(400).send(page(`<h1>Link incomplete</h1><p>Open the link from your email again, or ask for a new one.</p>`));
    return res
      .status(200)
      .send(page(`<h1>Signing you in…</h1><p>One moment.</p><form method="post" id="f"><input type="hidden" name="t" value="${escapeHtml(token)}"><button>Sign in</button></form>`, true));
  }

  // 3. Use the link and start the session.
  if (req.method === 'POST') {
    const email = await consumeLoginLink(token).catch(() => null);
    const appUrl = appUrlFor(req);
    if (!email) {
      return res
        .status(400)
        .send(page(`<h1>This link has expired</h1><p>Sign-in links work once, for ${LINK_TTL_MIN} minutes. Ask for a new one in the app.</p><a class="btn" href="${escapeHtml(appUrl)}/?signin=email">Get a new link</a>`));
    }
    await revokeSession(readSessionCookie(req)).catch(() => {});
    const userId = await findOrCreateUserByEmail(email);
    const session = await createSession(userId, email, req.headers?.['user-agent']);
    res.setHeader('Set-Cookie', buildSessionCookie(session));
    res.statusCode = 303;
    res.setHeader('Location', `${appUrl}/dashboard?signed_in=email`);
    return res.end();
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
