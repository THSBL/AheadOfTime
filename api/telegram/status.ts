import { TelegramService } from '../_lib/telegramService.js';
import { TelegramSessionStore } from '../_lib/telegramStore.js';

export default async function handler(req: any, res: any) {
  const isConfigured = TelegramService.isConfigured();
  let botInfo = null;
  let webhookInfo = null;

  if (isConfigured) {
    try {
      botInfo = await TelegramService.getMe();
      webhookInfo = await TelegramService.getWebhookInfo();
    } catch (e: any) {
      console.warn('Could not retrieve telegram status:', e.message);
    }
  }

  const host = req.headers?.['host'] || 'aheadoftime.app';
  const protocol = req.headers?.['x-forwarded-proto'] || 'https';
  const inferredWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  return res.status(200).json({
    isConfigured,
    hasToken: isConfigured,
    botInfo: botInfo?.ok ? botInfo.result : null,
    webhookInfo: webhookInfo?.ok ? webhookInfo.result : null,
    inferredWebhookUrl,
    activeSessions: TelegramSessionStore.getAllSessions().length,
    storedEventsCount: TelegramSessionStore.getAllEvents().length,
  });
}
