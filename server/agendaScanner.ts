import { CalendarEvent, TMinusMilestone } from '../src/types';
import { WhatsAppSessionStore } from './whatsappStore';
import { WhatsAppService } from './whatsappService';
import { WhatsAppEventSessionState } from '../src/types/whatsapp';

export interface EventEvaluationResult {
  isEligible: boolean;
  reason: string;
  category: string;
  leadTimeDays: number;
}

export class AgendaScannerService {
  /**
   * Evaluates an individual calendar event against AheadOfTime filtering rules:
   *  - Must be >= 7 days in the future
   *  - Excludes routine internal meetings, standups, 1-on-1s, recurring syncs
   *  - Excludes mundane chores, workouts, errands
   *  - Excludes passive birthdays (e.g. "Mom's Birthday") unless high-prep celebration ("Dave's 40th Birthday Party")
   *  - Identifies high-prep events (e.g. "Weekend away with friends", "Cabin trip", "Wedding", "Conference")
   */
  public static evaluateEventEligibility(
    event: {
      id: string;
      title: string;
      eventDate: string;
      description?: string;
      location?: string;
      createdOrModifiedRecently?: boolean;
    },
    referenceDate: Date = new Date()
  ): EventEvaluationResult {
    const title = (event.title || '').trim();
    const lowerTitle = title.toLowerCase();

    // 1. Calculate days until event
    const [year, month, day] = event.eventDate.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day);
    const diffMs = targetDate.getTime() - referenceDate.getTime();
    const leadTimeDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (leadTimeDays < 7) {
      return {
        isEligible: false,
        reason: `Event is too near (${leadTimeDays} days away). AheadOfTime proactive outreach requires >= 7 days runway.`,
        category: 'near_term',
        leadTimeDays,
      };
    }

    // 2. Filter out routine work meetings, 1-on-1s, agile ceremonies
    const routineMeetingRegex = /\b(standup|sync|1[:\-]1|one on one|catchup|weekly|bi-weekly|daily|scrum|grooming|retro|planning|status update|alignment|check-in|huddle|office hours|all hands|town hall)\b/i;
    if (routineMeetingRegex.test(lowerTitle)) {
      return {
        isEligible: false,
        reason: 'Filtered out: Routine work meeting, standup, or sync requires no reverse-logistics runway.',
        category: 'routine_meeting',
        leadTimeDays,
      };
    }

    // 3. Filter out personal recurring chores & daily errands
    const choreRegex = /\b(laundry|cleaning|clean apartment|trash|take out bins|groceries|supermarket|gym|workout|run 5k|haircut|oil change|dentist checkup|doctor routine)\b/i;
    if (choreRegex.test(lowerTitle)) {
      return {
        isEligible: false,
        reason: 'Filtered out: Routine personal errand or maintenance chore.',
        category: 'daily_chore',
        leadTimeDays,
      };
    }

    // 4. Passive birthdays vs. high-prep celebration parties
    const isBirthday = lowerTitle.includes('birthday') || lowerTitle.includes('bday');
    const isPartyOrTrip = /\b(party|dinner|celebration|drinks|gathering|bash|40th|30th|50th|21st|rooftop|bbq|weekend|trip|flight)\b/i.test(lowerTitle);
    
    if (isBirthday && !isPartyOrTrip) {
      return {
        isEligible: false,
        reason: 'Filtered out: Passive birthday reminder (requires explicit celebration/party trigger to warrant outreach).',
        category: 'passive_birthday',
        leadTimeDays,
      };
    }

    // 5. Positive High-Prep Triggers
    const highPrepRegex = /\b(weekend away|cabin|trip|vacation|flight|camping|bachelor|bachelorette|wedding|birthday party|conference|summit|retreat|offsite|holiday|festival|concert|road trip|skiing|tournament|dinner party|hosting)\b/i;
    const hasPrepSignal = highPrepRegex.test(lowerTitle) || (event.location && event.location.length > 3) || isPartyOrTrip;

    if (hasPrepSignal) {
      return {
        isEligible: true,
        reason: 'Identified as High-Prep event requiring multi-stage backward runway (reservations, bookings, packing, gifts).',
        category: 'high_prep',
        leadTimeDays,
      };
    }

    // Fallback: if lead time is >= 14 days and titled with substantial length, treat as potential event
    if (leadTimeDays >= 14 && title.split(' ').length >= 2) {
      return {
        isEligible: true,
        reason: 'Long-horizon event with multi-word subject, eligible for proactive runway confirmation.',
        category: 'custom_high_lead_time',
        leadTimeDays,
      };
    }

    return {
      isEligible: false,
      reason: 'Standard entry does not meet high-prep threshold.',
      category: 'general_entry',
      leadTimeDays,
    };
  }

  /**
   * Scans an array of calendar events and executes proactive WhatsApp outreach for eligible candidates
   */
  public static async scanAndTriggerOutreach(
    events: CalendarEvent[],
    userPhone: string,
    userFirstName: string = 'there'
  ): Promise<{
    totalScanned: number;
    eligibleEvents: Array<{ event: CalendarEvent; evaluation: EventEvaluationResult }>;
    outreachSent: Array<{ eventId: string; title: string; sessionId: string; mode: string }>;
    skippedExisting: string[];
  }> {
    const eligibleEvents: Array<{ event: CalendarEvent; evaluation: EventEvaluationResult }> = [];
    const outreachSent: Array<{ eventId: string; title: string; sessionId: string; mode: string }> = [];
    const skippedExisting: string[] = [];

    const now = new Date();

    for (const event of events) {
      const evaluation = this.evaluateEventEligibility(
        {
          id: event.id,
          title: event.title,
          eventDate: event.eventDate,
          location: event.location,
          description: event.context?.notes,
        },
        now
      );

      if (evaluation.isEligible) {
        eligibleEvents.push({ event, evaluation });

        // Check if outreach was already sent recently
        if (WhatsAppSessionStore.hasRecentOutreach(userPhone, event.id)) {
          skippedExisting.push(event.title);
          continue;
        }

        // Format date string for {{3}} in template (e.g. "Oct 18, 2026")
        const [year, month, day] = event.eventDate.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const formattedDate = dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        // 1. Build Meta Utility Template Payload
        const templatePayload = WhatsAppService.buildProactiveTemplatePayload(
          userPhone,
          userFirstName,
          event.title,
          formattedDate,
          event.id
        );

        // 2. Dispatch via Meta Cloud API (or simulator if in test mode)
        const dispatchResult = await WhatsAppService.sendMetaApiMessage(templatePayload);

        // 3. Initialize event-context state in session store
        const sessionId = WhatsAppSessionStore.generateSessionId(userPhone, event.id);
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const newSession: WhatsAppEventSessionState = {
          sessionId,
          phoneNumber: userPhone,
          userFirstName,
          eventId: event.id,
          googleCalendarEventId: event.googleEventId,
          eventTitle: event.title,
          eventDate: event.eventDate,
          eventTime: event.eventTime,
          eventLocation: event.location,
          status: 'OUTREACH_SENT',
          createdAt: new Date().toISOString(),
          lastInteractionAt: new Date().toISOString(),
          sessionExpiresAt,
          messagesTranscript: [
            {
              id: `wa-msg-${Date.now()}`,
              sender: 'bot',
              text: `Hi ${userFirstName}! AheadOfTime spotted a new event on your calendar: *${event.title}* on *${formattedDate}*. To build your custom runway (bookings, packing, gifts), what are the key details or extra plans for this?`,
              timestamp: new Date().toISOString(),
              type: 'template',
            },
          ],
          gatheredContext: {
            userRawNotes: event.context?.notes || '',
          },
          metadata: {
            leadTimeDays: evaluation.leadTimeDays,
            dispatchMode: dispatchResult.mode,
            messageId: dispatchResult.messageId,
          },
        };

        WhatsAppSessionStore.saveSession(newSession);

        outreachSent.push({
          eventId: event.id,
          title: event.title,
          sessionId,
          mode: dispatchResult.mode,
        });
      }
    }

    return {
      totalScanned: events.length,
      eligibleEvents,
      outreachSent,
      skippedExisting,
    };
  }
}
