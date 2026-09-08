import type { Request, Response } from 'express';
import { TelegramSessionStore } from './telegramStore.js';
import { TelegramService } from './telegramService.js';
import type { CalendarEvent } from '../../src/types.js';
import { GeminiCalendarAgent } from './geminiCalendarAgent.js';

export class TelegramWebhookHandler {
  /**
   * Primary entry point for POST /api/telegram/webhook and /webhook/telegram
   */
  public static async handleWebhook(req: Request | any, res: Response | any): Promise<void> {
    // 1. Return 200 OK immediately to satisfy Telegram timeout requirements (< 5000ms)
    if (typeof res.status === 'function') {
      res.status(200).json({ ok: true });
    } else if (typeof res.writeHead === 'function') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }

    try {
      // 2. Webhook secret verification (if configured)
      const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
      if (expectedSecret) {
        const receivedSecret = req.headers?.['x-telegram-bot-api-secret-token'];
        if (receivedSecret !== expectedSecret) {
          console.warn('⚠️ Telegram webhook secret mismatch, ignoring update.');
          return;
        }
      }

      const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!update) return;

      const host = req.headers?.host || (typeof req.get === 'function' ? req.get('host') : null) || 'aheadoftime.app';
      const protocol = req.headers?.['x-forwarded-proto'] || req.protocol || 'https';
      const appBaseUrl =
        process.env.APP_URL ||
        process.env.PUBLIC_URL ||
        `${protocol}://${host}`;

      // 3. Handle Callback Query (Button clicks)
      if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query, appBaseUrl);
        return;
      }

      // 4. Handle Incoming Message (standard, edited, or channel post)
      const incomingMessage = update.message || update.edited_message || update.channel_post;
      if (incomingMessage) {
        await this.handleIncomingMessage(incomingMessage, appBaseUrl);
        return;
      }

      // 5. Handle update with effective_chat fallback if present
      if (update.effective_chat?.id && update.text) {
        await this.handleIncomingMessage({ chat: update.effective_chat, text: update.text, from: update.effective_user }, appBaseUrl);
        return;
      }
    } catch (err) {
      console.error('❌ Error handling Telegram webhook update:', err);
    }
  }

  /**
   * Process incoming text messages and commands
   */
  private static async handleIncomingMessage(message: any, appBaseUrl: string): Promise<void> {
    const chatId = message.chat?.id;
    if (!chatId) return;

    const text = (message.text || '').trim();
    const from = message.from;

    const session = TelegramSessionStore.getOrCreateSession(chatId, from);

    // Command: /start
    if (text === '/start' || text.startsWith('/start ')) {
      const welcome = [
        `*Ahead Of Time* — Active Executive Calendar Assistant`,
        ``,
        `I manage your schedule and build backward preparation runways so you are fully prepared when events arrive.`,
        ``,
        `*Quick Start*:`,
        `Send me any scheduling request in plain English, for example:`,
        `• _"Trip to Scottish Highlands Oct 14-18 with 4 friends"_`,
        `• _"Alex 30th birthday dinner Oct 24 at 8pm"_`,
        `• _"Conference presentation next Thursday at 2pm"_`,
        ``,
        `I will parse the dates, construct the Google Calendar entry, draft your T-Minus preparation timeline, and provide a direct link to customize logistics.`,
        ``,
        `*Commands*:`,
        `• /events — View your active events and runways`,
        `• /status — Check bot and calendar connectivity`,
        `• /help — Tips for scheduling and reverse planning`,
      ].join('\n');

      await TelegramService.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
      return;
    }

    // Command: /help
    if (text === '/help') {
      const helpText = [
        `*Ahead Of Time Commands & Capabilities*:`,
        ``,
        `*Natural Language Scheduling*:`,
        `Just type what you're planning. Include dates, group sizes, and activities:`,
        `• _"Weekend cabin trip Nov 6-8, need to rent gear and buy groceries"_`,
        `• _"Sprint demo on Sept 25, need slide review 3 days prior"_`,
        ``,
        `*Available Commands*:`,
        `• /events — List recently drafted events`,
        `• /status — Connection and timezone status`,
        `• /sync — Trigger bidirectional calendar sync`,
      ].join('\n');

      await TelegramService.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
      return;
    }

    // Command: /status
    if (text === '/status') {
      const events = TelegramSessionStore.getRecentEventsForChat(chatId);
      const statusText = [
        `*System Status*:`,
        `• *Bot*: Online & Connected`,
        `• *Chat ID*: \`${chatId}\``,
        `• *User*: ${session.firstName || session.username || 'User'}`,
        `• *Tracked Events*: ${events.length} active in session`,
        `• *Webapp URL*: ${appBaseUrl}`,
      ].join('\n');

      await TelegramService.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
      return;
    }

    // Command: /events
    if (text === '/events') {
      const events = TelegramSessionStore.getRecentEventsForChat(chatId);
      if (events.length === 0) {
        await TelegramService.sendMessage(
          chatId,
          `No active events found in this chat session yet. Send a message describing an upcoming event to create your first runway!`
        );
        return;
      }

      const listText = [
        `*Active Events & Runways* (${events.length}):`,
        ...events.slice(0, 5).map((ev) => {
          const refineUrl = `${appBaseUrl}/?eventId=${encodeURIComponent(ev.id)}&stage=refine`;
          return `• *${ev.title}* (${ev.eventDate})\n  [Refine in App](${refineUrl})`;
        }),
      ].join('\n\n');

      await TelegramService.sendMessage(chatId, listText, { parse_mode: 'Markdown' });
      return;
    }

    // Regular message: Parse event and generate backward milestones
    await this.processNaturalLanguageEvent(chatId, text, appBaseUrl);
  }

  /**
   * Parse natural language text into a CalendarEvent and T-Minus milestones
   * using Ahead Of Time's Gemini executive calendar agent
   */
  private static async processNaturalLanguageEvent(
    chatId: number | string,
    rawText: string,
    appBaseUrl: string
  ): Promise<void> {
    try {
      const agentResult = await GeminiCalendarAgent.processMessage(chatId, rawText);

      if (agentResult.createdEvent) {
        // Event was created via create_calendar_event
        await TelegramService.sendRefinementPrompt(chatId, agentResult.createdEvent, appBaseUrl, agentResult.replyText);
      } else {
        // Schedule query or status response
        await TelegramService.sendMessage(chatId, agentResult.replyText, {
          parse_mode: 'Markdown',
        });
      }
    } catch (err: any) {
      console.error('Error in processNaturalLanguageEvent:', err);
      await TelegramService.sendMessage(
        chatId,
        `⚠️ *Error Processing Request*: ${err.message || 'Could not access calendar tool.'}`
      );
    }
  }

  /**
   * Handle callback query (inline button clicks)
   */
  private static async handleCallbackQuery(callbackQuery: any, appBaseUrl: string): Promise<void> {
    const callbackId = callbackQuery.id;
    const data = callbackQuery.data || '';
    const chatId = callbackQuery.message?.chat?.id;

    if (data.startsWith('CONFIRM_DEFAULT:')) {
      const eventId = data.replace('CONFIRM_DEFAULT:', '');
      const event = TelegramSessionStore.getEvent(eventId);

      if (event) {
        event.needsRefinement = false;
        event.refinedAt = new Date().toISOString();
      }

      await TelegramService.answerCallbackQuery(callbackId, '✅ Default runway confirmed!');

      if (chatId) {
        await TelegramService.sendMessage(
          chatId,
          `✅ *Runway Locked*: Default milestones confirmed for *${event?.title || 'your event'}*. We will ping you as milestones approach.`
        );
      }
      return;
    }

    if (data.startsWith('ADD_NOTE:')) {
      const eventId = data.replace('ADD_NOTE:', '');
      await TelegramService.answerCallbackQuery(callbackId, 'Type your note or extra item:');
      if (chatId) {
        await TelegramService.sendMessage(
          chatId,
          `💬 To add tasks or details to this event, type it directly or open the webapp:\n${appBaseUrl}/?eventId=${encodeURIComponent(eventId)}&stage=refine`
        );
      }
      return;
    }

    await TelegramService.answerCallbackQuery(callbackId);
  }
}
