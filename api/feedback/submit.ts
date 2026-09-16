import { extractBearerToken, verifyGoogleAccessToken } from '../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../server/telegramStore.js';
import { submitFeedback } from '../../server/feedbackStore.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const { responseType, score, feedbackText } = req.body || {};
    if (responseType !== 'csat' && responseType !== 'general_feedback') {
      return res.status(400).json({ ok: false, error: 'Invalid responseType' });
    }

    const userId = await findOrCreateUserByEmail(verified.email);
    const result = await submitFeedback({
      userId,
      responseType,
      score: typeof score === 'number' ? score : undefined,
      feedbackText: typeof feedbackText === 'string' ? feedbackText.trim().slice(0, 2000) : undefined,
      sourceChannel: 'web',
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error('feedback submit error:', err);
    return res.status(400).json({ ok: false, error: err?.message || 'Failed to submit feedback' });
  }
}
