import { verifyRequestUser } from './requestAuth.js';
import { findOrCreateUserByEmail } from './telegramStore.js';
import { isAiPlanningEnabled, setAiPlanningEnabled } from './aiGuard.js';

/**
 * GET /api/auth/ai-settings -> { aiPlanningEnabled }
 * PUT /api/auth/ai-settings { aiPlanningEnabled: boolean }
 *
 * The user's choice whether plans are written with Gemini. Off: every
 * route (web and Telegram) uses the built-in planner instead - see
 * guardAiRequest and aiAccessForChat, which read the same value.
 */
export async function handleAiSettings(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, aiPlanningEnabled: await isAiPlanningEnabled(userId) });
    return;
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const value = req.body?.aiPlanningEnabled;
    if (typeof value !== 'boolean') {
      res.status(400).json({ ok: false, error: 'aiPlanningEnabled must be true or false' });
      return;
    }
    await setAiPlanningEnabled(userId, value);
    res.status(200).json({ ok: true, aiPlanningEnabled: value });
    return;
  }
  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
