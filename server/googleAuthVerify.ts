/**
 * Server-side verification of a Google OAuth access token the client sends
 * with a request, instead of trusting a client-supplied userId/email.
 *
 * Reuses the exact technique src/services/googleCalendar.ts already uses
 * client-side (calling Calendar API's /calendars/primary, whose `id` field
 * equals the account's email) - so this requires no new OAuth scopes, no
 * Google Cloud Console changes, and no change to the sign-in flow. The
 * token the client already holds from "Connect Calendar" is reused as-is;
 * the server just independently re-checks it with Google rather than
 * trusting whatever the client claims about itself.
 */

export interface VerifiedGoogleUser {
  email: string;
}

/**
 * Verifies a bearer access token by asking Google's own Calendar API who
 * it belongs to. Returns the verified email, or null if the token is
 * missing, expired, or otherwise invalid. Never throws for an invalid
 * token - callers should treat null as "unauthenticated".
 */
export async function verifyGoogleAccessToken(accessToken: string | undefined | null): Promise<VerifiedGoogleUser | null> {
  if (!accessToken || !accessToken.trim()) {
    return null;
  }

  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const email = typeof data?.id === 'string' ? data.id.toLowerCase().trim() : '';
    if (!email || !email.includes('@')) {
      return null;
    }

    return { email };
  } catch {
    return null;
  }
}

/**
 * Extracts the bearer token from a request's Authorization header.
 */
export function extractBearerToken(req: any): string | null {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
