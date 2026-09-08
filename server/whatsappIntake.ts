import { GoogleGenAI } from '@google/genai';
import { WhatsAppEventSessionState } from '../src/types/whatsapp.js';
import { TMinusMilestone, MilestoneCategory } from '../src/types.js';

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-whatsapp',
        },
      },
    });
  }
  return aiClient;
}

export interface WhatsAppIntakeResult {
  milestones: TMinusMilestone[];
  conversationalSummary: string;
  extractedContext: {
    partySize?: number;
    destination?: string;
    subActivities?: string[];
    dietaryOrDining?: string;
    giftNeeded?: boolean;
    keyDetails: string[];
  };
}

export class WhatsAppIntakeService {
  /**
   * Deep Context Prompt for Compound Event Extraction & T-Minus Milestone Generation
   */
  public static async processConversationalIntake(
    userText: string,
    session: WhatsAppEventSessionState
  ): Promise<WhatsAppIntakeResult> {
    const eventDate = session.eventDate;
    const eventTitle = session.eventTitle;
    const [year, month, day] = eventDate.split('-').map(Number);
    const eventDateObj = new Date(year, month - 1, day, 12, 0, 0);

    // If Gemini key is missing, utilize deterministic heuristic extraction
    if (!process.env.GEMINI_API_KEY) {
      return this.fallbackHeuristicIntake(userText, session, eventDateObj);
    }

    const systemInstruction = `You are AheadOfTime's senior reverse-logistics concierge and calendar planner.
The user is planning an upcoming event: "${eventTitle}" on ${eventDate}.
They just replied via WhatsApp with key details and plans: "${userText}".

Your objective:
1. Deep compound event extraction: Identify if this is a compound event (e.g. a trip, cabin weekend, birthday party, conference) that contains nested sub-activities (e.g. Saturday dinner spot, rental car, grocery run, group gift, equipment packing, tickets).
2. Calculate realistic reverse preparation milestones (T-Minus days). Each milestone represents an action item that MUST be handled BEFORE the event date to prevent scrambling.
3. Keep offsets practical:
   - Major bookings/reservations: T-21d to T-14d
   - Logistics & group coordination (rides, gear, menus): T-10d to T-7d
   - Shopping, supplies & gifts: T-5d to T-3d
   - Final packing, pre-departure checks: T-2d or T-1d
   - Day-of critical items: T-Day (T-0d)
4. Return strict JSON matching the schema below.`;

    const prompt = `Event Context:
Title: "${eventTitle}"
Date: ${eventDate}
Location: "${session.eventLocation || 'Unspecified'}"
User WhatsApp Message: "${userText}"

Generate 4 to 6 tailored T-minus milestones for this event and return a JSON object with:
- "extracted_context": {
    "party_size": number or null,
    "destination": string or null,
    "sub_activities": array of strings (e.g. ["Saturday dinner reservation", "shared rides / carpool"]),
    "dining_plan": string or null,
    "gift_needed": boolean,
    "key_details": array of 2-4 key takeaways
  }
- "milestones": array of objects:
    {
      "title": string (concise, action-oriented, e.g. "Book Saturday dinner spot for 6"),
      "t_minus_days": integer (positive integer: e.g. 21, 14, 7, 3, 1, 0),
      "category": string (one of: "booking", "logistics", "shopping", "gift", "prep", "review", "general"),
      "tag": string (e.g. "Reservations", "Transport", "Supplies", "Packing"),
      "deliverable_type": string ("reservation", "activity", "booking", "shopping", "logistics", "general"),
      "description": string (short actionable sentence)
    }
- "whatsapp_summary": A warm, high-impact 2-sentence WhatsApp reply string:
    e.g. "Got it! I mapped out 5 prep milestones for your trip (including booking your Saturday dinner at T-14d). Should I push these directly to your calendar?"`;

    try {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);

      const rawMilestones = Array.isArray(parsed.milestones) ? parsed.milestones : [];
      
      const mappedMilestones: TMinusMilestone[] = rawMilestones.map((m: any, idx: number) => {
        const tMinusDays = Number(m.t_minus_days) || 7;
        
        // Exact calendar date subtraction
        const calcDate = new Date(year, month - 1, day, 12, 0, 0);
        calcDate.setDate(calcDate.getDate() - tMinusDays);

        const y = calcDate.getFullYear();
        const mo = String(calcDate.getMonth() + 1).padStart(2, '0');
        const d = String(calcDate.getDate()).padStart(2, '0');
        const calculatedDate = `${y}-${mo}-${d}`;

        const tMinusLabel = tMinusDays === 0 ? 'T-Day' : `T-${tMinusDays}d`;
        const offsetMinutes = -tMinusDays * 24 * 60;

        return {
          id: `wa-m-${session.eventId}-${idx + 1}-${Date.now().toString(36)}`,
          eventId: session.eventId,
          tMinusLabel,
          tMinusOffsetMinutes: offsetMinutes,
          calculatedDate,
          title: m.title || `Prep milestone ${idx + 1}`,
          description: m.description || `Generated via WhatsApp intake: ${m.title}`,
          category: (m.category as MilestoneCategory) || 'prep',
          status: 'pending',
          scope: tMinusDays >= 14 ? 'macro' : 'micro',
          tag: m.tag || 'Logistics',
          kind: 'milestone',
          deliverableType: m.deliverable_type || 'general',
        };
      });

      // Sort descending by t_minus_days
      mappedMilestones.sort((a, b) => {
        const offsetA = -a.tMinusOffsetMinutes;
        const offsetB = -b.tMinusOffsetMinutes;
        return offsetA - offsetB;
      });

      const summaryText = parsed.whatsapp_summary || 
        `Got it! I mapped out ${mappedMilestones.length} prep milestones for ${eventTitle}. Should I push these directly to your calendar?`;

      return {
        milestones: mappedMilestones,
        conversationalSummary: summaryText,
        extractedContext: {
          partySize: parsed.extracted_context?.party_size || undefined,
          destination: parsed.extracted_context?.destination || undefined,
          subActivities: parsed.extracted_context?.sub_activities || [],
          dietaryOrDining: parsed.extracted_context?.dining_plan || undefined,
          giftNeeded: Boolean(parsed.extracted_context?.gift_needed),
          keyDetails: parsed.extracted_context?.key_details || [],
        },
      };
    } catch (err) {
      console.warn('Gemini WhatsApp intake parsing failed, using fallback:', err);
      return this.fallbackHeuristicIntake(userText, session, eventDateObj);
    }
  }

  /**
   * Resilient heuristic fallback for offline or zero-key mode
   */
  private static fallbackHeuristicIntake(
    userText: string,
    session: WhatsAppEventSessionState,
    eventDateObj: Date
  ): WhatsAppIntakeResult {
    const title = session.eventTitle;
    const lower = (userText + ' ' + title).toLowerCase();

    const hasDinner = lower.includes('dinner') || lower.includes('restaurant') || lower.includes('food');
    const hasRides = lower.includes('ride') || lower.includes('drive') || lower.includes('carpool') || lower.includes('transport');
    const hasCabin = lower.includes('cabin') || lower.includes('trip') || lower.includes('stay') || lower.includes('lodging');
    const hasGift = lower.includes('gift') || lower.includes('present') || lower.includes('card');

    const milestonesConfig: Array<{ title: string; days: number; tag: string; cat: MilestoneCategory }> = [];

    if (hasCabin) {
      milestonesConfig.push({ title: 'Confirm lodging access codes & check-in details', days: 21, tag: 'Reservations', cat: 'booking' });
    }
    if (hasDinner) {
      milestonesConfig.push({ title: 'Reserve group dinner table & dietary check', days: 14, tag: 'Dining', cat: 'booking' });
    }
    if (hasRides) {
      milestonesConfig.push({ title: 'Coordinate shared rides & departure timing', days: 7, tag: 'Transport', cat: 'logistics' });
    }
    if (hasGift) {
      milestonesConfig.push({ title: 'Purchase group gift & wrap', days: 5, tag: 'Gift', cat: 'gift' });
    }

    milestonesConfig.push({ title: 'Pack clothes, toiletries, and weekend gear', days: 2, tag: 'Packing', cat: 'prep' });
    milestonesConfig.push({ title: 'Final departure check & route navigation lock', days: 0, tag: 'Operations', cat: 'prep' });

    const milestones: TMinusMilestone[] = milestonesConfig.map((item, idx) => {
      const calc = new Date(eventDateObj);
      calc.setDate(calc.getDate() - item.days);
      const y = calc.getFullYear();
      const mo = String(calc.getMonth() + 1).padStart(2, '0');
      const d = String(calc.getDate()).padStart(2, '0');

      return {
        id: `wa-m-fb-${session.eventId}-${idx + 1}-${Date.now().toString(36)}`,
        eventId: session.eventId,
        tMinusLabel: item.days === 0 ? 'T-Day' : `T-${item.days}d`,
        tMinusOffsetMinutes: -item.days * 24 * 60,
        calculatedDate: `${y}-${mo}-${d}`,
        title: item.title,
        description: `Preparation task for ${title}`,
        category: item.cat,
        status: 'pending',
        scope: item.days >= 14 ? 'macro' : 'micro',
        tag: item.tag,
        kind: 'milestone',
        deliverableType: 'general',
      };
    });

    const highlight = hasDinner ? ' (including booking your dinner reservation at T-14d)' : '';
    const summary = `Got it! I mapped out ${milestones.length} prep milestones for your trip${highlight}. Should I push these directly to your calendar?`;

    return {
      milestones,
      conversationalSummary: summary,
      extractedContext: {
        subActivities: hasDinner ? ['Group dinner reservation'] : [],
        keyDetails: [userText.slice(0, 80)],
      },
    };
  }
}
