import { extractBearerToken, verifyGoogleAccessToken } from '../../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../../server/telegramStore.js';
import { hasBackgroundSyncLinked, unlinkBackgroundSync } from '../../../server/googleOAuthTokenStore.js';

export default async function handler(req: any, res: any) {
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const userId = await findOrCreateUserByEmail(verified.email);

  if (req.method === 'GET') {
    const linked = await hasBackgroundSyncLinked(userId);
    return res.status(200).json({ ok: true, linked });
  }

  if (req.method === 'DELETE') {
    await unlinkBackgroundSync(userId);
    return res.status(200).json({ ok: true, linked: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
