import { query } from './db.js';
import { TelegramService } from './telegramService.js';

export type QualitySignalType =
  | 'gemini_error'
  | 'gemini_fallback'
  | 'json_parse_failure'
  | 'explicit_failure_reply'
  | 'empty_plan_returned'
  | 'rapid_correction'
  | 'plan_generated'
  | 'plan_refined'
  // "AOT VALIDATES" (architecture reset Phase 5) - a milestone's calculated
  // date was unparseable or absurdly far past its event, logged as a
  // non-blocking signal rather than rejecting the write.
  | 'milestone_chronology_anomaly';

export type QualitySeverity = 'low' | 'medium' | 'high';

export interface LogQualityEventInput {
  userId?: string | null;
  eventId?: string | null;
  sourceChannel: 'web' | 'telegram' | 'whatsapp';
  signalType: QualitySignalType;
  severity?: QualitySeverity;
  rawUserMessage?: string | null;
  errorDetail?: string | null;
  modelUsed?: string | null;
  context?: Record<string, unknown>;
}

/**
 * Owner-only alert channel. This must NEVER take a chat id from a request
 * payload or any user-supplied value - it always reads OWNER_TELEGRAM_CHAT_ID
 * directly from the environment, so a bug-quality alert can only ever reach
 * the product owner, never another user.
 */
async function sendOwnerAlert(text: string): Promise<void> {
  const ownerChatId = process.env.OWNER_TELEGRAM_CHAT_ID?.trim();
  if (!ownerChatId) return;
  try {
    await TelegramService.sendMessage(ownerChatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    // Never let an alert-delivery failure surface anywhere - this is a
    // best-effort side channel, not something a request should fail over.
    console.warn('Owner alert delivery failed:', err);
  }
}

const MAX_MESSAGE_LEN = 500;
const truncate = (s: string | null | undefined, max = MAX_MESSAGE_LEN): string | null =>
  s ? (s.length > max ? `${s.slice(0, max)}…` : s) : null;

/**
 * Pure logging - inserts one ai_quality_events row and, for high severity,
 * fires an immediate owner-only Telegram alert. Never throws: every call
 * site instrumented with this sits inside an existing catch block or a
 * happy-path tail, and a failure to log a quality signal must never change
 * what the AI pipeline actually returns to the user.
 */
export async function logQualityEvent(input: LogQualityEventInput): Promise<string | null> {
  const severity = input.severity || 'medium';
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO ai_quality_events
         (user_id, event_id, source_channel, signal_type, severity, raw_user_message, error_detail, model_used, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.userId || null,
        input.eventId || null,
        input.sourceChannel,
        input.signalType,
        severity,
        truncate(input.rawUserMessage),
        truncate(input.errorDetail),
        input.modelUsed || null,
        JSON.stringify(input.context || {}),
      ]
    );
    const id = rows[0]?.id || null;

    if (severity === 'high') {
      const lines = [
        `🚨 *High-severity AI quality signal*`,
        `Type: \`${input.signalType}\``,
        `Channel: ${input.sourceChannel}`,
        input.errorDetail ? `Error: ${truncate(input.errorDetail, 300)}` : null,
        input.rawUserMessage ? `Message: ${truncate(input.rawUserMessage, 200)}` : null,
      ].filter(Boolean);
      await sendOwnerAlert(lines.join('\n'));
      if (id) {
        await query(`UPDATE ai_quality_events SET notified_at = now() WHERE id = $1`, [id]).catch(() => {});
      }
    }

    return id;
  } catch (err) {
    console.warn('logQualityEvent failed (non-fatal):', err);
    return null;
  }
}

/**
 * Signal 4: a correction arriving shortly after a plan was (re)generated for
 * the same event is strong evidence the first answer was wrong. Checks for
 * a plan_generated/plan_refined row for this event in the last N minutes
 * and, if found, logs a linked rapid_correction row.
 */
export async function checkAndLogRapidCorrection(
  eventId: string | null | undefined,
  userId: string | null | undefined,
  sourceChannel: 'web' | 'telegram' | 'whatsapp',
  correctionText: string,
  windowMinutes = 15
): Promise<void> {
  if (!eventId) return;
  try {
    const rows = await query<{ id: string }>(
      `SELECT id FROM ai_quality_events
       WHERE event_id = $1
         AND signal_type IN ('plan_generated', 'plan_refined')
         AND created_at > now() - ($2 || ' minutes')::interval
       ORDER BY created_at DESC
       LIMIT 1`,
      [eventId, String(windowMinutes)]
    );
    const priorPlanRowId = rows[0]?.id;
    if (!priorPlanRowId) return;

    await query(
      `INSERT INTO ai_quality_events
         (user_id, event_id, source_channel, signal_type, severity, related_event_row, raw_user_message)
       VALUES ($1, $2, $3, 'rapid_correction', 'high', $4, $5)`,
      [userId || null, eventId, sourceChannel, priorPlanRowId, truncate(correctionText)]
    );
    await sendOwnerAlert(
      [
        `🚨 *Rapid correction after plan generation*`,
        `A correction arrived within ${windowMinutes} min of a plan being generated for this event - likely the first answer was wrong.`,
        `Channel: ${sourceChannel}`,
        correctionText ? `Correction: ${truncate(correctionText, 200)}` : null,
      ].filter(Boolean).join('\n')
    );
  } catch (err) {
    console.warn('checkAndLogRapidCorrection failed (non-fatal):', err);
  }
}

export interface WeeklyDigestData {
  qualitySummary: { signal_type: string; severity: string; count: number }[];
  csatAverage: number | null;
  csatCount: number;
  priorCsatAverage: number | null;
  tagCounts: { tag: string; count: number }[];
  sampleQuotes: { score: number | null; feedback_text: string }[];
}

/**
 * Everything the weekly Telegram digest needs, pulled in one pass. Covers
 * both features per the product decision to send one combined weekly
 * message rather than two separate ones.
 */
export async function getWeeklyDigestData(): Promise<WeeklyDigestData> {
  const qualitySummary = await query<{ signal_type: string; severity: string; count: string }>(
    `SELECT signal_type, severity, COUNT(*)::text as count
     FROM ai_quality_events
     WHERE created_at > now() - interval '7 days'
     GROUP BY signal_type, severity
     ORDER BY severity DESC, count DESC`
  );

  const csatRows = await query<{ avg: string | null; count: string }>(
    `SELECT AVG(score)::text as avg, COUNT(*)::text as count
     FROM csat_responses
     WHERE response_type = 'csat' AND created_at > now() - interval '7 days' AND score IS NOT NULL`
  );
  const priorCsatRows = await query<{ avg: string | null }>(
    `SELECT AVG(score)::text as avg
     FROM csat_responses
     WHERE response_type = 'csat' AND created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days' AND score IS NOT NULL`
  );

  const tagRows = await query<{ tag: string; count: string }>(
    `SELECT unnest(tags) as tag, COUNT(*)::text as count
     FROM csat_responses
     WHERE created_at > now() - interval '7 days'
     GROUP BY tag
     ORDER BY count DESC
     LIMIT 10`
  );

  const quoteRows = await query<{ score: number | null; feedback_text: string }>(
    `SELECT score, feedback_text FROM csat_responses
     WHERE created_at > now() - interval '7 days' AND feedback_text IS NOT NULL AND feedback_text != ''
     ORDER BY score ASC NULLS LAST
     LIMIT 3`
  );

  return {
    qualitySummary: qualitySummary.map((r) => ({ ...r, count: parseInt(r.count, 10) })),
    csatAverage: csatRows[0]?.avg ? parseFloat(csatRows[0].avg) : null,
    csatCount: csatRows[0]?.count ? parseInt(csatRows[0].count, 10) : 0,
    priorCsatAverage: priorCsatRows[0]?.avg ? parseFloat(priorCsatRows[0].avg) : null,
    tagCounts: tagRows.map((r) => ({ ...r, count: parseInt(r.count, 10) })),
    sampleQuotes: quoteRows,
  };
}

export { sendOwnerAlert };
