import { extractBearerToken, verifyGoogleAccessToken } from './googleAuthVerify.js';
import { findOrCreateUserByEmail } from './telegramStore.js';
import {
  createSession,
  verifySession,
  revokeSession,
  readSessionCookie,
  buildSessionCookie,
  buildClearedSessionCookie,
} from './sessionStore.js';

/**
 * /api/auth/session - the app's own login session.
 *   POST   Google access token in the Authorization header (proof of who you
 *          are, once) -> new session cookie. Always a Google check, never an
 *          existing cookie, so a session can only ever be started by Google.
 *   GET    -> { ok, email } while the cookie's session is valid, else 401.
 *   DELETE -> revokes the session and clears the cookie (sign out).
 * Shared by the Vercel function (api/auth/google/index.ts) and server.ts.
 */
export async function handleSessionApi(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    return await handleSessionApiInner(req, res);
  } catch (err: any) {
    // e.g. the database is unreachable: answer instead of hanging; the
    // browser treats it as "no session" and a Google token still works.
    console.error('Session API error:', err?.message || err);
    return res.status(503).json({ ok: false, error: 'Session service unavailable' });
  }
}

async function handleSessionApiInner(req: any, res: any) {
  if (req.method === 'GET') {
    const session = await verifySession(readSessionCookie(req));
    return session
      ? res.status(200).json({ ok: true, email: session.email })
      : res.status(401).json({ ok: false, error: 'No active session' });
  }

  if (req.method === 'POST') {
    const verified = await verifyGoogleAccessToken(extractBearerToken(req));
    if (!verified) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    // Replacing any previous session on this browser (e.g. switching accounts).
    await revokeSession(readSessionCookie(req)).catch(() => {});
    const userId = await findOrCreateUserByEmail(verified.email);
    const token = await createSession(userId, verified.email, req.headers?.['user-agent']);
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return res.status(200).json({ ok: true, email: verified.email });
  }

  if (req.method === 'DELETE') {
    await revokeSession(readSessionCookie(req)).catch(() => {});
    res.setHeader('Set-Cookie', buildClearedSessionCookie());
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
