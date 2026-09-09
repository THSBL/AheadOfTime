import { CalendarEvent, AgentMessage, OnboardingProfile } from '../types';

export interface AuthUser {
  id: string; // Normalized unique ID / email, e.g. "th.blanckaert@gmail.com"
  email: string;
  name?: string;
  avatar?: string;
  timeZone?: string;
  provider: 'google' | 'oidc' | 'guest';
  connectedAt: string;
}

const AUTH_USER_KEY = 'aot_active_user_session';
const LEGACY_EVENTS_KEY = 'tminus_events_v2';
const LEGACY_MESSAGES_KEY = 'tminus_messages_v2';

export const INITIAL_GUEST_MESSAGES: AgentMessage[] = [
  {
    id: 'msg-welcome-guest',
    sender: 'agent',
    text: `Hello! I'm Ahead Of Time, your assistant for busy calendars. Tell me about any upcoming event (a dinner, birthday, trip, or hosting friends), or connect your Google Calendar, and I will build your backward preparation milestones so you are ready when it starts.`,
    focusText: 'Ahead Of Time is ready for your events.',
    additionText: 'Tell me about an upcoming event or connect your calendar.',
    timestamp: new Date().toISOString(),
    mode: 'CREATE_AND_INTAKE',
  },
];

/**
 * Normalizes user ID or email into a safe storage key token
 */
export function normalizeUserId(userId?: string | null): string {
  if (!userId || typeof userId !== 'string') return 'guest';
  return userId.trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

/**
 * Returns a storage key strictly scoped to the active user account.
 * This guarantees complete data isolation between different Google/OIDC accounts.
 */
export function getUserStorageKey(baseKey: string, userId?: string | null): string {
  const normId = normalizeUserId(userId);
  if (normId === 'guest') {
    return `${baseKey}_guest`;
  }
  return `${baseKey}_user_${normId}`;
}

/**
 * Retrieves the currently active authenticated user from storage
 */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) {
      // Fallback: check if gcal_profile is in sessionStorage
      const gcalProfileRaw = sessionStorage.getItem('gcal_profile');
      if (gcalProfileRaw) {
        const parsed = JSON.parse(gcalProfileRaw);
        if (parsed?.id) {
          const user: AuthUser = {
            id: parsed.id.toLowerCase().trim(),
            email: parsed.id.toLowerCase().trim(),
            name: parsed.summary || parsed.id,
            timeZone: parsed.timeZone,
            provider: 'google',
            connectedAt: new Date().toISOString(),
          };
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
          return user;
        }
      }
      return null;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse current user from storage:', err);
    return null;
  }
}

/**
 * Sets the active user and dispatches a storage event for cross-component sync
 */
export function setCurrentUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      localStorage.setItem('aot_calendar_connected', 'true');
      localStorage.setItem('aot_onboarding_completed', 'true');
      localStorage.setItem('aot_user_name', user.name || user.email);
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem('aot_calendar_connected');
    }
    window.dispatchEvent(new CustomEvent('aot_account_switched', { detail: { user } }));
  } catch (err) {
    console.error('Failed to set current user:', err);
  }
}

/**
 * Loads events strictly belonging to the given user account.
 * If user is not logged in (guest) or has no stored events, returns an empty array (NO preloaded events).
 */
export function loadUserEvents(userId?: string | null): CalendarEvent[] {
  if (typeof window === 'undefined') return [];
  const normId = normalizeUserId(userId);
  // Logged-out / guest state must ALWAYS have a clean empty slate with 0 events
  if (normId === 'guest' || normId === 'anonymous' || !userId) {
    return [];
  }
  const scopedKey = getUserStorageKey('tminus_events_v2', normId);

  try {
    const scopedSaved = localStorage.getItem(scopedKey);
    if (scopedSaved) {
      const parsed = JSON.parse(scopedSaved);
      if (Array.isArray(parsed)) return parsed;
    }

    // Never preload dummy or sample events when not logged in or with no saved events
    return [];
  } catch (err) {
    console.error('Failed to load user events:', err);
    return [];
  }
}

/**
 * Persists events strictly into the user-scoped storage key
 */
export function saveUserEvents(events: CalendarEvent[], userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const normId = normalizeUserId(userId);
  if (normId === 'guest' || normId === 'anonymous' || !userId) {
    // Never persist events to unauthenticated guest storage
    return;
  }
  const scopedKey = getUserStorageKey('tminus_events_v2', normId);

  try {
    localStorage.setItem(scopedKey, JSON.stringify(events));
  } catch (err) {
    console.error('Failed to persist user events:', err);
  }
}

/**
 * Loads messages strictly belonging to the given user account
 */
export function loadUserMessages(userId?: string | null, userName?: string): AgentMessage[] {
  if (typeof window === 'undefined') return INITIAL_GUEST_MESSAGES;
  const normId = normalizeUserId(userId);
  const scopedKey = getUserStorageKey('tminus_messages_v2', normId);

  try {
    const scopedSaved = localStorage.getItem(scopedKey);
    if (scopedSaved) {
      const parsed = JSON.parse(scopedSaved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    if (normId !== 'guest') {
      const displayName = userName || normId.split('@')[0];
      return [
        {
          id: `msg-welcome-user-${Date.now()}`,
          sender: 'agent',
          text: `Welcome back, **${displayName}**! Your Google account (\`${normId}\`) is active and isolated. Scan your agenda or create an event to calculate backward preparation timelines.`,
          focusText: `Active Account: ${normId}`,
          additionText: 'Ready to build T-Minus preparation timelines.',
          timestamp: new Date().toISOString(),
          mode: 'CREATE_AND_INTAKE',
        },
      ];
    }

    return INITIAL_GUEST_MESSAGES;
  } catch (err) {
    console.error('Failed to load user messages:', err);
    return INITIAL_GUEST_MESSAGES;
  }
}

/**
 * Persists messages strictly into the user-scoped storage key
 */
export function saveUserMessages(messages: AgentMessage[], userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const normId = normalizeUserId(userId);
  const scopedKey = getUserStorageKey('tminus_messages_v2', normId);

  try {
    localStorage.setItem(scopedKey, JSON.stringify(messages));
  } catch (err) {
    console.error('Failed to persist user messages:', err);
  }
}

/**
 * Loads user-scoped onboarding profile
 */
export function loadUserOnboardingProfile(userId?: string | null): OnboardingProfile | null {
  if (typeof window === 'undefined') return null;
  const normId = normalizeUserId(userId);
  const scopedKey = getUserStorageKey('onboarding_profile', normId);

  try {
    const scopedSaved = localStorage.getItem(scopedKey);
    if (scopedSaved) return JSON.parse(scopedSaved);

    if (normId === 'guest') {
      const legacy = localStorage.getItem('onboarding_profile');
      if (legacy) return JSON.parse(legacy);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Saves user-scoped onboarding profile
 */
export function saveUserOnboardingProfile(profile: OnboardingProfile, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const normId = normalizeUserId(userId);
  const scopedKey = getUserStorageKey('onboarding_profile', normId);

  try {
    localStorage.setItem(scopedKey, JSON.stringify(profile));
  } catch (err) {
    console.warn('Failed to save onboarding profile:', err);
  }
}

/**
 * Performs a complete, GDPR-compliant account sign-out and cache purge
 */
export function logoutAndClearAccountSession(): void {
  if (typeof window === 'undefined') return;
  try {
    // 1. Clear session tokens
    sessionStorage.removeItem('gcal_access_token');
    sessionStorage.removeItem('gcal_token_expires_at');
    sessionStorage.removeItem('gcal_profile');
    sessionStorage.removeItem('aot_open_scan_modal');

    // 2. Clear active auth user & cached guest data
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem('aot_calendar_connected');
    localStorage.removeItem('aot_google_access_token');
    localStorage.removeItem('aot_google_token_expires_at');
    localStorage.removeItem(LEGACY_EVENTS_KEY);
    localStorage.removeItem('tminus_events_v2_guest');
    localStorage.removeItem('tminus_events_v2');
    localStorage.removeItem('tminus_events_v2:guest');
    localStorage.removeItem('tminus_events');

    // 3. Dispatch account switch event with null user
    window.dispatchEvent(new CustomEvent('aot_account_switched', { detail: { user: null } }));
  } catch (err) {
    console.error('Error during account logout:', err);
  }
}
