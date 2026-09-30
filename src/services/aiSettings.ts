import { aiJsonHeaders } from './aiRequest';
import { getCurrentUser } from './accountManager';

/**
 * The user's "plan with AI (Google Gemini)" switch. The server holds the
 * real value and enforces it on every AI route; this keeps a local copy so
 * the chat notice and Settings show it instantly, and remembers a choice
 * made before the account was reachable (onboarding) until it's saved.
 */
const CACHE_KEY = 'aot_ai_planning_enabled';
const PENDING_KEY = 'aot_ai_planning_pending';
export const AI_SETTING_EVENT = 'aot_ai_setting_changed';

function readFlag(key: string): boolean | null {
  try {
    const value = localStorage.getItem(key);
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: boolean | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // Private mode: the server value still applies.
  }
}

/**
 * A choice not saved yet belongs to the account that made it (or to the
 * first account after onboarding, when there was none yet): it's never
 * applied to a different account signing in on this browser later.
 */
function readPending(): boolean | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const me = getCurrentUser()?.email?.toLowerCase() || null;
    if (typeof parsed?.value !== 'boolean') return null;
    if (parsed.owner && parsed.owner !== me) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function writePending(value: boolean | null) {
  try {
    if (value === null) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify({ value, owner: getCurrentUser()?.email?.toLowerCase() || null }));
  } catch {
    // Private mode: the server value still applies.
  }
}

/** The last known value; AI planning is on unless the user switched it off. */
export function getCachedAiPlanningEnabled(): boolean {
  return readFlag(CACHE_KEY) ?? true;
}

function publish(value: boolean) {
  writeFlag(CACHE_KEY, value);
  window.dispatchEvent(new CustomEvent(AI_SETTING_EVENT, { detail: { enabled: value } }));
}

async function putSetting(value: boolean): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/ai-settings', {
      method: 'PUT',
      headers: aiJsonHeaders(),
      body: JSON.stringify({ aiPlanningEnabled: value }),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Saves the choice (locally at once, on the server when reachable). */
export async function saveAiPlanningEnabled(value: boolean): Promise<boolean> {
  publish(value);
  writePending(value);
  const saved = await putSetting(value);
  if (saved) writePending(null);
  return saved;
}

/**
 * Brings the local copy in line with the server: first saves a choice that
 * couldn't be saved yet, then reads the server's value.
 */
export async function refreshAiPlanningEnabled(): Promise<boolean> {
  const pending = readPending();
  if (pending !== null && (await putSetting(pending))) writePending(null);
  try {
    const res = await fetch('/api/auth/ai-settings', { headers: aiJsonHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.aiPlanningEnabled === 'boolean') {
      publish(data.aiPlanningEnabled);
      return data.aiPlanningEnabled;
    }
  } catch {
    // Offline: keep the cached value.
  }
  return getCachedAiPlanningEnabled();
}
