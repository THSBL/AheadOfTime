/**
 * Signed action tokens for the Auto Sync & Notify feature. Two distinct
 * uses, same HMAC-signed-and-expiring shape as server/deepLinkToken.ts's
 * Telegram deep links (kept as a separate file/secret rather than reusing
 * TELEGRAM_WEBHOOK_SECRET, since this feature exists independently of
 * whether a user ever links Telegram at all):
 *
 * 1. OAuth "state" round-trip: when a signed-in user clicks "Connect for
 *    Background Sync", the browser is fully redirected to Google's
 *    consent screen and back - there is no live session to carry
 *    "which user initiated this" across that redirect. The state token
 *    proves the callback's email claim was minted by us moments earlier,
 *    not forged by whoever lands on the callback URL.
 *
 * 2. One-click "push to calendar" from a notification email: the whole
 *    point of the emailed digest (per product decision) is that the user
 *    should NOT have to log back into the web app just to press one
 *    button - the link itself must carry enough proof to authorize a
 *    specific, narrow action (push this exact event's milestones to this
 *    exact user's calendar) without a login step. Scoped to one event id
 *    + user id pair and given a longer TTL than the OAuth state (a digest
 *    email may sit unread for days), but still nothing like a standing
 *    session token - it authorizes exactly one action, once.
 */
import crypto from 'crypto';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes - the whole point is a single immediate redirect round trip
const PUSH_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days - a digest email may sit unread for a while

function getSigningSecret(): string | null {
  const secret = process.env.NOTIFY_LINK_SECRET?.trim();
  return secret || null;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signOAuthState(userEmail: string): { state: string } | null {
  const secret = getSigningSecret();
  if (!secret || !userEmail) return null;
  const expiresAt = Date.now() + OAUTH_STATE_TTL_MS;
  const normalizedEmail = userEmail.toLowerCase().trim();
  const token = sign(`${normalizedEmail}.${expiresAt}`, secret);
  // Packed into one opaque string since Google round-trips "state" as a
  // single opaque value, not a structured object.
  const state = Buffer.from(`${normalizedEmail}.${expiresAt}.${token}`).toString('base64url');
  return { state };
}

export function verifyOAuthState(state: string | undefined | null): { email: string } | null {
  const secret = getSigningSecret();
  if (!secret || !state) return null;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [email, expiresAtRaw, token] = decoded.split('.');
    if (!email || !expiresAtRaw || !token) return null;
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
    const expected = sign(`${email}.${expiresAt}`, secret);
    if (!timingSafeEqualHex(token, expected)) return null;
    return { email };
  } catch {
    return null;
  }
}

export function signPushToCalendarLink(eventId: string, userId: string): { token: string; expiresAt: number } | null {
  const secret = getSigningSecret();
  if (!secret || !eventId || !userId) return null;
  const expiresAt = Date.now() + PUSH_LINK_TTL_MS;
  const token = sign(`push.${eventId}.${userId}.${expiresAt}`, secret);
  return { token, expiresAt };
}

export function verifyPushToCalendarLink(
  eventId: string,
  userId: string,
  token: string | undefined | null,
  expiresAtRaw: string | undefined | null
): boolean {
  const secret = getSigningSecret();
  if (!secret || !eventId || !userId || !token || !expiresAtRaw) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = sign(`push.${eventId}.${userId}.${expiresAt}`, secret);
  return timingSafeEqualHex(token, expected);
}
