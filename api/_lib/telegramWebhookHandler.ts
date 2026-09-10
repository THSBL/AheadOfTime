import { Request, Response } from 'express';
import { TelegramSessionStore } from './telegramStore.js';
import { TelegramService } from './telegramService.js';
import { CalendarEvent } from './types.js';
import { GeminiCalendarAgent } from './geminiCalendarAgent.js';

export class TelegramWebhookHandler {
  // Deduplication cache: stores update_id -> timestamp (ms)
  private static processedUpdateIds: Map<number, number> = new Map();

  static {
    // Periodically clean up update_ids older than 2 minutes
    setInterval(() => {
      const cutoff = Date.now() - 120000;
      for (const [id, time] of TelegramWebhookHandler.processedUpdateIds.entries()) {
        if (time < cutoff) {
          TelegramWebhookHandler.processedUpdateIds.delete(id);
        }
      }
    }, 60000);
  }

  /**
   * Primary entry point for POST /api/telegram/webhook and /webhook/telegram
   */
  public static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // 1. Webhook secret verification (if configured, a matching header is required)
      const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
      const receivedSecret =
        req.headers['x-telegram-bot-api-secret-token'] ||
        req.headers['X-Telegram-Bot-Api-Secret-Token'];

      if (expectedSecret && receivedSecret !== expectedSecret) {
        console.warn('⚠️ Telegram webhook secret mismatch, ignoring update.');
        res.status(403).json({ error: 'Secret mismatch' });
        return;
      }

      const update = req.body;
      if (!update || typeof update !== 'object') {
        res.status(200).json({ ok: true });
        return;
      }

      // 2. Update Deduplication Check
      const updateId = update.update_id;
      if (typeof updateId === 'number') {
        if (TelegramWebhookHandler.processedUpdateIds.has(updateId)) {
          console.log(`⚠️ Telegram duplicate update_id ${updateId} discarded.`);
          res.status(200).json({ ok: true, duplicate: true });
          return;
        }
        TelegramWebhookHandler.processedUpdateIds.set(updateId, Date.now());
      }

      // 3. Fast Webhook Acknowledgment: Immediately respond HTTP 200 so Telegram never retries
      res.status(200).json({ ok: true });

      // 4. Resolve application base URL
      const appBaseUrl =
        process.env.APP_URL ||
        process.env.PUBLIC_URL ||
        (req.headers['x-forwarded-host'] ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host']}` : '') ||
        (req.get('host') ? `https://${req.get('host')}` : '') ||
        'https://aheadoftime.app';

      console.log('📥 Telegram update received & ACKed:', {
        update_id: update.update_id,
        has_message: Boolean(update.message),
        has_callback: Boolean(update.callback_query),
        chat_id: update.message?.chat?.id || update.callback_query?.message?.chat?.id,
        text: update.message?.text?.slice(0, 40),
      });

      // 5. Run processing asynchronously in background
      setImmediate(async () => {
        try {
          // Handle Callback Query (Button clicks)
          if (update.callback_query) {
            await TelegramWebhookHandler.handleCallbackQuery(update.callback_query, appBaseUrl);
            return;
          }

          // Handle Incoming Message (standard, edited, or channel post)
          const incomingMessage = update.message || update.edited_message || update.channel_post;
          if (incomingMessage) {
            await TelegramWebhookHandler.handleIncomingMessage(incomingMessage, appBaseUrl);
            return;
          }

          // Handle update with effective_chat fallback if present
          if (update.effective_chat?.id && update.text) {
            await TelegramWebhookHandler.handleIncomingMessage(
              { chat: update.effective_chat, text: update.text, from: update.effective_user },
              appBaseUrl
            );
            return;
          }
        } catch (bgErr) {
          console.error('❌ Error in background Telegram update processing:', bgErr);
        }
      });
    } catch (err) {
      console.error('❌ Error handling Telegram webhook update:', err);
      if (!res.headersSent) {
        res.status(200).json({ ok: true, error: (err as any)?.message });
      }
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

    // Command: /start (with pairing code support)
    if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start=')) {
      // 1. Extract payload after /start: e.g. "/start pair_987xyz" or "/start=pair_987xyz"
      const parts = text.split(/[\s=]+/);
      const pairCode = parts.length > 1 ? parts[1].trim() : '';

      if (pairCode) {
        console.log(`[Telegram Webhook] Received pairing attempt for code:`, pairCode);
        const linkResult = TelegramSessionStore.linkUserByPairingCode(chatId, pairCode, from);

        if (linkResult.success) {
          const successMsg = `🎉 *Connected!* Your AheadOfTime calendar assistant is now linked.`;
          await TelegramService.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
          return;
        } else {
          const errorMsg = `⚠️ *Connection Issue*: ${linkResult.error || 'The connection link is invalid or has expired.'}\n\nPlease refresh your dashboard settings to generate a new link.`;
          await TelegramService.sendMessage(chatId, errorMsg, { parse_mode: 'Markdown' });
          return;
        }
      }

      // 2. Standard /start without pairing code
      if (!session.isLinked) {
        const onboardingMsg = [
          `👋 *Welcome to Ahead Of Time!*`,
          ``,
          `I am your executive calendar assistant communicating via Telegram. I schedule your events and calculate backward preparation runways so you are never rushed.`,
          ``,
          `🔗 *Link Your Calendar Account*:`,
          `To pair this chat with your web dashboard, open your settings and click *Connect Telegram Account*:`,
          `${appBaseUrl}/settings/credentials`,
          ``,
          `*Quick Test*:`,
          `You can also start prompting me right now in plain English:`,
          `• _"Alex 30th birthday dinner Oct 24 at 8pm"_`,
          `• _"Trip to Scottish Highlands Oct 14-18 with 4 friends"_`,
          `• _"What is my schedule next Monday?"_`,
          ``,
          `*Commands*: /events, /status, /help`,
        ].join('\n');

        await TelegramService.sendMessage(chatId, onboardingMsg, { parse_mode: 'Markdown' });
        return;
      }

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

    // Command: /unlink
    if (text === '/unlink') {
      TelegramSessionStore.unlinkSession(chatId);
      await TelegramService.sendMessage(
        chatId,
        `🔌 *Account Unlinked*\n\nYour Telegram chat has been disconnected from your web account. You can reconnect anytime via ${appBaseUrl}/settings/credentials.`,
        { parse_mode: 'Markdown' }
      );
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
        `• /unlink — Disconnect from web dashboard`,
        `• /sync — Trigger bidirectional calendar sync`,
      ].join('\n');

      await TelegramService.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
      return;
    }

    // Command: /status
    if (text === '/status') {
      const events = TelegramSessionStore.getRecentEventsForChat(chatId);
      const isLinked = Boolean(session.isLinked);
      const statusText = [
        `*System Status*:`,
        `• *Bot*: Online & Connected`,
        `• *Chat ID*: \`${chatId}\``,
        `• *Account Link*: ${isLinked ? `✅ Paired (${session.webUserEmail || session.webUserId || 'Active'})` : `⚠️ Unlinked — [Pair at ${appBaseUrl}/settings/credentials](${appBaseUrl}/settings/credentials)`}`,
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
          const refineUrl = `${appBaseUrl}/?event_id=${encodeURIComponent(ev.id)}&action=refine`;
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
        // Send Telegram response and include refinement action button
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
          `💬 To add tasks or details to this event, type it directly or open the webapp:\n${appBaseUrl}/?event_id=${encodeURIComponent(eventId)}&action=refine`
        );
      }
      return;
    }

    await TelegramService.answerCallbackQuery(callbackId);
  }
}
