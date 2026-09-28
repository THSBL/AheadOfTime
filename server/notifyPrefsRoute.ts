import { verifyRequestUser } from './requestAuth.js';
import { findOrCreateUserByEmail, TelegramSessionStore } from './telegramStore.js';
import { getNotifyPrefs, hasBackgroundSyncLinked, setNotifyPrefs } from './googleOAuthTokenStore.js';
import { mergeNotifyPrefs } from './notifyPrefs.js';
import { isEmailConfigured } from './emailService.js';
import { sendTestUpdate } from './sendTestUpdate.js';

/**
 * GET  /api/auth/notify-prefs -> the Updates tab: preferences plus which channels can deliver
 * PUT  /api/auth/notify-prefs { prefs } -> save (partial) preferences
 * POST /api/auth/notify-prefs { sendTest: true } -> send a test update now
 *
 * Signed-in account only; unlike the older /api/auth/google/status routes
 * this does not need Background Sync.
 */
export async function handleNotifyPrefs(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);

  if (req.method === 'GET') {
    const [stored, linked, session] = await Promise.all([
      getNotifyPrefs(userId),
      hasBackgroundSyncLinked(userId),
      TelegramSessionStore.getLinkedSessionForWebUser(verified.email),
    ]);
    // Without Background Sync nothing goes out until the user picks a
    // frequency, so an untouched account reads as Off, not the daily default.
    const prefs = !stored.saved && !linked ? { ...stored.prefs, frequency: 'off' as const } : stored.prefs;
    res.status(200).json({
      ok: true,
      prefs,
      saved: stored.saved,
      backgroundSyncLinked: linked,
      telegramLinked: Boolean(session?.chatId),
      emailAvailable: isEmailConfigured(),
      email: verified.email,
    });
    return;
  }

  if (req.method === 'PUT') {
    const current = await getNotifyPrefs(userId);
    const next = mergeNotifyPrefs(req.body?.prefs, current.prefs);
    if (!next) {
      res.status(400).json({ ok: false, error: 'Those preferences are not valid.' });
      return;
    }
    await setNotifyPrefs(userId, next);
    res.status(200).json({ ok: true, prefs: next });
    return;
  }

  if (req.method === 'POST' && req.body?.sendTest) {
    const result = await sendTestUpdate({ userId, email: verified.email, appUrl: process.env.APP_URL?.trim() || '' });
    res.status(200).json({ ...result });
    return;
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
