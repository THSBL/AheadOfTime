import { generateContentFast, DEFAULT_FAST_MODELS } from '../../server/agentProcessor.js';
import { calculateOffsetDate } from '../../src/utils/tminusRules.js';
import { deepRefineEventLocally } from '../../src/utils/deepRefine.js';
import { SHARED_PLANNING_RULES } from '../../server/planningPipeline.js';
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
      // usedAi lets a caller that has its OWN, more context-aware local
      // generator (e.g. the event wizard, which knows the user's actual
      // chip answers) tell this generic local fallback apart from a real
      // Gemini plan and prefer its own generator instead.
      res.json({ event: localRefinedEvent, usedAi: false });
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

${SHARED_PLANNING_RULES}

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
        usedAi: true,
      });
      return;
    }

    res.json({ event: localRefinedEvent, usedAi: false });
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
        usedAi: false,
      });
    } else {
      res.status(500).json({ error: 'Failed to refine event' });
    }
  }
}
