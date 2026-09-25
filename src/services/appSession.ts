/**
 * The app's own login session (server/sessionStore.ts), kept in an HttpOnly
 * cookie the browser sends automatically. Page scripts can't read that
 * cookie, so this module tracks whether the server confirmed it: that's what
 * lets server calls (event sync, profile, feedback...) keep working after
 * Chrome was closed or the one-hour Google token expired.
 */
let confirmedEmail: string | null = null;
let checkInFlight: Promise<string | null> | null = null;
let checkedOnce = false;

const notify = () => {
  try {
    window.dispatchEvent(new CustomEvent('aot_app_session_changed', { detail: { email: confirmedEmail } }));
  } catch {
    // Non-browser (tests): nothing to notify.
  }
};

/**
 * True once the server has confirmed a session for this browser - for the
 * given account when one is passed, so another account's leftover session
 * is never used to sync the wrong user's data.
 */
export function hasAppSession(expectedEmail?: string | null): boolean {
  if (!confirmedEmail) return false;
  return !expectedEmail || confirmedEmail === expectedEmail.toLowerCase().trim();
}

export function getAppSessionEmail(): string | null {
  return confirmedEmail;
}

/**
 * For code that runs right as the page opens: waits for the first session
 * check (once per page load), then says whether a session is usable.
 */
export async function canUseAppSession(expectedEmail?: string | null): Promise<boolean> {
  if (!checkedOnce) await checkAppSession();
  return hasAppSession(expectedEmail);
}

/** Asks the server whether this browser's session cookie is still valid. */
export function checkAppSession(): Promise<string | null> {
  if (!checkInFlight) {
    checkInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        confirmedEmail = res.ok && data?.ok ? String(data.email) : null;
        checkedOnce = true;
      } catch {
        // Offline: keep whatever was known.
      }
      notify();
      return confirmedEmail;
    })().finally(() => {
      checkInFlight = null;
    });
  }
  return checkInFlight;
}

/** Trades a fresh Google access token for an app session (one Google check). */
export async function startAppSession(googleAccessToken: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${googleAccessToken}` },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      confirmedEmail = String(data.email);
      checkedOnce = true;
      notify();
      return true;
    }
  } catch {
    // Best-effort: the Google token itself still works until it expires.
  }
  return false;
}

/** Signs this browser out on the server and clears the cookie. */
export async function endAppSession(): Promise<void> {
  confirmedEmail = null;
  notify();
  try {
    await fetch('/api/auth/session', { method: 'DELETE', cache: 'no-store' });
  } catch {
    // The cookie still expires on its own.
  }
}

/** Authorization header when a live Google token exists; otherwise the cookie alone does the work. */
export function bearerHeader(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
