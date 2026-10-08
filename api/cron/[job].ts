import { getWeeklyDigestData, sendOwnerAlert } from '../../server/qualityStore.js';
import { runBackgroundAgendaScan } from '../../server/backgroundAgendaScan.js';
import { purgeDeletedEvents } from '../../server/eventSyncStore.js';
import { appOrigin } from '../../server/appOrigin.js';
import { runBlogEpisode, handleBlogAdmin } from '../../server/blogEpisodes.js';
import { buildWeeklyPackage, deliverWeeklyPackage, deliverWeeklySkipNotice, WeeklyContentSkipped } from '../../server/weeklyContent.js';

// One dynamic function serves every cron job (/api/cron/weekly-report,
// /api/cron/agenda-scan - the paths vercel.json's crons entries point at).
// Vercel's Hobby plan caps a deployment at 12 serverless functions and this
// project is already at 11, so a new job goes in here rather than in a new
// api/cron/*.ts file (same consolidation as api/auth/google/index.ts).
// The Monday run builds an AI plan and drafts on top of the report.
export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  const job = String(req.query?.job || '');
  if (job === 'weekly-report') return handleWeeklyReport(req, res);
  if (job === 'agenda-scan') return handleAgendaScan(req, res);
  // Manual run of the Monday content package (it also rides the weekly report).
  if (job === 'weekly-content') return handleWeeklyContent(req, res);
  // Manual run of the blog conversation (it also rides the daily agenda scan).
  if (job === 'blog-episode') return handleBlogEpisode(req, res);
  // The /admin/blog page (signed-in admins, not the cron secret); here for
  // the 60 seconds a writing run needs.
  if (job === 'blog-admin') return handleBlogAdmin(req, res, Date.now() + RUN_BUDGET_MS);
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
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET is not configured.' });
  }
  if ((req.headers?.authorization || '') !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  // Riding the same daily run (Hobby allows two cron jobs, both taken): events
  // deleted more than PURGE_AFTER_DAYS ago are removed for good.
  let purged = 0;
  try {
    purged = await purgeDeletedEvents();
  } catch (err) {
    console.warn('Purging deleted events failed (non-fatal):', err);
  }

  try {
    const summary = await runBackgroundAgendaScan({
      appUrl: appOrigin(req),
      dryRun: req.query?.dryRun === '1' || req.query?.dryRun === 'true',
    });
    // The weekly blog conversation advances with whatever time is left
    // (server/blogEpisodes.ts saves after every step and carries on tomorrow).
    const blog = dryRun(req) ? 'not run (dry run)' : await runBlogQuietly(req, startedAt + RUN_BUDGET_MS);
    return res.status(200).json({ ok: true, purgedDeletedEvents: purged, ...summary, blog });
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
  // Fails closed like the agenda scan: without CRON_SECRET anyone could
  // trigger it (it sends user feedback quotes to the owner's chat).
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return res.status(500).json({ ok: false, error: 'CRON_SECRET is not configured.' });
  }
  if ((req.headers?.authorization || '') !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
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
      ? data.sampleQuotes.map((q) => `  "${oneLine(q.feedback_text, 200)}"${q.score ? ` (${q.score}/5)` : ''}`).join('\n')
      : '  No freeform feedback this week';

    const message = [
      `📊 Weekly Digest`,
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

    // Monday is also the day the weekly content package goes out.
    const weeklyContent = await runWeeklyContentQuietly(req);
    return res.status(200).json({ ok: true, weeklyContent });
  } catch (err: any) {
    console.error('Weekly report generation failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to generate weekly report' });
  }
}

function oneLine(text: string | null | undefined, max: number): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * The weekly "T-minus Tuesday" content package (server/weeklyContent.ts):
 * built and sent to the owner on Mondays with the weekly report (Hobby
 * allows two cron jobs, both taken). Owner-only manual run, e.g. to preview
 * without publishing or sending anything:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<app>/api/cron/weekly-content?dryRun=1"
 */
async function handleWeeklyContent(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return res.status(500).json({ ok: false, error: 'CRON_SECRET is not configured.' });
  if ((req.headers?.authorization || '') !== `Bearer ${cronSecret}`) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const dryRun = req.query?.dryRun === '1' || req.query?.dryRun === 'true';
  try {
    const pkg = await buildWeeklyPackage({ appUrl: appOrigin(req), dryRun });
    const delivered = dryRun ? { email: false, telegram: false } : await deliverWeeklyPackage(pkg);
    return res.status(200).json({ ok: true, dryRun, delivered, package: pkg });
  } catch (err: any) {
    if (err instanceof WeeklyContentSkipped) {
      const notified = await deliverWeeklySkipNotice(err);
      return res.status(200).json({ ok: true, skipped: true, reason: err.message, notified });
    }
    console.error('Weekly content failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Weekly content failed' });
  }
}

/** Rides the Monday weekly report: never fails the report itself. */
async function runWeeklyContentQuietly(req: any): Promise<string> {
  try {
    const pkg = await buildWeeklyPackage({ appUrl: appOrigin(req) });
    const d = await deliverWeeklyPackage(pkg);
    return `weekly content ${pkg.week}: email ${d.email ? 'sent' : 'not sent'}, telegram ${d.telegram ? 'sent' : 'not sent'}`;
  } catch (err: any) {
    if (err instanceof WeeklyContentSkipped) {
      await deliverWeeklySkipNotice(err);
      return `weekly content ${err.week}: skipped (no AI planner)`;
    }
    console.warn('Weekly content (non-fatal):', err);
    return `weekly content failed: ${err?.message || err}`;
  }
}

/** This function's 60 s, minus room to answer. */
const RUN_BUDGET_MS = 52_000;
const dryRun = (req: any) => req.query?.dryRun === '1' || req.query?.dryRun === 'true';

/** Rides the daily agenda scan: never fails the scan itself. */
async function runBlogQuietly(req: any, deadline: number): Promise<string> {
  try {
    const r = await runBlogEpisode({ appUrl: appOrigin(req), deadline });
    return [r.status, r.week, r.step].filter(Boolean).join(' · ');
  } catch (err: any) {
    console.warn('Blog episode (non-fatal):', err);
    return `blog failed: ${err?.message || err}`;
  }
}

/**
 * Owner-only manual run of the weekly blog conversation: carries on the one
 * being written (or starts this week's); ?new=1 starts another one this
 * week. Run it again until it says "ready for review" (each run has ~50 s).
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/blog-episode"
 */
async function handleBlogEpisode(req: any, res: any) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return res.status(500).json({ ok: false, error: 'CRON_SECRET is not configured.' });
  if ((req.headers?.authorization || '') !== `Bearer ${cronSecret}`) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    const r = await runBlogEpisode({ appUrl: appOrigin(req), deadline: startedAt + RUN_BUDGET_MS, startNew: req.query?.new === '1' });
    return res.status(200).json({ ok: true, ...r });
  } catch (err: any) {
    console.error('Blog episode failed:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Blog episode failed' });
  }
}
