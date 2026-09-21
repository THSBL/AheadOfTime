import { Request, Response } from 'express';
import { TelegramSessionStore } from './telegramStore.js';
import { TelegramService, buildEventDeepLink } from './telegramService.js';
import { CalendarEvent } from '../src/types.js';
import { GeminiCalendarAgent } from './geminiCalendarAgent.js';
import { signEventDeepLink } from './deepLinkToken.js';
import { logQualityEvent, checkAndLogRapidCorrection } from './qualityStore.js';
import { pushEventToGoogleInBackground, isAutoPushEnabledForUser } from './googleBackgroundPush.js';

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

      // 2. Update Deduplication Check - DB-backed (per chat) rather than
      // purely in-memory, since a Telegram retry landing on a different,
      // cold serverless instance would never see the in-memory cache from
      // the instance that handled the original request. This is the
      // confirmed cause of a reply occasionally being sent twice. Falls
      // back to the in-memory-only check when no chat id can be resolved
      // from this update shape (better than skipping dedup entirely).
      const updateId = update.update_id;
      const chatIdForDedup =
        update.message?.chat?.id ||
        update.callback_query?.message?.chat?.id ||
        update.edited_message?.chat?.id ||
        update.channel_post?.chat?.id;
      if (typeof updateId === 'number') {
        if (chatIdForDedup) {
          const isFirstTime = await TelegramSessionStore.markUpdateSeenOnce(chatIdForDedup, updateId);
          if (!isFirstTime) {
            console.log(`⚠️ Telegram duplicate update_id ${updateId} discarded (DB-backed check).`);
            res.status(200).json({ ok: true, duplicate: true });
            return;
          }
        } else if (TelegramWebhookHandler.processedUpdateIds.has(updateId)) {
          console.log(`⚠️ Telegram duplicate update_id ${updateId} discarded (in-memory fallback).`);
          res.status(200).json({ ok: true, duplicate: true });
          return;
        } else {
          TelegramWebhookHandler.processedUpdateIds.set(updateId, Date.now());
        }
      }

      // 4. Resolve application base URL
      const appBaseUrl =
        process.env.APP_URL ||
        process.env.PUBLIC_URL ||
        (req.headers['x-forwarded-host'] ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host']}` : '') ||
        (req.get('host') ? `https://${req.get('host')}` : '') ||
        'https://aheadoftime.app';

      console.log('📥 Telegram update received:', {
        update_id: update.update_id,
        has_message: Boolean(update.message),
        has_callback: Boolean(update.callback_query),
        chat_id: update.message?.chat?.id || update.callback_query?.message?.chat?.id,
        text: update.message?.text?.slice(0, 40),
      });

      // 5. Process the update BEFORE responding. Vercel serverless
      // functions can freeze/tear down immediately once a response is
      // sent, which does not reliably let setImmediate/background work
      // finish (confirmed directly: it never ran at all in testing) - so
      // "ack first, process in the background" silently drops updates on
      // serverless. Processing synchronously is simpler and safe here
      // because the duplicate-update check above already marks the
      // update_id as seen before this runs, so a Telegram retry (if this
      // takes long enough to trigger one) is correctly deduped rather
      // than reprocessed.
      try {
        if (update.callback_query) {
          await TelegramWebhookHandler.handleCallbackQuery(update.callback_query, appBaseUrl);
        } else {
          const incomingMessage = update.message || update.edited_message || update.channel_post;
          if (incomingMessage) {
            await TelegramWebhookHandler.handleIncomingMessage(incomingMessage, appBaseUrl);
          } else if (update.effective_chat?.id && update.text) {
            await TelegramWebhookHandler.handleIncomingMessage(
              { chat: update.effective_chat, text: update.text, from: update.effective_user },
              appBaseUrl
            );
          }
        }
      } catch (processingErr) {
        console.error('❌ Error processing Telegram update:', processingErr);
      }

      res.status(200).json({ ok: true });
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

    const session = await TelegramSessionStore.getOrCreateSession(chatId, from);

    // A chat that tapped "Refine in Chat" on an event is expected to type
    // the change next - checked before any command routing so e.g. a
    // request that happens to start with "/status" doesn't get swallowed
    // as a command. If a clarifying question is already pending for this
    // refinement, this message is the answer to THAT question instead of a
    // fresh request - checked first since both states use the same
    // pendingNoteForEventId marker.
    const pendingRefinementClarification = await TelegramSessionStore.getPendingRefinementClarification(chatId);
    const pendingNoteEventId = await TelegramSessionStore.getPendingEventNote(chatId);
    if (pendingRefinementClarification && text && !text.startsWith('/')) {
      await TelegramSessionStore.setPendingRefinementClarification(chatId, null);
      await TelegramSessionStore.setPendingEventNote(chatId, null);
      await this.refineEventInChat(
        chatId,
        pendingRefinementClarification.eventId,
        `${pendingRefinementClarification.originalText}\n\n(Follow-up answer to "${pendingRefinementClarification.question}"): ${text}`,
        true
      );
      return;
    }
    if (pendingNoteEventId && text && !text.startsWith('/')) {
      await TelegramSessionStore.setPendingEventNote(chatId, null);
      await this.refineEventInChat(chatId, pendingNoteEventId, text, false);
      return;
    }

    // Command: /start (with or without pairing code)
    if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start=')) {
      // Extract optional payload after /start (e.g., "/start pair_987xyz")
      const parts = text.split(/[\s=]+/);
      const pairCode = parts.length > 1 ? parts[1].trim() : '';

      if (pairCode) {
        console.log(`[Telegram Webhook] Received pairing attempt for code:`, pairCode);
        await TelegramSessionStore.linkUserByPairingCode(chatId, pairCode, from);
      }

      const welcome = [
        `*Ahead Of Time*`,
        ``,
        `Tell me what you're planning and I'll work backward from the date to build your prep checklist.`,
        ``,
        `*Quick Start*:`,
        `Send me any scheduling request in plain English, for example:`,
        `• _"Trip to Scottish Highlands Oct 14-18 with 4 friends"_`,
        `• _"Alex 30th birthday dinner Oct 24 at 8pm"_`,
        `• _"Conference presentation next Thursday at 2pm"_`,
        ``,
        `I'll ask a quick follow-up question if something important is missing, then save your prep checklist here - open the app to push it to Google Calendar/Tasks.`,
        ``,
        `*Commands*:`,
        `• /events — View your active events and checklists`,
        `• /status — Check bot and calendar connectivity`,
        `• /help — Tips for scheduling and reverse planning`,
      ].join('\n');

      await TelegramService.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
      return;
    }

    // Command: /unlink
    if (text === '/unlink') {
      await TelegramSessionStore.unlinkSession(chatId);
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
      const events = await TelegramSessionStore.getRecentEventsForChat(chatId);
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
      const events = await TelegramSessionStore.getRecentEventsForChat(chatId);
      if (events.length === 0) {
        await TelegramService.sendMessage(
          chatId,
          `No active events found in this chat session yet. Send a message describing an upcoming event to get started!`
        );
        return;
      }

      const listText = [
        `*Active Events* (${events.length}):`,
        ...events.slice(0, 5).map((ev) => {
          const deepLinkAuth = signEventDeepLink(ev.id);
          const authQuery = deepLinkAuth ? `&dlt=${deepLinkAuth.token}&dlte=${deepLinkAuth.expiresAt}` : '';
          const refineUrl = `${appBaseUrl}/?event_id=${encodeURIComponent(ev.id)}&action=refine${authQuery}`;
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
    // Telegram's own "typing…" indicator auto-expires after ~5s, so it's
    // repeated for the duration of the (usually sub-few-second, but not
    // guaranteed) planning call instead of the chat going silent.
    const stopTyping = this.startTypingIndicator(chatId);
    try {
      const agentResult = await GeminiCalendarAgent.processMessage(chatId, rawText);

      if (agentResult.createdEvent) {
        // Event was created via create_calendar_event.
        // Deliberately does NOT pass agentResult.replyText as custom text -
        // that's the model's own one-line summary ("N milestones
        // generated"), which never actually lists what was planned, giving
        // the user nothing to judge before tapping "Looks Good". Letting
        // sendRefinementPrompt fall through to its own default builds the
        // real milestone list instead.
        // Users with Background Sync get the event pushed to Google
        // Calendar/Tasks right after this reply, so the prompt says so
        // instead of telling them to open the app and push it themselves.
        const session = await TelegramSessionStore.getOrCreateSession(chatId);
        const autoPush = await isAutoPushEnabledForUser(session.webUserId);
        await TelegramService.sendRefinementPrompt(chatId, agentResult.createdEvent, appBaseUrl, undefined, {
          autoPushingToGoogle: autoPush,
        });
        // Pure logging, fire-and-forget - gives checkAndLogRapidCorrection
        // something to compare a later correction against.
        logQualityEvent({
          sourceChannel: 'telegram',
          eventId: agentResult.createdEvent.id,
          signalType: 'plan_generated',
          severity: 'low',
        });
        if (autoPush) await this.pushToGoogleAndReport(chatId, agentResult.createdEvent.id);
      } else {
        // Schedule query or status response
        await TelegramService.sendMessage(chatId, agentResult.replyText, {
          parse_mode: 'Markdown',
        });
        // A plain-text update that merged new milestones into an existing
        // event: push just the additions.
        if (agentResult.updatedEventId) await this.pushToGoogleAndReport(chatId, agentResult.updatedEventId);
      }
    } catch (err: any) {
      console.error('Error in processNaturalLanguageEvent:', err);
      await logQualityEvent({
        sourceChannel: 'telegram',
        signalType: 'explicit_failure_reply',
        severity: 'high',
        errorDetail: err?.message || String(err),
        rawUserMessage: rawText,
      });
      await TelegramService.sendMessage(
        chatId,
        `⚠️ *Error Processing Request*: ${err.message || 'Could not access calendar tool.'}`
      );
    } finally {
      stopTyping();
    }
  }

  /**
   * Pushes an event (or just its new milestones) to the owner's Google
   * Calendar/Tasks in the background and tells them how it went. Silent for
   * users without Background Sync - the manual "Push to Cal" in the app
   * stays their way in. Awaited by callers (not fire-and-forget): on
   * serverless the work would be cut off once the handler returns.
   */
  private static async pushToGoogleAndReport(chatId: number | string, eventId: string): Promise<void> {
    const result = await pushEventToGoogleInBackground(eventId);
    if (result.status === 'skipped') return;

    if (result.status === 'failed') {
      await TelegramService.sendMessage(
        chatId,
        "⚠️ I couldn't add that to your Google Calendar just now. Nothing is lost - open the app and tap Push to Cal whenever you like."
      );
      return;
    }

    const parts: string[] = [];
    if (result.createdCalendarEvent) parts.push('📅 Added to your Google Calendar');
    if (result.tasksCreated > 0) {
      parts.push(`✅ ${result.tasksCreated} prep ${result.tasksCreated === 1 ? 'task' : 'tasks'} added to Google Tasks`);
    }
    if (result.error) parts.push(`(${result.error} Open the app and tap Push to Cal to finish.)`);
    if (parts.length > 0) await TelegramService.sendMessage(chatId, parts.join('\n'));
  }

  /**
   * Fires Telegram's "typing…" chat action immediately and every ~4s after,
   * until the returned function is called. Best-effort - a failed/slow
   * typing call never blocks or fails the actual request.
   */
  private static startTypingIndicator(chatId: number | string): () => void {
    void TelegramService.sendChatAction(chatId, 'typing');
    const interval = setInterval(() => {
      void TelegramService.sendChatAction(chatId, 'typing');
    }, 4000);
    return () => clearInterval(interval);
  }

  /**
   * Handles a "Refine in Chat" request (or its follow-up clarification
   * answer) for an already-created event: AI-powered, merge-aware, and
   * capped at one clarifying question - replaces the old "Add Note" flow's
   * blind local-heuristic single-milestone insert.
   */
  private static async refineEventInChat(
    chatId: number | string,
    eventId: string,
    text: string,
    isSecondRound: boolean
  ): Promise<void> {
    const stopTyping = this.startTypingIndicator(chatId);
    try {
      const event = await TelegramSessionStore.getEvent(eventId);
      if (!event) {
        await TelegramService.sendMessage(chatId, `Hmm, I couldn't find that event anymore - it may have been deleted.`);
        return;
      }

      const result = await GeminiCalendarAgent.refineEvent(event, text, isSecondRound);

      if (result.clarificationPending) {
        await TelegramSessionStore.setPendingRefinementClarification(chatId, {
          eventId,
          originalText: text,
          question: result.replyText,
        });
        // Re-arm the same marker the top-of-handler check reads, so the
        // next message routes back here as the clarification answer.
        await TelegramSessionStore.setPendingEventNote(chatId, eventId);
        await TelegramService.sendMessage(chatId, result.replyText);
        return;
      }

      if (result.newlyAddedMilestones.length > 0) {
        await TelegramSessionStore.addMilestonesToEvent(eventId, result.newlyAddedMilestones);
      }

      await TelegramService.sendMessage(chatId, result.replyText, { parse_mode: 'Markdown' });
      if (result.newlyAddedMilestones.length > 0) await this.pushToGoogleAndReport(chatId, eventId);

      // Pure logging, fire-and-forget - a correction shortly after a plan
      // was generated for this same event is strong evidence the first
      // answer was wrong (see checkAndLogRapidCorrection's own doc comment).
      checkAndLogRapidCorrection(eventId, null, 'telegram', text);
    } catch (err: any) {
      console.error('Error in refineEventInChat:', err);
      await logQualityEvent({
        sourceChannel: 'telegram',
        eventId,
        signalType: 'explicit_failure_reply',
        severity: 'high',
        errorDetail: err?.message || String(err),
        rawUserMessage: text,
      });
      await TelegramService.sendMessage(chatId, `⚠️ Couldn't process that change: ${err.message || 'please try again.'}`);
    } finally {
      stopTyping();
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
      const event = await TelegramSessionStore.getEvent(eventId);
      // Was: mutated a CalendarEvent object fetched from getEvent() and then
      // discarded it without writing anything back - the confirmation had
      // zero effect on the stored event. markEventConfirmed actually persists it.
      await TelegramSessionStore.markEventConfirmed(eventId);

      await TelegramService.answerCallbackQuery(callbackId, '✅ Confirmed');

      if (chatId) {
        // Was "We will ping you as milestones approach" - no reminder
        // scheduler exists anywhere in this codebase, so that was a false
        // promise. The real next step is pushing to Google Calendar/Tasks
        // from the app, which is where reminders actually come from.
        // The button (rather than the previous bare URL in the text) uses
        // the same signed deep link as sendRefinementPrompt, so it works
        // immediately even if the browser's Google session has expired.
        await TelegramService.sendMessage(
          chatId,
          `✅ Prep checklist confirmed for *${event?.title || 'your event'}*.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '📅 Push to Calendar',
                    url: buildEventDeepLink(eventId, appBaseUrl, 'push'),
                  },
                ],
              ],
            },
          }
        );
      }
      return;
    }

    if (data.startsWith('ADD_NOTE:')) {
      const eventId = data.replace('ADD_NOTE:', '');
      if (chatId) {
        // Clear any stale clarification round from a previous refinement
        // before starting a new one, so it can't bleed into this request.
        await TelegramSessionStore.setPendingRefinementClarification(chatId, null);
        await TelegramSessionStore.setPendingEventNote(chatId, eventId);
      }
      await TelegramService.answerCallbackQuery(callbackId, 'Go ahead, tell me what to change');
      if (chatId) {
        await TelegramService.sendMessage(chatId, `💬 What would you like to change or add? I'll ask a follow-up if anything's unclear.`);
      }
      return;
    }

    await TelegramService.answerCallbackQuery(callbackId);
  }
}
