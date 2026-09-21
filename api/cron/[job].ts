import { getWeeklyDigestData, sendOwnerAlert } from '../../server/qualityStore.js';
import { runBackgroundAgendaScan } from '../../server/backgroundAgendaScan.js';

// One dynamic function serves every cron job (/api/cron/weekly-report,
// /api/cron/agenda-scan - the paths vercel.json's crons entries point at).
// Vercel's Hobby plan caps a deployment at 12 serverless functions and this
// project is already at 11, so a new job goes in here rather than in a new
// api/cron/*.ts file (same consolidation as api/auth/google/index.ts).
export default async function handler(req: any, res: any) {
  const job = String(req.query?.job || '');
  if (job === 'weekly-report') return handleWeeklyReport(req, res);
  if (job === 'agenda-scan') return handleAgendaScan(req, res);
  return res.status(404).json({ ok: false, error: 'Unknown cron job' });
}

/**
 * Daily background agenda scan: Telegram digest of new calendar events that
 * need prep (see server/backgroundAgendaScan.ts). Unlike the weekly report
 * this FAILS CLOSED without CRON_SECRET, since it sends messages to real
 * users. Vercel Cron attaches `Authorization: Bearer $CRON_SECRET`
 * automatically once that env var exists on the project.
 *
 * Owner-only manual test (no messages sent, nothing advanced):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<app>/api/cron/agenda-scan?dryRun=1"
 */
async function handleAgendaScan(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET is not configured.' });
  }
  if ((req.headers?.authorization || '') !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const summary = await runBackgroundAgendaScan({
      appUrl: process.env.APP_URL?.trim(),
      dryRun: req.query?.dryRun === '1' || req.query?.dryRun === 'true',
    });
    return res.status(200).json({ ok: true, ...summary });
  } catch (err: any) {
    console.error('Background agenda scan failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Agenda scan failed' });
  }
}

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
async function handleWeeklyReport(req: any, res: any) {
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
