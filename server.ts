import express, { Request, Response } from "express";
import { appOrigin } from "./server/appOrigin";
import path from "path";
import fs from "fs";
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
import { generateDeterministicMilestones } from "./src/utils/deterministicMilestoneGenerator";
import { getActiveAssessor } from "./src/utils/preparationAssessment";
import { SHARED_PLANNING_RULES, buildPreparationLevelAddendum } from "./server/planningPipeline";
import {
  generateContentFast,
  DEFAULT_FAST_MODELS,
  TRANSCRIBE_MODELS,
  processWithGemini,
  processWithDeterministicRules,
  applyExtensiveRunUps,
  askRefinementQuestions,
  describeGeminiError,
} from "./server/agentProcessor";
import { sanitizePlanningProfile } from "./src/utils/refinementQuestions";
import { WhatsAppWebhookHandler } from "./server/whatsappWebhookHandler";
import { WhatsAppSessionStore } from "./server/whatsappStore";
import { WhatsAppService } from "./server/whatsappService";
import { AgendaScannerService } from "./server/agendaScanner";
import { TelegramWebhookHandler } from "./server/telegramWebhookHandler";
import { TelegramSessionStore, findOrCreateUserByEmail } from "./server/telegramStore";
import { extractBearerToken, verifyGoogleAccessToken, isAdminEmail } from "./server/googleAuthVerify";
import { verifyEventDeepLink } from "./server/deepLinkToken";
import { TelegramService } from "./server/telegramService";
import { logQualityEvent, QualitySignalType } from "./server/qualityStore";
import { getFeedbackEligibility, submitFeedback, listRecentFeedback } from "./server/feedbackStore";
import { recordCalendarVote, pollClientHash, summarizeCalendarVotes } from "./server/calendarPollStore";
import { parseCalendarVote } from "./src/utils/calendarPoll";
import { handleProfileApi } from "./server/userProfileStore";
import { handleSessionApi } from "./server/sessionRoutes";
import { verifyRequestUser } from "./server/requestAuth";
import { handleAiSettings } from "./server/aiSettingsRoute";
import { handleNotifyPrefs } from "./server/notifyPrefsRoute";
import { handleEmailLink } from "./server/emailLogin";
import { handleCalendarFeed, handleCalendarDone, handleCalendarFeedSettings, handleCalendarPlan } from "./server/calendarFeed";
import { handleTelegramWarm } from "./server/telegramWarm";
import { handleAccountDeletion } from "./server/accountDeletion";
import { guardAiRequest, AI_LIMITS, OffTopicRequestError, OFF_TOPIC_REPLY, AI_SCOPE_RULE, capPlannerOutput, capText, capTimingSuggestion } from "./server/aiGuard";
import { handleCalendarPush, handleCalendarEvents, handleCalendarDelete } from "./server/googleCalendarServerApi";
import { signOAuthState, verifyOAuthState } from "./server/notifyActionToken";
import {
  exchangeAuthorizationCode,
  storeRefreshToken,
  hasBackgroundSyncLinked,
  backgroundSyncHasTasksScope,
  grantIncludesTasks,
  unlinkBackgroundSync,
  isBackgroundSyncConfigured,
  getNotifyPrefs,
  setNotifyPrefs,
} from "./server/googleOAuthTokenStore";
import { mergeNotifyPrefs } from "./server/notifyPrefs";
import { listPendingFindings, dismissAllFindings } from "./server/agendaFindingsStore";
import { handleEventsApi } from "./server/eventsApi";
import { isEmailConfigured } from "./server/emailService";
import { getGoogleClientId } from "./server/googleClientId";
import { sendTestUpdate } from "./server/sendTestUpdate";

// dotenv only loads .env by default - it does NOT auto-load .env.local the
// way Next.js/Vite's own env handling does. Loading both here (.env first,
// then .env.local so a local override wins) means a key set only in
// .env.local (e.g. GEMINI_API_KEY) actually reaches this Express server,
// not just Vite's client-side build.
dotenv.config({ path: ['.env', '.env.local'] });

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

// Voice transcription was never used by the app and answered anyone (an
// open Gemini transcription service) - removed; twin of api/agent's 410.
app.post("/api/agent/transcribe", (_req: Request, res: Response) => {
  res.status(410).json({ error: "Voice transcription is not available." });
});

// Endpoint to intelligently infer preparation timing based on task input and event context
app.post("/api/milestone/suggest-timing", async (req: Request, res: Response): Promise<void> => {
  const sanitizeString = (str: any, maxLen: number = 500): string => {
    if (typeof str !== 'string') return '';
    return str.replace(/[\u0000-\checked]/g, '').trim().slice(0, maxLen);
  };

  try {
    const aiUser = await guardAiRequest(req, res, { taskTitle: 400, taskDescription: 1000, eventTitle: 400 });
    if (!aiUser) return;
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

    if (!process.env.GEMINI_API_KEY || !aiUser.aiEnabled) {
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

${AI_SCOPE_RULE}

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
      res.json(capTimingSuggestion(parsed));
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
    const aiUser = await guardAiRequest(req, res, { event: 60_000 });
    if (!aiUser) return;
    const { event }: { event: CalendarEvent } = req.body;
    if (!event || !event.title) {
      res.status(400).json({ error: "Valid calendar event is required" });
      return;
    }

    // Architecture reset Phase 6 - always a fresh, never-before-seen event
    // here (no existingEvent concept), so always AOT's own fresh
    // assessment, never a sticky user-set level to respect.
    const prepAssessment = getActiveAssessor().assessPreparationLevel({
      category: event.category,
      title: event.title,
      location: event.location,
      context: event.context,
    });

    const localMilestones = generateDeterministicMilestones({
      eventId: event.id,
      title: event.title,
      eventDate: event.eventDate,
      eventTime: event.eventTime,
      location: event.location,
      category: event.category,
      context: event.context,
    }).map((m) => ({ ...m, tier: prepAssessment.level }));
    const localRefinedEvent: CalendarEvent = {
      ...event,
      needsRefinement: false,
      refinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      milestones: localMilestones,
      preparationLevel: prepAssessment.level,
      preparationLevelReasons: prepAssessment.reasons,
      preparationLevelSetBy: "aot",
    };

    if (!process.env.GEMINI_API_KEY || !aiUser.aiEnabled) {
      // usedAi lets a caller that has its OWN, more context-aware local
      // generator (e.g. the event wizard, which knows the user's actual
      // chip answers) tell this generic local fallback apart from a real
      // Gemini plan and prefer its own generator instead - without this,
      // every caller silently got this endpoint's generic checklist any
      // time no API key was configured, even when they had something
      // better available locally.
      res.json({ event: localRefinedEvent, usedAi: false });
      return;
    }

    const prompt = `You are an elite event logistics director, personal concierge, and timing strategist.
A user imported this upcoming agenda event from their calendar. It currently has not been refined yet.
Generate an intelligent, reverse-engineered timeline of backward preparation milestones (T-Minus buffer tasks).

Event Title: "${event.title}"
Event Date: ${event.eventDate || "Upcoming"} (Time: ${event.eventTime || "19:00"})
Event Location: "${event.location || "None specified"}"
Event Category: "${event.category || "custom"}"
Existing Context: "${JSON.stringify(event.context || {})}"${event.endDate ? `\nTrip ends: ${event.endDate}` : ''}${Array.isArray(event.context?.calendarEntries) && event.context.calendarEntries.length
  ? `\nAlready in the user's calendar for this trip (each one is booked or arranged - do not plan tasks to book or arrange these again; plan what they still need, like documents, gear or getting between them):\n${event.context.calendarEntries.map((line: string) => `- ${line}`).join('\n')}`
  : ''}

${SHARED_PLANNING_RULES}

${buildPreparationLevelAddendum(prepAssessment.level)}

### Schema notes for the rules above:
This is a fresh, one-shot generation for a single event with no prior plan - there is no "existingMilestones"/"existingTargetEvent" here, so the REFINEMENT MEANS MERGE and DECIDE THE TARGET EVENT rules above don't apply. This schema is also flatter than the one those rules describe: each milestone is a single object with "title"/"description" and no separate "deliverables" array and no "slot_key" - fold whatever a deliverable would have said into the milestone's own description instead of inventing extra fields.

CRITICAL LOGISTICAL & TIMING REQUIREMENTS:
1. Deconstruct the event into as many realistic, concrete, chronological preparation milestones as it genuinely needs (no fixed maximum), leading backward from the event date. Include safety- or compliance-critical phases before AND after the event (e.g. a post-dive no-fly window, visa or medical clearance).
2. Calculate exact lead times based on real-world logistical constraints - in addition to the general timing knowledge above, use these concrete anchors where relevant:
   - Private entertainment booths (karaoke, escape rooms, bowling, VR): T-3w or T-4w for weekend peak bookings.
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

${AI_SCOPE_RULE}

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

    const parsed = capPlannerOutput(JSON.parse(result.text.trim()));
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
      const taggedMilestones = refinedMilestones.map((m) => ({ ...m, tier: prepAssessment.level }));

      res.json({
        event: {
          ...event,
          needsRefinement: false,
          refinedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: taggedMilestones,
          preparationLevel: prepAssessment.level,
          preparationLevelReasons: prepAssessment.reasons,
          preparationLevelSetBy: "aot",
        },
        usedAi: true,
      });
      return;
    }

    res.json({ event: localRefinedEvent, usedAi: false });
  } catch (err: any) {
    console.warn("AI deep refinement notice, using local engine:", err?.message);
    const { event }: { event: CalendarEvent } = req.body;
    if (event) {
      const fallbackAssessment = getActiveAssessor().assessPreparationLevel({
        category: event.category,
        title: event.title,
        location: event.location,
        context: event.context,
      });
      const localMilestones = generateDeterministicMilestones({
        eventId: event.id,
        title: event.title,
        eventDate: event.eventDate,
        eventTime: event.eventTime,
        location: event.location,
        category: event.category,
        context: event.context,
      }).map((m) => ({ ...m, tier: fallbackAssessment.level }));
      res.json({
        event: {
          ...event,
          needsRefinement: false,
          refinedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          milestones: localMilestones,
          preparationLevel: fallbackAssessment.level,
          preparationLevelReasons: fallbackAssessment.reasons,
          preparationLevelSetBy: "aot",
        },
        usedAi: false,
      });
    } else {
      res.status(500).json({ error: "Failed to refine event" });
    }
  }
});

// Endpoint to AI-calibrate T-Minus offsets for spreadsheet checklists lacking explicit lead times
app.post("/api/presets/calibrate-offsets", async (req: Request, res: Response): Promise<void> => {
  try {
    const aiUser = await guardAiRequest(req, res, { presetTitle: 200, tasks: 60_000 });
    if (!aiUser) return;
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

    if (!process.env.GEMINI_API_KEY || !aiUser.aiEnabled) {
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

Ensure every input task is preserved and calibrated. ${AI_SCOPE_RULE}

Output ONLY the raw JSON object.`;

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
      if (parsedResult && Array.isArray(parsedResult.calibratedTasks)) {
        parsedResult.calibratedTasks = capPlannerOutput({ milestones: parsedResult.calibratedTasks }).milestones;
      }
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

// AI smart-import: reads every sheet of an uploaded workbook (dashboards,
// weekly schedules, RACI matrices, multiple tabs) and extracts a clean
// milestone runway directly, without requiring manual column mapping.
app.post("/api/presets/smart-import", async (req: Request, res: Response): Promise<void> => {
  try {
    const aiUser = await guardAiRequest(req, res, { fileName: 300, sheets: 200_000 });
    if (!aiUser) return;
    const {
      fileName = "Uploaded workbook",
      sheets = [],
    }: {
      fileName?: string;
      sheets: Array<{ name: string; rows: any[][] }>;
    } = req.body;

    if (!Array.isArray(sheets) || sheets.length === 0) {
      res.status(400).json({ error: "At least one sheet with rows is required for smart import" });
      return;
    }

    if (!process.env.GEMINI_API_KEY || !aiUser.aiEnabled) {
      res.json({
        extractedBy: "unavailable",
        error: "AI smart import requires Gemini to be configured on this environment. Use manual column mapping instead.",
      });
      return;
    }

    const MAX_ROWS_TOTAL = 400;
    let rowBudget = MAX_ROWS_TOTAL;
    const sheetsText = sheets
      .map((sheet) => {
        if (rowBudget <= 0) return "";
        const rows = sheet.rows.slice(0, rowBudget);
        rowBudget -= rows.length;
        const rowsText = rows
          .map((row, idx) => `${idx + 1}. ${row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | ")}`)
          .join("\n");
        return `--- SHEET: "${sheet.name}" ---\n${rowsText}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const prompt = `You are an elite program manager who specializes in reading messy, real-world spreadsheets — dashboards, weekly execution schedules, RACI matrices, status trackers — spread across multiple tabs, and extracting the real underlying project plan even when headers are buried mid-sheet, columns are decorative, or numbers are missing.

A user uploaded a workbook named "${fileName}" while trying to import it into a T-Minus milestone planning tool. Below is the raw content of every sheet, row by row (blank rows already stripped).

${sheetsText}

YOUR OBJECTIVE:
1. Infer what this file is actually planning (e.g. a product launch, a marketing campaign, an onboarding process, a sales cycle) and infer a short, specific preset title for it.
2. Infer the real-world target/anchor date this plan counts down to, if one is stated or implied anywhere in the sheets (e.g. "Launch Day: Thursday", a specific calendar date). If genuinely absent, use null.
3. Distill the file into 6 to 14 MEANINGFUL milestones — not a copy of every execution row. Collapse granular hour-by-hour tasks into the gates, deliverables, cross-functional syncs and dated decisions that actually matter for a reusable planning template. Prefer named gates, sign-offs, freezes, launches and reviews over routine busywork rows.
4. Calculate each milestone's t_minus_days as an integer offset relative to the inferred target/anchor date (positive = before, 0 = on the day, negative = after, e.g. -7 for "Day +7").
5. Assign a short, human tag per milestone (department/function, e.g. "Marketing", "Tech", "PR", "Leadership") and a crisp one-sentence description grounded in what the sheet actually says — never generic filler.
6. Propose 2 to 4 ADDITIONAL milestones that are NOT already present in the file but would meaningfully round out this specific plan (e.g. an internal stakeholder recap, a post-mortem, a legal review) — for each, include a short "rationale" written as a helpful suggestion to the user explaining why it's commonly missing and useful for this kind of plan. A suggestion must never contradict anything the sheets actually state - if a row or note explicitly says something is already handled, skipped, out of scope, or being done a specific way (e.g. "PR handled externally", "no legal review needed for this market", "using vendor X, not building in-house"), do not suggest a milestone that assumes otherwise.

Return a JSON object strictly following this structure:
{
  "presetTitle": "Specific, short preset name inferred from the file",
  "tags": ["2 to 4 short tags"],
  "targetDateGuess": "YYYY-MM-DD" or null,
  "milestones": [
    {
      "task": "Clear milestone title",
      "t_minus_days": 14,
      "tag": "Short department/function tag",
      "description": "Crisp 1-sentence description grounded in the source data",
      "kind": "milestone" or "deliverable",
      "scope": "macro" or "micro"
    }
  ],
  "suggestedAdditions": [
    {
      "task": "Milestone title not present in the source file",
      "t_minus_days": -1,
      "tag": "Short department/function tag",
      "description": "Crisp 1-sentence description of the task itself",
      "kind": "milestone" or "deliverable",
      "scope": "macro" or "micro",
      "rationale": "1-sentence explanation of why this is a useful addition for this plan"
    }
  ]
}

${AI_SCOPE_RULE}

Output ONLY the raw JSON object.`;

    const result = await generateContentFast(
      () => ({
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.15,
        }
      }),
      DEFAULT_FAST_MODELS,
      15000
    );

    const cleanJson = result.text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = capPlannerOutput(JSON.parse(cleanJson));

    if (!parsed || !Array.isArray(parsed.milestones) || parsed.milestones.length === 0) {
      throw new Error("Model returned no extractable milestones");
    }

    res.json({
      presetTitle: capText(parsed.presetTitle, 120) || fileName.replace(/\.[^/.]+$/, ""),
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : ["Custom"],
      targetDateGuess: parsed.targetDateGuess || null,
      milestones: parsed.milestones.sort((a: any, b: any) => (b.t_minus_days || 0) - (a.t_minus_days || 0)),
      suggestedAdditions: Array.isArray(parsed.suggestedAdditions) ? capPlannerOutput({ milestones: parsed.suggestedAdditions.slice(0, 10) }).milestones : [],
      extractedBy: result.usedModel,
    });
  } catch (error: any) {
    console.error("Error in /api/presets/smart-import:", error);
    res.status(500).json({ error: "Failed to extract milestones from this file. Try manual column mapping instead." });
  }
});

// Architecture reset Phase C - a small, fast pre-check the client calls
// before the first full generation: does this message need one clarifying
// question first? Kept as its own endpoint (not folded into /api/agent/
// process) since it never touches an event, never calls the deterministic
// fallback, and always resolves quickly either way (Gemini not configured
// or the call itself failing both just mean "no clarification needed" -
// this never blocks event creation).
app.post("/api/agent/clarify", async (req: Request, res: Response): Promise<void> => {
  try {
    const aiUser = await guardAiRequest(req, res, { message: AI_LIMITS.messageChars }, { allowTrial: true });
    if (!aiUser) return;
    const { message, currentReferenceDate, userProfile } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: "Message is required." });
      return;
    }
    const refDate = currentReferenceDate ? new Date(currentReferenceDate) : new Date();
    const refDateISO = isNaN(refDate.getTime()) ? new Date().toISOString() : refDate.toISOString();
    const result = await askRefinementQuestions({ message, currentReferenceDate: refDateISO, userProfile: sanitizePlanningProfile(userProfile), useAi: aiUser.aiEnabled });
    res.json(result.offTopic ? { ...result, message: OFF_TOPIC_REPLY } : result);
  } catch (error: any) {
    console.error("Error in /api/agent/clarify:", error);
    res.json({ needsClarification: false, questions: [] });
  }
});

// Main intelligent agent processing endpoint
app.post("/api/agent/process", async (req: Request, res: Response): Promise<void> => {
  try {
    const aiUser = await guardAiRequest(
      req,
      res,
      {
        message: AI_LIMITS.messageChars,
        conversationBrief: AI_LIMITS.briefChars,
        activeEvents: 400_000,
      },
      { allowTrial: true }
    );
    if (!aiUser) return;
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
      userProfile: rawUserProfile,
      conversationBrief,
      lockToTargetEvent,
      isLevelExpansion
    } = payload;
    const userProfile = sanitizePlanningProfile(rawUserProfile);

    const refDate = currentReferenceDate ? new Date(currentReferenceDate) : new Date("2026-09-01T03:20:00-07:00");
    const refDateISO = isNaN(refDate.getTime()) ? new Date().toISOString() : refDate.toISOString();
    const refDateStr = refDateISO.substring(0, 10);

    // The app never sends voice memos; audio in a request is ignored
    // rather than transcribed for whoever sends it.
    const transcribedVoiceText: string | undefined = undefined;
    void audioBase64;
    void mimeType;

    if (!message && !intakeAnswer && !batchAnswers) {
      res.status(400).json({ error: "Message or intake answer is required." });
      return;
    }

    // Existing event lookup if targeted
    const existingEvent = targetEventId ? activeEvents.find(e => e.id === targetEventId) : undefined;

    // An answered intake question or a structured variable retune on an
    // existing event used to always skip Gemini entirely ("ARCHITECTURAL
    // SPEED BOOST" - resolve instantly via the deterministic engine alone),
    // even when GEMINI_API_KEY is configured. That meant a genuinely
    // consequential answer (e.g. switching a trip's transport mode from
    // flight to train) never got the same context-aware reconsideration a
    // plain-text correction already gets - it just reran the category's
    // fixed template. Now it takes the exact same Gemini-first,
    // deterministic-fallback path as every other message below.

    let result: ProcessAgentResponsePayload;

    if (process.env.GEMINI_API_KEY && aiUser.aiEnabled) {
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
          conversationBrief: typeof conversationBrief === 'string' ? conversationBrief.slice(0, 6000) : undefined,
          lockToTargetEvent: lockToTargetEvent === true,
          isLevelExpansion,
        });
        if (transcribedVoiceText) {
          result.transcribedText = transcribedVoiceText;
        }
        result.usedAi = true;
      } catch (geminiError: any) {
        if (geminiError instanceof OffTopicRequestError) {
          res.status(422).json({ ok: false, error: 'off_topic', message: OFF_TOPIC_REPLY });
          return;
        }
        console.warn(`Fast Gemini notice, seamlessly using deterministic rules engine: ${describeGeminiError(geminiError)}`);
        // Pure logging - does not affect the deterministic fallback below.
        await logQualityEvent({
          sourceChannel: 'web',
          signalType: 'gemini_fallback',
          severity: 'medium',
          errorDetail: describeGeminiError(geminiError),
          rawUserMessage: message,
        });
        result = processWithDeterministicRules({
          message,
          refDateStr,
          refDateISO,
          existingEvent,
          intakeAnswer,
          batchAnswers,
          transcribedVoiceText,
          userProfile,
          isLevelExpansion,
        });
        result.usedAi = false;
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
        userProfile,
        isLevelExpansion,
      });
      result.usedAi = false;
    }

    res.json(applyExtensiveRunUps(result, refDateISO));
  } catch (error: any) {
    console.error("Agent process handler error:", error);
    await logQualityEvent({
      sourceChannel: 'web',
      signalType: 'gemini_error',
      severity: 'high',
      errorDetail: error?.message || String(error),
    });
    res.status(500).json({ error: error.message || "Failed to process request" });
  }
});

app.post("/api/quality/report-client-error", async (req: Request, res: Response) => {
  if (!(await verifyRequestUser(req))) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  try {
    const { signalType, errorDetail, rawUserMessage, eventId } = req.body || {};
    const allowedSignalTypes: QualitySignalType[] = ['explicit_failure_reply', 'gemini_error'];
    const safeSignalType: QualitySignalType = allowedSignalTypes.includes(signalType) ? signalType : 'explicit_failure_reply';
    await logQualityEvent({
      sourceChannel: 'web',
      signalType: safeSignalType,
      severity: 'high',
      errorDetail: typeof errorDetail === 'string' ? errorDetail : undefined,
      rawUserMessage: typeof rawUserMessage === 'string' ? rawUserMessage : undefined,
      eventId: typeof eventId === 'string' && /^[0-9a-f-]{36}$/i.test(eventId) ? eventId : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    console.warn('report-client-error handler notice:', err);
    res.json({ ok: false });
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
// WhatsApp test tools (list/delete sessions, outreach, simulated messages):
// only in this local server, never deployed, and owner-only (CRON_SECRET),
// so someone who can reach a running dev server can't read or message chats.
app.use("/api/whatsapp", (req: Request, res: Response, next) => {
  const ownerSecret = process.env.CRON_SECRET?.trim();
  if (!ownerSecret || req.get("authorization") !== `Bearer ${ownerSecret}`) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
});

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
          text: `Hi ${userFirstName}! AheadOfTime spotted a new event on your calendar: *${eventTitle}* on *${formattedDate}*. To build your prep checklist (bookings, packing, gifts), what are the key details or extra plans for this?`,
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
// Twin of api/telegram/[...path].ts route=warm.
app.get("/api/telegram/warm", (req: Request, res: Response) => handleTelegramWarm(req, res));
app.get("/api/telegram/status", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);

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

  const inferredWebhookUrl = `${appOrigin(req)}/api/telegram/webhook`;

  // Reveals a real linked account's username/chatId - never resolve to a
  // client-supplied or default userId. See api/telegram/[...path].ts for
  // the matching Vercel-side fix.
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.json({
      ok: true,
      linked: false,
      status: "unlinked",
      telegram_linked: false,
      isLinked: false,
      session: null,
      isConfigured,
      hasToken: isConfigured,
      botInfo: botInfo?.ok ? botInfo.result : null,
      webhookInfo: null,
      inferredWebhookUrl,
    });
    return;
  }

  const pairStatus = await TelegramSessionStore.getPairingStatus(code, verified.email);

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

// 2b. Manual linking is gone: it linked the code to whichever Telegram chat
// was most recently active - any user's - so a click could attach an
// account to a stranger's chat. Linking only happens when the user sends
// the code to the bot (/start pair_...). Twin of api/telegram's 410.
app.post("/api/telegram/manual-link", (_req: Request, res: Response) => {
  res.status(410).json({ ok: false, error: "Send the code to the bot in Telegram to link your account." });
});

// 3. Register the webhook with Telegram: owner only (CRON_SECRET), and
// always this app's own URL with its secret - never a URL from the request.
app.post("/api/telegram/set-webhook", async (req: Request, res: Response) => {
  const ownerSecret = process.env.CRON_SECRET?.trim();
  if (!ownerSecret || req.get("authorization") !== `Bearer ${ownerSecret}`) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  try {
    res.json(await TelegramService.setWebhook(TelegramService.ownWebhookUrl(new URL(appOrigin(req)).host)));
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
    const verified = await verifyRequestUser(req);
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
    // Same identity leak class as /api/telegram/status above.
    const verified = await verifyRequestUser(req);
    if (!verified) {
      res.json({ ok: true, linked: false, status: "unlinked", telegram_linked: false, isLinked: false, session: null });
      return;
    }
    const code = (req.query.code as string) || (req.query.pairCode as string) || (req.query.token as string);
    const status = await TelegramSessionStore.getPairingStatus(code, verified.email);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to check pairing status" });
  }
});

app.delete("/api/telegram/pair-code", async (req: Request, res: Response) => {
  try {
    // Unlinking (by chatId or by claimed userId) disconnects someone's
    // Telegram account, so both require verified identity - a bare chatId
    // is not a secret a legitimate caller needs to prove ownership with,
    // it's just an ID, so trusting it alone let anyone disconnect an
    // arbitrary stranger's session.
    const verified = await verifyRequestUser(req);
    if (!verified) {
      res.status(401).json({ ok: false, error: "Sign in required to unlink Telegram." });
      return;
    }
    const session = await TelegramSessionStore.getLinkedSessionForWebUser(verified.email);
    if (session) {
      await TelegramSessionStore.unlinkSession(session.chatId);
    }
    res.json({ ok: true, message: "Unlinked successfully" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to unlink" });
  }
});

// 4. Send Refinement Prompt for an Event to Telegram (Multi-tenant: requires chatId)
app.post("/api/telegram/send-refine", async (req: Request, res: Response) => {
  try {
    const { event } = req.body || {};
    // Only to the signed-in user's own linked chat, never a chat id from the request.
    const verified = await verifyRequestUser(req);
    if (!verified) {
      res.status(401).json({ ok: false, error: "Sign in required." });
      return;
    }
    const session = await TelegramSessionStore.getLinkedSessionForWebUser(verified.email);
    const targetChatId = session?.isLinked ? session.chatId : null;
    if (!targetChatId) {
      res.status(400).json({
        ok: false,
        error: "Connect Telegram first: click 'Connect Telegram' and tap Start in the bot.",
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

    const appBaseUrl = appOrigin(req);

    const result = await TelegramService.sendRefinementPrompt(targetChatId, event, appBaseUrl);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Failed to dispatch telegram prompt" });
  }
});

// 5. Get Events created via Telegram (User/Account Scoped)
// Now the multi-device event sync endpoint (list/incremental pull, push,
// restore) - one implementation shared with the Vercel function, see
// server/eventsApi.ts.
app.all("/api/telegram/events", async (req: Request, res: Response) => {
  // Identity is verified, never trusted from a query param - a
  // client-supplied userId was exactly how the earlier cross-user event
  // exposure bug worked.
  const verified = await verifyRequestUser(req);
  const result = await handleEventsApi({
    method: req.method,
    query: req.query as Record<string, any>,
    body: req.body,
    email: verified?.email ?? null,
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(result.status).json(result.json);
});

// Local-dev twin of the /api/telegram/profile route in api/telegram/[...path].ts.
app.all("/api/telegram/profile", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  const userId = verified ? await findOrCreateUserByEmail(verified.email) : null;
  const result = await handleProfileApi({ method: req.method, body: req.body, userId });
  res.setHeader("Cache-Control", "no-store");
  res.status(result.status).json(result.json);
});

app.get("/api/telegram/event/:id", async (req: Request, res: Response) => {
  // A signed, single-event deep-link token (minted by the bot itself)
  // proves the caller legitimately just interacted with this exact event
  // via Telegram - lets that user view it without separately
  // re-authenticating with Google. See server/deepLinkToken.ts.
  if (verifyEventDeepLink(req.params.id, req.query.dlt as string, req.query.dlte as string)) {
    const event = await TelegramSessionStore.getEvent(req.params.id);
    if (event) {
      const verified = await verifyRequestUser(req).catch(() => null);
      const ownedByCaller = verified
        ? (await TelegramSessionStore.getAllEvents(verified.email)).some((e) => e.id === req.params.id)
        : false;
      res.json({ ok: true, event, ownedByCaller });
    } else {
      res.status(404).json({ ok: false, error: "Event not found" });
    }
    return;
  }

  // Scope through the same ownership-filtered query as /api/telegram/events
  // (this route previously called getEvent() directly with no ownership
  // check at all - the same class of bug already fixed in api/telegram/*).
  const verified = await verifyRequestUser(req);
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

app.delete("/api/telegram/event/:id", async (req: Request, res: Response) => {
  // Deletion is destructive and ownership-scoped - unlike the GET route
  // above, a deep-link token is not enough to permanently remove an event.
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const deleted = await TelegramSessionStore.deleteEvent(req.params.id, verified.email);
  res.json({ ok: true, deleted });
});

// Local-dev twin of api/feedback/index.ts's anonymous calendar poll.
app.post("/api/feedback/calendar-poll", async (req: Request, res: Response) => {
  const parsed = parseCalendarVote(req.body);
  if ("error" in parsed) {
    res.status(400).json({ ok: false, error: parsed.error });
    return;
  }
  try {
    const verified = await verifyRequestUser(req);
    const userId = verified ? await findOrCreateUserByEmail(verified.email) : null;
    await recordCalendarVote(parsed.vote, userId, pollClientHash(req));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("calendar poll error:", err);
    res.status(500).json({ ok: false, error: "Could not save your answer." });
  }
});

app.get("/api/feedback/admin-list", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  if (!isAdminEmail(verified.email)) {
    res.status(403).json({ ok: false, error: "Not authorized" });
    return;
  }
  try {
    const rows = await listRecentFeedback(200);
    const calendarPoll = await summarizeCalendarVotes().catch((err) => {
      console.error("calendar poll summary error:", err);
      return null;
    });
    res.json({ ok: true, rows, calendarPoll });
  } catch (err: any) {
    console.error("feedback admin-list error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to load feedback" });
  }
});

app.get("/api/feedback/eligibility", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  try {
    const userId = await findOrCreateUserByEmail(verified.email);
    const eligibility = await getFeedbackEligibility(userId);
    res.json({ ok: true, ...eligibility });
  } catch (err: any) {
    console.error("feedback eligibility error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to check eligibility" });
  }
});

app.post("/api/feedback/submit", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  try {
    const { responseType, score, feedbackText } = req.body || {};
    if (responseType !== "csat" && responseType !== "general_feedback") {
      res.status(400).json({ ok: false, error: "Invalid responseType" });
      return;
    }
    const userId = await findOrCreateUserByEmail(verified.email);
    const result = await submitFeedback({
      userId,
      responseType,
      score: typeof score === "number" ? score : undefined,
      feedbackText: typeof feedbackText === "string" ? feedbackText.trim().slice(0, 2000) : undefined,
      sourceChannel: "web",
    });
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("feedback submit error:", err);
    res.status(400).json({ ok: false, error: err?.message || "Failed to submit feedback" });
  }
});

// -----------------------------------------------------------------------------
// Auto Sync & Notify - server-side Google OAuth (authorization-code flow,
// distinct from the implicit token-client flow src/services/googleAuth.ts
// uses everywhere else) for background sync with no browser open.
// -----------------------------------------------------------------------------

const BACKGROUND_SYNC_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks",
].join(" ");

function getOAuthRedirectUri(req: Request): string {
  return `${appOrigin(req)}/api/auth/google/callback`;
}

function getAppOrigin(req: Request): string {
  return appOrigin(req);
}

// The app's own login session (local-dev twin of the Vercel route).
app.all("/api/auth/session", (req: Request, res: Response) => handleSessionApi(req, res));
// Twin of api/auth/google/index.ts action=ai-settings.
app.all("/api/auth/ai-settings", (req: Request, res: Response) => handleAiSettings(req, res));
// Twin of api/auth/google/index.ts action=notify-prefs.
app.all("/api/auth/notify-prefs", (req: Request, res: Response) => handleNotifyPrefs(req, res));
// Twin of api/auth/google/index.ts action=email-link.
app.all("/api/auth/email-link", (req: Request, res: Response) => handleEmailLink(req, res));
// Twins of api/auth/google/index.ts action=ics-feed / feed-done / calendar-feed.
app.get("/api/calendar/feed/:token", (req: Request, res: Response) => handleCalendarFeed(req, res, String(req.params.token)));
app.all("/api/calendar/done", (req: Request, res: Response) => handleCalendarDone(req, res));
app.all("/api/calendar/plan", (req: Request, res: Response) => handleCalendarPlan(req, res));
app.all("/api/auth/calendar-feed", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  await handleCalendarFeedSettings(req, res, await findOrCreateUserByEmail(verified.email));
});
// Twin of api/auth/google/index.ts action=delete-account.
app.all("/api/auth/account", (req: Request, res: Response) => handleAccountDeletion(req, res));

app.get("/api/auth/google/authorize", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const clientId = getGoogleClientId();
  if (!clientId) {
    res.status(500).json({ ok: false, error: "Google client id is not configured." });
    return;
  }
  const signed = signOAuthState(verified.email);
  if (!signed) {
    res.status(500).json({ ok: false, error: "NOTIFY_LINK_SECRET is not configured." });
    return;
  }
  await findOrCreateUserByEmail(verified.email);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getOAuthRedirectUri(req),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: BACKGROUND_SYNC_SCOPES,
    state: signed.state,
  });
  res.json({ ok: true, authorizeUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query;
  const appOrigin = getAppOrigin(req);

  if (oauthError) {
    res.redirect(302, `${appOrigin}/settings/credentials?background_sync=declined`);
    return;
  }

  const verifiedState = verifyOAuthState(typeof state === "string" ? state : undefined);
  if (!verifiedState || typeof code !== "string") {
    res.redirect(302, `${appOrigin}/settings/credentials?background_sync=error`);
    return;
  }

  try {
    const userId = await findOrCreateUserByEmail(verifiedState.email);
    const exchanged = await exchangeAuthorizationCode(code, getOAuthRedirectUri(req), verifiedState.email);
    if (!exchanged) {
      res.redirect(302, `${appOrigin}/settings/credentials?background_sync=no_refresh_token`);
      return;
    }
    await storeRefreshToken(userId, exchanged.refreshToken, exchanged.scope);
    const result = grantIncludesTasks(exchanged.scope) ? "connected" : "partial";
    res.redirect(302, `${appOrigin}/settings/credentials?background_sync=${result}`);
  } catch (err: any) {
    if (err?.message === "google_account_mismatch") {
      res.redirect(302, `${appOrigin}/settings/credentials?background_sync=wrong_account`);
      return;
    }
    console.error("Google OAuth callback error:", err);
    res.redirect(302, `${appOrigin}/settings/credentials?background_sync=error`);
  }
});

app.get("/api/auth/google/status", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  const linked = await hasBackgroundSyncLinked(userId);
  const telegramSession = await TelegramSessionStore.getLinkedSessionForWebUser(verified.email);
  res.json({
    ok: true,
    linked,
    configured: isBackgroundSyncConfigured(),
    telegramLinked: Boolean(telegramSession?.chatId),
    emailConfigured: isEmailConfigured(),
    email: verified.email,
    tasksGranted: linked ? await backgroundSyncHasTasksScope(userId) : null,
    prefs: linked ? (await getNotifyPrefs(userId)).prefs : null,
    prefsSaved: linked ? (await getNotifyPrefs(userId)).saved : false,
  });
});

app.post("/api/auth/google/status", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  if (!req.body?.sendTest) {
    res.status(400).json({ ok: false, error: "Unknown request." });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  if (!(await hasBackgroundSyncLinked(userId))) {
    res.status(409).json({ ok: false, error: "Turn on Background Sync first." });
    return;
  }
  const result = await sendTestUpdate({ userId, email: verified.email, appUrl: appOrigin(req) });
  res.json({ ok: result.ok, ...result });
});

app.put("/api/auth/google/status", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  if (!(await hasBackgroundSyncLinked(userId))) {
    res.status(409).json({ ok: false, error: "Turn on Background Sync first." });
    return;
  }
  const current = await getNotifyPrefs(userId);
  const next = mergeNotifyPrefs(req.body?.prefs, current.prefs);
  if (!next) {
    res.status(400).json({ ok: false, error: "Those preferences are not valid." });
    return;
  }
  await setNotifyPrefs(userId, next);
  res.json({ ok: true, prefs: next });
});

// Push to Cal / Scan agenda through the Background Sync grant (twins of
// api/auth/google/index.ts's action=calendar-push / calendar-events).
app.all(["/api/auth/google/calendar-push", "/api/auth/google/calendar-events", "/api/auth/google/calendar-delete"], async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  const result = req.path.endsWith("calendar-push")
    ? await handleCalendarPush(userId, req.method, req.body)
    : req.path.endsWith("calendar-delete")
      ? await handleCalendarDelete(userId, req.method, req.body)
      : await handleCalendarEvents(userId, req.method, req.query);
  res.status(result.status).json(result.body);
});

// In-app fallback notice for new calendar events the daily scan found that no
// Telegram/email message covered (twin of api/auth/google/index.ts's
// action=findings).
app.get("/api/auth/google/findings", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  res.json({ ok: true, findings: await listPendingFindings(userId, new Date().toISOString()) });
});

app.post("/api/auth/google/findings", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  await dismissAllFindings(userId);
  res.json({ ok: true });
});

app.delete("/api/auth/google/status", async (req: Request, res: Response) => {
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  const userId = await findOrCreateUserByEmail(verified.email);
  const googleRevoked = await unlinkBackgroundSync(userId);
  res.json({ ok: true, linked: false, googleRevoked });
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
      // App routes get the empty shell (app.html, written by
      // scripts/prerender.mjs); index.html holds the rendered home page.
      const shell = path.join(distPath, "app.html");
      res.sendFile(fs.existsSync(shell) ? shell : path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`T-Minus Calendar Intelligence Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
