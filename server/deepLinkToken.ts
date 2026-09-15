/**
 * Signed, single-event, short-lived access tokens for Telegram deep links.
 *
 * The problem this solves: a user who is actively chatting with the bot on
 * Telegram and taps "Open Full Timeline in App" seconds later should not be
 * asked to separately authenticate with Google just to VIEW what they just
 * did - that conflates "who is this web session" with "should we also push
 * to this person's Google Calendar" (a genuinely separate, optional
 * integration). The bot itself already knows with certainty that it created
 * this exact event for this exact chat, so it can hand out a link that
 * proves that directly, instead of requiring a Google access token the
 * user's browser may not have (or may have let expire).
 *
 * Security model: an HMAC-SHA256 of `eventId.expiresAt`, signed with
 * TELEGRAM_WEBHOOK_SECRET. Scoped to exactly one event id and expires
 * quickly (15 minutes - long enough to open the link right after using the
 * bot, short enough that a forwarded/leaked link doesn't grant standing
 * access to anything). This is the same class of mechanism as a password
 * reset or calendar-invite link, not a general auth token - it never
 * grants access to any event other than the one it was minted for.
 */
import crypto from 'crypto';

const DEEP_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

function getSigningSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return secret || null;
}

/**
 * Mints a token for this event id, valid for the next 15 minutes. Returns
 * null if TELEGRAM_WEBHOOK_SECRET isn't configured in this environment -
 * callers should fall back to building a plain (Google-auth-only) link in
 * that case rather than throwing, so a missing optional env var never
 * breaks event creation.
 */
export function signEventDeepLink(eventId: string): { token: string; expiresAt: number } | null {
  const secret = getSigningSecret();
  if (!secret || !eventId) return null;
  const expiresAt = Date.now() + DEEP_LINK_TOKEN_TTL_MS;
  const token = crypto.createHmac('sha256', secret).update(`${eventId}.${expiresAt}`).digest('hex');
  return { token, expiresAt };
}

/**
 * Verifies a token was genuinely minted for this exact event id and hasn't
 * expired. Constant-time comparison so timing can't leak the correct value.
 */
export function verifyEventDeepLink(eventId: string, token: string | undefined | null, expiresAtRaw: string | undefined | null): boolean {
  const secret = getSigningSecret();
  if (!secret || !eventId || !token || !expiresAtRaw) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${eventId}.${expiresAt}`).digest('hex');
  const provided = Buffer.from(token, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (provided.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuf);
}
