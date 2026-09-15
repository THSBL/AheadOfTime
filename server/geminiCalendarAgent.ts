import { GoogleGenAI } from '@google/genai';
import { TelegramSessionStore } from './telegramStore.js';
import { CalendarEvent, TMinusMilestone, Deliverable, EventCategory, StructuredPlanningPayload } from '../src/types.js';
import {
  decomposeComplexTripIntent,
  parseNaturalDateRange,
  getCleanEventTitle,
  detectEventCategory,
  attachDeliverablesToMilestones,
  applyMilestoneQualityGuardrails,
} from '../src/utils/tminusRules.js';

export interface CalendarAgentResult {
  replyText: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    result: any;
  }>;
  createdEvent?: CalendarEvent;
}

const COMPOUND_EVENT_SYSTEM_PROMPT = `You are "Ahead Of Time", a calendar-prep assistant communicating via Telegram. You talk like a sharp, friendly person texting - not a formal executive assistant.

### Core Objectives:
1. Parse user scheduling requests (trips, dinners, birthdays, meetings, deadlines, conferences, vacations, weddings) into rich structured calendar events.
2. Calculate realistic backward preparation milestones with tangible deliverables based on real-world lead times (e.g., weddings take 6-12 months for venue/dress/caterer; dog sitters and boarding take 4-8 weeks; passports and international flights take 8-12 weeks).
3. Manage the user's schedule with speed, clarity, and zero unnecessary conversational filler. Use clean, modern plain English (avoid archaic words like 'dispatched', 'garments', 'artifact', etc.) and never internal planning vocabulary either - no "runway", "Track A/B", "macro/micro", "checkpoint gate". Say what you actually did, the way the user themselves would describe it.

### CRITICAL RULE - CONTEXT LEADS, NEVER GENERIC TEMPLATES:
Category-standard milestones (the usual checklist for "birthday party", "trip", etc.) are a STARTING POINT, not a fixed script. Before including any generic/routine milestone, check it against everything the user actually said. If a stated detail makes a routine milestone irrelevant, DROP it entirely:
- If the event is at an external venue the user names or implies (a bar, restaurant, hired hall, venue, club) - do NOT generate milestones for supplies/setup that venue would already provide (buying ice, glassware, decorations, tables, a sound system). Only generate milestones for what the user must personally still arrange.
- Example: "planning a party in a bar" needs a reservation/headcount milestone, NOT "buy ice and glassware". If the user mentions a specific preference (e.g. "make sure her favorite liqueur is available"), generate ONE targeted milestone for exactly that, not a generic shopping list.
- For a trip: do NOT default to group-coordination milestones (collecting shared funds/deposits, locking a headcount, chasing RSVPs, a "group activity"/"group dinner") unless the input names a wider group of independent people (friends, colleagues, a stag/hen party, an explicit attendee count). A trip with a partner, girlfriend/boyfriend, spouse, or family is not a group to coordinate.
- When genuinely unsure whether a routine milestone still applies, leave it out rather than include something irrelevant.

### CRITICAL RULE - NO DUPLICATE TASKS:
Each real-world task exists as exactly ONE milestone. Review your own list before responding and remove anything that covers the same underlying task as another entry, even if worded differently.

### CRITICAL RULE - REFINING AN EXISTING EVENT MEANS MERGE, NEVER REPLACE:
If "existingTargetEvent" is present in the input, an event ALREADY EXISTS with the milestones listed under "existingMilestones" - the message is a correction, addition, or clarification to that plan, not a request to plan a new event from scratch. This is true no matter how narrow the message is (e.g. "we also need a dog sitter" on an existing business trip adds ONE thing, it does not redefine the trip).
- Your "milestones" output must be the COMPLETE resulting plan: every existing milestone that's still relevant (unchanged or lightly adjusted), plus whatever the new message adds or changes. Returning only milestones derived from the new message discards the entire existing plan - never do that.
- Only drop or rewrite an existing milestone if the new message explicitly contradicts it.
- If genuinely something is unclear about the ADDITION itself (not the whole event), use Option C to ask about that one thing - e.g. "Got it, one thing: is the dog sitter needed for the full week or just a couple of days?"

### Temporal Grounding Rules:
- Every incoming user message contains dynamic system time context in the format:
  \`[System Context: Current Time: <Day, DD Month YYYY, HH:MM:SS TZ> (Timezone: <TZ>)]\`
- Always evaluate relative references ("today", "tomorrow morning", "next Friday", "in 2 hours", "Oct 14-18", "next month") strictly against this timestamp and timezone.
- Never guess the current year or date; rely exclusively on the injected system context.

### Response Format:
You MUST respond with a valid JSON object matching one of three schemas:

#### Option A: Event Creation / Compound Scheduling Request (e.g. "Trip to Scottish Highlands Oct 14-18 with 4 friends", "Dinner party next Friday at 7pm", "Product launch Nov 15")
\`\`\`json
{
  "type": "event_creation",
  "summary": "Scottish Highlands Trip (with 4 friends)",
  "start_date": "2026-10-14",
  "end_date": "2026-10-18",
  "start_time": "09:00",
  "category": "travel_trip",
  "location": "Scottish Highlands",
  "description": "Trip to Scottish Highlands with 4 friends",
  "milestones": [
    {
      "milestone_title": "Lodging & Transport Locked",
      "t_minus_days": 21,
      "target_date": "2026-09-23",
      "deliverables": [
        "Book rental car / train passes",
        "Reserve group stay / cabin"
      ]
    },
    {
      "milestone_title": "Headcount & Group Costs Settled",
      "t_minus_days": 14,
      "target_date": "2026-09-30",
      "deliverables": [
        "Confirm headcount with all 4 friends",
        "Collect shared budget/expenses"
      ]
    },
    {
      "milestone_title": "Gear & Bags Packed",
      "t_minus_days": 2,
      "target_date": "2026-10-12",
      "deliverables": [
        "Pack hiking boots & weather gear",
        "Check offline trail maps"
      ]
    }
  ],
  "telegram_reply": "*Scottish Highlands Trip (with 4 friends)*\\n• 📅 \`2026-10-14\` to \`2026-10-18\`\\n• 📍 Scottish Highlands\\n• 🎯 3 Preparation Milestones generated"
}
\`\`\`

#### Option B: Calendar Query / Availability Check (e.g. "What do I have going on tomorrow afternoon?", "Am I free next Monday?")
\`\`\`json
{
  "type": "query",
  "time_min_iso": "2026-09-09T12:00:00+01:00",
  "time_max_iso": "2026-09-09T18:00:00+01:00",
  "telegram_reply": "*Schedule for Tomorrow Afternoon* (\`2026-09-09\`):\\n• No scheduled conflicts between \`12:00\` and \`18:00\`. Your afternoon is clear."
}
\`\`\`

#### Option C: Clarification Needed - use ONLY when a detail is genuinely necessary to plan correctly and you'd otherwise have to guess something important (e.g. the event date is completely absent, or "the pitch" doesn't say what city). Do NOT use this for things you can reasonably infer or that don't change the plan - most messages should go straight to Option A.
Ask AT MOST 2 short questions in ONE message - never a back-and-forth interrogation. You get exactly one clarification round per event: if you already asked once for this conversation (a prior user message answered a clarification_needed question), do NOT ask again - use Option A instead, fill any remaining gaps with a clearly-labeled best guess, and say so in the telegram_reply.
\`\`\`json
{
  "type": "clarification_needed",
  "telegram_reply": "Got the shape of it - a client pitch trip to NY, next month. Two quick things:\\n1. Solo, or is anyone else from your team going?\\n2. Are flights/hotel already booked, or still to arrange?"
}
\`\`\`

Allowed categories: "travel_trip", "birthday_party", "dinner_social", "project_deadline", "hosting_visitors", "festival_concert", "custom".
Always ensure date arithmetic for milestones is accurate: target_date = start_date minus t_minus_days.`;

// Fast active models to try in order, mirroring agentProcessor.ts's
// DEFAULT_FAST_MODELS - a single hardcoded model name means the bot goes
// permanently dark the moment that one model is deprecated/renamed.
const CALENDAR_AGENT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'];

/**
 * Re-derives each milestone's deliverables from its own title via the same
 * deterministic keyword matching agentProcessor.ts's web-app milestones use
 * (attachDeliverablesToMilestones). The model's originally-suggested
 * deliverables are kept as a defensive fallback for an empty result, but in
 * practice attachDeliverablesToMilestones always synthesizes at least one
 * title-derived deliverable via its own generic catch-all branch, so this
 * makes the deterministic engine the sole source of deliverable content -
 * deliberately, since trusting the model's own pairing was the actual bug
 * (it can pair the wrong deliverable text to the wrong milestone when asked
 * to produce several at once, e.g. a passport milestone ending up with
 * football-kit deliverable text for a kids' sports trip abroad). Exported
 * standalone (rather than inlined in buildAndStoreEvent) so this is
 * directly testable without a live Gemini call.
 */
export function reconcileMilestoneDeliverables(
  milestonesPendingDeliverables: TMinusMilestone[],
  modelDeliverablesByIndex: Map<number, Deliverable[]>
): TMinusMilestone[] {
  const deterministic = attachDeliverablesToMilestones(milestonesPendingDeliverables);
  return deterministic.map((ms, idx) => ({
    ...ms,
    deliverables: ms.deliverables.length > 0 ? ms.deliverables : modelDeliverablesByIndex.get(idx) || [],
  }));
}

export class GeminiCalendarAgent {
  private static aiClient: GoogleGenAI | null = null;

  private static getClient(): GoogleGenAI | null {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    if (!this.aiClient) {
      this.aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-ahead-of-time',
          },
        },
      });
    }
    return this.aiClient;
  }

  /**
   * Format the current system time context header if not already present
   */
  public static ensureSystemContext(userText: string, defaultTimezone: string = 'Europe/London', referenceDateISO?: string): string {
    if (userText.includes('[System Context: Current Time:')) {
      return userText;
    }

    const now = referenceDateISO ? new Date(referenceDateISO) : new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
      timeZone: defaultTimezone,
    };
    const formattedDate = new Intl.DateTimeFormat('en-GB', options).format(now);
    const contextHeader = `[System Context: Current Time: ${formattedDate} (Timezone: ${defaultTimezone})]`;
    return `${contextHeader}\nUser: ${userText}`;
  }

  /**
   * Tries each model in CALENDAR_AGENT_MODELS in order (with a per-model
   * timeout), falling through to the next one on error/timeout so a single
   * deprecated or momentarily-unavailable model doesn't take the whole bot
   * down.
   */
  private static async generateWithFallback(
    ai: GoogleGenAI,
    prompt: string,
    timeoutMs: number = 10000
  ): Promise<{ text: string; usedModel: string }> {
    let lastError: any = null;

    for (const modelName of CALENDAR_AGENT_MODELS) {
      try {
        const apiPromise = ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          config: {
            systemInstruction: COMPOUND_EVENT_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${modelName} timeout after ${timeoutMs}ms`)), timeoutMs)
        );

        const response = await Promise.race([apiPromise, timeoutPromise]);
        const text = response.text || '';
        if (text) {
          return { text, usedModel: modelName };
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ Gemini model ${modelName} unavailable for Telegram:`, err?.message || err);
        continue;
      }
    }

    throw lastError || new Error('All Gemini models timed out or were unavailable.');
  }

  /**
   * Main processor: executes Gemini Flash extraction or intelligent calendar parser fallback.
   *
   * Supports exactly one round of clarification per event (see Option C in
   * COMPOUND_EVENT_SYSTEM_PROMPT): if a prior message left a question
   * pending for this chat, this call's rawText is treated as the answer,
   * combined with the original message, and the pending state is cleared
   * before Gemini even runs - so a crash mid-request can't leave the chat
   * stuck waiting forever. If Gemini asks a *second* clarifying question in
   * a row despite the prompt's explicit "don't ask again" instruction, that
   * request is ignored and generation is forced via the deterministic
   * fallback instead, rather than looping.
   */
  public static async processMessage(
    chatId: number | string,
    rawText: string,
    defaultTimezone: string = 'Europe/London'
  ): Promise<CalendarAgentResult> {
    const referenceDateISO = new Date().toISOString();

    const pending = await TelegramSessionStore.getPendingClarification(chatId);
    let effectiveText = rawText;
    let isSecondRound = false;
    if (pending) {
      await TelegramSessionStore.setPendingClarification(chatId, null);
      effectiveText = `${pending.originalText}\n\n(Follow-up answer to "${pending.question}"): ${rawText}`;
      isSecondRound = true;
    }

    const prompt = this.ensureSystemContext(effectiveText, defaultTimezone, referenceDateISO)
      + (isSecondRound ? '\n\n[Note: you already asked one clarifying question in this conversation and the user just answered it - use Option A now, filling any remaining gaps with a clearly-labeled best guess. Do not ask another question.]' : '');
    const ai = this.getClient();

    // Deterministic trip parser (same one agentProcessor.ts uses for the web
    // app) - trusted over the model/regex fallback for title & dates, since
    // both have been observed to mangle them for messages like "Weekend trip
    // to Lisbon on 5 december...".
    const tripDecomposition = decomposeComplexTripIntent(effectiveText, referenceDateISO);

    if (ai) {
      try {
        console.log(`🤖 Invoking Gemini for Telegram chat ${chatId}: "${effectiveText.slice(0, 60)}..."`);
        const { text: rawJson, usedModel } = await this.generateWithFallback(ai, prompt);
        console.log(`📥 Gemini raw response (${usedModel}):`, rawJson.slice(0, 200));

        if (rawJson.trim()) {
          const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          if (parsed.type === 'event_creation' && parsed.summary && parsed.start_date) {
            return this.buildAndStoreEvent(chatId, parsed, effectiveText, referenceDateISO, tripDecomposition);
          } else if (parsed.type === 'query') {
            return {
              replyText: parsed.telegram_reply || 'Checked your calendar: No conflicts found.',
              toolCalls: [
                {
                  name: 'list_calendar_events',
                  args: { time_min_iso: parsed.time_min_iso, time_max_iso: parsed.time_max_iso },
                  result: { count: 0 },
                },
              ],
            };
          } else if (parsed.type === 'clarification_needed' && parsed.telegram_reply && !isSecondRound) {
            await TelegramSessionStore.setPendingClarification(chatId, {
              originalText: rawText,
              question: parsed.telegram_reply,
              askedAt: referenceDateISO,
            });
            return { replyText: parsed.telegram_reply };
          }
          // A clarification_needed response on the second round (the model
          // ignored the "don't ask again" instruction) falls through to the
          // deterministic engine below rather than looping forever.
        }
      } catch (err: any) {
        console.warn('⚠️ Gemini extraction error:', err.message);
      }
    }

    // Intelligent Deterministic NLP Engine Fallback
    return this.intelligentNaturalLanguageEngine(chatId, effectiveText, referenceDateISO, tripDecomposition);
  }

  /**
   * AI-powered refinement of an ALREADY-CREATED event ("Refine Event in
   * Chat"). Unlike the old "Add Note" flow (one heuristically-timed
   * milestone, no real understanding of the request), this gives the model
   * the event's existing milestones and lets it either ask one clarifying
   * question about the change (capped the same way as initial creation) or
   * return the complete resulting plan, which is then merged with what's
   * already there via the same quality guardrail used everywhere else -
   * belt-and-braces against the model still returning only the new bits.
   */
  public static async refineEvent(
    event: CalendarEvent,
    rawText: string,
    isSecondRound: boolean,
    defaultTimezone: string = 'Europe/London'
  ): Promise<{ replyText: string; clarificationPending: boolean; newlyAddedMilestones: TMinusMilestone[]; mergedMilestones: TMinusMilestone[] }> {
    const referenceDateISO = new Date().toISOString();
    const existingTargetEvent = {
      id: event.id,
      title: event.title,
      eventDate: event.eventDate,
      endDate: event.endDate,
      category: event.category,
      location: event.location,
      existingMilestones: (event.milestones || []).map((m) => ({
        title: m.title,
        description: m.description,
        target_date: m.calculatedDate,
      })),
    };

    const prompt = this.ensureSystemContext(rawText, defaultTimezone, referenceDateISO)
      + `\n\n[System: existingTargetEvent = ${JSON.stringify(existingTargetEvent)}]`
      + (isSecondRound
        ? '\n\n[Note: you already asked one clarifying question about this refinement and the user just answered it - use Option A now, filling any remaining gaps with a clearly-labeled best guess. Do not ask another question.]'
        : '');

    const fallback = {
      replyText: "Sorry, I couldn't process that just now - please try again.",
      clarificationPending: false,
      newlyAddedMilestones: [],
      mergedMilestones: event.milestones || [],
    };

    const ai = this.getClient();
    if (!ai) return fallback;

    try {
      const { text: rawJson } = await this.generateWithFallback(ai, prompt);
      if (!rawJson.trim()) return fallback;

      const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.type === 'clarification_needed' && parsed.telegram_reply && !isSecondRound) {
        return { ...fallback, replyText: parsed.telegram_reply, clarificationPending: true };
      }

      if (parsed.type === 'event_creation' && Array.isArray(parsed.milestones)) {
        const modelDeliverablesByIndex = new Map<number, Deliverable[]>();
        const freshMilestonesPending: TMinusMilestone[] = parsed.milestones.map((m: any, idx: number) => {
          const tMinusDays = typeof m.t_minus_days === 'number' ? m.t_minus_days : 7;
          const modelDeliverables: Deliverable[] = Array.isArray(m.deliverables)
            ? m.deliverables.map((d: any, dIdx: number) => ({
                deliverable_id: `del_${Date.now()}_${idx}_${dIdx}`,
                title: typeof d === 'string' ? d : d.title || 'Action item',
                type: 'coordination' as const,
                is_completed: false,
              }))
            : [];
          modelDeliverablesByIndex.set(idx, modelDeliverables);
          return {
            id: `ms_${Date.now()}_${idx}`,
            eventId: event.id,
            tMinusLabel: `T-${tMinusDays}d`,
            tMinusOffsetMinutes: -1 * tMinusDays * 1440,
            calculatedDate: m.target_date || event.eventDate,
            title: m.milestone_title || `Milestone ${idx + 1}`,
            category: 'logistics',
            status: 'pending',
            scope: 'macro',
            deliverables: [],
          };
        });
        const reconciled = reconcileMilestoneDeliverables(freshMilestonesPending, modelDeliverablesByIndex);

        const merged = applyMilestoneQualityGuardrails(
          [...(event.milestones || []), ...reconciled],
          { title: event.title, location: event.location, rawText }
        );
        const existingIds = new Set((event.milestones || []).map((m) => m.id));
        const newlyAdded = merged.filter((m) => !existingIds.has(m.id));

        const replyText = newlyAdded.length > 0
          ? newlyAdded.map((m) => `✅ Added *${m.title}* (${m.tMinusLabel})`).join('\n')
          : `That looks like it's already covered by an existing task, so I didn't add anything new.`;

        return { replyText, clarificationPending: false, newlyAddedMilestones: newlyAdded, mergedMilestones: merged };
      }

      return { ...fallback, replyText: "I didn't quite catch a specific change there - could you say it a different way?" };
    } catch (err: any) {
      console.warn('⚠️ Gemini refine error:', err.message);
      return fallback;
    }
  }

  /**
   * Constructs a full CalendarEvent object with milestones and saves it to store
   */
  private static async buildAndStoreEvent(
    chatId: number | string,
    parsed: any,
    rawInputSnippet: string,
    referenceDateISO: string = new Date().toISOString(),
    tripDecomposition: StructuredPlanningPayload | null = null
  ): Promise<CalendarAgentResult> {
    const eventId = `evt_${Date.now()}`;
    const macro = tripDecomposition?.macro_event;

    // Cross-check the model's (or regex fallback's) title & dates against the
    // shared parsers agentProcessor.ts uses. An explicit date in the raw text
    // ("on 5 december") wins over anything guessed, and trip messages get the
    // same clean "Trip to X" title the web app produces.
    const explicitDate = macro ? null : parseNaturalDateRange(rawInputSnippet, referenceDateISO);

    const category: EventCategory = macro
      ? 'travel_trip'
      : (parsed.category as EventCategory) || detectEventCategory(parsed.summary || '', rawInputSnippet);
    const startDateStr = macro?.start_date || explicitDate?.startDate || parsed.start_date;
    const endDateStr = macro?.end_date || explicitDate?.endDate || parsed.end_date || startDateStr;
    const startTimeStr = parsed.start_time || '09:00';
    const title = macro?.title || getCleanEventTitle(parsed.summary, category, { destination: parsed.location });

    // Prefer the model's own runway; fall back to the deterministic trip
    // decomposition's Track A / Track B milestones when it has none.
    const rawMilestones: any[] =
      Array.isArray(parsed.milestones) && parsed.milestones.length > 0
        ? parsed.milestones
        : (tripDecomposition?.milestones || []).map((m) => ({
            milestone_title: m.task,
            t_minus_days: m.t_minus_days,
            target_date: m.target_date,
            deliverables: m.description ? [m.description] : [],
          }));

    // Map extracted milestones. The model's own `deliverables` strings are
    // kept only as a fallback, not trusted outright: a model asked to
    // produce several milestones at once (e.g. one about a passport, one
    // about football kit for a kids' sports trip abroad) can pair the wrong
    // deliverable text to the wrong milestone - the same "no single
    // authoritative planner" failure mode the web app already solved for
    // its own milestones via attachDeliverablesToMilestones's title-keyword
    // matching. Re-deriving deliverables from each milestone's own title
    // here, the same way, means a topic mismatch in the model's output gets
    // corrected instead of stored verbatim.
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>();
    const milestonesPendingDeliverables: TMinusMilestone[] = rawMilestones.map((m: any, idx: number) => {
      const tMinusDays = typeof m.t_minus_days === 'number' ? m.t_minus_days : 7;
      const targetDate = m.target_date || startDateStr;

      const modelDeliverables: Deliverable[] = Array.isArray(m.deliverables)
        ? m.deliverables.map((d: any, dIdx: number) => ({
            deliverable_id: `del_${Date.now()}_${idx}_${dIdx}`,
            title: typeof d === 'string' ? d : d.title || 'Action item',
            type: 'coordination',
            is_completed: false,
          }))
        : [];
      modelDeliverablesByIndex.set(idx, modelDeliverables);

      return {
        id: `ms_${Date.now()}_${idx}`,
        eventId,
        tMinusLabel: `T-${tMinusDays}d`,
        tMinusOffsetMinutes: -1 * tMinusDays * 1440,
        calculatedDate: targetDate,
        title: m.milestone_title || `Milestone ${idx + 1}`,
        category: 'logistics',
        status: 'pending',
        scope: 'macro',
        deliverables: [],
      };
    });

    const reconciled = reconcileMilestoneDeliverables(milestonesPendingDeliverables, modelDeliverablesByIndex);
    // Same context-aware dedup/suppression pass the web app's agentProcessor.ts
    // applies to its own output - a Telegram-originated event shouldn't get a
    // laxer quality bar than one created in the app. rawInputSnippet is the
    // user's own message, so "a party at the bar" is caught here too.
    const milestones: TMinusMilestone[] = applyMilestoneQualityGuardrails(reconciled, {
      title,
      location: parsed.location || macro?.destination,
      rawText: rawInputSnippet,
    });

    const newEvent: CalendarEvent = {
      id: eventId,
      title,
      category,
      eventDate: startDateStr,
      endDate: endDateStr,
      eventTime: startTimeStr,
      location: parsed.location || macro?.destination || undefined,
      status: 'milestones_active',
      needsRefinement: true,
      context: {
        customNote: parsed.description || title,
        guestCount: parsed.guest_count,
      },
      milestones,
      rawInputSnippet,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await TelegramSessionStore.recordEventCreated(chatId, newEvent);

    let reply = parsed.telegram_reply;
    if (!reply) {
      const rangeText = endDateStr && endDateStr !== startDateStr ? `\`${startDateStr}\` to \`${endDateStr}\`` : `\`${startDateStr}\``;
      reply = [
        `*${newEvent.title}* Confirmed!`,
        `• 📅 *Dates*: ${rangeText}`,
        newEvent.location ? `• 📍 *Location*: ${newEvent.location}` : null,
        `• 🎯 *Preparation Runways*: ${milestones.length} milestones activated.`,
      ].filter(Boolean).join('\n');
    }

    return {
      replyText: reply,
      toolCalls: [
        {
          name: 'create_calendar_event',
          args: {
            summary: newEvent.title,
            start_iso: `${startDateStr}T${startTimeStr}:00`,
            end_iso: `${endDateStr}T18:00:00`,
          },
          result: { ok: true, id: newEvent.id },
        },
      ],
      createdEvent: newEvent,
    };
  }

  /**
   * Deterministic Natural Language Engine fallback (used when no Gemini API
   * key is configured, or the model call/JSON parse fails). Date and title
   * extraction defer to buildAndStoreEvent's tripDecomposition/explicitDate
   * overrides (the same parseNaturalDateRange used by agentProcessor.ts, so
   * e.g. day-before-month dates like "5 december" resolve correctly) -
   * everything computed here is only the last-resort default.
   */
  private static intelligentNaturalLanguageEngine(
    chatId: number | string,
    rawText: string,
    referenceDateISO: string,
    tripDecomposition: StructuredPlanningPayload | null
  ): Promise<CalendarAgentResult> {
    const explicitDate = parseNaturalDateRange(rawText, referenceDateISO);

    // Last-resort default target date (3 weeks out), only used when neither
    // the trip decomposition nor an explicit date match anything in the text.
    let startDateStr = explicitDate?.startDate;
    if (!startDateStr) {
      const fallback = new Date(referenceDateISO);
      fallback.setDate(fallback.getDate() + 21);
      startDateStr = fallback.toISOString().substring(0, 10);
    }
    const endDateStr = explicitDate?.endDate || startDateStr;

    // Derive a short fallback title: strip the matched date phrase and any
    // leading filler verb, then cap to the first sentence.
    let summary = rawText;
    if (explicitDate?.matchedText) {
      summary = summary.replace(explicitDate.matchedText, '');
    }
    summary = summary
      .replace(/^(book|schedule|plan|create)\s+(?:a\s+)?/i, '')
      .split(/[.\n]/)[0]
      .replace(/\s+(on|from)\s*$/i, '')
      .replace(/\s+with\s+(\d+\s+\w+)/i, ' (with $1)')
      .replace(/\s+/g, ' ')
      .trim();
    if (summary) {
      summary = summary.charAt(0).toUpperCase() + summary.slice(1);
    }

    // Calculate milestone dates relative to startDate
    const startObj = new Date(`${startDateStr}T09:00:00Z`);

    const subtractDays = (d: Date, days: number): string => {
      const res = new Date(d.getTime() - days * 86400000);
      return res.toISOString().substring(0, 10);
    };

    const isTrip = Boolean(tripDecomposition) || /trip|highlands|cabin|vacation|flight|hotel|tour|camp/i.test(rawText);

    const milestonesData = isTrip
      ? [
          {
            milestone_title: 'Lodging & Transport Locked',
            t_minus_days: 21,
            target_date: subtractDays(startObj, 21),
            deliverables: ['Book rental car / train passes', 'Reserve group stay / cabin'],
          },
          {
            milestone_title: 'Headcount & Group Costs Settled',
            t_minus_days: 14,
            target_date: subtractDays(startObj, 14),
            deliverables: ['Confirm headcount with all friends', 'Collect shared budget/expenses'],
          },
          {
            milestone_title: 'Gear & Bags Packed',
            t_minus_days: 2,
            target_date: subtractDays(startObj, 2),
            deliverables: ['Pack hiking boots & weather gear', 'Check offline trail maps'],
          },
        ]
      : [
          {
            milestone_title: 'Invitations & RSVPs Finalized',
            t_minus_days: 7,
            target_date: subtractDays(startObj, 7),
            deliverables: ['Send calendar invites', 'Confirm attendee headcount'],
          },
          {
            milestone_title: 'Agenda & Materials Prepared',
            t_minus_days: 2,
            target_date: subtractDays(startObj, 2),
            deliverables: ['Draft agenda notes', 'Prepare shared documents'],
          },
        ];

    return this.buildAndStoreEvent(
      chatId,
      {
        type: 'event_creation',
        summary,
        start_date: startDateStr,
        end_date: endDateStr,
        category: isTrip ? 'travel_trip' : 'dinner_social',
        description: rawText,
        milestones: milestonesData,
      },
      rawText,
      referenceDateISO,
      tripDecomposition
    );
  }
}
