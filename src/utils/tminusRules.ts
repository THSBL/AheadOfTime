import { CalendarEvent, TMinusMilestone, MilestoneCategory, IntakeQuestion, EventCategory } from '../types';

/**
 * Automatically detects an event category from its title, summary, or description
 */
export function detectEventCategory(title: string, description?: string): EventCategory {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  
  if (/birthday|bday|b-day|turning \d+|sweet 16|bar mitzvah|bat mitzvah|\bparty\b/i.test(combined)) {
    return 'birthday_party';
  }
  if (/flight|trip|vacation|holiday|travel|hotel|airbnb|luggage|camping|campsite|getaway|resort/i.test(combined)) {
    return 'travel_trip';
  }
  if (/visiting|staying with|in town|hosting|sleepover|guest|weekend with/i.test(combined)) {
    return 'hosting_visitors';
  }
  if (/dinner|supper|lunch|brunch|dining|bbq|barbecue|cocktails|drinks with|gathering|restaurant/i.test(combined)) {
    return 'dinner_social';
  }
  if (/festival|concert|gig|glastonbury|show|live music|theatre|theater|rave/i.test(combined)) {
    return 'festival_concert';
  }
  if (/deadline|launch|sprint|demo|release|milestone|presentation|pitch|hackathon|audit|client review/i.test(combined)) {
    return 'project_deadline';
  }
  if (/service|car inspection|oil change|dentist|doctor|checkup|veterinarian|\bvet\b|maintenance|mechanic|hvac|garage/i.test(combined)) {
    return 'maintenance';
  }
  if (/subscription|renewal|membership|free trial|gym trial|billing period|recurring charge/i.test(combined)) {
    return 'subscription';
  }
  return 'custom';
}

/**
 * Calculates a date offset given an event date string, optional time, and offset minutes.
 */
export function calculateOffsetDate(eventDateStr: string, eventTimeStr: string | undefined, offsetMinutes: number): string {
  // Use eventDate and eventTime (or default 10:00 AM)
  const timePart = eventTimeStr || '10:00';
  const baseDate = new Date(`${eventDateStr}T${timePart}:00`);
  
  if (isNaN(baseDate.getTime())) {
    const fallback = new Date(eventDateStr);
    fallback.setMinutes(fallback.getMinutes() + offsetMinutes);
    return fallback.toISOString();
  }

  baseDate.setMinutes(baseDate.getMinutes() + offsetMinutes);
  return baseDate.toISOString();
}

/**
 * Format ISO date for display
 */
export function formatDisplayDate(isoString: string, includeTime: boolean = false): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    };
    
    if (includeTime) {
      options.hour = 'numeric';
      options.minute = '2-digit';
    }
    
    return d.toLocaleDateString(undefined, options);
  } catch {
    return isoString;
  }
}

/**
 * Computes exact duration a deadline has been overdue relative to reference date.
 */
export function getOverdueDurationString(targetDateIso: string, referenceDateIso: string): {
  isOverdue: boolean;
  overdueText: string;
  shortLabel: string;
  diffMinutes: number;
  diffHours: number;
  diffDays: number;
} {
  const target = new Date(targetDateIso).getTime();
  const ref = new Date(referenceDateIso).getTime();
  const diffMs = target - ref;

  if (isNaN(target) || isNaN(ref) || diffMs >= 0) {
    return {
      isOverdue: false,
      overdueText: '',
      shortLabel: '',
      diffMinutes: 0,
      diffHours: 0,
      diffDays: 0,
    };
  }

  const overdueMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(overdueMs / (1000 * 60));
  const totalHours = Math.floor(overdueMs / (1000 * 60 * 60));
  const totalDays = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
  const remainingHours = totalHours % 24;

  let overdueText = '';
  let shortLabel = '';

  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const remDays = totalDays % 30;
    overdueText = remDays > 0 ? `Overdue by ${months}mo ${remDays}d` : `Overdue by ${months} month${months > 1 ? 's' : ''}`;
    shortLabel = `${months}mo overdue`;
  } else if (totalDays >= 1) {
    if (remainingHours > 0 && totalDays < 5) {
      overdueText = `Overdue by ${totalDays}d ${remainingHours}h`;
      shortLabel = `${totalDays}d ${remainingHours}h overdue`;
    } else {
      overdueText = `Overdue by ${totalDays} day${totalDays > 1 ? 's' : ''}`;
      shortLabel = `${totalDays}d overdue`;
    }
  } else if (totalHours >= 1) {
    overdueText = `Overdue by ${totalHours} hour${totalHours > 1 ? 's' : ''}`;
    shortLabel = `${totalHours}h overdue`;
  } else if (totalMinutes > 0) {
    overdueText = `Overdue by ${totalMinutes} min${totalMinutes > 1 ? 's' : ''}`;
    shortLabel = `${totalMinutes}m overdue`;
  } else {
    overdueText = 'Overdue just now';
    shortLabel = 'Overdue';
  }

  return {
    isOverdue: true,
    overdueText,
    shortLabel,
    diffMinutes: totalMinutes,
    diffHours: totalHours,
    diffDays: totalDays,
  };
}

/**
 * Helper to compute days / hours difference relative to current reference date
 */
export function getCountdownStatus(targetDateIso: string, referenceDateIso: string): {
  label: string;
  isOverdue: boolean;
  isToday: boolean;
  isSoon: boolean;
  diffDays: number;
  overdueText: string;
} {
  const target = new Date(targetDateIso).getTime();
  const ref = new Date(referenceDateIso).getTime();
  const diffMs = target - ref;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const overdueInfo = getOverdueDurationString(targetDateIso, referenceDateIso);
    return {
      label: overdueInfo.overdueText,
      isOverdue: true,
      isToday: false,
      isSoon: false,
      diffDays,
      overdueText: overdueInfo.overdueText,
    };
  }

  if (Math.abs(diffHours) <= 24 && Math.abs(diffDays) === 0) {
    return {
      label: 'Due today',
      isOverdue: false,
      isToday: true,
      isSoon: true,
      diffDays,
      overdueText: '',
    };
  }

  if (diffDays === 1) {
    return {
      label: 'Tomorrow',
      isOverdue: false,
      isToday: false,
      isSoon: true,
      diffDays,
      overdueText: '',
    };
  }

  if (diffDays > 1 && diffDays <= 5) {
    return {
      label: `In ${diffDays} days`,
      isOverdue: false,
      isToday: false,
      isSoon: true,
      diffDays,
      overdueText: '',
    };
  }

  if (diffDays > 5) {
    return {
      label: `In ${diffDays} days`,
      isOverdue: false,
      isToday: false,
      isSoon: false,
      diffDays,
      overdueText: '',
    };
  }

  return {
    label: 'Now',
    isOverdue: false,
    isToday: true,
    isSoon: true,
    diffDays,
    overdueText: '',
  };
}

/**
 * Generates reverse-engineered milestones for an event based on specific rules & context
 */
export function generateHeuristicMilestones(
  event: Partial<CalendarEvent>,
  eventId: string,
  eventDate: string,
  eventTime: string = '19:00'
): TMinusMilestone[] {
  const milestones: TMinusMilestone[] = [];
  const category = event.category || 'custom';
  const context = event.context || {};

  const addMilestone = (
    label: string,
    offsetMinutes: number,
    title: string,
    cat: MilestoneCategory,
    description?: string,
    customBaseDate?: string
  ) => {
    const baseDate = customBaseDate || eventDate;
    const calcDate = calculateOffsetDate(baseDate, eventTime, offsetMinutes);
    milestones.push({
      id: `ms-${eventId}-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now() % 100000}-${Math.random().toString(36).substring(2, 5)}`,
      eventId,
      tMinusLabel: label,
      tMinusOffsetMinutes: offsetMinutes,
      calculatedDate: calcDate,
      title,
      description,
      category: cat,
      status: 'pending',
    });
  };

  if (category === 'birthday_party') {
    // 1. Invitations & RSVPs Baseline
    if (context.skipInvites !== true && context.invitationsSent !== true) {
      addMilestone('T-21d', -21 * 24 * 60, 'Send invitations & track RSVPs', 'booking', 'Send out party invitations, collect RSVPs, and confirm headcount');
    }

    // 2. Group Gift vs Solo Gift vs None
    if (context.giftType === 'none' || context.noGift === true) {
      // Skip gift milestones
    } else if (context.giftType === 'group') {
      addMilestone('T-30d', -30 * 24 * 60, 'Initiate pot & rally team', 'gift', 'Reach out to friends, set up money pool, brainstorm main group present');
      addMilestone('T-10d', -10 * 24 * 60, 'Purchase group gift', 'shopping', 'Finalize collection and place order for group present');
    } else if (context.giftType === 'solo') {
      addMilestone('T-14d', -14 * 24 * 60, 'Order gift', 'shopping', 'Select and order solo birthday gift online with delivery margin');
      addMilestone('T-2d', -2 * 24 * 60, 'Wrapping & card check', 'prep', 'Wrap present, write birthday card, ensure tags and tape are ready');
    } else {
      // Default baseline solo gift if not yet refined
      addMilestone('T-14d', -14 * 24 * 60, 'Order or brainstorm birthday gift', 'shopping', 'Select and order birthday gift with shipping buffer');
      addMilestone('T-2d', -2 * 24 * 60, 'Wrap gift & prepare birthday card', 'prep', 'Wrap gift, write heartfelt birthday card, and check ribbon/tags');
    }

    // 3. Themed / Costume Check
    if (context.isThemed === true || context.isThemed === 'true' || context.theme) {
      const themeDesc = context.theme ? `Outfit theme: ${context.theme}` : 'Source costume or outfit accessories';
      addMilestone('T-14d', -14 * 24 * 60, 'Source costume / outfit', 'costume', themeDesc);
    }

    // 4. Food & Drinks Refinements (Custom bakery cake, standard cake, restaurant, bar, catering, home cooking, or baseline)
    const foodChoice = context.foodPlan || context.foodOrCake || context.cakeStrategy;
    if (foodChoice === 'custom_cake' || foodChoice === 'cake') {
      addMilestone('T-7d', -7 * 24 * 60, 'Order custom bakery cake', 'shopping', 'Confirm bakery order, flavor, custom design, and pickup window');
      addMilestone('T-4h', -240, 'Pick up birthday cake & refrigerate', 'prep', 'Retrieve cake from bakery and store in cool fridge until party');
    } else if (foodChoice === 'standard_cake') {
      addMilestone('T-1d', -1 * 24 * 60, 'Buy birthday cake & candles', 'shopping', 'Pick up fresh cake, candles, and matches from bakery/store');
    } else if (foodChoice === 'restaurant') {
      addMilestone('T-14d', -14 * 24 * 60, 'Reserve restaurant table', 'booking', 'Book restaurant table for party group and confirm dietary requirements');
    } else if (foodChoice === 'bar') {
      addMilestone('T-14d', -14 * 24 * 60, 'Reserve bar / lounge area', 'booking', 'Book reserved area or table at bar/lounge and confirm guest list');
    } else if (foodChoice === 'catering') {
      addMilestone('T-7d', -7 * 24 * 60, 'Confirm party catering order', 'booking', 'Lock in food platters/catering menu and dietary counts');
      addMilestone('T-3h', -180, 'Catering delivery & food setup', 'prep', 'Receive food delivery, set up chafing dishes and serving utensils');
    } else if (foodChoice === 'home_cooking' || foodChoice === 'homemade') {
      addMilestone('T-2d', -2 * 24 * 60, 'Party food & drink grocery run', 'shopping', 'Buy party food, fresh ingredients, mixers, and ice');
      addMilestone('T-4h', -240, 'Food prep & chill drinks', 'prep', 'Prepare appetizer platters and chill beverages on ice');
    } else {
      // Robust baseline food, cake & refreshments for any birthday celebration
      addMilestone('T-7d', -7 * 24 * 60, 'Order birthday cake & plan refreshments', 'shopping', 'Confirm bakery order or party food, snacks, and drink options');
      addMilestone('T-1d', -1 * 24 * 60, 'Party beverages, snacks & ice run', 'shopping', 'Pick up party drinks, mixers, party snacks, and fresh ice bags');
      addMilestone('T-3h', -180, 'Party setup & beverage chill', 'prep', 'Chill drinks on ice, set up gift table, and light party ambiance');
    }

    // 5. Transport & Arrival Logistics
    if (context.transportType === 'taxi' || context.transportType === 'rideshare') {
      addMilestone('T-2h', -120, 'Pre-book taxi / rideshare', 'logistics', 'Book taxi with 20min buffer to guarantee timely party arrival');
    } else if (context.transportType === 'carpool' || context.transportType === 'rental') {
      addMilestone('T-7d', -7 * 24 * 60, 'Coordinate carpool / vehicle', 'logistics', 'Confirm vehicle, designated driver schedule, and parking space');
      addMilestone('T-2h', -120, 'Vehicle departure & parking check', 'logistics', 'Gas check, load party gear, navigate to venue');
    } else if (context.transportType === 'transit') {
      addMilestone('T-1d', -1 * 24 * 60, 'Check train / transit timetables', 'logistics', 'Verify weekend rail/bus schedules and travel tickets');
      addMilestone('T-2h', -120, 'Head to transit station', 'logistics', 'Allow 15min transit buffer for connections');
    } else {
      addMilestone('T-1h', -60, 'Departure buffer & arrival check', 'logistics', 'Gather gifts and card, coordinate travel, and arrive on time');
    }

    // Other Reservations & Party Vendors Checklist (Photographer, DJ, Balloons, Projector, Speech, Custom items)
    const neededItems: string[] = Array.isArray(context.neededItems) 
      ? context.neededItems 
      : typeof context.neededItems === 'string' 
        ? context.neededItems.split(',').map(s => s.trim()).filter(Boolean) 
        : [];

    const hasItem = (name: string) => neededItems.some(item => item.toLowerCase().includes(name.toLowerCase()));

    // Speech / Toast / Presentation
    if (hasItem('speech') || hasItem('toast') || hasItem('talk') || hasItem('presentation') || 
        (context.customNote && /speech|toast|talk/i.test(context.customNote))) {
      addMilestone('T-5d', -5 * 24 * 60, 'Draft speech outline & memories', 'prep', 'Write down key memories, funny anecdotes, thank-yous, and timing for the birthday toast/speech');
      addMilestone('T-1d', -1 * 24 * 60, 'Rehearse speech timing & delivery', 'prep', 'Rehearse speech (keep to 2-3 min runtime) and coordinate microphone/cue with host or DJ');
    }

    // Photographer
    if (hasItem('photographer') || hasItem('photo') || context.photographer) {
      addMilestone('T-21d', -21 * 24 * 60, 'Book event photographer', 'booking', 'Confirm photographer rate, hours, key moments, and shot list');
    }

    // DJ / Music / Sound
    if (hasItem('dj') || hasItem('music') || hasItem('sound') || context.dj) {
      addMilestone('T-21d', -21 * 24 * 60, 'Book DJ & sound setup', 'booking', 'Reserve DJ / audio equipment, and curate playlist favorites & do-not-play list');
    }

    // Balloons & Decor
    if (hasItem('balloon') || hasItem('decor')) {
      addMilestone('T-5d', -5 * 24 * 60, 'Order balloon decor & party supplies', 'shopping', 'Order balloon arrangements, banners, tableware, and lighting');
      addMilestone('T-3h', -180, 'Pick up / inflate balloons & decorate', 'prep', 'Set up balloon arch, party signs, and table decor');
    }

    // Projector / Screen / AV
    if (hasItem('projector') || hasItem('screen') || hasItem('slideshow') || hasItem('av')) {
      addMilestone('T-3d', -3 * 24 * 60, 'Test projector & slideshow video', 'prep', 'Test projector, HDMI/AirPlay adapters, audio jack, and photo slideshow file');
      addMilestone('T-2h', -120, 'Set up projector screen & sound check', 'logistics', 'Position projector, focus lens, and run test video');
    }

    // Table Reservation (if added as vendor/reservation item)
    if (hasItem('table') || hasItem('reservation')) {
      addMilestone('T-14d', -14 * 24 * 60, 'Reserve table / venue area', 'booking', 'Book table/space for party headcount and confirm reservation');
    }

    // Custom items added by user (e.g. Karaoke, Magician, Florist, Games)
    neededItems.forEach(item => {
      const lower = item.toLowerCase();
      if (!lower.includes('photo') && !lower.includes('dj') && !lower.includes('table') && 
          !lower.includes('balloon') && !lower.includes('projector') && !lower.includes('screen') && 
          !lower.includes('music') && !lower.includes('decor') && !lower.includes('reservation') && 
          !lower.includes('speech') && !lower.includes('toast') && !lower.includes('talk') &&
          !lower.includes('cake') && !lower.includes('transport') &&
          item.trim().length > 0) {
        addMilestone('T-4d', -4 * 24 * 60, `Arrange & prep: ${item.trim()}`, 'prep', `Coordinate logistics, equipment, and confirmation for ${item.trim()} ahead of party`);
      }
    });

    // Custom Note / Anything else
    if (context.customNote && context.customNote.trim() && !/speech|toast|talk/i.test(context.customNote)) {
      addMilestone('T-3d', -3 * 24 * 60, `Prep: ${context.customNote.trim()}`, 'prep', `User specified prep: ${context.customNote.trim()}`);
    }
  } 
  else if (category === 'hosting_visitors') {
    if (context.diningRestaurant !== false && context.diningRestaurant !== 'false') {
      addMilestone('T-30d', -30 * 24 * 60, 'Make restaurant / pub dinner reservations', 'booking', 'Book popular dinner tables and dining spots in advance');
    }
    if (context.activityTouristSpots !== false && context.activityTouristSpots !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Plan tourist spots, city walks & tickets', 'booking', 'Research and book museum tickets, city highlights, and sightseeing itineraries');
    }
    if (context.recommendAccommodation === true || context.recommendAccommodation === 'true') {
      addMilestone('T-14d', -14 * 24 * 60, 'Recommend accommodation / nearby boutique hotels & Airbnb', 'booking', 'Research and share nearby boutique hotels or Airbnb options for visitor overflow');
    }
    if (context.activityHiking === true || context.activityHiking === 'true') {
      addMilestone('T-14d', -14 * 24 * 60, 'Plan hiking trails & outdoor gear check', 'prep', 'Choose hiking routes, check weather forecasts, and prep walking boots / daypacks');
    }
    if (context.diningHomeCooked !== false && context.diningHomeCooked !== 'false') {
      addMilestone('T-7d', -7 * 24 * 60, 'Plan home-cooked dinners & menus', 'prep', 'Plan home-cooked meal menus, dietary preferences, and grocery lists');
    }
    if (context.activityBoardGames !== false && context.activityBoardGames !== 'false') {
      addMilestone('T-7d', -7 * 24 * 60, 'Prepare board games, movie night & pub quiz', 'prep', 'Organize board game collection, movie watchlist, or local pub trivia schedule');
    }
    addMilestone('T-7d', -7 * 24 * 60, 'Confirm headcount & arrival schedule', 'prep', 'Verify arrival times, transport tickets, and dietary restrictions');
    if (context.diningBreakfastHouse !== false && context.diningBreakfastHouse !== 'false') {
      addMilestone('T-3d', -3 * 24 * 60, 'Stock breakfast & coffee groceries in-house', 'shopping', 'Stock fresh bread, coffee, fruit, and breakfast essentials for mornings at home');
    }
    if (context.stayGuestRoom !== false && context.stayGuestRoom !== 'false') {
      addMilestone('T-1d', -1 * 24 * 60, 'Guest room prep & clean sheets', 'prep', 'Fresh linens, guest towels, check Wi-Fi details, room ventilation');
    }
  } 
  else if (category === 'booking_trip') {
    if (context.needFlights !== false && context.needFlights !== 'false') {
      addMilestone('T-45d', -45 * 24 * 60, 'Book flights & compare airline prices', 'booking', 'Search flight options, check luggage allowances, and secure tickets');
    }
    if (context.needHotel !== false && context.needHotel !== 'false') {
      addMilestone('T-30d', -30 * 24 * 60, 'Book hotel / accommodation & check cancellation', 'booking', 'Reserve hotel rooms or Airbnb accommodation with flexible cancellation');
    }
    if (context.needRentalCar !== false && context.needRentalCar !== 'false') {
      addMilestone('T-30d', -30 * 24 * 60, 'Reserve rental car & check insurance', 'booking', 'Book rental car pickup/drop-off at destination airport/station and verify insurance coverage');
    }
    addMilestone('T-14d', -14 * 24 * 60, 'Confirm all bookings & print vouchers', 'prep', 'Verify flight tickets, hotel confirmation codes, and rental car vouchers');
  }
  else if (category === 'festival_concert') {
    // Unconfirmed ticket watchpoint is handled separately in watchpoints, but if camping/travel is needed:
    if (context.isCamping !== false) {
      addMilestone('T-60d', -60 * 24 * 60, 'Gear check & transport logistics', 'logistics', 'Inspect tent, sleeping mats, power banks, and coordinate group travel');
      addMilestone('T-14d', -14 * 24 * 60, 'Festival packing list & outfit check', 'costume', 'Finalize weather-appropriate gear, wellies, earplugs, and schedule');
    } else {
      addMilestone('T-14d', -14 * 24 * 60, 'Tickets & transport verification', 'booking', 'Confirm ticket barcode/app access, parking pass or train tickets');
    }
    addMilestone('T-2d', -2 * 24 * 60, 'Final supply run (batteries, hydration, essentials)', 'shopping', 'Hydration packs, portable chargers, poncho, blister packs');
    addMilestone('T-2h', -120, 'Pre-departure check & meeting spot', 'logistics', 'Assemble with group at designated landmark/gate');
  } 
  else if (category === 'project_deadline') {
    // Stakeholder Review
    if (context.stakeholderReview === 'client') {
      addMilestone('T-14d', -14 * 24 * 60, 'Stakeholder / Client review & feedback lock', 'review', 'Deliver draft milestones, secure client feedback, and freeze requirements');
    } else if (context.stakeholderReview === 'internal') {
      addMilestone('T-7d', -7 * 24 * 60, 'Internal team demo & feedback sprint', 'review', 'Host cross-functional team walk-through to catch blockers');
    } else {
      addMilestone('T-10d', -10 * 24 * 60, 'Deliverable draft & progress sync', 'review', 'Review milestone progress against delivery targets');
    }

    // QA & Test Freeze
    if (context.qaFreeze !== 'skip') {
      addMilestone('T-7d', -7 * 24 * 60, 'Feature freeze & QA regression cycle', 'work', 'Lock code changes, execute critical test suites, and patch high-priority bugs');
    }

    // Marketing & Launch Collateral
    if (context.marketingCollateral === 'press' || context.marketingCollateral === 'public') {
      addMilestone('T-3d', -3 * 24 * 60, 'Marketing assets & release announcement sign-off', 'marketing', 'Finalize blog post, press collateral, social copy, and product screenshots');
    } else if (context.marketingCollateral === 'docs') {
      addMilestone('T-2d', -2 * 24 * 60, 'Release notes & user documentation final check', 'marketing', 'Publish changelog, updated help docs, and internal training guides');
    }

    // Deployment & Runbook
    addMilestone('T-1d', -1 * 24 * 60, 'Deployment runbook & roll-back rehearsal', 'logistics', 'Verify staging environment, database migrations, credentials, and backup status');
    addMilestone('T-2h', -120, 'Go/No-Go launch check & team standup', 'logistics', 'Conduct final operational sync, monitor alarms, and execute release sequence');
  }
  else if (category === 'travel_trip') {
    if (context.needPassportRenewal === true || context.needPassportRenewal === 'true') {
      addMilestone('T-60d', -60 * 24 * 60, 'Passport validity & renewal check', 'booking', 'Verify passport has 6+ months validity remaining and initiate renewal if expiring soon');
    }
    if (context.needVisa === true || context.needVisa === 'true') {
      addMilestone('T-45d', -45 * 24 * 60, 'Entry visa & e-visa application', 'booking', 'Submit required travel visa applications and entry permits');
    }
    if (context.bookingStatus !== 'done') {
      addMilestone('T-30d', -30 * 24 * 60, 'Flights, trains & hotel reservation lock', 'booking', 'Lock transport legs, accommodations, and travel insurance coverage');
    }
    // Separate Activity Checklists
    if (context.activitySightseeing !== false && context.activitySightseeing !== 'false') {
      addMilestone('T-21d', -21 * 24 * 60, 'Book guided city tours & museum tickets', 'booking', 'Secure tickets and time slots for popular museums, city tours & excursions');
    }
    if (context.activityHikingExcursion === true || context.activityHikingExcursion === 'true') {
      addMilestone('T-21d', -21 * 24 * 60, 'Plan hiking trails & outdoor routes', 'prep', 'Map out hiking trails, check weather forecasts, and download offline maps');
    }
    if (context.activityWaterSports === true || context.activityWaterSports === 'true') {
      addMilestone('T-21d', -21 * 24 * 60, 'Book beach, snorkel & water sports excursions', 'booking', 'Reserve boat tours, snorkel gear rentals, or water activity spots');
    }

    // Separate Gear Buying Checklists with Examples (sunscreen, hiking boots, snorkel gear, adapters)
    if (context.gearSunscreen !== false && context.gearSunscreen !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy sunscreen & beach essentials (e.g. SPF 50, hats)', 'shopping', 'Purchase reef-safe sunscreen, sunglasses, and beach wear');
    }
    if (context.gearHikingBoots !== false && context.gearHikingBoots !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy hiking boots & outdoor gear (e.g. wool socks)', 'shopping', 'Break in hiking boots, purchase moisture-wicking socks and daypacks');
    }
    if (context.gearSnorkelGear === true || context.gearSnorkelGear === 'true') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy snorkel gear & water accessories', 'shopping', 'Purchase travel snorkel mask, dry bag, and quick-dry towels');
    }
    if (context.gearSkiGear === true || context.gearSkiGear === 'true') {
      addMilestone('T-14d', -14 * 24 * 60, 'Rent ski gear & pack thermal layers (e.g. goggles, base layers)', 'shopping', 'Reserve skis/snowboard equipment rentals, pack thermal base layers, helmets, and ski goggles');
    }
    if (context.gearAdapters !== false && context.gearAdapters !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy universal power adapters & chargers', 'shopping', 'Acquire country-specific electrical plug adapters and portable power banks');
    }

    addMilestone('T-3d', -3 * 24 * 60, 'Packing essentials & roaming setup', 'prep', 'Pack weather apparel, toiletries, and activate roaming/eSIM');
    addMilestone('T-1d', -1 * 24 * 60, 'Online check-in & out-of-office setup', 'logistics', 'Check in for flights 24h prior, download offline maps, and set email out-of-office');
    const returnBaseDate = context.returnDate || eventDate;
    addMilestone('T-Return-1d', -1 * 24 * 60, 'Return trip prep & flight status check', 'logistics', 'Verify return flight status, pack return luggage, and plan hotel check-out', returnBaseDate);
    addMilestone('T-2h', -120, 'Departure buffer & home lockup', 'logistics', 'Final luggage zip, lock house, travel to airport / terminal');
    if (context.customNote && context.customNote.trim()) {
      addMilestone('T-5d', -5 * 24 * 60, `Travel prep: ${context.customNote.trim()}`, 'prep', `Travel custom requirement: ${context.customNote.trim()}`);
    }
    if (Array.isArray(context.customItems)) {
      context.customItems.forEach((ci: string, idx: number) => {
        if (ci && ci.trim()) {
          addMilestone(`T-${4 + idx}d`, -(4 + idx) * 24 * 60, `Task: ${ci.trim()}`, 'prep', `Custom user task: ${ci.trim()}`);
        }
      });
    }
  } 
  else if (category === 'subscription') {
    addMilestone('T-14d', -14 * 24 * 60, 'Review terms & cancellation notice window', 'prep', 'Check provider cancellation policy, minimum notice period, and renewal billing date');
    addMilestone('T-7d', -7 * 24 * 60, 'Export account data & download invoices', 'admin', 'Save necessary receipts, payment history, or user data before account closure');
    addMilestone('T-3d', -3 * 24 * 60, 'Submit formal cancellation request', 'booking', 'Execute cancellation via customer portal, support chat, or registered email');
    addMilestone('T-0d', 0, 'Verify cancellation & prevent future charges', 'admin', 'Confirm cancellation receipt email and verify credit card is not charged');
  }
  else if (category === 'maintenance') {
    addMilestone('T-10d', -10 * 24 * 60, 'Schedule service appointment or order parts', 'booking', 'Book slot at garage/service provider or order DIY replacement filters/fluids');
    addMilestone('T-3d', -3 * 24 * 60, 'Confirm appointment & quote', 'logistics', 'Confirm drop-off timing, estimated duration, and scope of maintenance work');
    addMilestone('T-1d', -1 * 24 * 60, 'Pre-service preparation', 'prep', 'Clear vehicle boot / clear access around HVAC unit and gather service manual / keys');
    addMilestone('T-0d', 0, 'Service execution & invoice check', 'prep', 'Complete service, record maintenance log, and verify service indicator reset');
  }
  else if (category === 'dinner_social') {
    addMilestone('T-14d', -14 * 24 * 60, 'Send invites & confirm dietary requirements', 'booking', 'Gather RSVPs and note allergies');
    addMilestone('T-3d', -3 * 24 * 60, 'Grocery run & wine selection', 'shopping', 'Buy non-perishables, wine, table decor');
    addMilestone('T-1d', -1 * 24 * 60, 'Prep ingredients & playlist', 'prep', 'Marinate, chop aromatics, set mood lighting and music');
    addMilestone('T-2h', -120, 'Chilling drinks & table setting', 'prep', 'Ice wine, set table, warm serving dishes');
  } 
  else {
    // Custom generic event
    addMilestone('T-14d', -14 * 24 * 60, 'Initial planning & calendar lock', 'booking', 'Confirm agenda, reservations, and participant availability');
    addMilestone('T-3d', -3 * 24 * 60, 'Supplies & logistical alignment', 'shopping', 'Acquire necessary materials or gear');
    addMilestone('T-1d', -1 * 24 * 60, 'Final confirmation & checklist', 'prep', 'Double-check times, documents, and contacts');
    addMilestone('T-2h', -120, 'Immediate prep & transit check', 'logistics', 'Check traffic and prepare departure');
  }

  // Support customItems across all presets & event categories
  if (Array.isArray(context.customItems)) {
    context.customItems.forEach((ci: string, idx: number) => {
      if (ci && typeof ci === 'string' && ci.trim()) {
        const itemText = ci.trim();
        const title = `Task: ${itemText}`;
        if (!milestones.some(m => m.title.toLowerCase() === title.toLowerCase() || m.title.toLowerCase().includes(itemText.toLowerCase()))) {
          const offsetDays = Math.max(1, 5 - idx);
          addMilestone(`T-${offsetDays}d`, -offsetDays * 24 * 60, title, 'prep', `Custom user task: ${itemText}`);
        }
      }
    });
  }

  // Sort milestones chronologically (earliest first, which means largest negative offset first)
  return milestones.sort((a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime());
}

/**
 * Generate iCalendar (.ics) string for the event and all its reverse-engineered milestones
 */
export function generateICSContent(event: CalendarEvent): string {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  
  const formatDateToICS = (isoDateStr: string) => {
    const d = new Date(isoDateStr);
    if (isNaN(d.getTime())) return '20260901T120000Z';
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      'Z'
    );
  };

  const nowICS = formatDateToICS(new Date().toISOString());

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AheadOfTime Preparation Assistant//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${event.title} + AheadOfTime Milestones`,
  ];

  // Main Event
  const mainEventStart = `${event.eventDate}T${event.eventTime || '19:00'}:00`;
  const mainEventEnd = `${event.eventDate}T${event.eventTime ? addHours(event.eventTime, 3) : '22:00'}:00`;
  
  ics.push('BEGIN:VEVENT');
  ics.push(`UID:main-${event.id}@aheadoftime.app`);
  ics.push(`DTSTAMP:${nowICS}`);
  ics.push(`DTSTART:${formatDateToICS(mainEventStart)}`);
  ics.push(`DTEND:${formatDateToICS(mainEventEnd)}`);
  ics.push(`SUMMARY:🎯 ${event.title}`);
  ics.push(`DESCRIPTION:Event prepared with AheadOfTime.\\nStatus: ${event.status}\\nCategory: ${event.category}`);
  if (event.location) ics.push(`LOCATION:${event.location}`);
  ics.push('STATUS:CONFIRMED');
  ics.push('END:VEVENT');

  // Milestone Events
  event.milestones.forEach((ms) => {
    const msStart = ms.calculatedDate;
    const msEnd = calculateOffsetDate(
      ms.calculatedDate.substring(0, 10),
      ms.calculatedDate.substring(11, 16) || '10:00',
      30
    );

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${ms.id}@aheadoftime.app`);
    ics.push(`DTSTAMP:${nowICS}`);
    ics.push(`DTSTART:${formatDateToICS(msStart)}`);
    ics.push(`DTEND:${formatDateToICS(msEnd)}`);
    ics.push(`SUMMARY:[${ms.tMinusLabel}] ${ms.title} (${event.title})`);
    ics.push(`DESCRIPTION:AheadOfTime Milestone for ${event.title}\\nCategory: ${ms.category}\\nDetail: ${ms.description || 'Milestone action'}`);
    ics.push('STATUS:CONFIRMED');
    ics.push('BEGIN:VALARM');
    ics.push('ACTION:DISPLAY');
    ics.push(`DESCRIPTION:Reminder: ${ms.title} (${ms.tMinusLabel})`);
    ics.push('TRIGGER:-PT15M');
    ics.push('END:VALARM');
    ics.push('END:VEVENT');
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

function addHours(timeStr: string, hoursToAdd: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const newH = ((h || 0) + hoursToAdd) % 24;
  return `${newH < 10 ? '0' + newH : newH}:${m < 10 ? '0' + m : m || '00'}`;
}

/**
 * Format a WhatsApp / Telegram copyable markdown schedule
 */
export function formatMessagingSummary(event: CalendarEvent): string {
  const lines: string[] = [];
  lines.push(`📅 *${event.title.toUpperCase()}*`);
  lines.push(`🗓 *Date:* ${formatDisplayDate(event.eventDate)} ${event.eventTime ? `at ${event.eventTime}` : ''}`);
  if (event.location) lines.push(`📍 *Location:* ${event.location}`);
  lines.push('');
  lines.push(`⏳ *REVERSE-ENGINEERED T-MINUS TIMELINE:*`);
  
  if (event.milestones.length === 0) {
    if (event.watchpoint) {
      lines.push(`🔍 *Watchpoint Active:* ${event.watchpoint.expectedAction}`);
      lines.push(`⏰ *Target Window:* ${event.watchpoint.targetAnnouncementWindow}`);
    } else {
      lines.push(`• Milestone schedule pending intake confirmation.`);
    }
  } else {
    event.milestones.forEach((ms) => {
      const check = ms.status === 'completed' ? '✅' : '⏳';
      const formattedDate = formatDisplayDate(ms.calculatedDate, true);
      lines.push(`${check} *${ms.tMinusLabel}* (${formattedDate}) — ${ms.title}`);
      if (ms.description) {
        lines.push(`   _${ms.description}_`);
      }
    });
  }

  lines.push('');
  lines.push(`_Generated by AheadOfTime Preparation Assistant_`);
  return lines.join('\n');
}
