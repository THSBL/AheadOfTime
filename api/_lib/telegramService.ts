import type { CalendarEvent, TMinusMilestone } from './types.js';

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
  ): Promise<{ ok: boolean; result?: any; description?: string }> {
    if (!this.isConfigured()) {
      console.warn('⚠️ TelegramService: Cannot send message, TELEGRAM_BOT_TOKEN is missing.');
      return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured.' };
    }

    try {
      const url = `${this.getApiBase()}/sendMessage`;
      const payload = {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode ?? 'Markdown',
        reply_markup: options.reply_markup,
        disable_web_page_preview: options.disable_web_page_preview ?? false,
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.ok) {
        console.error('❌ Telegram API error:', data);
      }
      return data;
    } catch (err: any) {
      console.error('❌ Telegram sendMessage network error:', err);
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
    const refineDeepLink = `${cleanUrl}/?eventId=${encodeURIComponent(event.id)}&stage=refine`;

    let text = customText;
    if (!text) {
      const milestoneHighlights = (event.milestones || [])
        .slice(0, 3)
        .map((m: TMinusMilestone) => {
          const badge = m.tMinusLabel || 'T-7d';
          return `• *${badge}*: ${m.title}`;
        })
        .join('\n');

      text = [
        `📅 *New Event Parsed*: *${event.title}*`,
        `🗓️ *Target Date*: ${event.eventDate}${event.eventTime ? ` at ${event.eventTime}` : ''}`,
        event.location ? `📍 *Location*: ${event.location}` : null,
        '',
        `⏳ *Initial Runway Created* (${(event.milestones || []).length} milestones):`,
        milestoneHighlights || '• *T-7d*: Initial review and planning',
        '',
        '⚡ *Refinement Required*:',
        'Customize food, transit, gear, or budget requirements to lock your optimal reverse-logistics schedule.',
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
              text: '🛠️ Refine Prep Timeline in App',
              url: refineDeepLink,
            },
          ],
          [
            {
              text: '✅ Keep Default Runway',
              callback_data: `CONFIRM_DEFAULT:${event.id}`,
            },
            {
              text: '➕ Add Note',
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
      const body: any = {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      };
      if (secretToken) {
        body.secret_token = secretToken;
      }

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
