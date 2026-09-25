import { extractBearerToken, verifyGoogleAccessToken, isAdminEmail } from '../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../server/telegramStore.js';
import { getFeedbackEligibility, submitFeedback, listRecentFeedback } from '../../server/feedbackStore.js';
import { recordCalendarVote, summarizeCalendarVotes } from '../../server/calendarPollStore.js';
import { parseCalendarVote } from '../../src/utils/calendarPoll.js';

// Consolidated Vercel function for /api/feedback/eligibility (GET) and
// /api/feedback/submit (POST) - two files, same auth, cleanly split by
// method already. vercel.json rewrites both old paths here so the
// frontend and server.ts's own Express routes need no changes; Vercel's
// Hobby plan caps a deployment at 12 serverless functions, and merging
// same-domain single-purpose endpoints like this is how this project
// stays under that cap as routes are added over time (see
// api/telegram/[...path].ts for the same pattern applied earlier).
// Logic below is ported verbatim from the two files this replaces.
// "Which calendar do you use?" (landing page, onboarding, feedback page).
// Anonymous on purpose - landing-page visitors aren't signed in - so it is
// handled before the sign-in check below; a signed-in user's id is attached
// when a valid token happens to be present.
async function handleCalendarPoll(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const parsed = parseCalendarVote(req.body);
  if ('error' in parsed) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }
  try {
    const verified = await verifyGoogleAccessToken(extractBearerToken(req));
    const userId = verified ? await findOrCreateUserByEmail(verified.email) : null;
    await recordCalendarVote(parsed.vote, userId);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('calendar poll error:', err);
    return res.status(500).json({ ok: false, error: 'Could not save your answer.' });
  }
}

export default async function handler(req: any, res: any) {
  if (req.query?.action === 'calendar-poll') {
    return handleCalendarPoll(req, res);
  }
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET' && req.query?.action === 'admin-list') {
    if (!isAdminEmail(verified.email)) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    try {
      const rows = await listRecentFeedback(200);
      // Never lets a poll problem hide the feedback list itself.
      const calendarPoll = await summarizeCalendarVotes().catch((err) => {
        console.error('calendar poll summary error:', err);
        return null;
      });
      return res.status(200).json({ ok: true, rows, calendarPoll });
    } catch (err: any) {
      console.error('feedback admin-list error:', err);
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to load feedback' });
    }
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
