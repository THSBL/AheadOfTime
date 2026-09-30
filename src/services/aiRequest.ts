import { getStoredAccessToken, isTokenExpired } from './googleAuth';
import { bearerHeader } from './appSession';
import { getCachedAiPlanningEnabled } from './aiSettings';

/**
 * Headers for the app's AI routes (/api/agent, /api/event/deep-refine,
 * /api/milestone/suggest-timing, /api/presets). They only answer signed-in
 * users: the session cookie goes along by itself, and a live Google token
 * is added when there is one.
 */
export function aiJsonHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return {
    'Content-Type': 'application/json',
    ...bearerHeader(token && !isTokenExpired() ? token : null),
    // Switched off here but not saved on the server yet: still off.
    ...(getCachedAiPlanningEnabled() ? {} : { 'X-AI-Planning': 'off' }),
  };
}

/**
 * The user-facing message an AI route sent with a refusal (off-topic, too
 * long, too many requests, signed out), or null for other failures.
 */
export async function readAiRefusal(res: Response): Promise<string | null> {
  if (![401, 413, 422, 429].includes(res.status)) return null;
  const data = await res.clone().json().catch(() => null);
  return typeof data?.message === 'string' && data.message.trim() ? data.message : null;
}
