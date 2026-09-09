import { MilestoneCategory } from '../types.js';
import { lookupTaskTiming } from '../data/prepTimelineDatabase.js';

export type TimeUnit = 'weeks' | 'days' | 'hours';

export interface AlternativeTiming {
  amount: number;
  unit: TimeUnit;
  badge: string;
  label: string;
  reason: string;
}

export interface TimingSuggestion {
  amount: number;
  unit: TimeUnit;
  badge: string;
  category: MilestoneCategory;
  reason: string;
  alternatives: AlternativeTiming[];
}

/**
 * Intelligent local semantic parser that analyzes the task action and context
 * against our preparation timeline knowledge base to determine realistic lead times.
 */
export function inferTaskTimingLocally(
  taskTitle: string,
  taskDescription: string = '',
  eventTitle: string = ''
): TimingSuggestion {
  const text = `${taskTitle} ${taskDescription} ${eventTitle}`.toLowerCase().trim();

  // 1. First check the comprehensive Prep Knowledge Base
  const dbMatch = lookupTaskTiming(taskTitle, `${taskDescription} ${eventTitle}`);
  if (dbMatch) {
    const idealDays = dbMatch.idealLeadDays;
    let unit: TimeUnit = 'days';
    let amount = idealDays;

    if (idealDays >= 14 && idealDays % 7 === 0) {
      unit = 'weeks';
      amount = idealDays / 7;
    } else if (idealDays >= 14) {
      unit = 'weeks';
      amount = Math.round(idealDays / 7);
    }

    const mappedAlternatives: AlternativeTiming[] = dbMatch.alternatives.map((alt) => {
      let mappedUnit: TimeUnit = 'days';
      let mappedAmount = alt.amount;
      if (alt.unit === 'months') {
        mappedUnit = 'weeks';
        mappedAmount = alt.amount * 4;
      } else if (alt.unit === 'weeks') {
        mappedUnit = 'weeks';
      } else if (alt.unit === 'hours') {
        mappedUnit = 'hours';
      }
      return {
        amount: mappedAmount,
        unit: mappedUnit,
        badge: alt.badge,
        label: alt.label,
        reason: alt.reason,
      };
    });

    return {
      amount,
      unit,
      badge: dbMatch.badge,
      category: dbMatch.category,
      reason: dbMatch.reason,
      alternatives: mappedAlternatives,
    };
  }

  // 2. Wedding dresses & custom bridal attire (6 - 8 months out)
  if (text.match(/\b(wedding dress|bridal gown|wedding gown|bridal dress|custom suit|wedding tuxedo|bridesmaid dress|veil)\b/)) {
    return {
      amount: 32,
      unit: 'weeks',
      badge: 'T-8m',
      category: 'shopping',
      reason: 'Made-to-order wedding dresses and tailored suits take 4 to 6 months for manufacture plus 6 to 8 weeks for alterations and fittings.',
      alternatives: [
        { amount: 36, unit: 'weeks', badge: 'T-9m', label: '9 Months before', reason: 'Custom boutique made-to-measure orders' },
        { amount: 24, unit: 'weeks', badge: 'T-6m', label: '6 Months before', reason: 'Standard bridal shop order window' },
        { amount: 8, unit: 'weeks', badge: 'T-8w', label: '8 Weeks before', reason: 'Off-the-rack dress requiring alterations only' },
      ],
    };
  }

  // 3. Dog sitter, cat sitter, pet boarding & kennels (4 - 8 weeks out)
  if (text.match(/\b(dog sitter|cat sitter|pet sitter|dog boarding|pet boarding|kennel|cattery|dog hotel|pet hotel|doggy daycare)\b/)) {
    return {
      amount: 6,
      unit: 'weeks',
      badge: 'T-6w',
      category: 'booking',
      reason: 'Reputable pet sitters and boarding kennels reach full capacity weeks in advance, especially during holiday and weekend periods.',
      alternatives: [
        { amount: 8, unit: 'weeks', badge: 'T-8w', label: '8 Weeks before', reason: 'Peak summer holidays, Christmas and bank holiday getaways' },
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Regular trusted sitter or standard weekend trip' },
      ],
    };
  }

  // 4. Passports, visas, renewals (8 - 12 weeks out)
  if (text.match(/\b(passport|visa|renew passport|e-visa|esta|travel visa|passport validity)\b/)) {
    return {
      amount: 10,
      unit: 'weeks',
      badge: 'T-10w',
      category: 'admin',
      reason: 'Most countries require 6 months of passport validity past departure, and government passport processing requires 6 to 10 weeks.',
      alternatives: [
        { amount: 12, unit: 'weeks', badge: 'T-12w', label: '12 Weeks before', reason: 'Standard passport renewal processing window' },
        { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Online e-visa and electronic travel authorization' },
      ],
    };
  }

  // 5. Flights, international travel, long-haul (8 - 12 weeks out)
  if (text.match(/\b(flight|international flight|airline|plane ticket|long haul)\b/)) {
    return {
      amount: 12,
      unit: 'weeks',
      badge: 'T-12w',
      category: 'booking',
      reason: 'Securing flights 2 to 3 months early secures significantly lower fares and preferred seating options.',
      alternatives: [
        { amount: 16, unit: 'weeks', badge: 'T-16w', label: '16 Weeks before', reason: 'Peak summer vacation flights' },
        { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Short domestic or European flights' },
      ],
    };
  }

  // 6. Vacation rentals, villas, hotels (6 - 8 weeks out)
  if (text.match(/\b(hotel|airbnb|vacation rental|villa|resort|cabin|chalet)\b/)) {
    return {
      amount: 8,
      unit: 'weeks',
      badge: 'T-8w',
      category: 'booking',
      reason: 'Top vacation homes and central hotels get booked months ahead during peak seasons.',
      alternatives: [
        { amount: 12, unit: 'weeks', badge: 'T-12w', label: '12 Weeks before', reason: 'Large group villas and holiday houses' },
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Standard city hotels with free cancellation' },
      ],
    };
  }

  // 7. Karaoke booths, private rooms, escape rooms, bowling (3 - 4 weeks)
  if (
    text.match(/\b(karaoke|karaoke booth|karaoke room|singing room|escape room|bowling|arcade|laser tag|vr lounge|axe throwing|mini golf|topgolf)\b/)
  ) {
    return {
      amount: 3,
      unit: 'weeks',
      badge: 'T-3w',
      category: 'booking',
      reason: 'Private karaoke rooms and activity spaces experience high weekend peak demand; booking 3 to 4 weeks ahead locks in your preferred time slot.',
      alternatives: [
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Prime weekend evening slots and larger party groups' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Standard weekday or off-peak booking window' },
      ],
    };
  }

  // 8. Invites & RSVPs & Headcounts (3 - 4 weeks)
  if (
    text.match(/\b(invit|send invite|send rsvp|gather headcount|survey|evite|save the date|guest list|collect rsvp)\b/)
  ) {
    return {
      amount: 4,
      unit: 'weeks',
      badge: 'T-4w',
      category: 'prep',
      reason: 'Guests require 3 to 4 weeks of advance notice to clear their personal calendars, arrange transport, and confirm attendance.',
      alternatives: [
        { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Formal milestone events and busy holiday periods' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Casual get-togethers' },
      ],
    };
  }

  // 9. Restaurant tables, private dining rooms, venues & performers (3 - 4 weeks)
  if (
    text.match(/\b(reserve table|book restaurant|venue|hire dj|photographer|hire band|chef table|private room|rooftop bar|brunch table|reserve venue)\b/)
  ) {
    return {
      amount: 4,
      unit: 'weeks',
      badge: 'T-4w',
      category: 'booking',
      reason: 'Popular venues, top-rated restaurants, and group dining tables fill their books weeks early for weekend seatings.',
      alternatives: [
        { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Milestone celebrations and private rooms' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Casual dining & off-peak tables' },
      ],
    };
  }

  // 10. Standard Gifts, Flowers, Gift Baskets (1 - 2 weeks)
  if (
    text.match(/\b(gift|present|birthday card|gift card|voucher|flower delivery|order flowers|wrap gift|gift basket)\b/)
  ) {
    return {
      amount: 2,
      unit: 'weeks',
      badge: 'T-2w',
      category: 'gift',
      reason: 'Allows enough time to buy the ideal gift, write a card, handle gift wrapping, and avoid rush shipping charges.',
      alternatives: [
        { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Quick online or in-store purchase' },
        { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'In-person boutique shopping & card writing' },
      ],
    };
  }

  // 11. Bakery, Custom Cakes & Catering (1 - 2 weeks)
  if (
    text.match(/\b(order cake|bakery|cupcake|custom cake|caterer|catering|order food|party platter)\b/)
  ) {
    return {
      amount: 2,
      unit: 'weeks',
      badge: 'T-2w',
      category: 'shopping',
      reason: 'Bakeries and catering services require pre-orders 1 to 2 weeks in advance to schedule custom decoration and ingredient prep.',
      alternatives: [
        { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Elaborate multi-tier custom themed cakes' },
        { amount: 4, unit: 'days', badge: 'T-4d', label: '4 Days before', reason: 'Standard bakery pre-orders' },
      ],
    };
  }

  // 12. Outfits, Suits, Salons & Dry Cleaning (1 week)
  if (
    text.match(/\b(suit|tuxedo|dress|costume|dry clean|dry cleaning|iron shirt|tailor|alteration|haircut|salon|barber|nails|makeup)\b/)
  ) {
    return {
      amount: 1,
      unit: 'weeks',
      badge: 'T-7d',
      category: 'costume',
      reason: 'Dry cleaners, tailoring alterations, and salon appointments typically require 5 to 7 days to guarantee you look sharp without rush stress.',
      alternatives: [
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Tailoring alterations & custom fittings' },
        { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'Home steaming & trying on outfits' },
      ],
    };
  }

  // 13. Luggage, Packing & Equipment (2 - 3 days)
  if (
    text.match(/\b(pack bag|pack luggage|pack suitcase|pack clothes|packing|charge battery|charge camera|toiletries|sunscreen|swimsuit)\b/)
  ) {
    return {
      amount: 3,
      unit: 'days',
      badge: 'T-3d',
      category: 'logistics',
      reason: 'Packing 3 days early leaves time to do laundry and spot any missing items before departing.',
      alternatives: [
        { amount: 5, unit: 'days', badge: 'T-5d', label: '5 Days before', reason: 'Major international vacation packing' },
        { amount: 1, unit: 'days', badge: 'T-1d', label: '1 Day before', reason: 'Light weekend trip packing' },
      ],
    };
  }

  // 14. Perishable Groceries, Ice, Drinks (1 - 2 days)
  if (
    text.match(/\b(grocery|groceries|supermarket|ice|drinks|fresh produce|fruit|marinate|wine|beer|buy food|snack|meat|cheese board)\b/)
  ) {
    return {
      amount: 1,
      unit: 'days',
      badge: 'T-1d',
      category: 'shopping',
      reason: 'Perishable ingredients, fresh ice, and beverages stay in prime condition when purchased 24 to 48 hours prior.',
      alternatives: [
        { amount: 2, unit: 'days', badge: 'T-2d', label: '2 Days before', reason: 'Non-perishable bulk pantry shopping' },
        { amount: 4, unit: 'hours', badge: 'T-4h', label: '4 Hours before', reason: 'Ice bag pickup & chilled items' },
      ],
    };
  }

  // 15. Final Day-of Logistics (2 - 4 hours)
  if (
    text.match(/\b(uber|taxi|petrol|gas|fill tank|set table|sound check|check in online|boarding pass|drive|leave house)\b/)
  ) {
    return {
      amount: 3,
      unit: 'hours',
      badge: 'T-3h',
      category: 'logistics',
      reason: 'Immediate day-of preparations are time-sensitive and best executed a few hours prior to start.',
      alternatives: [
        { amount: 1, unit: 'days', badge: 'T-1d', label: '1 Day before', reason: 'Pre-check routes and car setup' },
        { amount: 1, unit: 'hours', badge: 'T-1h', label: '1 Hour before', reason: 'Final departure countdown' },
      ],
    };
  }

  // Tailored dynamic fallback explicitly referencing the task title
  const cleanTask = taskTitle.replace(/^(to\s+|please\s+)/i, '');
  return {
    amount: 3,
    unit: 'days',
    badge: 'T-3d',
    category: 'prep',
    reason: `Completing "${cleanTask}" 3 days in advance provides a focused preparation buffer without last-minute scrambling.`,
    alternatives: [
      { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: `Early buffer for "${cleanTask}" to avoid busy schedules` },
      { amount: 1, unit: 'days', badge: 'T-1d', label: '1 Day before', reason: `Immediate execution of "${cleanTask}" on the eve of the event` },
    ],
  };
}

/**
 * Calls server AI timing endpoint with instant local fallback
 */
export async function fetchAITaskTiming(
  taskTitle: string,
  taskDescription: string = '',
  eventTitle: string = '',
  eventDate: string = '',
  eventTime: string = ''
): Promise<TimingSuggestion> {
  // First get local heuristic as baseline
  const localSuggestion = inferTaskTimingLocally(taskTitle, taskDescription, eventTitle);

  if (!taskTitle.trim()) {
    return localSuggestion;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const res = await fetch('/api/milestone/suggest-timing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskTitle,
        taskDescription,
        eventTitle,
        eventDate,
        eventTime,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.amount === 'number' && data.unit && data.reason) {
        return {
          amount: data.amount,
          unit: data.unit as TimeUnit,
          badge: data.badge || (data.unit === 'weeks' ? `T-${data.amount}w` : data.unit === 'hours' ? `T-${data.amount}h` : `T-${data.amount}d`),
          category: data.category || localSuggestion.category,
          reason: data.reason,
          alternatives: Array.isArray(data.alternatives) && data.alternatives.length > 0 
            ? data.alternatives 
            : localSuggestion.alternatives,
        };
      }
    }
  } catch (err) {
    // Graceful fallback to local suggestion
  }

  return localSuggestion;
}
