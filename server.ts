import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  CalendarEvent,
  ProcessAgentInputPayload,
  ProcessAgentResponsePayload,
  TMinusMilestone,
  StructuredMilestone,
  MacroEventData,
  SubEvent,
} from "./src/types";
import {
  calculateOffsetDate,
  getEventTopicLabel,
} from "./src/utils/tminusRules";
import { inferTaskTimingLocally } from "./src/utils/timingAI";
import { deepRefineEventLocally } from "./src/utils/deepRefine";
import {
  generateContentFast,
  DEFAULT_FAST_MODELS,
  TRANSCRIBE_MODELS,
  processWithGemini,
  processWithDeterministicRules,
} from "./server/agentProcessor";
import { WhatsAppWebhookHandler } from "./server/whatsappWebhookHandler";
import { WhatsAppSessionStore } from "./server/whatsappStore";
import { WhatsAppService } from "./server/whatsappService";
import { AgendaScannerService } from "./server/agendaScanner";
import { TelegramWebhookHandler } from "./server/telegramWebhookHandler";
import { TelegramSessionStore } from "./server/telegramStore";
import { extractBearerToken, verifyGoogleAccessToken } from "./server/googleAuthVerify";
import { TelegramService } from "./server/telegramService";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    service: "T-Minus Calendar Intelligence Agent", 
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) 
  });
});

// Audio transcription endpoint with fast model
app.post("/api/agent/transcribe", async (req: Request, res: Response): Promise<void> => {
  try {
    const { audioBase64, mimeType = "audio/webm" } = req.body;
    if (!audioBase64) {
      res.status(400).json({ error: "audioBase64 is required" });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.json({ transcribedText: "Voice memo captured (Gemini API key not configured for live transcription)." });
      return;
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: audioBase64,
      },
    };

    const transcribeModels = TRANSCRIBE_MODELS;
    const result = await generateContentFast(
      () => ({
        contents: { 
          parts: [
            audioPart, 
            { text: "Transcribe this conversational calendar voice memo exactly. Output ONLY the transcribed speech text." }
          ] 
        },
      }),
      transcribeModels,
      4500
    );

    const transcribedText = result.text?.trim() || "";
    res.json({ transcribedText });
  } catch (error: any) {
    console.warn("Audio transcription notice:", error?.message || "Unavailable");
    res.json({ transcribedText: "Voice memo captured successfully. (Transcription fallback applied)." });
  }
});

// Endpoint to intelligently infer preparation timing based on task input and event context
app.post("/api/milestone/suggest-timing", async (req: Request, res: Response): Promise<void> => {
  const sanitizeString = (str: any, maxLen: number = 500): string => {
    if (typeof str !== 'string') return '';
    return str.replace(/[\u0000-\checked]/g, '').trim().slice(0, maxLen);
  };

  try {
    const rawTaskTitle = req.body.taskTitle || "";
    const rawTaskDescription = req.body.taskDescription || "";
    const rawEventTitle = req.body.eventTitle || "";
    const rawEventDate = req.body.eventDate || "";
    const rawEventTime = req.body.eventTime || "";

    const taskTitle = sanitizeString(rawTaskTitle, 200);
    const taskDescription = sanitizeString(rawTaskDescription, 500);
    const eventTitle = sanitizeString(rawEventTitle, 200);
    const eventDate = sanitizeString(rawEventDate, 50);
    const eventTime = sanitizeString(rawEventTime, 50);
    
    if (!taskTitle) {
      res.status(400).json({ error: "taskTitle is required" });
      return;
    }

    const localBaseline = inferTaskTimingLocally(taskTitle, taskDescription, eventTitle);

    if (!process.env.GEMINI_API_KEY) {
      res.json(localBaseline);
      return;
    }

    const prompt = `You are a world-class event concierge, logistics director, and timing strategist.
Analyze the user's specific preparation task in the context of their upcoming event, and calculate the exact optimal lead time (T-Minus buffer) before the event.

Event: "${eventTitle || "Upcoming Event"}" (Date: ${eventDate || "Upcoming"}, Time: ${eventTime || "unspecified"})
Task Action: "${taskTitle}"
Task Notes: "${taskDescription || "None"}"

CRITICAL INSTRUCTIONS FOR REASONING & ACCURACY:
- Tailor the rationale explicitly and specifically to "${taskTitle}". Mention the real-world logistical realities, manufacturing lead times, and booking windows for this exact activity or item.
  * Real-World Production & Booking Lead Times:
    - Wedding dresses / custom gowns / bespoke bridal suits: Require 6 to 9 months (T-8m / 24-36 weeks) for boutique made-to-measure production, shipping, and multiple rounds of alteration fittings.
    - Wedding venues & reception halls: Require 9 to 12 months (T-9m to T-12m) to secure Saturday dates and preferred venues.
    - Dog sitters, cat sitters, pet boarding & kennels: Require 4 to 8 weeks (T-4w to T-8w / 4-8 weeks) as quality boarding facilities and sitters reach full capacity weeks in advance.
    - Passports & visas: Require 8 to 12 weeks (T-8w to T-12w) for government renewals, visas, and 6-month passport validity rules.
    - International flights & vacation rentals: Require 8 to 16 weeks (T-8w to T-16w) to lock in reasonable fares and spacious villas.
    - Karaoke booths, escape rooms, private party rooms, bowling: Require 3 to 4 weeks (T-3w to T-4w) due to weekend peak demand.
    - Custom gifts & personalized monogramming: Require 2 to 4 weeks for artisan production.
    - Bakeries & custom cakes: Require 1 to 2 weeks for decorator reservation and pre-orders.
    - Outfits, suits & dry cleaning: Require 1 week (T-7d) for dry cleaners and alterations.
    - Packing luggage: 2 to 3 days (T-3d).
    - Fresh groceries, ice, chilled drinks: 1 day (T-1d) for optimal freshness.
- NEVER suggest buying a wedding dress or arranging a dog sitter only days in advance.
- NEVER output generic placeholder text like "Standard preparation window".
- The explanation must feel expert, practical, straightforward, and modern (no archaic language).

Required JSON format:
{
  "amount": <integer number, e.g. 1, 2, 3, 4, 7, 14>,
  "unit": <"weeks" | "days" | "hours">,
  "badge": <string e.g. "T-3w", "T-2w", "T-7d", "T-3d", "T-1d", "T-4h">,
  "category": <"prep" | "gift" | "shopping" | "booking" | "costume" | "logistics">,
  "reason": <1-2 sentences of crisp, domain-specific, tailored rationale explaining why this exact task requires this timing>,
  "alternatives": [
    { "amount": <number>, "unit": <"weeks"|"days"|"hours">, "badge": <string>, "label": <string>, "reason": <string> },
    { "amount": <number>, "unit": <"weeks"|"days"|"hours">, "badge": <string>, "label": <string>, "reason": <string> }
  ]
}

Output ONLY the JSON object.`;

    const result = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.15,
        },
      }),
      DEFAULT_FAST_MODELS,
      8000
    );

    const parsed = JSON.parse(result.text.trim());
    if (parsed && typeof parsed.amount === "number" && parsed.unit && parsed.reason) {
      res.json(parsed);
      return;
    }
    res.json(localBaseline);
  } catch (err: any) {
    console.warn("AI milestone timing inference notice:", err?.message);
    const { taskTitle = "", taskDescription = "", eventTitle = "" } = req.body;
    res.json(inferTaskTimingLocally(taskTitle, taskDescription, eventTitle));
  }
});

// Endpoint to deeply refine an unrefined agenda event with expert logistics reasoning
app.post("/api/event/deep-refine", async (req: Request, res: Response): Promise<void> => {
  try {
    const { event }: { event: CalendarEvent } = req.body;
    if (!event || !event.title) {
      res.status(400).json({ error: "Valid calendar event is required" });
      return;
    }

    const localMilestones = deepRefineEventLocally(event);
    const localRefinedEvent: CalendarEvent = {
      ...event,
      needsRefinement: false,
      refinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      milestones: localMilestones,
    };

    if (!process.env.GEMINI_API_KEY) {
      res.json({ event: localRefinedEvent });
      return;
    }

    const prompt = `You are an elite event logistics director, personal concierge, and timing strategist.
A user imported this upcoming agenda event from their calendar. It currently has not been refined yet.
Generate an intelligent, reverse-engineered timeline of backward preparation milestones (T-Minus buffer tasks).

Event Title: "${event.title}"
Event Date: ${event.eventDate || "Upcoming"} (Time: ${event.eventTime || "19:00"})
Event Location: "${event.location || "None specified"}"
Event Category: "${event.category || "custom"}"
Existing Context: "${JSON.stringify(event.context || {})}"

CRITICAL LOGISTICAL & TIMING REQUIREMENTS:
1. Deconstruct the event into 4 to 8 realistic, concrete, chronological preparation milestones leading backward from the event date.
2. Calculate exact lead times based on real-world logistical constraints:
   - Private entertainment booths (karaoke, escape rooms, bowling, VR): T-3w or T-4w for weekend peak bookings.
   - High-demand restaurants & group dining tables: T-2w to T-3w.
   - Flights & lodging: T-4w to T-6w.
   - Custom gifts, monogramming, artisan crafting & parcel shipping: T-2w to T-3w.
   - Bakeries & custom cakes: T-7d to T-5d with T-4h pickup.
   - Invitations & RSVPs: T-3w for headcount collection.
   - Fresh grocery shopping, ice, perishable appetizers: T-1d or T-2d.
   - Travel packing, luggage, roaming eSIM: T-3d.
   - 24-hour airline check-in: T-1d.
   - Day-of travel buffer & arrival: T-2h or T-1h.
3. Every milestone MUST have a tailored, crisp, domain-specific rationale in "description" explaining why this exact task requires this timing. NEVER use generic placeholder phrases.

Required JSON format:
{
  "milestones": [
    {
      "tMinusLabel": "T-3w",
      "tMinusOffsetMinutes": -30240,
      "title": "Book private karaoke room / booth",
      "description": "Private entertainment rooms experience heavy weekend demand; booking 3 weeks ahead secures your preferred room size and optimal time slot.",
      "category": "booking"
    }
  ]
}

Categories allowed: "booking" | "gift" | "shopping" | "logistics" | "prep" | "costume" | "tickets" | "review" | "work" | "admin"

Output ONLY the raw JSON object.`;

    const result = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.15,
        },
      }),
      DEFAULT_FAST_MODELS,
      8000
    );

    const parsed = JSON.parse(result.text.trim());
    if (parsed && Array.isArray(parsed.milestones) && parsed.milestones.length > 0) {
      const refinedMilestones: TMinusMilestone[] = parsed.milestones.map((m: any, idx: number) => {
        const offset = typeof m.tMinusOffsetMinutes === "number" ? m.tMinusOffsetMinutes : -((idx + 1) * 24 * 60);
        const calculatedDate = calculateOffsetDate(event.eventDate, event.eventTime || "19:00", offset);
        return {
          id: `ms-${event.id}-${(m.tMinusLabel || `T-${idx + 1}d`).toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now() % 100000}-${idx}`,
          eventId: event.id,
          tMinusLabel: m.tMinusLabel || `T-${idx + 1}d`,
          tMinusOffsetMinutes: offset,
          calculatedDate,
          title: m.title || `Prep task ${idx + 1}`,
          description: m.description || "",
          category: m.category || "prep",
          status: "pending",
        };
      });

      refinedMilestones.sort((a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime());

      res.json({
        event: {
          ...event,
          needsRefinement: false,
          refinedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: refinedMilestones,
        },
      });
      return;
    }

    res.json({ event: localRefinedEvent });
  } catch (err: any) {
    console.warn("AI deep refinement notice, using local engine:", err?.message);
    const { event }: { event: CalendarEvent } = req.body;
    if (event) {
      const localMilestones = deepRefineEventLocally(event);
      res.json({
        event: {
          ...event,
          needsRefinement: false,
          refinedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: localMilestones,
        },
      });
    } else {
      res.status(500).json({ error: "Failed to refine event" });
    }
  }
});

// Endpoint to AI-calibrate T-Minus offsets for spreadsheet checklists lacking explicit lead times
app.post("/api/presets/calibrate-offsets", async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      presetTitle = "Project Workflow", 
      targetDate = "2026-11-20", 
      tasks = [] 
    }: {
      presetTitle?: string;
      targetDate?: string;
      tasks: Array<{ task: string; description?: string; tag?: string }>;
    } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({ error: "At least one task is required for calibration" });
      return;
    }

    // Heuristic fallback calculation in case LLM is not configured or fails
    const computeHeuristicCalibration = () => {
      const total = tasks.length;
      return tasks.map((t, idx) => {
        const titleLower = t.task.toLowerCase();
        let days = Math.round(Math.max(0, 45 - (idx * (45 / Math.max(1, total - 1)))));
        
        // Adjust for strong keywords
        if (titleLower.includes('kickoff') || titleLower.includes('scope') || titleLower.includes('architecture')) {
          days = Math.max(days, 45);
        } else if (titleLower.includes('beta') || titleLower.includes('design') || titleLower.includes('draft')) {
          days = Math.max(days, 30);
        } else if (titleLower.includes('qa') || titleLower.includes('test') || titleLower.includes('security') || titleLower.includes('audit')) {
          days = Math.max(days, 14);
        } else if (titleLower.includes('stage') || titleLower.includes('staging') || titleLower.includes('submission') || titleLower.includes('sign-off')) {
          days = Math.min(days, 7);
          days = Math.max(days, 2);
        } else if (titleLower.includes('launch') || titleLower.includes('release') || titleLower.includes('deploy') || titleLower.includes('live')) {
          days = 0;
        } else if (titleLower.includes('retro') || titleLower.includes('review') && idx === total - 1) {
          days = -7;
        }

        const isDeliverable = /deliverable|order|reserve|book|submit|lock|deploy|flip|dispatch/i.test(t.task);

        return {
          task: t.task,
          t_minus_days: days,
          tag: t.tag || (/qa|test/i.test(t.task) ? 'QA' : /design|asset/i.test(t.task) ? 'Design' : /security|legal/i.test(t.task) ? 'Security' : 'Operations'),
          description: t.description || `Heuristically calibrated offset for ${t.task} (${days >= 0 ? `T-${days}d` : `Day +${Math.abs(days)}`})`,
          kind: isDeliverable ? 'deliverable' : 'milestone',
          scope: Math.abs(days) >= 14 ? 'macro' : 'micro',
        };
      }).sort((a, b) => b.t_minus_days - a.t_minus_days);
    };

    if (!process.env.GEMINI_API_KEY) {
      const calibratedTasks = computeHeuristicCalibration();
      res.json({ calibratedTasks, calibratedBy: 'heuristic_engine' });
      return;
    }

    const taskListText = tasks
      .map((t, idx) => `${idx + 1}. [Tag: ${t.tag || 'General'}] Title: "${t.task}"${t.description ? ` - Details: "${t.description}"` : ''}`)
      .join('\n');

    const prompt = `You are a Principal Technical Program Manager and Logistics Systems Architect.
A user uploaded an unstructured project checklist or workflow for "${presetTitle}".
The target execution/launch date is "${targetDate}".
The tasks currently lack explicit T-minus lead times or have uncalibrated timelines.

Tasks to backward-plan and calibrate:
${taskListText}

YOUR OBJECTIVE:
Calculate realistic, backward-planned T-Minus offsets (integer number of days relative to the target date) for each task so that:
1. Pre-requisites and foundation tasks precede downstream validation and deployment.
2. Adequate buffer is preserved (e.g., QA regressions and security sign-offs have real runway).
3. Critical-path deliverables (orders, submissions, freezes) occur at realistic logistical milestones.
4. If a task is post-event (e.g., retro, 30-day review), assign a negative integer offset (e.g., -7 for Day +7).

Return a JSON object strictly following this structure:
{
  "calibratedTasks": [
    {
      "task": "Refined and clean task title",
      "t_minus_days": 30,
      "tag": "QA | Legal | Design | Engineering | Operations | Marketing | DevOps | HR",
      "description": "Crisp 1-sentence operational rationale for this lead time",
      "kind": "milestone" or "deliverable",
      "scope": "macro" or "micro"
    }
  ]
}

Ensure every input task is preserved and calibrated. Output ONLY the raw JSON object.`;

    const result = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      }),
      DEFAULT_FAST_MODELS,
      8000
    );

    let parsedResult: any = null;
    try {
      const cleanJson = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedResult = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.warn("Failed to parse Gemini calibrated offsets response:", parseErr);
    }

    if (parsedResult && Array.isArray(parsedResult.calibratedTasks) && parsedResult.calibratedTasks.length > 0) {
      const sorted = parsedResult.calibratedTasks.sort((a: any, b: any) => (b.t_minus_days || 0) - (a.t_minus_days || 0));
      res.json({ calibratedTasks: sorted, calibratedBy: result.usedModel });
      return;
    }

    const fallback = computeHeuristicCalibration();
    res.json({ calibratedTasks: fallback, calibratedBy: 'heuristic_engine_fallback' });
  } catch (error: any) {
    console.error("Error in /api/presets/calibrate-offsets:", error);
    res.status(500).json({ error: "Failed to calibrate offsets" });
  }
});

// Main intelligent agent processing endpoint
app.post("/api/agent/process", async (req: Request, res: Response): Promise<void> => {
  try {
    const payload: ProcessAgentInputPayload = req.body;
    let {
      message = "",
      audioBase64,
      mimeType,
      currentReferenceDate,
      activeEvents = [],
      targetEventId,
      intakeAnswer,
      batchAnswers,
      userProfile
    } = payload;

    const refDate = currentReferenceDate ? new Date(currentReferenceDate) : new Date("2026-09-01T03:20:00-07:00");
    const refDateISO = isNaN(refDate.getTime()) ? new Date().toISOString() : refDate.toISOString();
    const refDateStr = refDateISO.substring(0, 10);

    let transcribedVoiceText: string | undefined = undefined;

    // Handle voice memo transcription if audio provided
    if (audioBase64 && process.env.GEMINI_API_KEY) {
      try {
        const audioPart = {
          inlineData: {
            mimeType: mimeType || "audio/webm",
            data: audioBase64,
          },
        };
        const transcribeModels = TRANSCRIBE_MODELS;
        const transcribeRes = await generateContentFast(
          () => ({
            contents: { 
              parts: [
                audioPart, 
                { text: "Transcribe this calendar / event prep voice memo accurately. Return only the transcript." }
              ] 
            },
          }),
          transcribeModels,
          3000
        );
        transcribedVoiceText = transcribeRes.text?.trim() || "";
        if (transcribedVoiceText && !message) {
          message = transcribedVoiceText;
        }
      } catch (audioErr: any) {
        console.warn("Audio transcription notice:", audioErr?.message || "Transcribe fallback");
      }
    }

    if (!message && !intakeAnswer && !batchAnswers) {
      res.status(400).json({ error: "Message or intake answer is required." });
      return;
    }

    // Existing event lookup if targeted
    const existingEvent = targetEventId ? activeEvents.find(e => e.id === targetEventId) : undefined;

    // ARCHITECTURAL SPEED BOOST: If user is answering intake questions or tuning variables for an existing event,
    // we already have the structured parameters! Resolve instantly (0ms) using deterministic engine.
    if ((intakeAnswer || batchAnswers) && existingEvent) {
      const instantResult = processWithDeterministicRules({
        message,
        refDateStr,
        refDateISO,
        existingEvent,
        intakeAnswer,
        batchAnswers,
        transcribedVoiceText,
        userProfile
      });
      res.json(instantResult);
      return;
    }

    let result: ProcessAgentResponsePayload;

    if (process.env.GEMINI_API_KEY) {
      try {
        result = await processWithGemini({
          message,
          currentReferenceDate: refDateISO,
          refDateStr,
          existingEvent,
          intakeAnswer,
          batchAnswers,
          activeEvents,
          userProfile,
        });
        if (transcribedVoiceText) {
          result.transcribedText = transcribedVoiceText;
        }
      } catch (geminiError: any) {
        console.warn("Fast Gemini notice, seamlessly using deterministic rules engine:", geminiError?.message || "Fallback");
        result = processWithDeterministicRules({
          message,
          refDateStr,
          refDateISO,
          existingEvent,
          intakeAnswer,
          batchAnswers,
          transcribedVoiceText,
          userProfile
        });
      }
    } else {
      result = processWithDeterministicRules({
        message,
        refDateStr,
        refDateISO,
        existingEvent,
        intakeAnswer,
        batchAnswers,
        transcribedVoiceText,
        userProfile
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error("Agent process handler error:", error);
    res.status(500).json({ error: error.message || "Failed to process request" });
  }
});

// -----------------------------------------------------------------------------
// WhatsApp Reminder & Completion Tool - Webhook & API Routes
// -----------------------------------------------------------------------------

// 1. Meta Webhook Verification (supports both /webhook/whatsapp and /api/webhook/whatsapp)
app.get("/webhook/whatsapp", WhatsAppWebhookHandler.handleVerification);
app.get("/api/webhook/whatsapp", WhatsAppWebhookHandler.handleVerification);

// 2. Meta Incoming Messages Receiver (supports both /webhook/whatsapp and /api/webhook/whatsapp)
app.post("/webhook/whatsapp", WhatsAppWebhookHandler.handleIncomingMessage);
app.post("/api/webhook/whatsapp", WhatsAppWebhookHandler.handleIncomingMessage);

// 3. WhatsApp Integration Status & Config
app.get("/api/whatsapp/status", (_req: Request, res: Response) => {
  res.json({
    webhookUrl: "/webhook/whatsapp",
    isVerifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    isCloudApiConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "Not Configured",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "Not Configured",
    approvedTemplateName: "ahead_of_time_event_alert",
    activeSessionsCount: WhatsAppSessionStore.getAllSessions().length,
  });
});

// 4. List Active WhatsApp Sessions
app.get("/api/whatsapp/sessions", (_req: Request, res: Response) => {
  const sessions = WhatsAppSessionStore.getAllSessions();
  res.json({ sessions });
});

// 5. Trigger Outbound Proactive Template Outreach for a Specific Event
app.post("/api/whatsapp/outreach", async (req: Request, res: Response): Promise<void> => {
  try {
    const { toPhone, userFirstName = "there", eventId, eventTitle, eventDate, eventLocation, notes } = req.body;

    if (!toPhone || !eventId || !eventTitle || !eventDate) {
      res.status(400).json({ error: "toPhone, eventId, eventTitle, and eventDate are required" });
      return;
    }

    const [year, month, day] = String(eventDate).split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // 1. Format Meta Utility Template Payload
    const templatePayload = WhatsAppService.buildProactiveTemplatePayload(
      toPhone,
      userFirstName,
      eventTitle,
      formattedDate,
      eventId
    );

    // 2. Dispatch via Meta Cloud API (or simulated if credentials missing)
    const result = await WhatsAppService.sendMetaApiMessage(templatePayload);

    // 3. Persist Event Session
    const sessionId = WhatsAppSessionStore.generateSessionId(toPhone, eventId);
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session = WhatsAppSessionStore.saveSession({
      sessionId,
      phoneNumber: toPhone,
      userFirstName,
      eventId,
      eventTitle,
      eventDate,
      eventLocation,
      status: "OUTREACH_SENT",
      createdAt: new Date().toISOString(),
      lastInteractionAt: new Date().toISOString(),
      sessionExpiresAt,
      messagesTranscript: [
        {
          id: `wa-msg-${Date.now()}`,
          sender: "bot",
          text: `Hi ${userFirstName}! AheadOfTime spotted a new event on your calendar: *${eventTitle}* on *${formattedDate}*. To build your custom runway (bookings, packing, gifts), what are the key details or extra plans for this?`,
          timestamp: new Date().toISOString(),
          type: "template",
        },
      ],
      gatheredContext: {
        userRawNotes: notes || "",
      },
      metadata: {
        mode: result.mode,
        messageId: result.messageId,
      },
    });

    res.json({
      success: true,
      result,
      session,
      templatePayload,
    });
  } catch (err: any) {
    console.error("Outreach dispatch error:", err);
    res.status(500).json({ error: err.message || "Failed to trigger WhatsApp outreach" });
  }
});

// 6. Run Daily Agenda Background Scan
app.post("/api/whatsapp/scan-agenda", async (req: Request, res: Response): Promise<void> => {
  try {
    const { events = [], userPhone, userFirstName = "there" } = req.body;

    if (!userPhone) {
      res.status(400).json({ error: "userPhone is required for WhatsApp background scan" });
      return;
    }

    const scanResult = await AgendaScannerService.scanAndTriggerOutreach(
      events,
      userPhone,
      userFirstName
    );

    res.json(scanResult);
  } catch (err: any) {
    console.error("Agenda scan error:", err);
    res.status(500).json({ error: err.message || "Failed to execute agenda scan" });
  }
});

// 7. Developer & UI In-App Simulation: Simulate Incoming User Reply or Button Tap
app.post("/api/whatsapp/simulate-incoming", async (req: Request, res: Response): Promise<void> => {
  try {
    const { fromPhone, text, buttonPayload } = req.body;

    if (!fromPhone || (!text && !buttonPayload)) {
      res.status(400).json({ error: "fromPhone and either text or buttonPayload are required" });
      return;
    }

    const simResult = await WhatsAppWebhookHandler.simulateIncomingMessage(
      fromPhone,
      text || "",
      buttonPayload
    );

    res.json(simResult);
  } catch (err: any) {
    console.error("Simulation error:", err);
    res.status(500).json({ error: err.message || "Failed to simulate incoming message" });
  }
});

// 8. Delete / Clear a Session
app.delete("/api/whatsapp/sessions/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const deleted = WhatsAppSessionStore.deleteSession(sessionId);
  res.json({ success: deleted });
});

// -----------------------------------------------------------------------------
// Telegram Calendar Assistant - Webhook & API Routes
// -----------------------------------------------------------------------------

// 1. Telegram Incoming Webhook (supports both /webhook/telegram and /api/telegram/webhook)
app.post("/webhook/telegram", (req: Request, res: Response) => TelegramWebhookHandler.handleWebhook(req, res));
app.post("/api/telegram/webhook", (req: Request, res: Response) => TelegramWebhookHandler.handleWebhook(req, res));
app.get("/api/telegram/webhook", (req: Request, res: Response) => {
  res.json({ ok: true, message: "Ahead Of Time Telegram webhook is active and ready to receive POST updates from Telegram." });
});
app.get("/webhook/telegram", (req: Request, res: Response) => {
  res.json({ ok: true, message: "Ahead Of Time Telegram webhook is active and ready to receive POST updates from Telegram." });
});

// 2. Telegram Integration Status
app.get("/api/telegram/status", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
  const userId = (req.query.userId as string) || "user_default";

  const isConfigured = TelegramService.isConfigured();
  let botInfo = null;
  let webhookInfo = null;

  if (isConfigured) {
    try {
      botInfo = await TelegramService.getMe();
      webhookInfo = await TelegramService.getWebhookInfo();
    } catch (e: any) {
      console.warn("Could not retrieve telegram status:", e.message);
    }
  }

  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || host.includes("run.app") ? "https" : "http";
  const inferredWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  const pairStatus = await TelegramSessionStore.getPairingStatus(code, userId);

  res.json({
    ok: true,
    linked: pairStatus.linked,
    status: pairStatus.status,
    username: pairStatus.username || (pairStatus.session?.username ? `${pairStatus.session.username}` : undefined),
    chatId: pairStatus.chatId || pairStatus.telegram_chat_id,
    telegram_linked: pairStatus.linked,
    isLinked: pairStatus.linked,
    telegram_chat_id: pairStatus.chatId || pairStatus.telegram_chat_id,
    session: pairStatus.session,
    isConfigured,
    hasToken: isConfigured,
    botInfo: botInfo?.ok ? botInfo.result : null,
    webhookInfo: webhookInfo?.ok ? webhookInfo.result : null,
    inferredWebhookUrl,
    activeSessions: (await TelegramSessionStore.getAllSessions()).length,
    storedEventsCount: (await TelegramSessionStore.getAllEvents()).length,
  });
});

// 2b. Manual Verification Fallback & Force-Link Endpoint
app.post("/api/telegram/manual-link", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const { code, username = "Telegram User", chatId } = req.body || {};
    const cleanChatId = chatId && chatId !== 123456789 && chatId !== '123456789' ? chatId : undefined;
    const record = await TelegramSessionStore.manualLink(code, username, cleanChatId);
    res.json({
      ok: true,
      linked: true,
      status: "linked",
      username: record.username,
      chatId: record.chatId,
      record,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to manually link" });
  }
});

// 3. Register Webhook with Telegram API
app.post("/api/telegram/set-webhook", async (req: Request, res: Response) => {
  try {
    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || host.includes("run.app") ? "https" : "http";
    const defaultUrl = `${protocol}://${host}/api/telegram/webhook`;
    const targetUrl = req.body?.webhookUrl || defaultUrl;
    const secretToken = req.body?.secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;

    const result = await TelegramService.setWebhook(targetUrl, secretToken);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to set webhook" });
  }
});

// 3b. Pairing Code Generation & Account Linking
app.post(["/api/telegram/pair-code", "/api/pair-code"], async (req: Request, res: Response) => {
  try {
    // Generating a pairing code ties a Telegram chat to a real web account,
    // so this requires a verified identity rather than a client-claimed
    // email/userId - otherwise anyone could request a code claiming to be
    // someone else's account.
    const verified = await verifyGoogleAccessToken(extractBearerToken(req));
    if (!verified) {
      res.status(401).json({ ok: false, error: "Sign in required to generate a pairing code." });
      return;
    }
    const pairingCode = await TelegramSessionStore.createPairingCode(verified.email, verified.email);
    let botUsername = "AheadTimebot";
    try {
      const botMe = await TelegramService.getMe();
      if (botMe.ok && botMe.result?.username) {
        botUsername = botMe.result.username;
      }
    } catch (e) {
      // Fallback
    }
    const deepLink = `https://t.me/${botUsername}?start=${pairingCode}`;
    res.json({
      ok: true,
      pairingCode,
      pairCode: pairingCode,
      botUsername,
      deepLink,
      expiresInSeconds: 86400,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to create pairing code" });
  }
});

app.get(["/api/telegram/pair-code", "/api/pairing-status"], async (req: Request, res: Response) => {
  try {
    const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
    const userId = (req.query.userId as string) || "user_default";
    const status = await TelegramSessionStore.getPairingStatus(code, userId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to check pairing status" });
  }
});

app.delete("/api/telegram/pair-code", async (req: Request, res: Response) => {
  try {
    // Unlinking by userId disconnects someone's Telegram account, so it
    // requires verified identity rather than a client-claimed userId -
    // otherwise anyone could unlink another user's Telegram by guessing
    // their email. Unlinking by chatId is left as-is: that's already
    // scoped to a specific Telegram chat, not an arbitrary claimed user.
    const { chatId, userId } = req.body || {};
    if (chatId) {
      await TelegramSessionStore.unlinkSession(chatId);
    } else if (userId) {
      const verified = await verifyGoogleAccessToken(extractBearerToken(req));
      if (!verified || verified.email.toLowerCase() !== String(userId).toLowerCase()) {
        res.status(401).json({ ok: false, error: "Sign in required to unlink this account." });
        return;
      }
      const session = await TelegramSessionStore.getLinkedSessionForWebUser(verified.email);
      if (session) {
        await TelegramSessionStore.unlinkSession(session.chatId);
      }
    }
    res.json({ ok: true, message: "Unlinked successfully" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to unlink" });
  }
});

// 4. Send Refinement Prompt for an Event to Telegram (Multi-tenant: requires chatId)
app.post("/api/telegram/send-refine", async (req: Request, res: Response) => {
  try {
    const { chatId, event } = req.body || {};
    let targetChatId = chatId;

    // If targetChatId is a placeholder or not provided, try resolving from active linked sessions
    if (!targetChatId || targetChatId === 123456789 || targetChatId === '123456789' || targetChatId === 'demo') {
      const activeSessions = await TelegramSessionStore.getAllSessions();
      const linkedSession = activeSessions.find(s => s.isLinked && s.chatId && s.chatId !== 123456789 && s.chatId !== '123456789');
      if (linkedSession) {
        targetChatId = linkedSession.chatId;
      }
    }

    if (!targetChatId || targetChatId === 123456789 || targetChatId === '123456789' || targetChatId === 'demo') {
      res.status(400).json({
        ok: false,
        error: "Valid Telegram Chat ID required. Please click 'Connect Telegram' and tap Start in @AheadTimebot first.",
        description: "Valid Telegram Chat ID required. Please click 'Connect Telegram' and tap Start in @AheadTimebot first.",
      });
      return;
    }

    if (!event || !event.id || !event.title) {
      res.status(400).json({
        ok: false,
        error: "Valid calendar event object with id and title is required.",
      });
      return;
    }

    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol === "https" || host.includes("run.app") ? "https" : "http";
    const appBaseUrl = process.env.APP_URL || `${protocol}://${host}`;

    const result = await TelegramService.sendRefinementPrompt(targetChatId, event, appBaseUrl);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to dispatch telegram prompt" });
  }
});

// 5. Get Events created via Telegram (User/Account Scoped)
app.get("/api/telegram/events", async (req: Request, res: Response) => {
  // Returns real event data, so identity must be verified rather than
  // trusted from a query param - a client-supplied userId was exactly how
  // the earlier cross-user event exposure bug worked.
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    res.json({ ok: true, events: [] });
    return;
  }
  const events = await TelegramSessionStore.getAllEvents(verified.email);
  res.json({ ok: true, events });
});

app.get("/api/telegram/event/:id", async (req: Request, res: Response) => {
  // Scope through the same ownership-filtered query as /api/telegram/events
  // (this route previously called getEvent() directly with no ownership
  // check at all - the same class of bug already fixed in api/telegram/*).
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    res.status(404).json({ ok: false, error: "Event not found" });
    return;
  }
  const events = await TelegramSessionStore.getAllEvents(verified.email);
  const event = events.find((e) => e.id === req.params.id);
  if (event) {
    res.json({ ok: true, event });
  } else {
    res.status(404).json({ ok: false, error: "Event not found" });
  }
});

// Setup Vite middleware for development or static serving for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`T-Minus Calendar Intelligence Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
