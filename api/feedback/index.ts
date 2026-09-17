import { extractBearerToken, verifyGoogleAccessToken } from '../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../server/telegramStore.js';
import { getFeedbackEligibility, submitFeedback } from '../../server/feedbackStore.js';

// Consolidated Vercel function for /api/feedback/eligibility (GET) and
// /api/feedback/submit (POST) - two files, same auth, cleanly split by
// method already. vercel.json rewrites both old paths here so the
// frontend and server.ts's own Express routes need no changes; Vercel's
// Hobby plan caps a deployment at 12 serverless functions, and merging
// same-domain single-purpose endpoints like this is how this project
// stays under that cap as routes are added over time (see
// api/telegram/[...path].ts for the same pattern applied earlier).
// Logic below is ported verbatim from the two files this replaces.
export default async function handler(req: any, res: any) {
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const userId = await findOrCreateUserByEmail(verified.email);
      const eligibility = await getFeedbackEligibility(userId);
      return res.status(200).json({ ok: true, ...eligibility });
    } catch (err: any) {
      console.error('feedback eligibility error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to check eligibility' });
    }
  }

  if (req.method === 'POST') {
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

  return res.status(405).json({ error: 'Method not allowed' });
}
