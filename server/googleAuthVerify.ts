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
  /** Google's permanent account id, when Google reports it (see googleIdentity.ts). */
  sub?: string;
}

/** The token's Google account id (tokeninfo), or null when Google doesn't say. */
async function fetchGoogleSubject(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.sub === 'string' && data.sub ? data.sub : null;
  } catch {
    return null;
  }
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
    const token = accessToken.trim();
    const [response, sub] = await Promise.all([
      fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetchGoogleSubject(token),
    ]);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const email = typeof data?.id === 'string' ? data.id.toLowerCase().trim() : '';
    if (!email || !email.includes('@')) {
      return null;
    }

    // A reassigned address (same email, different Google account) is refused.
    const { checkGoogleSubject } = await import('./googleIdentity.js');
    if (!(await checkGoogleSubject(email, sub).catch(() => true))) {
      console.warn('Google sign-in refused: this address belongs to a different Google account than before.');
      return null;
    }

    return { email, ...(sub ? { sub } : {}) };
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

/**
 * Whether a verified email is allowed to see admin-only data (e.g. the
 * feedback inbox). Configured entirely through the ADMIN_EMAILS env var
 * (comma-separated) rather than a hardcoded address, so who counts as an
 * admin is never something committed to the repo - it's set once per
 * environment (.env.local for dev, the Vercel project's env vars for
 * prod). No ADMIN_EMAILS set means no one is an admin, not "everyone is."
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase().trim());
}
