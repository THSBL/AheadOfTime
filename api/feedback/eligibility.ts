import { extractBearerToken, verifyGoogleAccessToken } from '../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../server/telegramStore.js';
import { getFeedbackEligibility } from '../../server/feedbackStore.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const userId = await findOrCreateUserByEmail(verified.email);
    const eligibility = await getFeedbackEligibility(userId);
    return res.status(200).json({ ok: true, ...eligibility });
  } catch (err: any) {
    console.error('feedback eligibility error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to check eligibility' });
  }
}
