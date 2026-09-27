import type { CalendarEvent, ProcessAgentInputPayload, ProcessAgentResponsePayload } from '../../src/types.js';
import {
  generateContentFast,
  TRANSCRIBE_MODELS,
  processWithGemini,
  processWithDeterministicRules,
  askRefinementQuestions,
  describeGeminiError,
} from '../../server/agentProcessor.js';
import { sanitizePlanningProfile } from '../../src/utils/refinementQuestions.js';
import { logQualityEvent } from '../../server/qualityStore.js';
import { guardAiRequest, AI_LIMITS, OffTopicRequestError, OFF_TOPIC_REPLY } from '../../server/aiGuard.js';

// Consolidated Vercel function for /api/agent/transcribe (POST) and
// /api/agent/process (POST) - vercel.json rewrites both old paths here
// with an ?action= query param, so the frontend and server.ts's own
// Express routes need no changes. Vercel's Hobby plan caps a deployment
// at 12 serverless functions; merging same-domain endpoints like this is
// how this project stays under that cap as routes are added over time
// (see api/telegram/[...path].ts for the same pattern applied earlier).
// Logic below is ported verbatim from the two files this replaces, each
// kept as its own function - this touches nothing inside
// server/agentProcessor.ts itself, only how these two routes reach it.
//
// The Gemini extraction call (handleProcess) can race up to 2 models at
// 12s each (see processWithGemini's generateContentFast timeout) -
// default Vercel function duration is too short to safely cover that
// worst case, so raise it here for the whole file. (On plans capped
// below 30s, Vercel silently uses the plan's own ceiling - this is a
// no-op there, not an error.) handleTranscribe never needs this much,
// but sharing the file with handleProcess means it also gets this
// ceiling - harmless, since it's a maximum, not a fixed wait.
export const config = {
  maxDuration: 30,
};

// Voice transcription was never used by the app and answered anyone - an
// open Gemini transcription service. Gone; kept as a clear 410.
async function handleTranscribe(_req: any, res: any) {
  res.status(410).json({ error: 'Voice transcription is not available.' });
}

async function handleProcess(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/agent/process requires POST.' });
    return;
  }

  try {
    const aiUser = await guardAiRequest(req, res, {
      message: AI_LIMITS.messageChars,
      conversationBrief: AI_LIMITS.briefChars,
      activeEvents: 400_000,
    });
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
    const existingEvent: CalendarEvent | undefined = targetEventId ? activeEvents.find(e => e.id === targetEventId) : undefined;

    // An answered intake question or a structured variable retune on an
    // existing event used to always skip Gemini entirely ("ARCHITECTURAL
    // SPEED BOOST" - resolve instantly via the deterministic engine alone),
    // even when GEMINI_API_KEY is configured. Removed here to match
    // server.ts's Express route - this Vercel function is a separate copy
    // of the same route (see the file-level comment above) and had drifted
    // out of sync with that earlier fix. Now takes the exact same
    // Gemini-first, deterministic-fallback path as every other message.

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
        // Note: web-chat events use client-generated ids (evt-...), not
        // Postgres UUIDs, so eventId is intentionally omitted here.
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

    res.json(result);
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
}

// Architecture reset Phase C - see server.ts's own /api/agent/clarify
// route doc comment for why this is a separate, always-resolves-quickly
// pre-check rather than folded into handleProcess.
async function handleClarify(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/agent/clarify requires POST.' });
    return;
  }
  try {
    const aiUser = await guardAiRequest(req, res, { message: AI_LIMITS.messageChars });
    if (!aiUser) return;
    const { message, currentReferenceDate, userProfile } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }
    const refDate = currentReferenceDate ? new Date(currentReferenceDate) : new Date();
    const refDateISO = isNaN(refDate.getTime()) ? new Date().toISOString() : refDate.toISOString();
    const result = await askRefinementQuestions({ message, currentReferenceDate: refDateISO, userProfile: sanitizePlanningProfile(userProfile), useAi: aiUser.aiEnabled });
    res.json(result.offTopic ? { ...result, message: OFF_TOPIC_REPLY } : result);
  } catch (error: any) {
    console.error('Error in /api/agent/clarify:', error);
    res.json({ needsClarification: false, questions: [] });
  }
}

export default async function handler(req: any, res: any) {
  const action = req.query?.action as string;

  if (action === 'transcribe') {
    return handleTranscribe(req, res);
  }
  if (action === 'process') {
    return handleProcess(req, res);
  }
  if (action === 'clarify') {
    return handleClarify(req, res);
  }

  return res.status(404).json({ error: 'Unknown action' });
}
