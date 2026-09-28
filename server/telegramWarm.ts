import { query } from './db.js';
import { TelegramService } from './telegramService.js';

const FALLBACK_BOT_USERNAME = 'AheadTimebot';
let cachedUsername: string | null = null;

/** The bot's @username, asked from Telegram once per instance. */
export async function getBotUsername(): Promise<string> {
  if (cachedUsername) return cachedUsername;
  try {
    const me = await TelegramService.getMe();
    if (me.ok && me.result?.username) cachedUsername = me.result.username;
  } catch {
    // fall back below
  }
  return cachedUsername || FALLBACK_BOT_USERNAME;
}

/**
 * GET /api/telegram/warm: the app's "Open Telegram" button calls this as it
 * opens the chat. It lands on the same function Telegram's webhook uses, so
 * that function starts up (and connects to the database) while Telegram is
 * still opening - the user's first message then isn't held up by a cold start.
 */
export async function handleTelegramWarm(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const [botUsername] = await Promise.all([getBotUsername(), query('SELECT 1').catch(() => undefined)]);
  res.status(200).json({ ok: true, botUsername, deepLink: `https://t.me/${botUsername}` });
}
