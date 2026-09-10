import { generateContentFast, DEFAULT_FAST_MODELS } from '../../server/agentProcessor.js';
import { calculateOffsetDate } from '../../src/utils/tminusRules.js';
import { deepRefineEventLocally } from '../../src/utils/deepRefine.js';
import type { CalendarEvent, TMinusMilestone } from '../../src/types.js';

// Vercel serverless equivalent of server.ts's POST /api/event/deep-refine
// route. Logic ported verbatim; shared helpers imported from
// server/agentProcessor.ts and src/utils/*, same pattern as
// api/agent/process.ts.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. /api/event/deep-refine requires POST.' });
    return;
  }

  try {
    const { event }: { event: CalendarEvent } = req.body;
    if (!event || !event.title) {
      res.status(400).json({ error: 'Valid calendar event is required' });
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
Event Date: ${event.eventDate || 'Upcoming'} (Time: ${event.eventTime || '19:00'})
Event Location: "${event.location || 'None specified'}"
Event Category: "${event.category || 'custom'}"
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
          responseMimeType: 'application/json',
          temperature: 0.15,
        },
      }),
      DEFAULT_FAST_MODELS,
      8000
    );

    const parsed = JSON.parse(result.text.trim());
    if (parsed && Array.isArray(parsed.milestones) && parsed.milestones.length > 0) {
      const refinedMilestones: TMinusMilestone[] = parsed.milestones.map((m: any, idx: number) => {
        const offset = typeof m.tMinusOffsetMinutes === 'number' ? m.tMinusOffsetMinutes : -((idx + 1) * 24 * 60);
        const calculatedDate = calculateOffsetDate(event.eventDate, event.eventTime || '19:00', offset);
        return {
          id: `ms-${event.id}-${(m.tMinusLabel || `T-${idx + 1}d`).toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now() % 100000}-${idx}`,
          eventId: event.id,
          tMinusLabel: m.tMinusLabel || `T-${idx + 1}d`,
          tMinusOffsetMinutes: offset,
          calculatedDate,
          title: m.title || `Prep task ${idx + 1}`,
          description: m.description || '',
          category: m.category || 'prep',
          status: 'pending',
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
    console.warn('AI deep refinement notice, using local engine:', err?.message);
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
      res.status(500).json({ error: 'Failed to refine event' });
    }
  }
}
