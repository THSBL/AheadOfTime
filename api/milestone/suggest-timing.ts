import { generateContentFast, DEFAULT_FAST_MODELS } from '../../server/agentProcessor.js';
import { inferTaskTimingLocally } from '../../src/utils/timingAI.js';

// Vercel serverless equivalent of server.ts's POST /api/milestone/suggest-timing
// route. Logic ported verbatim; generateContentFast/DEFAULT_FAST_MODELS are
// imported from server/agentProcessor.ts and inferTaskTimingLocally from
// src/utils/timingAI.ts, same pattern as api/agent/process.ts.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/milestone/suggest-timing requires POST.' });
    return;
  }

  const sanitizeString = (str: any, maxLen: number = 500): string => {
    if (typeof str !== 'string') return '';
    // Strip control characters (below 0x20, and DEL/0x7F) without relying on
    // a regex escape range, which risks encoding issues when authored.
    const stripped = Array.from(str)
      .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
      .join('');
    return stripped.trim().slice(0, maxLen);
  };

  try {
    const rawTaskTitle = req.body.taskTitle || '';
    const rawTaskDescription = req.body.taskDescription || '';
    const rawEventTitle = req.body.eventTitle || '';
    const rawEventDate = req.body.eventDate || '';
    const rawEventTime = req.body.eventTime || '';

    const taskTitle = sanitizeString(rawTaskTitle, 200);
    const taskDescription = sanitizeString(rawTaskDescription, 500);
    const eventTitle = sanitizeString(rawEventTitle, 200);
    const eventDate = sanitizeString(rawEventDate, 50);
    const eventTime = sanitizeString(rawEventTime, 50);

    if (!taskTitle) {
      res.status(400).json({ error: 'taskTitle is required' });
      return;
    }

    const localBaseline = inferTaskTimingLocally(taskTitle, taskDescription, eventTitle);

    if (!process.env.GEMINI_API_KEY) {
      res.json(localBaseline);
      return;
    }

    const prompt = `You are a world-class event concierge, logistics director, and timing strategist.
Analyze the user's specific preparation task in the context of their upcoming event, and calculate the exact optimal lead time (T-Minus buffer) before the event.

Event: "${eventTitle || 'Upcoming Event'}" (Date: ${eventDate || 'Upcoming'}, Time: ${eventTime || 'unspecified'})
Task Action: "${taskTitle}"
Task Notes: "${taskDescription || 'None'}"

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
          responseMimeType: 'application/json',
          temperature: 0.15,
        },
      }),
      DEFAULT_FAST_MODELS,
      8000
    );

    const parsed = JSON.parse(result.text.trim());
    if (parsed && typeof parsed.amount === 'number' && parsed.unit && parsed.reason) {
      res.json(parsed);
      return;
    }
    res.json(localBaseline);
  } catch (err: any) {
    console.warn('AI milestone timing inference notice:', err?.message);
    const { taskTitle = '', taskDescription = '', eventTitle = '' } = req.body;
    res.json(inferTaskTimingLocally(taskTitle, taskDescription, eventTitle));
  }
}
