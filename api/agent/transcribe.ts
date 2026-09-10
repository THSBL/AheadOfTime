import { generateContentFast, TRANSCRIBE_MODELS } from '../../server/agentProcessor.js';

// Vercel serverless equivalent of server.ts's POST /api/agent/transcribe route.
// Logic ported verbatim; generateContentFast/TRANSCRIBE_MODELS are imported
// from server/agentProcessor.ts so both deployment targets share one
// implementation, same pattern as api/agent/process.ts.
export default async function handler(req: any, res: any) {
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
