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

/** True once the server answered the session check on this page load (false while offline). */
export function appSessionChecked(): boolean {
  return checkedOnce;
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
      // An earlier sign-out didn't reach the server: finish it first, and
      // never treat that old session as signed in.
      if (hasPendingSignOut()) {
        await deleteServerSession();
        confirmedEmail = null;
        checkedOnce = true;
        notify();
        return null;
      }
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
// Session starts run one after another, so when two start close together
// (switching accounts) the last one requested is the one left standing.
let startChain: Promise<unknown> = Promise.resolve();

export function startAppSession(googleAccessToken: string): Promise<boolean> {
  const run = startChain.then(() => startAppSessionNow(googleAccessToken));
  startChain = run.catch(() => undefined);
  return run;
}

async function startAppSessionNow(googleAccessToken: string): Promise<boolean> {
  // A new sign-in supersedes a sign-out that hadn't reached the server yet.
  clearPendingSignOut();
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
  // Remembered until the server confirms: a sign-out that failed (offline,
  // server hiccup) must not leave a working session cookie behind.
  markPendingSignOut();
  await deleteServerSession();
}

const PENDING_SIGN_OUT_KEY = 'aot_pending_sign_out';

function markPendingSignOut(): void {
  try {
    localStorage.setItem(PENDING_SIGN_OUT_KEY, '1');
  } catch {
    // storage blocked: best effort below
  }
}

// Back from an email sign-in link: the server just started a new session,
// which an older unfinished sign-out must not revoke. Checked as soon as
// this module loads, before any component asks about the session.
try {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('signed_in') === 'email') {
    localStorage.removeItem('aot_pending_sign_out');
  }
} catch {
  // no window/storage (tests)
}

/** A fresh sign-in (e.g. back from an email link) replaces an unfinished sign-out. */
export function forgetPendingSignOut(): void {
  clearPendingSignOut();
}

function clearPendingSignOut(): void {
  try {
    localStorage.removeItem(PENDING_SIGN_OUT_KEY);
  } catch {
    // ignore
  }
}

function hasPendingSignOut(): boolean {
  try {
    return localStorage.getItem(PENDING_SIGN_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Revokes the server session, retrying a few times; true once the server confirmed. */
async function deleteServerSession(): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/auth/session', { method: 'DELETE', cache: 'no-store' });
      if (res.ok) {
        clearPendingSignOut();
        return true;
      }
    } catch {
      // offline: try again shortly
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return false;
}

/** Authorization header when a live Google token exists; otherwise the cookie alone does the work. */
export function bearerHeader(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
