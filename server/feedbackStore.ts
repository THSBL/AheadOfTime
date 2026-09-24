import { query } from './db.js';

const CSAT_CADENCE_DAYS = 30;

// Short fixed taxonomy, matched via keyword rules rather than a Gemini call
// per submission - CSAT/feedback text is short and low-volume, so a
// keyword classifier gets most of the value with no added latency, no
// extra Gemini spend, and no risk of the tagger itself hallucinating.
const TAG_KEYWORDS: Record<string, RegExp> = {
  pricing: /\b(price|pricing|cost|expensive|subscription|plan tier|billing)\b/i,
  ai_quality: /\b(ai|gemini|wrong plan|hallucinat|made up|nonsense|inaccurate|bad suggestion)\b/i,
  calendar_sync: /\b(google calendar|sync|google tasks|calendar event|didn'?t sync|not syncing)\b/i,
  telegram_bot: /\btelegram\b/i,
  ux_confusion: /\b(confusing|couldn'?t figure|hard to find|unclear|didn'?t understand how)\b/i,
  missing_feature: /\b(wish it (had|could)|would be nice|feature request|missing|can'?t (do|find))\b/i,
  performance: /\b(slow|lag|freeze|crash|loading forever|timeout|timed out)\b/i,
  praise: /\b(love|great|awesome|amazing|fantastic|works well|thank you)\b/i,
};

export function tagFeedbackText(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags: string[] = [];
  for (const [tag, pattern] of Object.entries(TAG_KEYWORDS)) {
    if (pattern.test(text)) tags.push(tag);
  }
  return tags;
}

export interface FeedbackEligibility {
  csatEligible: boolean;
  lastCsatAt: string | null;
  nextEligibleAt: string | null;
}

export async function getFeedbackEligibility(userId: string): Promise<FeedbackEligibility> {
  const rows = await query<{ created_at: string }>(
    `SELECT created_at FROM csat_responses
     WHERE user_id = $1 AND response_type = 'csat'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const last = rows[0]?.created_at || null;
  if (!last) {
    return { csatEligible: true, lastCsatAt: null, nextEligibleAt: null };
  }
  const lastDate = new Date(last);
  const nextEligible = new Date(lastDate.getTime() + CSAT_CADENCE_DAYS * 24 * 60 * 60 * 1000);
  return {
    csatEligible: nextEligible.getTime() <= Date.now(),
    lastCsatAt: lastDate.toISOString(),
    nextEligibleAt: nextEligible.toISOString(),
  };
}

export interface SubmitFeedbackInput {
  userId: string;
  responseType: 'csat' | 'general_feedback';
  score?: number | null;
  feedbackText?: string | null;
  sourceChannel?: 'web' | 'telegram' | 'whatsapp';
}

export interface FeedbackRow {
  id: string;
  createdAt: string;
  responseType: 'csat' | 'general_feedback';
  score: number | null;
  feedbackText: string | null;
  tags: string[];
  sourceChannel: string;
  userEmail: string;
}

/**
 * Admin-only listing, most recent first. Joined to `users` for a readable
 * email instead of a bare user_id - there is no admin UI for browsing
 * users separately, so this is the only place that join is needed.
 */
export async function listRecentFeedback(limit: number = 200): Promise<FeedbackRow[]> {
  const rows = await query<{
    id: string;
    created_at: string;
    response_type: 'csat' | 'general_feedback';
    score: number | null;
    feedback_text: string | null;
    tags: string[];
    source_channel: string;
    email: string;
  }>(
    `SELECT c.id, c.created_at, c.response_type, c.score, c.feedback_text, c.tags, c.source_channel, u.email
     FROM csat_responses c
     JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC
     LIMIT $1`,
    [Math.min(Math.max(limit, 1), 1000)]
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    responseType: r.response_type,
    score: r.score,
    feedbackText: r.feedback_text,
    tags: r.tags || [],
    sourceChannel: r.source_channel,
    userEmail: r.email,
  }));
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<{ id: string; tags: string[] }> {
  if (input.responseType === 'csat') {
    const eligibility = await getFeedbackEligibility(input.userId);
    if (!eligibility.csatEligible) {
      throw new Error('CSAT already submitted this month.');
    }
    if (typeof input.score !== 'number' || input.score < 1 || input.score > 5) {
      throw new Error('CSAT score must be between 1 and 5.');
    }
  }

  const tags = tagFeedbackText(input.feedbackText);
  const rows = await query<{ id: string }>(
    `INSERT INTO csat_responses (user_id, response_type, score, feedback_text, tags, source_channel)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.userId,
      input.responseType,
      input.responseType === 'csat' ? input.score : null,
      input.feedbackText || null,
      tags,
      input.sourceChannel || 'web',
    ]
  );
  return { id: rows[0].id, tags };
}
