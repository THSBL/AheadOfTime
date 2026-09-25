import { Request, Response } from 'express';
import { TelegramSessionStore } from './telegramStore.js';
import { TelegramService, buildEventDeepLink } from './telegramService.js';
import { CalendarEvent } from '../src/types.js';
import { GeminiCalendarAgent } from './geminiCalendarAgent.js';
import { signEventDeepLink } from './deepLinkToken.js';
import { logQualityEvent, checkAndLogRapidCorrection } from './qualityStore.js';
import { pushEventToGoogleInBackground, isAutoPushEnabledForUser } from './googleBackgroundPush.js';
import { formatDisplayDate } from '../src/utils/tminusRules.js';
import { askRefinementQuestions } from './agentProcessor.js';
import { getUserProfile } from './userProfileStore.js';
import { composeConversationBrief } from '../src/utils/refinementQuestions.js';
import type { PendingTelegramRefinement } from './telegramStore.js';

// A half-answered set of refinement questions older than this is dropped,
// so a message days later starts fresh instead of answering a stale question.
const REFINEMENT_STALE_MS = 12 * 60 * 60 * 1000;

// Legacy Telegram Markdown: dynamic text (Gemini's questions, options) must
// not accidentally open a bold/italic/code span and make Telegram reject it.
const escapeMd = (text: string) => text.replace(/([_*`\[])/g, '\\$1');

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
    // A new plan still being set up: this message answers the refinement
    // question currently waiting (the web chat's same order - questions
    // first, then one plan from everything). Commands still work normally.
    const pendingNewPlan = await TelegramSessionStore.getPendingRefinement(chatId);
    if (pendingNewPlan && text && !text.startsWith('/')) {
      if (Date.now() - new Date(pendingNewPlan.askedAt).getTime() < REFINEMENT_STALE_MS) {
        await this.answerRefinementQuestion(chatId, pendingNewPlan, text, appBaseUrl);
        return;
      }
      await TelegramSessionStore.setPendingRefinement(chatId, null);
    }

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
        `I'll ask a few quick questions first, then save your prep checklist. With Background Sync on (Settings in the app), tapping Looks Good also adds it to your Google Calendar/Tasks.`,
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
      const autoAdd = await isAutoPushEnabledForUser(session.webUserId);
      const statusText = [
        `*System Status*:`,
        `• *Bot*: Online & Connected`,
        `• *Chat ID*: \`${chatId}\``,
        `• *Account Link*: ${isLinked ? `✅ Paired (${session.webUserEmail || session.webUserId || 'Active'})` : `⚠️ Unlinked — [Pair at ${appBaseUrl}/settings/credentials](${appBaseUrl}/settings/credentials)`}`,
        `• *Auto-add to Google Calendar*: ${autoAdd ? '✅ On - Looks Good adds your plan' : `❌ Off — [turn on Background Sync](${appBaseUrl}/settings/credentials?setup=background_sync)`}`,
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
          return `• *${ev.title}* (${formatDisplayDate(ev.eventDate)})\n  [Refine in App](${refineUrl})`;
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
    appBaseUrl: string,
    // forceNewEvent: rawText is the complete brief built from answered
    // refinement questions - plan it straight away as a new event.
    options: { forceNewEvent?: boolean } = {}
  ): Promise<void> {
    // Telegram's own "typing…" indicator auto-expires after ~5s, so it's
    // repeated for the duration of the (usually sub-few-second, but not
    // guaranteed) planning call instead of the chat going silent.
    const stopTyping = this.startTypingIndicator(chatId);
    try {
      // Same order as the web chat: for a NEW plan, first ask the
      // refinement questions (where/when/what, travel documents, which
      // date for "next Saturday"...), then plan once from everything.
      // Skipped for schedule questions and changes to existing plans
      // (Gemini classifies), when the agent is mid-way through its own
      // clarifying question, and when Gemini is unavailable.
      if (!options.forceNewEvent && !(await TelegramSessionStore.getPendingClarification(chatId))) {
        // The linked account's onboarding profile (pet, kids, home area)
        // adds its own questions, same as on the web.
        const session = await TelegramSessionStore.getOrCreateSession(chatId);
        const profile = session.webUserId ? await getUserProfile(session.webUserId).catch(() => null) : null;
        const refinement = await askRefinementQuestions({
          message: rawText,
          currentReferenceDate: new Date().toISOString(),
          userProfile: profile
            ? { hasPet: profile.hasPet, familyStructure: profile.family_structure, homeZipOrLocation: profile.homeZipOrLocation }
            : null,
        });
        if (refinement.isNewEventPlan && refinement.questions.length > 0) {
          const pending: PendingTelegramRefinement = {
            originalMessage: rawText,
            questions: refinement.questions,
            answers: [],
            index: 0,
            askedAt: new Date().toISOString(),
          };
          await TelegramSessionStore.setPendingRefinement(chatId, pending);
          await this.sendRefinementQuestion(chatId, pending);
          return;
        }
      }

      const agentResult = await GeminiCalendarAgent.processMessage(chatId, rawText, undefined, { forceNewEvent: options.forceNewEvent });

      if (agentResult.createdEvent) {
        // Event was created via create_calendar_event.
        // Deliberately does NOT pass agentResult.replyText as custom text -
        // that's the model's own one-line summary ("N milestones
        // generated"), which never actually lists what was planned, giving
        // the user nothing to judge before tapping "Looks Good". Letting
        // sendRefinementPrompt fall through to its own default builds the
        // real milestone list instead.
        // Background Sync users used to get the event pushed to Google
        // Calendar/Tasks immediately here, before they'd seen the checklist
        // or had a chance to correct anything - live-reported as "the bot
        // adds it to your calendar without verification." The push now
        // happens only once the user taps "Looks Good" (see the
        // CONFIRM_DEFAULT handler below). Still looked up here (not just
        // there) so the prompt itself only shows one calendar-related
        // button - "Looks Good" alone when the bot can push automatically,
        // "Push to Calendar" alone when it can't - instead of live-reported
        // confusion from showing both together always.
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

  /** Sends the refinement question currently waiting, with its options as buttons. */
  private static async sendRefinementQuestion(chatId: number | string, pending: PendingTelegramRefinement): Promise<void> {
    const q = pending.questions[pending.index];
    const total = pending.questions.length;
    const isDate = q.kind === 'date' || q.kind === 'dateRange';
    const hint = isDate
      ? '_Reply with the date(s), e.g. 12–19 November._'
      : q.options.length > 0
        ? '_Tap an option, or type your own answer._'
        : '_Type your answer._';
    const text = [
      pending.index === 0 ? `A few quick questions so the plan fits:` : null,
      `*${total > 1 ? `${pending.index + 1}/${total} · ` : ''}${escapeMd(q.question)}*`,
      hint,
    ].filter(Boolean).join('\n');
    // Callback data stays tiny (Telegram caps it at 64 bytes): question and
    // option by index; the text lives in the pending state.
    const optionRows = q.options.slice(0, 4).map((opt, optionIndex) => [{ text: opt, callback_data: `RQ:${pending.index}:${optionIndex}` }]);
    await TelegramService.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...optionRows, [{ text: 'Skip', callback_data: `RQ:${pending.index}:s` }]] },
    });
  }

  /**
   * Records the answer (empty = skipped) to the question currently waiting,
   * then asks the next one - or, after the last, builds the plan from the
   * first message plus every answer in one go, as a new event.
   */
  private static async answerRefinementQuestion(
    chatId: number | string,
    pending: PendingTelegramRefinement,
    answer: string,
    appBaseUrl: string
  ): Promise<void> {
    const q = pending.questions[pending.index];
    const answers = answer.trim() && q ? [...pending.answers, { question: q.question, answer: answer.trim() }] : pending.answers;
    const next: PendingTelegramRefinement = { ...pending, answers, index: pending.index + 1, askedAt: new Date().toISOString() };
    if (next.index < next.questions.length) {
      await TelegramSessionStore.setPendingRefinement(chatId, next);
      await this.sendRefinementQuestion(chatId, next);
      return;
    }
    await TelegramSessionStore.setPendingRefinement(chatId, null);
    const brief = composeConversationBrief({ originalMessage: pending.originalMessage, answers });
    await this.processNaturalLanguageEvent(chatId, brief, appBaseUrl, { forceNewEvent: true });
  }

  /**
   * Pushes an event (or just its new milestones) to the owner's Google
   * Calendar/Tasks in the background and tells them how it went. Silent for
   * users without Background Sync - the manual "Push to Cal" in the app
   * stays their way in. Awaited by callers (not fire-and-forget): on
   * serverless the work would be cut off once the handler returns.
   */
  private static async pushToGoogleAndReport(chatId: number | string, eventId: string, appBaseUrl?: string): Promise<void> {
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
    if (result.tasksScopeMissing) {
      // Tasks wasn't ticked on Google's consent screen: only relinking fixes it.
      const base = (appBaseUrl || process.env.APP_URL || 'https://aheadoftime.app').replace(/\/$/, '');
      parts.push(
        "⚠️ Your prep tasks weren't added: Google Tasks access wasn't ticked when Auto-add was turned on. Turn Background Sync off and on again in Settings and tick every box on Google's screen."
      );
      await TelegramService.sendMessage(chatId, parts.join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: '⚙️ Fix in Settings', url: `${base}/settings/credentials?setup=background_sync` }]] },
      });
      return;
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

    if (data.startsWith('RQ:')) {
      // "RQ:<questionIndex>:<optionIndex|s>" - an answer to a refinement
      // question (s = skip). A tap on an older question is ignored.
      const [, indexStr, choice] = data.split(':');
      const pending = chatId ? await TelegramSessionStore.getPendingRefinement(chatId) : undefined;
      const questionIndex = parseInt(indexStr, 10);
      if (!pending || pending.index !== questionIndex) {
        await TelegramService.answerCallbackQuery(callbackId, 'That question was already answered.');
        return;
      }
      const option = choice === 's' ? '' : pending.questions[questionIndex]?.options?.[parseInt(choice, 10)] || '';
      await TelegramService.answerCallbackQuery(callbackId, option ? `✅ ${option}` : 'Skipped');
      await this.answerRefinementQuestion(chatId, pending, option, appBaseUrl);
      return;
    }

    if (data.startsWith('CONFIRM_DEFAULT:')) {
      const eventId = data.replace('CONFIRM_DEFAULT:', '');
      const event = await TelegramSessionStore.getEvent(eventId);
      // Was: mutated a CalendarEvent object fetched from getEvent() and then
      // discarded it without writing anything back - the confirmation had
      // zero effect on the stored event. markEventConfirmed actually persists it.
      await TelegramSessionStore.markEventConfirmed(eventId);

      await TelegramService.answerCallbackQuery(callbackId, '✅ Confirmed');

      if (chatId) {
        // Background Sync users' push to Google Calendar/Tasks happens
        // here, gated behind this explicit "Looks Good" tap, instead of
        // firing the instant the event was created (before the user had
        // seen the checklist at all) - live-reported as a real gap: the
        // calendar was already written to before there was any chance to
        // catch a wrong date or detail.
        const session = await TelegramSessionStore.getOrCreateSession(chatId);
        const autoPush = await isAutoPushEnabledForUser(session.webUserId);

        // Was "We will ping you as milestones approach" - no reminder
        // scheduler exists anywhere in this codebase, so that was a false
        // promise. A "Push to Calendar" button here used to show
        // unconditionally, even for Background Sync users about to get an
        // automatic push seconds later - live-reported as two competing
        // calendar actions with no clear relationship. Now it's the same
        // one-button-per-user rule sendRefinementPrompt uses: only shown
        // when the bot itself can't push on this user's behalf.
        // Without Background Sync the bot has no permission to write to the
        // calendar itself. Instead of only "open the app" every time, offer
        // the one-time fix: turn it on once (or link the account first) and
        // every later "Looks Good" adds the plan automatically.
        const title = `✅ Prep checklist confirmed for *${event?.title || 'your event'}*.`;
        if (autoPush) {
          await TelegramService.sendMessage(chatId, title, { parse_mode: 'Markdown' });
        } else if (!session.webUserId) {
          await TelegramService.sendMessage(
            chatId,
            `${title}\n\nTo add plans to your Google Calendar straight from here, link this chat to your Ahead Of Time account and turn on Background Sync.`,
            {
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: '🔗 Link my account', url: `${appBaseUrl}/settings/credentials` }]] },
            }
          );
        } else {
          await TelegramService.sendMessage(
            chatId,
            `${title}\n\nIt's not on your calendar yet: add this one via the app, or turn on Background Sync once and I'll add every plan you confirm here automatically.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📅 Add this one via the app', url: buildEventDeepLink(eventId, appBaseUrl, 'push') }],
                  [{ text: '⚡ Add plans automatically from now on', url: `${appBaseUrl}/settings/credentials?setup=background_sync` }],
                ],
              },
            }
          );
        }

        if (autoPush) await this.pushToGoogleAndReport(chatId, eventId, appBaseUrl);
      }
      return;
    }

    if (data.startsWith('RESOLVE_GAP:')) {
      // Architecture reset Phase 8 - "<eventId>:<gapIndex>:<optionIndex>",
      // indices rather than the gap's own key/option text directly, to
      // keep callback_data well under Telegram's 64-byte limit regardless
      // of how long a question or option string is.
      const [eventId, gapIndexStr, optionIndexStr] = data.replace('RESOLVE_GAP:', '').split(':');
      const gapIndex = parseInt(gapIndexStr, 10);
      const optionIndex = parseInt(optionIndexStr, 10);
      const event = await TelegramSessionStore.getEvent(eventId);
      const gap = event?.outstandingGaps?.[gapIndex];
      const optionText = gap?.options?.[optionIndex];

      if (!event || !gap || !optionText) {
        await TelegramService.answerCallbackQuery(callbackId, "That decision isn't open anymore.");
        return;
      }

      await TelegramService.answerCallbackQuery(callbackId, `✅ ${optionText}`);
      if (chatId) {
        try {
          // The question travels with the answer, so a bare "Yes" or
          // "I'm organizing it" isn't planned without knowing what it answers.
          const result = await GeminiCalendarAgent.refineEvent(event, `${gap.question.replace(/^Decide:\s*/i, '')} ${optionText}`, false);
          await TelegramSessionStore.replaceMilestonesAndRecomputeGaps(eventId, result.mergedMilestones);
          await TelegramService.sendMessage(chatId, result.replyText, { parse_mode: 'Markdown' });
        } catch (err: any) {
          console.error('Error resolving Open Decision:', err);
          await TelegramService.sendMessage(chatId, `⚠️ Couldn't apply that just now - please try again.`);
        }
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
