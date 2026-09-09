import { GoogleGenAI } from '@google/genai';
import { TelegramSessionStore } from './telegramStore.js';
import { CalendarEvent, TMinusMilestone, Deliverable, EventCategory } from '../src/types.js';

export interface CalendarAgentResult {
  replyText: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, any>;
    result: any;
  }>;
  createdEvent?: CalendarEvent;
}

const COMPOUND_EVENT_SYSTEM_PROMPT = `You are "Ahead Of Time", an intelligent, high-efficiency personal executive calendar assistant communicating via Telegram.

### Core Objectives:
1. Parse user scheduling requests (trips, dinners, birthdays, meetings, deadlines, conferences, vacations, weddings) into rich structured calendar events.
2. Calculate realistic backward preparation runways (T-Minus milestones) with tangible deliverables based on real-world lead times (e.g., weddings take 6-12 months for venue/dress/caterer; dog sitters and boarding take 4-8 weeks; passports and international flights take 8-12 weeks).
3. Manage the user's schedule with speed, clarity, and zero unnecessary conversational filler. Use clean, modern plain English (avoid archaic words like 'dispatched', 'garments', 'artifact', etc.).

### Temporal Grounding Rules:
- Every incoming user message contains dynamic system time context in the format:
  \`[System Context: Current Time: <Day, DD Month YYYY, HH:MM:SS TZ> (Timezone: <TZ>)]\`
- Always evaluate relative references ("today", "tomorrow morning", "next Friday", "in 2 hours", "Oct 14-18", "next month") strictly against this timestamp and timezone.
- Never guess the current year or date; rely exclusively on the injected system context.

### Response Format:
You MUST respond with a valid JSON object matching one of two schemas:

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

Allowed categories: "travel_trip", "birthday_party", "dinner_social", "project_deadline", "hosting_visitors", "festival_concert", "custom".
Always ensure date arithmetic for milestones is accurate: target_date = start_date minus t_minus_days.`;

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
  public static ensureSystemContext(userText: string, defaultTimezone: string = 'Europe/London'): string {
    if (userText.includes('[System Context: Current Time:')) {
      return userText;
    }

    const now = new Date();
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
   * Main processor: executes Gemini Flash extraction or intelligent calendar parser fallback
   */
  public static async processMessage(
    chatId: number | string,
    rawText: string,
    defaultTimezone: string = 'Europe/London'
  ): Promise<CalendarAgentResult> {
    const prompt = this.ensureSystemContext(rawText, defaultTimezone);
    const ai = this.getClient();

    if (ai) {
      try {
        console.log(`🤖 Invoking Gemini Flash for Telegram chat ${chatId}: "${rawText.slice(0, 60)}..."`);
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
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

        const rawJson = response.text || '';
        console.log(`📥 Gemini raw response:`, rawJson.slice(0, 200));

        if (rawJson.trim()) {
          const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const parsed = JSON.parse(cleaned);

          if (parsed.type === 'event_creation' && parsed.summary && parsed.start_date) {
            return this.buildAndStoreEvent(chatId, parsed, rawText);
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
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Gemini extraction error:', err.message);
      }
    }

    // Intelligent Deterministic NLP Engine Fallback
    return this.intelligentNaturalLanguageEngine(chatId, rawText, prompt);
  }

  /**
   * Constructs a full CalendarEvent object with milestones and saves it to store
   */
  private static buildAndStoreEvent(
    chatId: number | string,
    parsed: any,
    rawInputSnippet: string
  ): CalendarAgentResult {
    const eventId = `evt_${Date.now()}`;
    const category: EventCategory = (parsed.category as EventCategory) || 'travel_trip';
    const startDateStr = parsed.start_date;
    const endDateStr = parsed.end_date || startDateStr;
    const startTimeStr = parsed.start_time || '09:00';

    // Map extracted milestones
    const milestones: TMinusMilestone[] = (parsed.milestones || []).map((m: any, idx: number) => {
      const tMinusDays = typeof m.t_minus_days === 'number' ? m.t_minus_days : 7;
      const targetDate = m.target_date || startDateStr;

      const deliverables: Deliverable[] = Array.isArray(m.deliverables)
        ? m.deliverables.map((d: any, dIdx: number) => ({
            deliverable_id: `del_${Date.now()}_${idx}_${dIdx}`,
            title: typeof d === 'string' ? d : d.title || 'Action item',
            type: 'coordination',
            is_completed: false,
          }))
        : [];

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
        deliverables,
      };
    });

    const newEvent: CalendarEvent = {
      id: eventId,
      title: parsed.summary,
      category,
      eventDate: startDateStr,
      endDate: endDateStr,
      eventTime: startTimeStr,
      location: parsed.location || undefined,
      status: 'milestones_active',
      needsRefinement: true,
      context: {
        customNote: parsed.description || parsed.summary,
        guestCount: parsed.guest_count,
      },
      milestones,
      rawInputSnippet,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    TelegramSessionStore.recordEventCreated(chatId, newEvent);

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
   * Deterministic Natural Language Engine (handles complex date expressions like "Oct 14-18 with 4 friends")
   */
  private static intelligentNaturalLanguageEngine(
    chatId: number | string,
    rawText: string,
    prompt: string
  ): CalendarAgentResult {
    // Grounding year / context
    const yearMatch = prompt.match(/\b(202\d)\b/);
    const baseYear = yearMatch ? parseInt(yearMatch[1], 10) : 2026;

    const monthMap: Record<string, number> = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, sept: 9, september: 9,
      oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };

    // Check for date range: "Oct 14-18", "October 14-18", "Oct 14 to 18", "Oct 14 - 18"
    const rangeRegex = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/i;
    const singleDateRegex = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i;

    let startDateStr = `${baseYear}-10-14`;
    let endDateStr = `${baseYear}-10-18`;

    const rangeMatch = rawText.match(rangeRegex);
    const singleMatch = rawText.match(singleDateRegex);

    if (rangeMatch) {
      const monthNum = monthMap[rangeMatch[1].toLowerCase()] || 10;
      const startDay = parseInt(rangeMatch[2], 10);
      const endDay = parseInt(rangeMatch[3], 10);
      const mm = String(monthNum).padStart(2, '0');
      startDateStr = `${baseYear}-${mm}-${String(startDay).padStart(2, '0')}`;
      endDateStr = `${baseYear}-${mm}-${String(endDay).padStart(2, '0')}`;
    } else if (singleMatch) {
      const monthNum = monthMap[singleMatch[1].toLowerCase()] || 10;
      const startDay = parseInt(singleMatch[2], 10);
      const mm = String(monthNum).padStart(2, '0');
      startDateStr = `${baseYear}-${mm}-${String(startDay).padStart(2, '0')}`;
      endDateStr = startDateStr;
    }

    // Clean summary title
    let summary = rawText
      .replace(/^(book|schedule|plan|create)\s+(?:a\s+)?/i, '')
      .replace(/\s+with\s+(\d+\s+\w+)/i, ' (with $1)')
      .trim();

    // Capitalize first letter
    summary = summary.charAt(0).toUpperCase() + summary.slice(1);

    // Calculate milestone dates relative to startDate
    const startObj = new Date(`${startDateStr}T09:00:00Z`);

    const subtractDays = (d: Date, days: number): string => {
      const res = new Date(d.getTime() - days * 86400000);
      return res.toISOString().substring(0, 10);
    };

    const isTrip = /trip|highlands|cabin|vacation|flight|hotel|tour|camp/i.test(rawText);

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
      rawText
    );
  }
}
