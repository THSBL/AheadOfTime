import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { 
  CalendarEvent, 
  OperationalMode, 
  ProcessAgentInputPayload, 
  ProcessAgentResponsePayload,
  TMinusMilestone,
  IntakeQuestion
} from "./src/types";
import { generateHeuristicMilestones, calculateOffsetDate } from "./src/utils/tminusRules";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Lazy initialize Gemini SDK
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Multi-model fast execution with low thinking latency and strict timeout
async function generateContentFast(
  requestConfig: (modelName: string) => any,
  modelsToTry: string[] = ["gemini-3.7-flash", "gemini-3.1-flash-lite"],
  timeoutMs: number = 3200
): Promise<{ text: string; usedModel: string }> {
  const ai = getGeminiClient();
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const config = requestConfig(modelName);
      
      // Enforce fast thinking level for minimum latency
      if (!config.config) config.config = {};
      if (!config.config.thinkingConfig) {
        config.config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }

      // Race with timeout so API never hangs user
      const apiPromise = ai.models.generateContent({
        model: modelName,
        ...config,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Model ${modelName} timeout after ${timeoutMs}ms`)), timeoutMs)
      );

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const text = response.text || "";
      if (text) {
        return { text, usedModel: modelName };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Fast model execution notice (${modelName}):`, err?.message || err);
      // Try next fast model immediately without sleeping
      continue;
    }
  }

  throw lastError || new Error("All fast Gemini models timed out or were unavailable.");
}

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

    const transcribeModels = ["gemini-3.5-transcribe", "gemini-3.7-flash"];
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
      3500
    );

    const transcribedText = result.text?.trim() || "";
    res.json({ transcribedText });
  } catch (error: any) {
    console.warn("Audio transcription notice:", error?.message || "Unavailable");
    res.json({ transcribedText: "Voice memo captured successfully. (Transcription fallback applied)." });
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
      batchAnswers
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
        const transcribeModels = ["gemini-3.5-transcribe", "gemini-3.7-flash"];
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
        transcribedVoiceText
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
          transcribedVoiceText
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
        transcribedVoiceText
      });
    }

    res.json(result);
  } catch (error: any) {
    console.error("Agent process handler error:", error);
    res.status(500).json({ error: error.message || "Failed to process request" });
  }
});

// Helper function to reliably parse preset tags and user requirements from message
function extractContextFromMessage(message: string, existingContext: any = {}) {
  const context = { ...(existingContext || {}) };
  if (!message) return context;

  // Extract all [key: value] brackets
  const bracketRegex = /\[([a-zA-Z0-9_-]+):\s*([^\]]+)\]/g;
  let match;
  while ((match = bracketRegex.exec(message)) !== null) {
    const key = match[1].trim();
    const val = match[2].trim();

    if (key === 'customItems') {
      const itemsList = val.split(/[;,]/).map(s => s.trim()).filter(Boolean);
      const existing = Array.isArray(context.customItems) ? context.customItems : [];
      context.customItems = Array.from(new Set([...existing, ...itemsList]));
    } else if (key === 'neededItems' || key === 'items' || key === 'vendors') {
      const itemsList = val.split(',').map(s => s.trim()).filter(Boolean);
      const existingItems = Array.isArray(context.neededItems)
        ? context.neededItems
        : (typeof context.neededItems === 'string' ? context.neededItems.split(',').map(s => s.trim()).filter(Boolean) : []);
      
      const combined = Array.from(new Set([...existingItems, ...itemsList]));
      context.neededItems = combined;
    } else if (key === 'costume' || key === 'isThemed') {
      context.isThemed = val === 'true' || val === 'themed' || val === 'yes';
    } else if (key === 'gift' || key === 'giftType') {
      context.giftType = val;
    } else if (key === 'transport' || key === 'transportType') {
      context.transportType = val;
    } else if (key === 'food' || key === 'foodPlan' || key === 'foodOrCake' || key === 'cake' || key === 'cakeStrategy') {
      context.foodPlan = val;
      context.cakeStrategy = val;
    } else if (key === 'note' || key === 'customNote') {
      context.customNote = val;
    } else {
      context[key] = val;
    }
  }

  // Also check if raw message text explicitly mentions speech or toast
  const lower = message.toLowerCase();
  if (lower.includes('speech') || lower.includes('toast') || lower.includes('speech notes')) {
    const existing = Array.isArray(context.neededItems) ? context.neededItems : [];
    if (!existing.some((i: string) => i.toLowerCase().includes('speech') || i.toLowerCase().includes('toast'))) {
      context.neededItems = [...existing, 'Speech'];
    }
  }

  return context;
}

// Streamlined, high-speed Gemini NLP extraction integration
async function processWithGemini(params: {
  message: string;
  currentReferenceDate: string;
  refDateStr: string;
  existingEvent?: CalendarEvent;
  intakeAnswer?: { questionId: string; parameterKey: string; answerValue: string };
  batchAnswers?: { parameterKey: string; answerValue: string }[];
  activeEvents: CalendarEvent[];
}): Promise<ProcessAgentResponsePayload> {
  const systemInstruction = `You are a Fast T-Minus Calendar Intelligence Agent.
Parse the user's natural language event into structured metadata.
System Reference Date: ${params.currentReferenceDate} (${params.refDateStr}). Always calculate relative dates ("next Friday", "in 2 weeks", "Oct 15") against this reference date!

OUTPUT MODES:
- "RESOLVE_MILESTONES": If full parameters or bracketed preset options [gift: ...], [neededItems: ...], [transport: ...], [food: ...] are provided.
- "CREATE_AND_INTAKE": If the event needs key prep details. Provide 1-2 multiple-choice intake questions in intakeQuestions. Do not prefix options with emojis unless it represents a '🚫 None / No' choice.
- "RESEARCH_REQUIRED": If the event date/tickets are unannounced.

Focus and Addition format:
FOCUS: <1 clear sentence stating event created or timeline scheduled>
ADDITION: <1-2 questions or confirmation>`;

  const userPrompt = JSON.stringify({
    userInput: params.message,
    existingTargetEvent: params.existingEvent ? {
      id: params.existingEvent.id,
      title: params.existingEvent.title,
      eventDate: params.existingEvent.eventDate,
      category: params.existingEvent.category,
      context: params.existingEvent.context,
    } : null,
    referenceDate: params.refDateStr,
  });

  // High-speed compact schema (omits redundant milestone array tokens since server engine synthesizes them in <1ms)
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      mode: {
        type: Type.STRING,
        description: "CREATE_AND_INTAKE, RESOLVE_MILESTONES, or RESEARCH_REQUIRED",
      },
      focus: {
        type: Type.STRING,
        description: "Statement starting with 'I created...' or 'I scheduled...'",
      },
      addition: {
        type: Type.STRING,
        description: "Clarifying question or parameter note",
      },
      eventTitle: {
        type: Type.STRING,
        description: "Title of the event (e.g. Maya's 30th Birthday Party)",
      },
      category: {
        type: Type.STRING,
        description: "birthday_party | hosting_visitors | festival_concert | travel_trip | dinner_social | custom",
      },
      eventDate: {
        type: Type.STRING,
        description: "ISO Date YYYY-MM-DD",
      },
      eventTime: {
        type: Type.STRING,
        description: "HH:mm format (e.g. '19:00')",
      },
      location: {
        type: Type.STRING,
      },
      context: {
        type: Type.OBJECT,
        properties: {
          giftType: { type: Type.STRING, description: "group | solo | none" },
          isThemed: { type: Type.BOOLEAN },
          theme: { type: Type.STRING },
          isCamping: { type: Type.BOOLEAN },
          guestCount: { type: Type.INTEGER },
          diningPlan: { type: Type.STRING },
          transportType: { type: Type.STRING },
          foodPlan: { type: Type.STRING },
          cakeStrategy: { type: Type.STRING },
          customNote: { type: Type.STRING },
          neededItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
      },
      intakeQuestions: {
        type: Type.ARRAY,
        description: "1 or 2 targeted intake questions if mode is CREATE_AND_INTAKE",
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            parameterKey: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["label", "value"],
              },
            },
          },
          required: ["question", "parameterKey"],
        },
      },
      watchpoint: {
        type: Type.OBJECT,
        properties: {
          targetAnnouncementWindow: { type: Type.STRING },
          expectedAction: { type: Type.STRING },
          checkDate: { type: Type.STRING },
          historicalContext: { type: Type.STRING },
        },
      },
    },
    required: ["mode", "focus", "addition", "eventTitle", "category", "eventDate"],
  };

  const response = await generateContentFast(
    () => ({
      contents: [{ text: userPrompt }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    }),
    ["gemini-3.7-flash", "gemini-3.1-flash-lite"],
    3200
  );

  let rawText = response.text || "{}";
  if (rawText.startsWith("```json")) {
    rawText = rawText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (rawText.startsWith("```")) {
    rawText = rawText.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(rawText);
  } catch (parseErr) {
    console.warn("JSON parse notice for Gemini output, falling back gracefully:", parseErr);
    parsed = {};
  }

  // Pre-extract tags and bracket parameters directly from message
  const tagContext = extractContextFromMessage(params.message, params.existingEvent?.context);
  const hasExplicitBrackets = /\[[a-zA-Z0-9_-]+:\s*[^\]]+\]/.test(params.message);

  let mode: OperationalMode = (parsed.mode as OperationalMode) || "CREATE_AND_INTAKE";
  if (hasExplicitBrackets || (tagContext.neededItems && tagContext.neededItems.length > 0) || (tagContext.customItems && tagContext.customItems.length > 0) || tagContext.giftType || tagContext.transportType || tagContext.foodPlan) {
    mode = "RESOLVE_MILESTONES";
  }

  const eventId = params.existingEvent?.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const eventDate = parsed.eventDate || params.existingEvent?.eventDate || params.refDateStr;
  const eventTime = parsed.eventTime || params.existingEvent?.eventTime || "19:00";

  const focusText = parsed.focus || `I created "${parsed.eventTitle || 'Event'}" for ${eventDate}.`;
  const additionText = parsed.addition || `I have scheduled your prep milestones and lead times.`;
  const formattedReply = `FOCUS: ${focusText}\nADDITION: ${additionText}`;

  // Merge context: existing -> AI extracted -> directly extracted tag parameters
  const mergedContext = {
    ...(params.existingEvent?.context || {}),
    ...(parsed.context || {}),
    ...tagContext,
  };

  if (params.intakeAnswer) {
    mergedContext[params.intakeAnswer.parameterKey] = params.intakeAnswer.answerValue;
    if (params.intakeAnswer.parameterKey === "giftType") {
      mergedContext.giftType = params.intakeAnswer.answerValue as any;
    }
    if (params.intakeAnswer.parameterKey === "isThemed") {
      mergedContext.isThemed = params.intakeAnswer.answerValue === "true" || params.intakeAnswer.answerValue === "themed";
    }
  }
  
  if (params.batchAnswers) {
    params.batchAnswers.forEach(ans => {
      mergedContext[ans.parameterKey] = ans.answerValue;
      if (ans.parameterKey === "isThemed") {
        mergedContext.isThemed = ans.answerValue === "true" || ans.answerValue === "themed";
      }
    });
  }

  // Format intake questions with IDs
  let intakeQuestions: IntakeQuestion[] = [];
  if (mode === "CREATE_AND_INTAKE") {
    if (Array.isArray(parsed.intakeQuestions) && parsed.intakeQuestions.length > 0) {
      intakeQuestions = parsed.intakeQuestions.map((q: any, idx: number) => ({
        id: `q-${eventId}-${idx + 1}`,
        question: q.question,
        parameterKey: q.parameterKey,
        options: Array.isArray(q.options) ? q.options : [],
        answered: false,
      }));
    } else {
      // Fallback default questions if model skipped them
      if (parsed.category === 'birthday_party') {
        intakeQuestions = [
          {
            id: `q-${eventId}-1`,
            question: "What gift strategy are you planning?",
            parameterKey: "giftType",
            options: [
              { label: "Group Gift", value: "group", description: "T-30d money pool rally + T-10d purchase" },
              { label: "Solo Gift", value: "solo", description: "T-14d gift order + T-2d wrapping check" },
              { label: "No Gift", value: "none", description: "No gift milestones scheduled" }
            ],
            answered: false
          },
          {
            id: `q-${eventId}-2`,
            question: "Is there a costume or specific theme?",
            parameterKey: "isThemed",
            options: [
              { label: "Themed / Costume", value: "true", description: "T-14d costume & outfit sourcing" },
              { label: "Standard Attire", value: "false", description: "No costume prep needed" }
            ],
            answered: false
          }
        ];
      } else if (parsed.category === 'hosting_visitors') {
        intakeQuestions = [
          {
            id: `q-${eventId}-1`,
            question: "What dining plans do you want to organize?",
            parameterKey: "diningPlan",
            options: [
              { label: "Restaurant Reservations", value: "restaurants", description: "T-30d table bookings" },
              { label: "Home Cooking & Groceries", value: "home", description: "T-3d food & beverage stocking" },
              { label: "Casual / Spontaneous", value: "casual", description: "Basic drinks & snacks only" }
            ],
            answered: false
          }
        ];
      } else if (parsed.category === 'travel_trip') {
        intakeQuestions = [
          {
            id: `q-${eventId}-1`,
            question: "Do you need international passports or travel visas?",
            parameterKey: "passportVisa",
            options: [
              { label: "🛂 Passports / Visa Needed", value: "international", description: "T-60d renewal & visa check" },
              { label: "✅ Valid Passports Ready", value: "ready", description: "Standard packing timeline" },
              { label: "🚗 Domestic / No Passport", value: "domestic", description: "Skip passport check" }
            ],
            answered: false
          }
        ];
      } else if (parsed.category === 'project_deadline') {
        intakeQuestions = [
          {
            id: `q-${eventId}-1`,
            question: "What stakeholder review or client demo is required?",
            parameterKey: "stakeholderReview",
            options: [
              { label: "👥 Client / Stakeholder Sign-off", value: "client", description: "T-14d deliverable freeze & feedback" },
              { label: "💻 Internal Team Demo", value: "internal", description: "T-7d cross-functional review" },
              { label: "⚡ Solo / No External Review", value: "none", description: "Direct execution" }
            ],
            answered: false
          }
        ];
      }
    }
  }

  // High-performance deterministic milestone generation (computes all lead times in <1ms)
  let milestones: TMinusMilestone[] = [];
  if (mode === "RESOLVE_MILESTONES" || (mode !== "CREATE_AND_INTAKE" && mode !== "RESEARCH_REQUIRED")) {
    milestones = generateHeuristicMilestones(
      { category: parsed.category, context: mergedContext },
      eventId,
      eventDate,
      eventTime
    );
  }

  // Construct CalendarEvent object
  const calendarEvent: CalendarEvent = {
    id: eventId,
    title: parsed.eventTitle || params.existingEvent?.title || "New Event",
    category: parsed.category || params.existingEvent?.category || "custom",
    eventDate,
    eventTime,
    location: parsed.location || params.existingEvent?.location || undefined,
    status: mode === "CREATE_AND_INTAKE" ? "intake_pending" 
          : mode === "RESEARCH_REQUIRED" ? "research_watchpoint" 
          : "milestones_active",
    context: mergedContext,
    intakeQuestions: intakeQuestions.length > 0 ? intakeQuestions : undefined,
    milestones,
    watchpoint: parsed.watchpoint || undefined,
    rawInputSnippet: params.message,
    createdAt: params.existingEvent?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    mode,
    replyText: formattedReply,
    focusText,
    additionText,
    event: calendarEvent,
  };
}

// Fallback deterministic rule parser
function processWithDeterministicRules(params: {
  message: string;
  refDateStr: string;
  refDateISO: string;
  existingEvent?: CalendarEvent;
  intakeAnswer?: { questionId: string; parameterKey: string; answerValue: string };
  batchAnswers?: { parameterKey: string; answerValue: string }[];
  transcribedVoiceText?: string;
}): ProcessAgentResponsePayload {
  const msgLower = (params.message || "").toLowerCase();
  const eventId = params.existingEvent?.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  
  // Default target date: 3 weeks out from reference date
  const targetDateObj = new Date(params.refDateISO);
  targetDateObj.setDate(targetDateObj.getDate() + 21);
  const defaultEventDate = targetDateObj.toISOString().substring(0, 10);
  
  const eventDate = params.existingEvent?.eventDate || defaultEventDate;
  const eventTime = params.existingEvent?.eventTime || "19:00";
 
  let mode: OperationalMode = "CREATE_AND_INTAKE";
  let category: any = params.existingEvent?.category || "custom";
  let title = params.existingEvent?.title || "Upcoming Event";
  const context: any = extractContextFromMessage(params.message, params.existingEvent?.context);
 
  if (params.intakeAnswer) {
    context[params.intakeAnswer.parameterKey] = params.intakeAnswer.answerValue;
    mode = "RESOLVE_MILESTONES";
  }
 
  if (params.batchAnswers) {
    params.batchAnswers.forEach(ans => {
      context[ans.parameterKey] = ans.answerValue;
    });
    mode = "RESOLVE_MILESTONES";
  }

  const hasExplicitBrackets = /\[[a-zA-Z0-9_-]+:\s*[^\]]+\]/.test(params.message);
  if (hasExplicitBrackets || (context.neededItems && context.neededItems.length > 0) || (context.customItems && context.customItems.length > 0) || context.transportType || context.foodPlan) {
    mode = "RESOLVE_MILESTONES";
  }

  if (msgLower.includes("glastonbury") || msgLower.includes("ticket drop") || msgLower.includes("unconfirmed") || msgLower.includes("festival ticket")) {
    mode = "RESEARCH_REQUIRED";
    category = "festival_concert";
    title = msgLower.includes("glastonbury") ? "Glastonbury Festival 2027" : "Festival Ticket Release & Event";
  } else if (msgLower.includes("birthday") || msgLower.includes("bday") || msgLower.includes("party")) {
    category = "birthday_party";
    title = "Birthday Celebration";
    if (msgLower.includes("maya")) title = "Maya's 30th Birthday Party";
    if (msgLower.includes("group gift") || msgLower.includes("pot")) context.giftType = "group";
    else if (msgLower.includes("solo") || msgLower.includes("gift from me")) context.giftType = "solo";
    if (msgLower.includes("costume") || msgLower.includes("themed") || msgLower.includes("80s")) {
      context.isThemed = true;
      context.theme = "80s Neon / Costume";
    }
  } else if (msgLower.includes("visiting") || msgLower.includes("staying") || msgLower.includes("hosting") || msgLower.includes("in town")) {
    category = "hosting_visitors";
    title = "Friends Visiting Weekend";
  } else if (msgLower.includes("trip") || msgLower.includes("flight") || msgLower.includes("travel") || msgLower.includes("vacation") || msgLower.includes("holiday")) {
    category = "travel_trip";
    title = "Upcoming Trip / Vacation";
  } else if (msgLower.includes("project") || msgLower.includes("deadline") || msgLower.includes("launch") || msgLower.includes("milestone") || msgLower.includes("sprint")) {
    category = "project_deadline";
    title = "Project Launch / Deadline";
  } else if (msgLower.includes("dinner") || msgLower.includes("supper")) {
    category = "dinner_social";
    title = "Dinner Gathering";
  }

  // If user provided complete details directly
  if (context.giftType && (category === "birthday_party" || category === "hosting_visitors")) {
    mode = "RESOLVE_MILESTONES";
  }

  let focusText = "";
  let additionText = "";
  let intakeQuestions: IntakeQuestion[] = [];
  let milestones: TMinusMilestone[] = [];
  let watchpoint: any = undefined;

  if (mode === "RESEARCH_REQUIRED") {
    watchpoint = {
      targetAnnouncementWindow: "Late October 2026",
      expectedAction: "Ticket sale & coach package announcement monitor",
      checkDate: "2026-10-15",
      historicalContext: "Glastonbury festival tickets historically go on sale in late October / early November.",
    };
    focusText = `I created "${title}" and established a watchpoint for Late October.`;
    additionText = `I will alert you once ticket dates are released. Select your camping/travel parameters below.`;
  } else if (mode === "CREATE_AND_INTAKE") {
    if (category === "birthday_party") {
      intakeQuestions = [
        {
          id: `q-${eventId}-1`,
          question: "How are you handling the gift?",
          parameterKey: "giftType",
          options: [
            { label: "Group Gift", value: "group", description: "T-30d pot setup, T-10d purchase" },
            { label: "Solo Gift", value: "solo", description: "T-14d order, T-2d wrap check" },
            { label: "🚫 No Gift Needed", value: "none", description: "Skip gift milestones" }
          ]
        },
        {
          id: `q-${eventId}-2`,
          question: "Is there a specific theme or costume required?",
          parameterKey: "isThemed",
          options: [
            { label: "Themed / Costume Required", value: "true", description: "T-14d outfit sourcing" },
            { label: "Standard Casual / No Theme", value: "false", description: "Standard logistics only" }
          ]
        }
      ];
      focusText = `I created the event "${title}" on ${eventDate} at ${eventTime}.`;
      additionText = `Please select your gift strategy and costume requirements below.`;
    } else if (category === "hosting_visitors") {
      intakeQuestions = [
        {
          id: `q-${eventId}-1`,
          question: "Will you be dining out at reservations or cooking at home?",
          parameterKey: "diningPlan",
          options: [
            { label: "Table Reservations", value: "reservations", description: "T-30d table booking" },
            { label: "Home Cooked / Casual Dining", value: "home", description: "T-3d grocery stock" },
            { label: "🚫 Casual / Spontaneous", value: "casual", description: "Basic drinks only" }
          ]
        }
      ];
      focusText = `I created the event "${title}" on ${eventDate} at ${eventTime}.`;
      additionText = `Please select your dining plan and room prep requirements below.`;
    } else if (category === "travel_trip") {
      intakeQuestions = [
        {
          id: `q-${eventId}-1`,
          question: "Do you need international passports or travel visas?",
          parameterKey: "passportVisa",
          options: [
            { label: "Passport / Visa Renewal Needed", value: "international", description: "T-60d renewal & visa verification" },
            { label: "Valid Passports Ready", value: "ready", description: "Standard packing timeline" },
            { label: "🚫 Domestic / No Passport Needed", value: "domestic", description: "Skip passport check" }
          ]
        }
      ];
      focusText = `I created the event "${title}" on ${eventDate} at ${eventTime}.`;
      additionText = `Please confirm your travel requirements and bookings below.`;
    } else if (category === "project_deadline") {
      intakeQuestions = [
        {
          id: `q-${eventId}-1`,
          question: "What stakeholder review or client demo is required?",
          parameterKey: "stakeholderReview",
          options: [
            { label: "Client / Stakeholder Sign-off", value: "client", description: "T-14d deliverable freeze & review" },
            { label: "Internal Team Demo", value: "internal", description: "T-7d team walk-through" },
            { label: "🚫 Solo / No External Review", value: "none", description: "Direct execution" }
          ]
        }
      ];
      focusText = `I created the project deadline "${title}" for ${eventDate}.`;
      additionText = `Please select your review milestones and QA freeze preferences below.`;
    } else {
      focusText = `I created the event "${title}" on ${eventDate} at ${eventTime}.`;
      additionText = `Please select your preparation preferences below.`;
    }
  } else {
    // RESOLVE_MILESTONES
    milestones = generateHeuristicMilestones(
      { category, context },
      eventId,
      eventDate,
      eventTime
    );
    focusText = `I scheduled the preparation timeline for "${title}" on ${eventDate} at ${eventTime}.`;
    additionText = `Event details, chosen parameters, and milestones are summarized below.`;
  }

  const replyText = `FOCUS: ${focusText}\nADDITION: ${additionText}`;

  const calendarEvent: CalendarEvent = {
    id: eventId,
    title,
    category,
    eventDate,
    eventTime,
    status: mode === "CREATE_AND_INTAKE" ? "intake_pending" 
          : mode === "RESEARCH_REQUIRED" ? "research_watchpoint" 
          : "milestones_active",
    context,
    intakeQuestions: intakeQuestions.length > 0 ? intakeQuestions : undefined,
    milestones,
    watchpoint,
    rawInputSnippet: params.message,
    createdAt: params.existingEvent?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    mode,
    replyText,
    focusText,
    additionText,
    event: calendarEvent,
    transcribedText: params.transcribedVoiceText,
  };
}

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
