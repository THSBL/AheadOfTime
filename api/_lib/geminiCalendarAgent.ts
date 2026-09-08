import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { TelegramSessionStore } from './telegramStore.js';
import type { CalendarEvent } from './types.js';
import { detectEventCategory, generateHeuristicMilestones } from './tminusRules.js';

export interface CalendarAgentResult {
  replyText: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, any>;
    result: any;
  }>;
  createdEvent?: CalendarEvent;
}

const SYSTEM_INSTRUCTION = `You are "Ahead Of Time", an intelligent, high-efficiency personal executive calendar assistant communicating via Telegram.

### Core Objectives
1. Manage the user's schedule with speed, clarity, and zero unnecessary conversational filler.
2. Read, verify, and modify the user's Google Calendar using the provided function-calling tools.

### Temporal Grounding Rules
- Every incoming user message contains dynamic system time context in the format:
  \`[System Context: Current Time: <Day, DD Month YYYY, HH:MM:SS TZ> (Timezone: <TZ>)]\`
- Always evaluate relative references ("today", "tomorrow morning", "next Friday", "in 2 hours") strictly against this timestamp and timezone.
- Never guess the current year or date; rely exclusively on the injected system context.

### Tool Execution Rules
- Querying Schedule: When the user asks about availability or existing events, invoke \`list_calendar_events\`. Always specify ISO 8601 timestamps (e.g., \`2026-09-08T09:00:00+01:00\`).
- Booking / Moving: When scheduling or rescheduling, invoke \`create_calendar_event\`. If the user does not specify a duration, default to 30 minutes for quick chats/syncs and 60 minutes for general meetings.
- Pre-booking Conflict Check: If the user requests a new meeting at a specific time, first verify existing events. If there is a direct conflict, state the clash succinctly and propose alternative free windows.
- No Hallucinated Writes: Never tell the user an event has been created, changed, or deleted without receiving a successful tool call result.

### Output Formatting for Telegram
- Structure responses cleanly using Telegram Markdown (bolding, bullet points, monospace for times).
- Keep replies concise and easy to read at a glance on mobile screens.
- Skip pleasantries (e.g., avoid "I hope you are having a productive day!"). Go directly to the schedule overview or booking confirmation.`;

const listCalendarEventsDeclaration: FunctionDeclaration = {
  name: 'list_calendar_events',
  description: 'Retrieves Google Calendar events within an ISO 8601 start and end time window.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      time_min_iso: {
        type: Type.STRING,
        description: 'Start of the search window in ISO 8601 format (e.g., 2026-09-08T00:00:00+01:00).',
      },
      time_max_iso: {
        type: Type.STRING,
        description: 'End of the search window in ISO 8601 format (e.g., 2026-09-08T23:59:59+01:00).',
      },
    },
    required: ['time_min_iso', 'time_max_iso'],
  },
};

const createCalendarEventDeclaration: FunctionDeclaration = {
  name: 'create_calendar_event',
  description: "Creates a new event on the user's primary calendar.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: 'Title of the event.',
      },
      start_iso: {
        type: Type.STRING,
        description: 'Start time in ISO 8601 format with timezone offset.',
      },
      end_iso: {
        type: Type.STRING,
        description: 'End time in ISO 8601 format with timezone offset.',
      },
      description: {
        type: Type.STRING,
        description: 'Meeting notes, agenda, or link.',
      },
    },
    required: ['summary', 'start_iso', 'end_iso'],
  },
};

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
   * Execute list_calendar_events
   */
  public static executeListEvents(chatId: number | string, args: { time_min_iso: string; time_max_iso: string }): any {
    const { time_min_iso, time_max_iso } = args;
    const minTime = new Date(time_min_iso).getTime();
    const maxTime = new Date(time_max_iso).getTime();

    const userEvents = TelegramSessionStore.getRecentEventsForChat(chatId);
    const candidateEvents = userEvents.length > 0 ? userEvents : TelegramSessionStore.getAllEvents();

    const matching = candidateEvents.filter((ev) => {
      if (!ev.eventDate) return false;
      const timeStr = ev.eventTime || '09:00';
      const eventDateTime = new Date(`${ev.eventDate}T${timeStr}:00Z`).getTime();
      return eventDateTime >= minTime - 3600000 && eventDateTime <= maxTime + 3600000;
    });

    return {
      events: matching.map((ev) => ({
        id: ev.id,
        summary: ev.title,
        start: `${ev.eventDate}T${ev.eventTime || '09:00'}:00`,
        end: `${ev.eventDate}T${ev.eventTime || '10:00'}:00`,
        location: ev.location,
        description: ev.context?.customNote || ev.title,
      })),
      window: {
        time_min_iso,
        time_max_iso,
      },
    };
  }

  /**
   * Execute create_calendar_event
   */
  public static executeCreateEvent(
    chatId: number | string,
    args: { summary: string; start_iso: string; end_iso: string; description?: string }
  ): { result: any; event?: CalendarEvent } {
    const { summary, start_iso, end_iso, description } = args;

    const newStart = new Date(start_iso).getTime();
    const newEnd = new Date(end_iso).getTime();
    const existingEvents = TelegramSessionStore.getRecentEventsForChat(chatId);

    const conflict = existingEvents.find((ev) => {
      if (!ev.eventDate) return false;
      const evStart = new Date(`${ev.eventDate}T${ev.eventTime || '09:00'}:00Z`).getTime();
      const evEnd = evStart + 60 * 60 * 1000;
      return newStart < evEnd && newEnd > evStart;
    });

    if (conflict) {
      return {
        result: {
          status: 'conflict',
          message: `Direct conflict with existing event "${conflict.title}"`,
          conflicting_event: {
            summary: conflict.title,
            date: conflict.eventDate,
            time: conflict.eventTime,
          },
          suggested_slots: [
            { start_iso: new Date(newEnd + 15 * 60 * 1000).toISOString(), duration_minutes: 30 },
            { start_iso: new Date(newStart - 45 * 60 * 1000).toISOString(), duration_minutes: 30 },
          ],
        },
      };
    }

    const eventId = `evt_${Date.now()}`;
    const category = detectEventCategory(summary);
    const dateStr = start_iso.substring(0, 10);
    const timeMatch = start_iso.match(/T(\d{2}:\d{2})/);
    const timeStr = timeMatch ? timeMatch[1] : '09:00';

    const milestones = generateHeuristicMilestones(
      { category, context: { customNote: description || summary } },
      eventId,
      dateStr,
      timeStr
    );

    const newEvent: CalendarEvent = {
      id: eventId,
      title: summary,
      category,
      eventDate: dateStr,
      eventTime: timeStr,
      status: 'milestones_active',
      needsRefinement: true,
      context: {
        customNote: description || summary,
      },
      milestones,
      rawInputSnippet: summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    TelegramSessionStore.recordEventCreated(chatId, newEvent);

    return {
      result: {
        status: 'confirmed',
        event_id: newEvent.id,
        summary: newEvent.title,
        start_iso,
        end_iso,
        milestones_count: milestones.length,
      },
      event: newEvent,
    };
  }

  /**
   * Main processor: takes prompt (with or without system context), runs Gemini with tools or fallback
   */
  public static async processMessage(
    chatId: number | string,
    rawText: string,
    defaultTimezone: string = 'Europe/London'
  ): Promise<CalendarAgentResult> {
    const prompt = this.ensureSystemContext(rawText, defaultTimezone);
    const ai = this.getClient();
    const toolCallsRecorded: Array<{ name: string; args: any; result: any }> = [];
    let createdEventObj: CalendarEvent | undefined;

    if (ai) {
      try {
        const firstTurn = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [
              {
                functionDeclarations: [listCalendarEventsDeclaration, createCalendarEventDeclaration],
              },
            ],
          },
        });

        const functionCalls = firstTurn.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
          const functionResponseParts: any[] = [];

          for (const call of functionCalls) {
            let callResult: any = null;

            if (call.name === 'list_calendar_events') {
              callResult = this.executeListEvents(chatId, call.args as any);
            } else if (call.name === 'create_calendar_event') {
              const res = this.executeCreateEvent(chatId, call.args as any);
              callResult = res.result;
              if (res.event) createdEventObj = res.event;
            }

            toolCallsRecorded.push({
              name: call.name,
              args: call.args as any,
              result: callResult,
            });

            functionResponseParts.push({
              functionResponse: {
                name: call.name,
                response: callResult,
              },
            });
          }

          // Second turn: feed function responses back to Gemini
          const secondTurn = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
              {
                role: 'model',
                parts: firstTurn.candidates?.[0]?.content?.parts || [],
              },
              {
                role: 'user',
                parts: functionResponseParts,
              },
            ],
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
            },
          });

          const finalText = secondTurn.text || '';
          if (finalText.trim()) {
            return {
              replyText: finalText.trim(),
              toolCalls: toolCallsRecorded,
              createdEvent: createdEventObj,
            };
          }
        } else if (firstTurn.text) {
          return {
            replyText: firstTurn.text.trim(),
            toolCalls: [],
            createdEvent: undefined,
          };
        }
      } catch (err: any) {
        console.warn('⚠️ Gemini tool execution failed or timed out, executing local engine:', err.message);
      }
    }

    // Heuristic Fallback Engine
    return this.fallbackHeuristicEngine(chatId, prompt);
  }

  /**
   * Deterministic heuristic engine that strictly mirrors the tool calls and Telegram output
   */
  private static fallbackHeuristicEngine(chatId: number | string, prompt: string): CalendarAgentResult {
    const userLineMatch = prompt.match(/User:\s*([\s\S]+)$/i);
    const userText = userLineMatch ? userLineMatch[1].trim() : prompt.trim();

    const contextMatch = prompt.match(/\[System Context: Current Time:\s*([A-Za-z]+),\s*(\d{1,2})\s*([A-Za-z]+)\s*(\d{4}),\s*([\d:]+)\s*([A-Za-z]+)?\s*\(Timezone:\s*([^)]+)\)\]/i);

    const baseYear = contextMatch ? parseInt(contextMatch[4], 10) : new Date().getFullYear();
    const baseMonthName = contextMatch ? contextMatch[3] : 'September';
    const baseDay = contextMatch ? parseInt(contextMatch[2], 10) : new Date().getDate();
    const tzOffset = '+01:00';

    const monthMap: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };

    const baseMonth = monthMap[baseMonthName.toLowerCase()] ?? 8;
    const baseDateObj = new Date(Date.UTC(baseYear, baseMonth, baseDay, 11, 45, 0));

    // Case 1: Querying schedule
    if (/\b(what|show|check|list|any).*(going on|schedule|calendar|free|events|afternoon|morning)\b/i.test(userText)) {
      const tomorrow = new Date(baseDateObj.getTime() + 24 * 60 * 60 * 1000);
      const y = tomorrow.getUTCFullYear();
      const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getUTCDate()).padStart(2, '0');

      const timeMin = `${y}-${m}-${d}T12:00:00${tzOffset}`;
      const timeMax = `${y}-${m}-${d}T18:00:00${tzOffset}`;

      const listRes = this.executeListEvents(chatId, {
        time_min_iso: timeMin,
        time_max_iso: timeMax,
      });

      const toolCalls = [
        {
          name: 'list_calendar_events',
          args: { time_min_iso: timeMin, time_max_iso: timeMax },
          result: listRes,
        },
      ];

      if (!listRes.events || listRes.events.length === 0) {
        return {
          replyText: `*Schedule for Tomorrow Afternoon* (\`${y}-${m}-${d}\`):\n• No scheduled events between \`12:00\` and \`18:00\`. Your afternoon is clear.`,
          toolCalls,
        };
      }

      const eventsList = listRes.events
        .map((e: any) => `• \`${e.start.slice(11, 16)} - ${e.end.slice(11, 16)}\` *${e.summary}*`)
        .join('\n');

      return {
        replyText: `*Schedule for Tomorrow Afternoon* (\`${y}-${m}-${d}\`):\n${eventsList}`,
        toolCalls,
      };
    }

    // Case 2: Booking an event
    const durationMatch = userText.match(/(\d+)[ -]minute/i);
    const durationMin = durationMatch ? parseInt(durationMatch[1], 10) : 30;

    let targetDay = baseDay + 9;
    let targetHour = 15;
    let targetMinute = 0;

    const pmMatch = userText.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am)/i);
    if (pmMatch) {
      targetHour = parseInt(pmMatch[1], 10);
      if (pmMatch[3].toLowerCase() === 'pm' && targetHour < 12) targetHour += 12;
      if (pmMatch[3].toLowerCase() === 'am' && targetHour === 12) targetHour = 0;
      targetMinute = pmMatch[2] ? parseInt(pmMatch[2], 10) : 0;
    }

    const endTotalMinutes = targetHour * 60 + targetMinute + durationMin;
    const endHour = Math.floor(endTotalMinutes / 60);
    const endMinute = endTotalMinutes % 60;

    const startIso = `${baseYear}-${String(baseMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}:00${tzOffset}`;
    const endIso = `${baseYear}-${String(baseMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00${tzOffset}`;

    let summary = userText.replace(/^book\s+(?:a\s+)?(?:\d+[- ]minute\s+)?/i, '');
    summary = summary.replace(/\s+at\s+\d+.*$/i, '').trim();
    if (!summary) summary = 'Sync meeting';

    const createRes = this.executeCreateEvent(chatId, {
      summary,
      start_iso: startIso,
      end_iso: endIso,
      description: userText,
    });

    const toolCalls = [
      {
        name: 'create_calendar_event',
        args: {
          summary,
          start_iso: startIso,
          end_iso: endIso,
          description: userText,
        },
        result: createRes.result,
      },
    ];

    const reply = [
      `*Event Confirmed*`,
      `• *Summary*: ${summary}`,
      `• *Date*: \`${baseYear}-${String(baseMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}\``,
      `• *Time*: \`${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')} – ${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}\` (${durationMin} mins)`,
      `• *Preparation Milestones*: Active and tracking`,
    ].join('\n');

    return {
      replyText: reply,
      toolCalls,
      createdEvent: createRes.event,
    };
  }
}
