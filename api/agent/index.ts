import type { CalendarEvent, ProcessAgentInputPayload, ProcessAgentResponsePayload } from '../../src/types.js';
import {
  generateContentFast,
  TRANSCRIBE_MODELS,
  processWithGemini,
  processWithDeterministicRules,
  askRefinementQuestions,
} from '../../server/agentProcessor.js';
import { sanitizePlanningProfile } from '../../src/utils/refinementQuestions.js';
import { logQualityEvent } from '../../server/qualityStore.js';

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

async function handleTranscribe(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/agent/transcribe requires POST.' });
    return;
  }

  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;
    if (!audioBase64) {
      res.status(400).json({ error: 'audioBase64 is required' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.json({ transcribedText: 'Voice memo captured (Gemini API key not configured for live transcription).' });
      return;
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    };

    const result = await generateContentFast(
      () => ({
        contents: {
          parts: [
            audioPart,
            { text: 'Transcribe this conversational calendar voice memo exactly. Output ONLY the transcribed speech text.' }
          ]
        },
      }),
      TRANSCRIBE_MODELS,
      4500
    );

    const transcribedText = result.text?.trim() || '';
    res.json({ transcribedText });
  } catch (error: any) {
    console.warn('Audio transcription notice:', error?.message || 'Unavailable');
    res.json({ transcribedText: 'Voice memo captured successfully. (Transcription fallback applied).' });
  }
}

async function handleProcess(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/agent/process requires POST.' });
    return;
  }

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
      userProfile: rawUserProfile,
      conversationBrief,
      lockToTargetEvent,
      isLevelExpansion
    } = payload;
    const userProfile = sanitizePlanningProfile(rawUserProfile);

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
          conversationBrief: typeof conversationBrief === 'string' ? conversationBrief.slice(0, 6000) : undefined,
          lockToTargetEvent: lockToTargetEvent === true,
          isLevelExpansion,
        });
        if (transcribedVoiceText) {
          result.transcribedText = transcribedVoiceText;
        }
        result.usedAi = true;
      } catch (geminiError: any) {
        console.warn("Fast Gemini notice, seamlessly using deterministic rules engine:", geminiError?.message || "Fallback");
        // Pure logging - does not affect the deterministic fallback below.
        // Note: web-chat events use client-generated ids (evt-...), not
        // Postgres UUIDs, so eventId is intentionally omitted here.
        await logQualityEvent({
          sourceChannel: 'web',
          signalType: 'gemini_fallback',
          severity: 'medium',
          errorDetail: geminiError?.message || String(geminiError),
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
    const { message, currentReferenceDate, userProfile } = req.body || {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }
    const refDate = currentReferenceDate ? new Date(currentReferenceDate) : new Date();
    const refDateISO = isNaN(refDate.getTime()) ? new Date().toISOString() : refDate.toISOString();
    const result = await askRefinementQuestions({ message, currentReferenceDate: refDateISO, userProfile: sanitizePlanningProfile(userProfile) });
    res.json(result);
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
