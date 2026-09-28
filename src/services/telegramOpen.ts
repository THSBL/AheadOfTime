/**
 * "Open Telegram": the chat with the bot opens in the Telegram app, and the
 * same tap wakes the bot's server (GET /api/telegram/warm lands on the
 * function Telegram's webhook uses), so its start-up happens while Telegram
 * is still opening instead of after the user's first message.
 */
const FALLBACK_LINK = 'https://t.me/AheadTimebot';
const STORAGE_KEY = 'aot_telegram_bot_link';

export function cachedBotLink(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || FALLBACK_LINK;
  } catch {
    return FALLBACK_LINK;
  }
}

/** Wakes the bot; resolves with its t.me link (remembered for next time). */
export async function warmTelegramBot(): Promise<string> {
  try {
    const res = await fetch('/api/telegram/warm', { cache: 'no-store', keepalive: true });
    const data = await res.json();
    if (typeof data?.deepLink === 'string' && data.deepLink.startsWith('https://t.me/')) {
      try {
        localStorage.setItem(STORAGE_KEY, data.deepLink);
      } catch {
        // storage unavailable: the fallback link still works
      }
      return data.deepLink;
    }
  } catch {
    // offline or blocked: opening Telegram still works
  }
  return cachedBotLink();
}
