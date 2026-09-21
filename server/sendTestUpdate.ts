import { getNotifyPrefs } from './googleOAuthTokenStore.js';
import { resolveChannels } from './backgroundAgendaScan.js';
import { listTasksNeedingAttention } from './dailyDigestData.js';
import { hasUpdateContent, renderEmailUpdate, renderTelegramUpdate, sampleUpdateModel, type DailyUpdateModel } from './dailyUpdateTemplate.js';
import { isEmailConfigured, sendEmail } from './emailService.js';
import { TelegramSessionStore } from './telegramStore.js';
import { TelegramService } from './telegramService.js';

export interface TestUpdateResult {
  ok: boolean;
  /** One entry per external channel tried. */
  results: Array<{ channel: 'telegram' | 'email'; ok: boolean; error?: string }>;
  /** True when the user had nothing real to report, so sample content was sent. */
  usedSample: boolean;
  error?: string;
}

/**
 * "Send me a test": delivers today's real update (their overdue / due-this-week
 * tasks) over every external channel they picked, or a clearly labelled sample
 * when there is nothing real yet. Lets the owner check email/Telegram delivery
 * without waiting for the schedule or holding the cron secret. Always the
 * caller's own address/chat - the recipient comes from the verified identity,
 * never from the request.
 */
export async function sendTestUpdate(input: { userId: string; email: string; appUrl: string }): Promise<TestUpdateResult> {
  const session = await TelegramSessionStore.getLinkedSessionForWebUser(input.email);
  const { prefs } = await getNotifyPrefs(input.userId);
  const { deliver } = resolveChannels(prefs.channels, session?.chatId, isEmailConfigured());
  if (deliver.length === 0) {
    return {
      ok: false,
      results: [],
      usedSample: false,
      error: 'Pick Telegram or Email first (Telegram needs to be connected, email needs to be set up).',
    };
  }

  const today = new Date().toISOString().substring(0, 10);
  const tasks = await listTasksNeedingAttention(input.userId, new Date().toISOString());
  const real: DailyUpdateModel = { today, overdue: tasks.overdue, dueThisWeek: tasks.dueThisWeek, newEvents: [], appUrl: input.appUrl };
  const usedSample = !hasUpdateContent(real);
  const model = usedSample ? sampleUpdateModel(today, input.appUrl) : real;

  const results: TestUpdateResult['results'] = [];
  for (const channel of deliver) {
    if (channel === 'email') {
      const mail = renderEmailUpdate(model);
      const sent = await sendEmail({ to: input.email, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text });
      results.push({ channel, ok: sent.ok, error: sent.error });
    } else {
      const update = renderTelegramUpdate(model);
      const sent = await TelegramService.sendMessage(session!.chatId, `🧪 <b>Test update</b>\n\n${update.text}`, {
        parse_mode: update.parse_mode,
        reply_markup: update.buttons.length ? { inline_keyboard: update.buttons.map((b) => [{ text: b.text, url: b.url }]) } : undefined,
        disable_web_page_preview: true,
      });
      results.push({ channel, ok: sent.ok, error: sent.ok ? undefined : sent.description || 'Telegram did not accept the message.' });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return { ok: failed.length === 0, results, usedSample, error: failed.map((f) => f.error).filter(Boolean).join(' ') || undefined };
}
