import { TelegramService } from '../_lib/telegramService.js';
import { TelegramSessionStore } from '../_lib/telegramStore.js';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
  const userId = (req.query.userId as string) || 'user_default';

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

  const pairStatus = TelegramSessionStore.getPairingStatus(code, userId);

  return res.status(200).json({
    ok: true,
    linked: pairStatus.linked,
    status: pairStatus.status,
    username: pairStatus.username || (pairStatus.session?.username ? `${pairStatus.session.username}` : undefined),
    chatId: pairStatus.chatId || pairStatus.telegram_chat_id,
    telegram_linked: pairStatus.linked,
    isLinked: pairStatus.linked,
    telegram_chat_id: pairStatus.chatId || pairStatus.telegram_chat_id,
    session: pairStatus.session,
    isConfigured,
    hasToken: isConfigured,
    botInfo: botInfo?.ok ? botInfo.result : null,
    webhookInfo: webhookInfo?.ok ? webhookInfo.result : null,
    inferredWebhookUrl,
    activeSessions: TelegramSessionStore.getAllSessions().length,
    storedEventsCount: TelegramSessionStore.getAllEvents().length,
  });
}
