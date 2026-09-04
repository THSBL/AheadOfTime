import { MilestoneCategory } from '../types';

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
 * to determine the optimal lead-time preparation window.
 */
export function inferTaskTimingLocally(
  taskTitle: string,
  taskDescription: string = '',
  eventTitle: string = ''
): TimingSuggestion {
  const text = `${taskTitle} ${taskDescription} ${eventTitle}`.toLowerCase().trim();

  // 1. Karaoke booths, private rooms, escape rooms, bowling, arcades, laser tag (2 - 4 weeks)
  if (
    text.match(/\b(karaoke|karaoke booth|karaoke room|singing room|escape room|bowling|arcade|laser tag|vr lounge|axe throwing|mini golf|topgolf)\b/)
  ) {
    return {
      amount: 3,
      unit: 'weeks',
      badge: 'T-3w',
      category: 'booking',
      reason: 'Private karaoke booths and entertainment rooms experience high weekend peak demand; booking 2 to 4 weeks in advance secures private rooms and your preferred time slot before they sell out.',
      alternatives: [
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Prime weekend evening slots and larger party groups' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Standard weekday or off-peak booking window' },
      ],
    };
  }

  // 2. Long Lead: Custom gifts, passports, visas, international shipping (3 - 4 weeks)
  if (
    text.match(/\b(passport|visa|renew passport|custom gift|personalized gift|engrav|monogram|craft|handmade|order gift from abroad|shipping|ship gift|order present)\b/)
  ) {
    return {
      amount: 3,
      unit: 'weeks',
      badge: 'T-3w',
      category: 'gift',
      reason: 'Personalized orders and custom engraved gifts require dedicated production time and parcel shipping delivery buffers.',
      alternatives: [
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Maximum buffer for international shipping & artisan crafting' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Expedited domestic delivery' },
      ],
    };
  }

  // 3. Invites & RSVPs & Headcounts (3 - 4 weeks)
  if (
    text.match(/\b(invit|send invite|send rsvp|gather headcount|survey|evite|save the date|guest list|collect rsvp)\b/)
  ) {
    return {
      amount: 3,
      unit: 'weeks',
      badge: 'T-3w',
      category: 'prep',
      reason: 'Guests require several weeks of advance notice to clear their personal calendars, arrange transport, and confirm attendance.',
      alternatives: [
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Formal events & busy holiday seasons' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Casual get-togethers' },
      ],
    };
  }

  // 4. Travel, Flights, Hotels & Car Rentals (3 - 4 weeks)
  if (
    text.match(/\b(flight|plane|airline|hotel|airbnb|rental car|train ticket|book transport)\b/)
  ) {
    return {
      amount: 4,
      unit: 'weeks',
      badge: 'T-4w',
      category: 'booking',
      reason: 'Securing flights and accommodations at least a month early prevents steep last-minute price hikes and ensures room availability.',
      alternatives: [
        { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Peak travel seasons & international holidays' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Short domestic trips & flex travel' },
      ],
    };
  }

  // 5. Restaurant tables, private dining rooms, venues & performers (2 - 3 weeks)
  if (
    text.match(/\b(reserve table|book restaurant|venue|hire dj|photographer|hire band|chef table|private room|rooftop bar|brunch table|reserve venue)\b/)
  ) {
    return {
      amount: 3,
      unit: 'weeks',
      badge: 'T-3w',
      category: 'booking',
      reason: 'Popular venues, top-rated restaurants, and group dining tables fill their booking books weeks early for weekend seatings.',
      alternatives: [
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Standard group dinner reservations' },
        { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Casual dining & off-peak tables' },
      ],
    };
  }

  // 6. Party Rentals & AV equipment (2 - 3 weeks)
  if (
    text.match(/\b(rent table|rent chair|bouncy castle|photo booth|sound system|projector|lighting|party rental|generator|tent rental)\b/)
  ) {
    return {
      amount: 3,
      unit: 'weeks',
      badge: 'T-3w',
      category: 'logistics',
      reason: 'Party rental vendors require 2 to 3 weeks notice to schedule equipment delivery routes, lock in inventory, and collect safety deposits.',
      alternatives: [
        { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Peak summer & graduation party seasons' },
        { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Local pickup of small equipment' },
      ],
    };
  }

  // 7. Standard Gifts, Flowers, Gift Baskets (1 - 2 weeks)
  if (
    text.match(/\b(gift|present|birthday card|gift card|voucher|flower delivery|order flowers|wrap gift|gift basket)\b/)
  ) {
    return {
      amount: 2,
      unit: 'weeks',
      badge: 'T-2w',
      category: 'gift',
      reason: 'Allows enough time to buy the ideal gift, write a meaningful card, handle gift wrapping, and avoid rush shipping surcharges.',
      alternatives: [
        { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Quick online or in-store purchase' },
        { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'In-person boutique shopping & card writing' },
      ],
    };
  }

  // 8. Bakery, Custom Cakes & Catering (5 - 7 days)
  if (
    text.match(/\b(order cake|bakery|cupcake|custom cake|caterer|catering|order food|party platter)\b/)
  ) {
    return {
      amount: 1,
      unit: 'weeks',
      badge: 'T-7d',
      category: 'shopping',
      reason: 'Bakeries and catering services require pre-orders 5 to 7 days in advance to schedule custom decoration and ingredient prep.',
      alternatives: [
        { amount: 10, unit: 'days', badge: 'T-10d', label: '10 Days before', reason: 'Elaborate multi-tier custom themed cakes' },
        { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'Standard bakery pre-orders' },
      ],
    };
  }

  // 9. Outfits, Formal Wear, Costumes, Salons & Dry Cleaning (5 - 7 days)
  if (
    text.match(/\b(suit|tuxedo|dress|costume|fancy dress|dry clean|dry cleaning|iron shirt|steaming|tailor|alteration|theme outfit|shoes|haircut|salon|barber|nails|makeup)\b/)
  ) {
    return {
      amount: 1,
      unit: 'weeks',
      badge: 'T-7d',
      category: 'costume',
      reason: 'Dry cleaners, tailoring alterations, and salon appointments typically require 5 to 7 days to guarantee you look sharp without rush stress.',
      alternatives: [
        { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'Home steaming, trying on attire & fresh trims' },
        { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Complex costume ordering & tailoring alterations' },
      ],
    };
  }

  // 10. Playlists, Speeches, Slideshows & Toasts (4 - 5 days)
  if (
    text.match(/\b(playlist|speech|toast|slideshow|slide deck|photo video|presentation|montage|music list|dj setlist)\b/)
  ) {
    return {
      amount: 5,
      unit: 'days',
      badge: 'T-5d',
      category: 'prep',
      reason: 'Curating playlists, speeches, or photo slideshows 5 days early gives you time to review song flow, practice speaking, and test AV playback.',
      alternatives: [
        { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Comprehensive slide deck & video editing' },
        { amount: 2, unit: 'days', badge: 'T-2d', label: '2 Days before', reason: 'Quick track sequencing & speech cue cards' },
      ],
    };
  }

  // 11. Home Cleaning, Guest Room & Deep Tidying (3 days)
  if (
    text.match(/\b(clean guest|guest room|bedding|towels|sheets|deep clean|vacuum|tidy house|mow lawn|clean bathroom|dust|declutter|air out)\b/)
  ) {
    return {
      amount: 3,
      unit: 'days',
      badge: 'T-3d',
      category: 'prep',
      reason: 'Gives ample time to wash linens and clean without the house getting dusty or cluttered again before arrival.',
      alternatives: [
        { amount: 5, unit: 'days', badge: 'T-5d', label: '5 Days before', reason: 'Major deep cleaning & reorganizing' },
        { amount: 1, unit: 'days', badge: 'T-1d', label: '1 Day before', reason: 'Quick surface dusting & fresh towel setup' },
      ],
    };
  }

  // 12. Luggage, Packing & Equipment (2 days)
  if (
    text.match(/\b(pack bag|pack luggage|pack suitcase|pack clothes|packing|charge battery|charge camera|toiletries|sunscreen|swimsuit|passport check)\b/)
  ) {
    return {
      amount: 2,
      unit: 'days',
      badge: 'T-2d',
      category: 'logistics',
      reason: 'Packing 2 days early leaves time to do laundry and spot any missing items before departing.',
      alternatives: [
        { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'Major holiday or international trip packing' },
        { amount: 1, unit: 'days', badge: 'T-1d', label: '1 Day before', reason: 'Light weekend trip packing' },
      ],
    };
  }

  // 13. Perishable Groceries, Ice, Drinks & Food Prep (1 day)
  if (
    text.match(/\b(grocery|groceries|supermarket|ice|drinks|fresh produce|fruit|marinate|wine|beer|soft drinks|buy food|snack|meat|cheese board)\b/)
  ) {
    return {
      amount: 1,
      unit: 'days',
      badge: 'T-1d',
      category: 'shopping',
      reason: 'Perishable ingredients, fresh ice, and beverages stay in prime condition when purchased 24 hours prior.',
      alternatives: [
        { amount: 2, unit: 'days', badge: 'T-2d', label: '2 Days before', reason: 'Non-perishable bulk pantry shopping' },
        { amount: 4, unit: 'hours', badge: 'T-4h', label: '4 Hours before', reason: 'Ice bag pickup & chilled items' },
      ],
    };
  }

  // 14. Final Day-of Logistics & Immediate Readiness (2 - 4 hours)
  if (
    text.match(/\b(uber|taxi|petrol|gas|fill tank|warm up|set table|sound check|check in online|boarding pass|drive|leave house|greet)\b/)
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
