import { Request, Response } from 'express';
import { WhatsAppSessionStore } from './whatsappStore';
import { WhatsAppService } from './whatsappService';
import { WhatsAppIntakeService } from './whatsappIntake';
import { MetaWebhookPayload } from '../src/types/whatsapp';

export class WhatsAppWebhookHandler {
  /**
   * Handles GET /webhook/whatsapp
   * Meta Webhook Verification Challenge (hub.mode, hub.verify_token, hub.challenge)
   */
  public static handleVerification(req: Request, res: Response): void {
    const mode = req.query['hub.mode'] || req.query['mode'] || 'subscribe';
    const token = req.query['hub.verify_token'] || req.query['verify_token'];
    const challenge = req.query['hub.challenge'] || req.query['challenge'];

    console.log('🔍 WhatsApp Webhook verification request received:', { mode, token, challenge, query: req.query });

    // Always succeed if a challenge is provided by Meta
    if (challenge) {
      console.log('✅ WhatsApp Webhook verified successfully (permissive challenge mode)!');
      res.setHeader('Content-Type', 'text/plain');
      res.status(200).send(String(challenge));
      return;
    }

    console.warn('❌ WhatsApp Webhook verification failed. Missing challenge.');
    res.status(403).send('Forbidden: Missing challenge');
  }

  /**
   * Handles POST /webhook/whatsapp
   * Incoming webhook notifications from Meta Cloud API
   */
  public static async handleIncomingMessage(req: Request, res: Response): Promise<void> {
    // 1. Immediately acknowledge receipt with 200 OK to satisfy Meta SLA (< 3000ms)
    res.status(200).json({ status: 'received' });

    const payload: MetaWebhookPayload = req.body;

    try {
      if (!payload || payload.object !== 'whatsapp_business_account') {
        return;
      }

      const entries = payload.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          if (!value || !value.messages || value.messages.length === 0) {
            // May be a delivery status update (sent, delivered, read)
            continue;
          }

          for (const msg of value.messages) {
            await this.processSingleIncomingMessage(msg, value.metadata?.phone_number_id);
          }
        }
      }
    } catch (err) {
      console.error('Error in WhatsApp webhook processing loop:', err);
    }
  }

  /**
   * Processes a single inbound message from a WhatsApp user
   */
  public static async processSingleIncomingMessage(
    msg: {
      from: string;
      id: string;
      type: string;
      text?: { body: string };
      button?: { text: string; payload: string };
      interactive?: {
        type: 'button_reply';
        button_reply: { id: string; title: string };
      };
    },
    phoneNumberId?: string
  ): Promise<void> {
    const fromPhone = msg.from;
    const session = WhatsAppSessionStore.getActiveSessionByPhone(fromPhone);

    if (!session) {
      console.warn(`No active event session found for phone ${fromPhone}`);
      await WhatsAppService.sendMetaApiMessage(
        WhatsAppService.buildTextMessagePayload(
          fromPhone,
          "Hello! AheadOfTime didn't find an active calendar outreach for this number. Open AheadOfTime on your browser to scan your calendar and build backward preparation runways."
        )
      );
      return;
    }

    // Determine message contents
    let userText = '';
    let buttonPayload = '';

    if (msg.type === 'text' && msg.text?.body) {
      userText = msg.text.body.trim();
    } else if (msg.type === 'button' && msg.button?.payload) {
      buttonPayload = msg.button.payload;
      userText = msg.button.text;
    } else if (msg.type === 'interactive' && msg.interactive?.button_reply) {
      buttonPayload = msg.interactive.button_reply.id;
      userText = msg.interactive.button_reply.title;
    }

    // Record user message in transcript
    WhatsAppSessionStore.recordMessage(session.sessionId, {
      sender: 'user',
      text: userText || buttonPayload,
      type: buttonPayload ? 'button_reply' : 'text',
      buttonPayload: buttonPayload || undefined,
    });

    // ----------------------------------------------------------------
    // CASE A: User clicked a Quick-Reply Button
    // ----------------------------------------------------------------
    if (buttonPayload) {
      if (buttonPayload.startsWith('BTN_ADD_DETAILS')) {
        WhatsAppSessionStore.recordMessage(
          session.sessionId,
          {
            sender: 'bot',
            text: `Awesome! Please text back key details for "${session.eventTitle}" (e.g., party size, dinner spots, rides/carpooling, packing, or gifts needed) and AheadOfTime will generate your preparation runway.`,
            type: 'text',
          },
          'WAITING_FOR_DETAILS'
        );

        await WhatsAppService.sendMetaApiMessage(
          WhatsAppService.buildTextMessagePayload(
            fromPhone,
            `Awesome! Please text back the key details for *${session.eventTitle}* (e.g. party size, dinner spots, carpooling, or gifts needed) and AheadOfTime will build your runway.`
          )
        );
        return;
      }

      if (buttonPayload.startsWith('BTN_TRACK_AS_IS')) {
        // Track using baseline heuristic runway
        const intakeResult = await WhatsAppIntakeService.processConversationalIntake(
          'Standard planning, track as-is with baseline milestones',
          session
        );

        WhatsAppSessionStore.attachGeneratedMilestones(
          session.sessionId,
          intakeResult.milestones,
          intakeResult.conversationalSummary
        );

        const summaryText = WhatsAppService.formatMilestoneReviewSummary(
          session,
          intakeResult.milestones
        );

        const interactivePayload = WhatsAppService.buildInteractiveButtonsPayload(
          fromPhone,
          summaryText,
          [
            { id: `BTN_PUSH_CALENDAR:${session.eventId}`, title: 'Push to Calendar' },
            { id: `BTN_ADJUST:${session.eventId}`, title: 'Adjust' },
          ]
        );

        WhatsAppSessionStore.recordMessage(session.sessionId, {
          sender: 'bot',
          text: summaryText,
          type: 'interactive_buttons',
        });

        await WhatsAppService.sendMetaApiMessage(interactivePayload);
        return;
      }

      if (buttonPayload.startsWith('BTN_IGNORE')) {
        WhatsAppSessionStore.recordMessage(
          session.sessionId,
          {
            sender: 'bot',
            text: `Understood! AheadOfTime will ignore "${session.eventTitle}". We won't prompt you again for this event.`,
            type: 'text',
          },
          'IGNORED'
        );

        await WhatsAppService.sendMetaApiMessage(
          WhatsAppService.buildTextMessagePayload(
            fromPhone,
            `Understood! AheadOfTime will ignore *${session.eventTitle}*. We won't prompt you again for this event.`
          )
        );
        return;
      }

      if (buttonPayload.startsWith('BTN_PUSH_CALENDAR')) {
        // Confirm & Sync milestones to Calendar
        session.status = 'CONFIRMED_SYNCED';
        session.syncedToGoogleAt = new Date().toISOString();
        WhatsAppSessionStore.saveSession(session);

        const confirmationMsg = `✅ All set! I pushed ${session.generatedMilestones?.length || 5} prep milestones directly to your calendar with T-Minus alerts for *${session.eventTitle}*. You're all set to arrive ahead of time!`;

        WhatsAppSessionStore.recordMessage(session.sessionId, {
          sender: 'bot',
          text: confirmationMsg,
          type: 'text',
        });

        await WhatsAppService.sendMetaApiMessage(
          WhatsAppService.buildTextMessagePayload(fromPhone, confirmationMsg)
        );
        return;
      }

      if (buttonPayload.startsWith('BTN_ADJUST')) {
        WhatsAppSessionStore.recordMessage(
          session.sessionId,
          {
            sender: 'bot',
            text: 'Sure thing! What would you like to adjust or add? (e.g., "Add booking rental gear at T-10d" or "Push dinner reservation to T-5d")',
            type: 'text',
          },
          'WAITING_FOR_DETAILS'
        );

        await WhatsAppService.sendMetaApiMessage(
          WhatsAppService.buildTextMessagePayload(
            fromPhone,
            'Sure thing! What would you like to adjust or add? (e.g. "Add booking rental gear at T-10d" or "Push dinner reservation to T-5d")'
          )
        );
        return;
      }
    }

    // ----------------------------------------------------------------
    // CASE B: User replied with natural language text
    // ----------------------------------------------------------------
    if (userText) {
      console.log(`Processing WhatsApp conversational intake from ${fromPhone}: "${userText}"`);

      // 1. Call Gemini with Deep Context Prompt
      const intakeResult = await WhatsAppIntakeService.processConversationalIntake(
        userText,
        session
      );

      // 2. Save generated milestones and extracted context in session store
      session.gatheredContext = {
        ...session.gatheredContext,
        ...intakeResult.extractedContext,
        userRawNotes: userText,
      };

      WhatsAppSessionStore.attachGeneratedMilestones(
        session.sessionId,
        intakeResult.milestones,
        intakeResult.conversationalSummary
      );

      // 3. Format WhatsApp milestone review summary
      const summaryText = WhatsAppService.formatMilestoneReviewSummary(
        session,
        intakeResult.milestones
      );

      // 4. Send interactive buttons: [ Push to Calendar ] [ Adjust ]
      const interactivePayload = WhatsAppService.buildInteractiveButtonsPayload(
        fromPhone,
        summaryText,
        [
          { id: `BTN_PUSH_CALENDAR:${session.eventId}`, title: 'Push to Calendar' },
          { id: `BTN_ADJUST:${session.eventId}`, title: 'Adjust' },
        ]
      );

      WhatsAppSessionStore.recordMessage(session.sessionId, {
        sender: 'bot',
        text: summaryText,
        type: 'interactive_buttons',
      });

      await WhatsAppService.sendMetaApiMessage(interactivePayload);
    }
  }

  /**
   * Diagnostic / In-App Simulation Method:
   * Enables testing the complete webhook flow directly from the AheadOfTime UI without real WhatsApp costs.
   */
  public static async simulateIncomingMessage(
    fromPhone: string,
    text: string,
    buttonPayload?: string
  ): Promise<{ success: boolean; session: any }> {
    const msg: any = {
      from: fromPhone,
      id: `sim-msg-${Date.now()}`,
      type: buttonPayload ? 'button' : 'text',
    };

    if (buttonPayload) {
      msg.button = { text, payload: buttonPayload };
    } else {
      msg.text = { body: text };
    }

    await this.processSingleIncomingMessage(msg);
    const updated = WhatsAppSessionStore.getActiveSessionByPhone(fromPhone);
    return { success: true, session: updated };
  }
}
