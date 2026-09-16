import { getWeeklyDigestData, sendOwnerAlert } from '../../server/qualityStore.js';

/**
 * Weekly digest covering both bug-quality signals and CSAT/feedback in one
 * message, sent ONLY to the owner's Telegram chat (see qualityStore.ts's
 * sendOwnerAlert - it always reads OWNER_TELEGRAM_CHAT_ID from the
 * environment, never from anything request-supplied). No email: the
 * product owner decided Telegram-to-self is enough, so this replaces the
 * originally-proposed Resend email delivery.
 *
 * Triggered by Vercel Cron (see vercel.json's crons entry) - protected by
 * CRON_SECRET so it can't be hit by anyone else.
 */
export default async function handler(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers?.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const data = await getWeeklyDigestData();

    const csatLine = data.csatCount > 0
      ? `⭐ CSAT: ${data.csatAverage?.toFixed(1)}/5 (${data.csatCount} responses)` +
        (data.priorCsatAverage ? `, prior week ${data.priorCsatAverage.toFixed(1)}` : '')
      : '⭐ CSAT: no responses this week';

    const qualityLines = data.qualitySummary.length > 0
      ? data.qualitySummary.map((r) => `  • ${r.signal_type} (${r.severity}): ${r.count}`).join('\n')
      : '  • No AI quality signals logged this week';

    const tagLines = data.tagCounts.length > 0
      ? data.tagCounts.map((t) => `  • ${t.tag}: ${t.count}`).join('\n')
      : '  • No tagged feedback this week';

    const quoteLines = data.sampleQuotes.length > 0
      ? data.sampleQuotes.map((q) => `  "${q.feedback_text}"${q.score ? ` (${q.score}/5)` : ''}`).join('\n')
      : '  No freeform feedback this week';

    const message = [
      `📊 *Weekly Digest*`,
      '',
      csatLine,
      '',
      `🩺 AI quality signals (last 7 days):`,
      qualityLines,
      '',
      `🏷️ Feedback tags:`,
      tagLines,
      '',
      `💬 Sample feedback:`,
      quoteLines,
    ].join('\n');

    await sendOwnerAlert(message);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('Weekly report generation failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to generate weekly report' });
  }
}
