import { extractBearerToken, verifyGoogleAccessToken, type VerifiedGoogleUser } from './googleAuthVerify.js';
import { readSessionCookie, verifySession } from './sessionStore.js';

/**
 * Who is making this request - the one identity check every API route uses.
 * A Google access token in the Authorization header decides when present
 * (exactly the old behaviour, and never ambiguous right after switching
 * Google accounts, when an older session cookie may still be around).
 * Without one - Chrome was closed, or the one-hour token expired - the
 * app's own session cookie identifies the user. Same return shape as
 * verifyGoogleAccessToken.
 */
export async function verifyRequestUser(req: any): Promise<VerifiedGoogleUser | null> {
  const cached = req?.__aotVerifiedUser;
  if (cached !== undefined) return cached;
  let user: VerifiedGoogleUser | null = null;
  const bearer = extractBearerToken(req);
  if (bearer) {
    user = await verifyGoogleAccessToken(bearer);
  }
  if (!user) {
    try {
      const session = await verifySession(readSessionCookie(req));
      if (session) user = { email: session.email };
    } catch (err) {
      console.warn('Session check notice:', (err as Error)?.message || err);
    }
  }
  if (req && typeof req === 'object') req.__aotVerifiedUser = user;
  return user;
}
