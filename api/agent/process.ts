import type { CalendarEvent, ProcessAgentInputPayload, ProcessAgentResponsePayload } from '../../src/types.js';
import {
  generateContentFast,
  TRANSCRIBE_MODELS,
  processWithGemini,
  processWithDeterministicRules,
} from '../../server/agentProcessor.js';

// Main intelligent agent processing endpoint (Vercel serverless equivalent of
// server.ts's POST /api/agent/process route). Logic is ported verbatim from
// that route handler; the actual processing lives in server/agentProcessor.ts
// so both deployment targets share the same implementation.
//
// The Gemini extraction call can race up to 2 models at 12s each (see
// processWithGemini's generateContentFast timeout) - default Vercel function
// duration is too short to safely cover that worst case, so raise it here.
// (On plans capped below 30s, Vercel silently uses the plan's own ceiling -
// this is a no-op there, not an error.)
export const config = {
  maxDuration: 30,
};

export default async function handler(req: any, res: any) {
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
    const existingEvent: CalendarEvent | undefined = targetEventId ? activeEvents.find(e => e.id === targetEventId) : undefined;

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
        // Temporary diagnostic: surfaces why Gemini was bypassed directly in
        // the response so it can be inspected from a live request without
        // depending on the Vercel log viewer's level filtering. Remove once
        // the underlying Gemini failure is root-caused and fixed.
        (result as any)._debugGeminiFallbackReason = geminiError?.message || String(geminiError);
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
      (result as any)._debugGeminiFallbackReason = 'GEMINI_API_KEY was not set in this function\'s environment';
    }

    res.json(result);
  } catch (error: any) {
    console.error("Agent process handler error:", error);
    res.status(500).json({ error: error.message || "Failed to process request" });
  }
}
