import { CalendarEvent, TMinusMilestone } from '../src/types.js';
import { signEventDeepLink } from './deepLinkToken.js';

export interface TelegramSendMessageOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  reply_markup?: {
    inline_keyboard?: Array<Array<{
      text: string;
      url?: string;
      callback_data?: string;
      web_app?: { url: string };
    }>>;
    keyboard?: Array<Array<{ text: string }>>;
    resize_keyboard?: boolean;
    one_time_keyboard?: boolean;
  };
  disable_web_page_preview?: boolean;
}

export class TelegramService {
  private static getBotToken(): string | null {
    return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  }

  private static getApiBase(): string {
    const token = this.getBotToken();
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured in environment.');
    }
    return `https://api.telegram.org/bot${token}`;
  }

  public static isConfigured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  }

  /**
   * Send a message to a Telegram chat
   */
  public static async sendMessage(
    chatId: number | string,
    text: string,
    options: TelegramSendMessageOptions = {}
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    if (!this.isConfigured()) {
      console.warn('⚠️ TelegramService: Cannot send message, TELEGRAM_BOT_TOKEN is missing.');
      return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured.' };
    }

    const cleanChatId = typeof chatId === 'string' ? chatId.trim() : chatId;
    if (!cleanChatId || cleanChatId === '123456789' || cleanChatId === 123456789 || cleanChatId === 'demo' || cleanChatId === 'null' || cleanChatId === 'undefined') {
      console.warn(`⚠️ TelegramService: Aborted sending message to uninitialized or placeholder chat ID: "${chatId}". User must initiate a chat with the bot first.`);
      return {
        ok: false,
        error_code: 400,
        description: 'Telegram chat is not connected. Please click "Connect Telegram" and start @AheadTimebot to link your account.',
      };
    }

    try {
      const url = `${this.getApiBase()}/sendMessage`;
      const parseMode = options.parse_mode !== undefined ? options.parse_mode : 'Markdown';
      const payload: Record<string, any> = {
        chat_id: cleanChatId,
        text,
        disable_web_page_preview: options.disable_web_page_preview ?? false,
      };

      if (parseMode) {
        payload.parse_mode = parseMode;
      }
      if (options.reply_markup) {
        payload.reply_markup = options.reply_markup;
      }

      console.log(`📤 Telegram sendMessage -> chat ${cleanChatId}:`, {
        textSnippet: text.slice(0, 60),
        parse_mode: parseMode,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let data = await res.json();
      console.log('📥 Telegram sendMessage response:', JSON.stringify(data));

      // Automatic fallback: If Markdown entity parsing fails, retry in plain text so message is NEVER lost
      if (!data.ok && parseMode && data.description?.includes("can't parse entities")) {
        console.warn('⚠️ Telegram markdown parsing failed, retrying immediately in plain text...');
        delete payload.parse_mode;
        const retryRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        data = await retryRes.json();
        console.log('📥 Telegram sendMessage fallback response:', JSON.stringify(data));
      }

      if (!data.ok) {
        if (data.description?.includes('chat not found')) {
          console.warn(`ℹ️ Telegram note: Chat ID ${cleanChatId} not found by Telegram. (The user has not clicked /start or authorized the bot yet).`);
          return {
            ok: false,
            error_code: 400,
            description: 'Chat not found on Telegram. Please open @AheadTimebot and click Start to enable notifications.',
          };
        }
        console.warn('⚠️ Telegram API response notice:', data);
      }
      return data;
    } catch (err: any) {
      console.warn('⚠️ Telegram sendMessage network error:', err?.message || err);
      return { ok: false, description: err?.message || 'Network error' };
    }
  }

  /**
   * Answer a Telegram callback query
   */
  public static async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<any> {
    if (!this.isConfigured()) return { ok: false };
    try {
      const url = `${this.getApiBase()}/answerCallbackQuery`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      });
      return await res.json();
    } catch (err) {
      console.error('Error answering callback query:', err);
      return { ok: false };
    }
  }

  /**
   * Dispatches an executive, crisp refinement prompt for an event
   */
  public static async sendRefinementPrompt(
    chatId: number | string,
    event: CalendarEvent,
    appBaseUrl: string,
    customText?: string
  ): Promise<{ ok: boolean; result?: any }> {
    const cleanUrl = appBaseUrl.replace(/\/+$/, '');
    // Signed so tapping this link works whether or not the browser has a
    // live Google session - a user chatting with the bot right now
    // shouldn't be asked to separately re-authenticate just to view what
    // they just did. Falls back to a plain (Google-auth-only) link if
    // TELEGRAM_WEBHOOK_SECRET isn't configured in this environment.
    const deepLinkAuth = signEventDeepLink(event.id);
    const authQuery = deepLinkAuth ? `&dlt=${deepLinkAuth.token}&dlte=${deepLinkAuth.expiresAt}` : '';
    const refineDeepLink = `${cleanUrl}/?event_id=${encodeURIComponent(event.id)}&action=refine${authQuery}`;

    let text = customText;
    if (!text) {
      const milestoneLines = (event.milestones || [])
        .slice(0, 5)
        .map((m: TMinusMilestone) => `📌 *${m.calculatedDate}* — ${m.title}`)
        .join('\n');

      // Was "Initial Runway Created" / "lock your optimal reverse-logistics
      // schedule" - internal planning vocabulary a user has no reason to
      // know. Also now honest about what actually happened: the event is
      // saved here, not pushed to Google Calendar/Tasks yet - that used to
      // be implied by "Runway Created" without ever being stated.
      text = [
        `*${event.title}*${event.eventDate ? ` — ${event.eventDate}` : ''}`,
        event.location ? `📍 ${event.location}` : null,
        '',
        `Here's your prep checklist, saved to your account:`,
        milestoneLines || '📌 Initial review and planning',
        '',
        `Not on your calendar yet - open the app to push it to Google Calendar/Tasks. Anything off? Tap Refine in Chat below and tell me.`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    return this.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🛠️ Open Full Timeline in App',
              url: refineDeepLink,
            },
          ],
          [
            {
              text: '✅ Looks Good',
              callback_data: `CONFIRM_DEFAULT:${event.id}`,
            },
            {
              text: '🔄 Refine in Chat',
              callback_data: `ADD_NOTE:${event.id}`,
            },
          ],
        ],
      },
    });
  }

  /**
   * Set webhook URL on Telegram API
   */
  public static async setWebhook(
    webhookUrl: string,
    secretToken?: string
  ): Promise<{ ok: boolean; description?: string; result?: any }> {
    if (!this.isConfigured()) {
      return { ok: false, description: 'TELEGRAM_BOT_TOKEN is missing.' };
    }

    try {
      const url = `${this.getApiBase()}/setWebhook`;
      const token = secretToken || process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
      const body: any = {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      };
      if (token) {
        body.secret_token = token;
      }

      console.log(`Setting Telegram webhook to ${webhookUrl} (secret configured: ${Boolean(token)})`);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      return await res.json();
    } catch (err: any) {
      return { ok: false, description: err?.message || 'Failed to set webhook' };
    }
  }

  /**
   * Query webhook info
   */
  public static async getWebhookInfo(): Promise<any> {
    if (!this.isConfigured()) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is missing.' };
    try {
      const res = await fetch(`${this.getApiBase()}/getWebhookInfo`);
      return await res.json();
    } catch (err: any) {
      return { ok: false, description: err?.message };
    }
  }

  /**
   * Query bot identity (getMe)
   */
  public static async getMe(): Promise<any> {
    if (!this.isConfigured()) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is missing.' };
    try {
      const res = await fetch(`${this.getApiBase()}/getMe`);
      return await res.json();
    } catch (err: any) {
      return { ok: false, description: err?.message };
    }
  }
}
