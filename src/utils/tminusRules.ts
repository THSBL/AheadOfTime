import { 
  CalendarEvent, 
  TMinusMilestone, 
  MilestoneCategory, 
  IntakeQuestion, 
  EventCategory,
  MacroEventData,
  SubEvent,
  StructuredMilestone,
  StructuredPlanningPayload,
  UserEventRole,
  TaskItemKind,
  Deliverable,
  DeliverableType
} from '../types.js';
import { inferTaskTimingLocally } from './timingAI.js';

/**
 * Automatically detects an event category from its title, summary, or description
 */
export function detectEventCategory(title: string, description?: string): EventCategory {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  
  if (/\b(soccer|football|basketball|baseball|softball|hockey|lacrosse|rugby|tennis|swimming|swim|karate|judo|taekwondo|martial arts|dance|ballet|gymnastics|cheerleading|piano|violin|guitar|choir|band|recital|tournament|championship|match|meet|game|practice|rehearsal|scouts?|athletics|cross country|track)\b/i.test(combined)) {
    return 'kids_hobbies';
  }
  if (/\b(school|science fair|book week|spirit day|spelling bee|math olympiad|open house|pta|parent-teacher|report card|homework|field trip|class project|grade|kindergarten|elementary|high school|exam|school play|costume parade|revision)\b/i.test(combined)) {
    return 'kids_school';
  }
  if (/wedding|marriage|matrimony|ceremony|reception|anniversary|celebration|gala|graduation|baptism|christening|shower|party|birthday|bday|b-day|turning \d+|sweet 16|bar mitzvah|bat mitzvah|\bparty\b/i.test(combined)) {
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
 * Safely parses the event date & time into a millisecond epoch timestamp for chronological calculations.
 */
export function getEventDateTimestamp(event: { eventDate?: string; eventTime?: string }): number {
  if (!event.eventDate) return Number.MAX_SAFE_INTEGER;
  // If eventDate is already a full ISO string (with T or Z)
  if (event.eventDate.includes('T')) {
    const ts = new Date(event.eventDate).getTime();
    if (!isNaN(ts)) return ts;
  }
  // Otherwise parse date + optional time (default to 09:00 if not specified)
  const time = event.eventTime && event.eventTime.length >= 4 ? event.eventTime : '09:00';
  const ts = new Date(`${event.eventDate}T${time.length === 5 ? time : '09:00'}:00`).getTime();
  if (!isNaN(ts)) return ts;
  const fallback = new Date(event.eventDate).getTime();
  return isNaN(fallback) ? Number.MAX_SAFE_INTEGER : fallback;
}

/**
 * Sorts active calendar events chronologically from shortly upcoming (nearest in time)
 * to further away in the future.
 * Upcoming events are sorted ascending (nearest upcoming first).
 * Past events are placed afterwards in descending order (most recent past first).
 */
export function sortEventsUpcomingFirst<T extends CalendarEvent>(events: T[], referenceDateStr?: string): T[] {
  if (!events || events.length <= 1) return events;

  let refTimestamp = Date.now();
  if (referenceDateStr) {
    const parsedRef = referenceDateStr.includes('T') 
      ? new Date(referenceDateStr).getTime() 
      : new Date(`${referenceDateStr}T00:00:00`).getTime();
    if (!isNaN(parsedRef)) {
      refTimestamp = parsedRef;
    }
  }

  // Grace threshold for "today" (beginning of the reference day minus 12 hours buffer)
  const todayThreshold = refTimestamp - (12 * 60 * 60 * 1000);

  return [...events].sort((a, b) => {
    const timeA = getEventDateTimestamp(a);
    const timeB = getEventDateTimestamp(b);

    const isUpcomingA = timeA >= todayThreshold;
    const isUpcomingB = timeB >= todayThreshold;

    // Both are upcoming: sort ascending (closest upcoming first, further away later)
    if (isUpcomingA && isUpcomingB) {
      return timeA - timeB;
    }
    // Upcoming event comes before past event
    if (isUpcomingA && !isUpcomingB) {
      return -1;
    }
    if (!isUpcomingA && isUpcomingB) {
      return 1;
    }
    // Both are in the past: sort descending (most recent past first)
    return timeB - timeA;
  });
}

/**
 * Return human-readable event topic / category name
 */
export function getEventTopicLabel(category?: string, context?: any): string {
  if (context?.topic && typeof context.topic === 'string') return context.topic;
  switch (category) {
    case 'birthday_party':
      return 'Birthday Celebration';
    case 'hosting_visitors':
      return 'Hosting Visitors & Guests';
    case 'festival_concert':
      return 'Concert & Festival Event';
    case 'travel_trip':
    case 'booking_trip':
      return 'Travel & Vacation Trip';
    case 'dinner_social':
      return 'Dinner & Social Gathering';
    case 'project_deadline':
      return 'Project & Milestone';
    case 'maintenance':
      return 'Service & Maintenance';
    case 'subscription':
      return 'Subscription Review';
    default:
      return 'Calendar Event';
  }
}

/**
 * Ensures an event title is never generic 'Upcoming Event'
 */
export function getCleanEventTitle(title?: string, category?: string, context?: any): string {
  let cleaned = (title || '').trim();

  // Strip leading emojis or icons if followed by 'Upcoming Event'
  cleaned = cleaned.replace(/^[🎯📅🗓️✨🎉🚀🎈🚗✈️👥]\s*/, '');

  const isGeneric = !cleaned || 
    /^upcoming(\s+event)?$/i.test(cleaned) || 
    /^new(\s+event)?$/i.test(cleaned) ||
    cleaned.toLowerCase() === 'event';

  if (!isGeneric) {
    return cleaned;
  }

  // Look for custom notes or topic hints in context
  if (context?.customNote && typeof context.customNote === 'string' && context.customNote.length < 50) {
    return context.customNote;
  }
  if (context?.who && typeof context.who === 'string') {
    return `${context.who}'s Event`;
  }

  // Fallback to category topic name
  return getEventTopicLabel(category, context);
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
  const role: UserEventRole = event.userRole || context.userRole || 'organiser';

  const addMilestone = (
    label: string,
    offsetMinutes: number,
    title: string,
    cat: MilestoneCategory,
    description?: string,
    customBaseDate?: string,
    kind: TaskItemKind = 'milestone',
    needsRefinement: boolean = false,
    refinementOptions?: string[],
    applicableRoles?: UserEventRole[],
    deliverableType?: string
  ) => {
    // If specific roles are specified and current role is not in the list, skip
    if (applicableRoles && !applicableRoles.includes(role)) {
      return;
    }

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
      kind,
      needsRefinement,
      refinementOptions,
      applicableRoles,
      deliverableType,
    });
  };

  // 0. SPECIALIZED GUEST RUNWAY (When the user's role is guest/attendee)
  if (role === 'guest') {
    if (category === 'birthday_party') {
      addMilestone('T-21d', -21 * 24 * 60, 'RSVP & confirm attendance', 'booking', 'Notify host of attendance and any dietary requirements', undefined, 'deliverable');
      addMilestone('T-14d', -14 * 24 * 60, 'Contribute to gift kitty or choose solo present', 'shopping', 'Send share of group present or order personalized gift', undefined, 'deliverable', true, ['Contribute to Group Money Pool', 'Buy Solo Personalized Gift', 'Bring Flowers / Wine / Card']);
      addMilestone('T-7d', -7 * 24 * 60, 'Check party attire & costume theme', 'costume', 'Ensure clothes match party dress code or costume requirements', undefined, 'milestone');
      addMilestone('T-2d', -2 * 24 * 60, 'Wrap gift & write birthday card', 'prep', 'Write personal card and prepare present packaging', undefined, 'milestone');
      addMilestone('T-1h', -60, 'Departure buffer & arrive at venue', 'logistics', 'Leave with travel buffer and arrive on time for party', undefined, 'milestone');
      return milestones;
    }

    if (category === 'travel_trip' || category === 'booking_trip') {
      addMilestone('T-30d', -30 * 24 * 60, 'Confirm attendance & RSVP to organiser', 'booking', 'Confirm participation and secure room share with trip organiser', undefined, 'deliverable');
      addMilestone('T-21d', -21 * 24 * 60, 'Transfer deposit / kitty share to organiser', 'booking', 'Pay share for lodging and group activity bookings', undefined, 'deliverable');
      addMilestone('T-21d', -21 * 24 * 60, 'Book personal travel / flights & coordinate arrival', 'booking', 'Book transport to match group arrival window', undefined, 'deliverable', true, ['Direct Flight', 'Train / Rail Ticket', 'Carpool with Group', 'Self Driving']);
      addMilestone('T-14d', -14 * 24 * 60, 'Check passport validity & travel insurance', 'prep', 'Verify 6-month passport validity and medical/travel coverage', undefined, 'milestone');
      addMilestone('T-7d', -7 * 24 * 60, 'Check weekend theme dress code & activity gear', 'prep', 'Coordinate group outfits or prepare specific activity footwear', undefined, 'milestone');
      addMilestone('T-3d', -3 * 24 * 60, 'Trip packing essentials & roaming eSIM', 'prep', 'Pack weather attire, toiletries, chargers, and activate data roaming', undefined, 'milestone');
      addMilestone('T-1d', -1 * 24 * 60, 'Online check-in & boarding pass download', 'logistics', 'Check in 24h prior and confirm meeting point with group chat', undefined, 'milestone');
      addMilestone('T-2h', -120, 'Departure buffer & meet group at transit hub', 'logistics', 'Head out with buffer to meet trip crew on time', undefined, 'milestone');
      return milestones;
    }

    if (category === 'dinner_social') {
      addMilestone('T-14d', -14 * 24 * 60, 'RSVP & communicate dietary preferences', 'booking', 'Confirm seat at dinner and list any food allergies', undefined, 'deliverable');
      addMilestone('T-1d', -1 * 24 * 60, 'Pick up wine, beverage, or dessert to share', 'shopping', 'Select wine or host dessert contribution', undefined, 'deliverable', true, ['Bottle of Fine Wine', 'Craft Beer / Cider Selection', 'Artisan Bakery Dessert', 'Flowers / Host Gift']);
      addMilestone('T-2h', -120, 'Outfit check & prep departure', 'prep', 'Dress comfortably and check restaurant address', undefined, 'milestone');
      addMilestone('T-30m', -30, 'Departure buffer & arrive at venue', 'logistics', 'Arrive on time to meet dining companions', undefined, 'milestone');
      return milestones;
    }
  }

  const isWedding = /\b(wedding|marriage|matrimony|bridal|reception)\b/i.test(event.title || '') ||
    /\b(wedding|marriage|matrimony|bridal)\b/i.test(context.customNote || '') ||
    (category === 'custom' && /\bwedding\b/i.test(event.title || ''));

  if (isWedding) {
    // WEDDINGS & MAJOR CEREMONIES: Realistic 6-12 month preparation lead times
    addMilestone('T-9m', -270 * 24 * 60, 'Book wedding venue & ceremony location', 'booking', 'Sign venue contract, confirm reception hall and pay deposit', undefined, 'deliverable');
    addMilestone('T-8m', -240 * 24 * 60, 'Buy wedding dress / custom suit & bridal attire', 'shopping', 'Order made-to-measure wedding dress and custom suit to allow 4-6 months production plus alterations', undefined, 'deliverable');
    addMilestone('T-8m', -240 * 24 * 60, 'Book wedding photographer & videographer', 'booking', 'Lock in full-day photography and videography coverage', undefined, 'deliverable');
    addMilestone('T-7m', -210 * 24 * 60, 'Book wedding caterer & schedule menu tasting', 'booking', 'Select caterer, review bar packages and schedule tasting session', undefined, 'deliverable');
    addMilestone('T-6m', -180 * 24 * 60, 'Send Save the Dates & hotel block info', 'prep', 'Give guests 6 months notice to arrange travel and book accommodations', undefined, 'deliverable');
    addMilestone('T-3m', -90 * 24 * 60, 'Send formal wedding invitations & registry', 'booking', 'Send invitations with RSVP deadline and link gift registry', undefined, 'deliverable');
    addMilestone('T-8w', -56 * 24 * 60, 'First dress / suit alteration fitting', 'costume', 'Bring wedding shoes and undergarments for initial tailoring fitting', undefined, 'deliverable');
    addMilestone('T-6w', -42 * 24 * 60, 'Apply for marriage license & legal paperwork', 'admin', 'Submit official marriage license application at city hall / registry', undefined, 'deliverable');
    addMilestone('T-3w', -21 * 24 * 60, 'Final dress fitting & finalize seating chart', 'costume', 'Collect altered wedding dress/suit and arrange table seating plan', undefined, 'deliverable');
    addMilestone('T-2w', -14 * 24 * 60, 'Final headcounts to caterer & song playlist', 'prep', 'Lock final guest counts with kitchen and share song choices with DJ/band', undefined, 'deliverable');
    addMilestone('T-1w', -7 * 24 * 60, 'Rehearsal dinner & wedding party schedule', 'logistics', 'Run ceremony walk-through and host rehearsal dinner', undefined, 'milestone');
    addMilestone('T-1d', -1 * 24 * 60, 'Emergency kit, rings & day-of schedule check', 'prep', 'Pack rings, marriage license, vow books, and day-of emergency bag', undefined, 'milestone');
    return milestones;
  }

  if (category === 'birthday_party') {
    // 1. Invitations & RSVPs Baseline
    if (context.skipInvites !== true && context.invitationsSent !== true) {
      addMilestone('T-21d', -21 * 24 * 60, 'Send invitations & track RSVPs', 'booking', 'Send out party invitations, collect RSVPs, and confirm headcount', undefined, 'deliverable', false, undefined, ['organiser', 'co_organiser']);
    }

    // 2. Group Gift vs Solo Gift vs None
    if (context.giftType === 'none' || context.noGift === true) {
      // Skip gift milestones
    } else if (context.giftType === 'group') {
      addMilestone('T-30d', -30 * 24 * 60, 'Start group gift pool & collect ideas', 'gift', 'Reach out to friends, set up money pool, brainstorm main group present', undefined, 'deliverable', false, undefined, ['organiser', 'co_organiser']);
      addMilestone('T-10d', -10 * 24 * 60, 'Purchase group gift', 'shopping', 'Finalize collection and place order for group present', undefined, 'deliverable', true, ['Main Experience / Voucher', 'Luxury Tech / Watch', 'Custom Keepsake Gift']);
    } else if (context.giftType === 'solo') {
      addMilestone('T-14d', -14 * 24 * 60, 'Order gift', 'shopping', 'Select and order solo birthday gift online with delivery margin', undefined, 'deliverable');
      addMilestone('T-2d', -2 * 24 * 60, 'Wrapping & card check', 'prep', 'Wrap present, write birthday card, ensure tags and tape are ready', undefined, 'milestone');
    } else {
      // Default baseline solo gift if not yet refined
      addMilestone('T-14d', -14 * 24 * 60, 'Order or brainstorm birthday gift', 'shopping', 'Select and order birthday gift with shipping buffer', undefined, 'deliverable');
      addMilestone('T-2d', -2 * 24 * 60, 'Wrap gift & prepare birthday card', 'prep', 'Wrap gift, write heartfelt birthday card, and check ribbon/tags', undefined, 'milestone');
    }

    // 3. Themed / Costume Check
    if (context.isThemed === true || context.isThemed === 'true' || context.theme) {
      const themeDesc = context.theme ? `Outfit theme: ${context.theme}` : 'Source costume or outfit accessories';
      addMilestone('T-14d', -14 * 24 * 60, 'Source costume / outfit', 'costume', themeDesc, undefined, 'milestone');
    }

    // 4. Food & Drinks Refinements (Custom bakery cake, standard cake, restaurant, bar, catering, home cooking, or baseline)
    const foodChoice = context.foodPlan || context.foodOrCake || context.cakeStrategy;
    if (foodChoice === 'custom_cake' || foodChoice === 'cake') {
      addMilestone('T-7d', -7 * 24 * 60, 'Order custom bakery cake', 'shopping', 'Confirm bakery order, flavor, custom design, and pickup window', undefined, 'deliverable', true, ['Chocolate Fudge Layer Cake', 'Red Velvet / Berry', 'Custom Photo / Fondant Cake', 'Gluten-Free / Vegan Cake']);
      addMilestone('T-4h', -240, 'Pick up birthday cake & refrigerate', 'prep', 'Retrieve cake from bakery and store in cool fridge until party', undefined, 'milestone');
    } else if (foodChoice === 'standard_cake') {
      addMilestone('T-1d', -1 * 24 * 60, 'Buy birthday cake & candles', 'shopping', 'Pick up fresh cake, candles, and matches from bakery/store', undefined, 'deliverable');
    } else if (foodChoice === 'restaurant') {
      addMilestone('T-14d', -14 * 24 * 60, 'Reserve restaurant table', 'booking', 'Book restaurant table for party group and confirm dietary requirements', undefined, 'deliverable', true, ['Italian Trattoria', 'Steakhouse & Grill', 'Tapas Sharing Table', 'Asian Fusion']);
    } else if (foodChoice === 'bar') {
      addMilestone('T-14d', -14 * 24 * 60, 'Reserve bar / lounge area', 'booking', 'Book reserved area or table at bar/lounge and confirm guest list', undefined, 'deliverable', true, ['Cocktail Lounge Booth', 'Rooftop Bar Area', 'Craft Beer Brewery Table']);
    } else if (foodChoice === 'catering') {
      addMilestone('T-7d', -7 * 24 * 60, 'Confirm party catering order', 'booking', 'Lock in food platters/catering menu and dietary counts', undefined, 'deliverable', true, ['Finger Food / Canapes', 'BBQ Buffet', 'Taco Bar', 'Charcuterie & Grazing Table']);
      addMilestone('T-3h', -180, 'Catering delivery & food setup', 'prep', 'Receive food delivery, set up chafing dishes and serving utensils', undefined, 'milestone');
    } else if (foodChoice === 'home_cooking' || foodChoice === 'homemade') {
      addMilestone('T-2d', -2 * 24 * 60, 'Party food & drink grocery run', 'shopping', 'Buy party food, fresh ingredients, mixers, and ice', undefined, 'deliverable');
      addMilestone('T-4h', -240, 'Food prep & chill drinks', 'prep', 'Prepare appetizer platters and chill beverages on ice', undefined, 'milestone');
    } else {
      // Robust baseline food, cake & refreshments for any birthday celebration
      addMilestone('T-7d', -7 * 24 * 60, 'Order birthday cake & plan refreshments', 'shopping', 'Confirm bakery order or party food, snacks, and drink options', undefined, 'deliverable', true, ['Custom Bakery Cake', 'Party Finger Food Platters', 'Cocktail & Mocktail Bar']);
      addMilestone('T-1d', -1 * 24 * 60, 'Party beverages, snacks & ice run', 'shopping', 'Pick up party drinks, mixers, party snacks, and fresh ice bags', undefined, 'deliverable');
      addMilestone('T-3h', -180, 'Party setup & beverage chill', 'prep', 'Chill drinks on ice, set up gift table, and light party ambiance', undefined, 'milestone');
    }

    // 5. Transport & Arrival Logistics
    if (context.transportType === 'taxi' || context.transportType === 'rideshare') {
      addMilestone('T-2h', -120, 'Pre-book taxi / rideshare', 'logistics', 'Book taxi with 20min buffer to guarantee timely party arrival', undefined, 'deliverable');
    } else if (context.transportType === 'carpool' || context.transportType === 'rental') {
      addMilestone('T-7d', -7 * 24 * 60, 'Coordinate carpool / vehicle', 'logistics', 'Confirm vehicle, designated driver schedule, and parking space', undefined, 'deliverable');
      addMilestone('T-2h', -120, 'Vehicle departure & parking check', 'logistics', 'Gas check, load party gear, navigate to venue', undefined, 'milestone');
    } else if (context.transportType === 'transit') {
      addMilestone('T-1d', -1 * 24 * 60, 'Check train / transit timetables', 'logistics', 'Verify weekend rail/bus schedules and travel tickets', undefined, 'milestone');
      addMilestone('T-2h', -120, 'Head to transit station', 'logistics', 'Allow 15min transit buffer for connections', undefined, 'milestone');
    } else {
      addMilestone('T-1h', -60, 'Departure buffer & arrival check', 'logistics', 'Gather gifts and card, coordinate travel, and arrive on time', undefined, 'milestone');
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
        const itemText = item.trim();
        const timing = inferTaskTimingLocally(itemText, '', event.title || '');
        const offsetMins = timing.unit === 'weeks'
          ? -timing.amount * 7 * 24 * 60
          : timing.unit === 'hours'
          ? -timing.amount * 60
          : -timing.amount * 24 * 60;
        addMilestone(timing.badge, offsetMins, itemText, timing.category, timing.reason);
      }
    });

    // Custom Note / Anything else
    if (context.customNote && context.customNote.trim() && !/speech|toast|talk/i.test(context.customNote)) {
      const noteText = context.customNote.trim();
      const timing = inferTaskTimingLocally(noteText, '', event.title || '');
      const offsetMins = timing.unit === 'weeks'
        ? -timing.amount * 7 * 24 * 60
        : timing.unit === 'hours'
        ? -timing.amount * 60
        : -timing.amount * 24 * 60;
      addMilestone(timing.badge, offsetMins, `Prep: ${noteText}`, timing.category, timing.reason);
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
    const isStagOrGroupParty = /stag|bachelor|bachelorette|hen|party/i.test(event.title || '') || 
      /stag|bachelor|bachelorette|hen/i.test(context.theme || '') ||
      event.macroEvent?.archetype === 'Stag Party / Bachelor Trip';

    if (context.needPassportRenewal === true || context.needPassportRenewal === 'true') {
      addMilestone('T-60d', -60 * 24 * 60, 'Passport validity & renewal check', 'booking', 'Verify passport has 6+ months validity remaining and initiate renewal if expiring soon', undefined, 'milestone');
    }
    if (context.hasPet === true || context.hasPet === 'true' || /dog|cat|pet|sitter|kennel/i.test(event.title || '') || /dog|cat|pet|sitter/i.test(context.customNote || '')) {
      addMilestone('T-45d', -45 * 24 * 60, 'Book dog sitter / pet boarding', 'booking', 'Book pet sitter or kennel boarding 4-6 weeks in advance before holiday slots fill up', undefined, 'deliverable');
      addMilestone('T-14d', -14 * 24 * 60, 'Pet vaccination check & sitter meet-and-greet', 'prep', 'Verify kennel cough/rabies vaccine records and confirm entry keys with sitter', undefined, 'milestone');
    }
    if (context.needVisa === true || context.needVisa === 'true') {
      addMilestone('T-45d', -45 * 24 * 60, 'Entry visa & e-visa application', 'booking', 'Submit required travel visa applications and entry permits', undefined, 'deliverable');
    }
    if (context.bookingStatus !== 'done') {
      addMilestone(
        'T-30d', 
        -30 * 24 * 60, 
        isStagOrGroupParty ? 'Book flights / group transit & lodging' : 'Flights, trains & hotel reservation lock', 
        'booking', 
        'Lock transport legs, accommodations, and travel insurance coverage',
        undefined,
        'deliverable',
        true,
        isStagOrGroupParty ? ['Group Airbnb / Villa Rental', 'Central Hotel Room Block', 'Budget Hostel Pods', 'Self-booked Individual Lodging'] : ['Hotel / Resort Reservation', 'Airbnb / Vacation Apartment', 'Flight & Hotel Package']
      );
    }

    if (isStagOrGroupParty) {
      addMilestone(
        'T-14d',
        -14 * 24 * 60,
        'Collect group kitty & lock in attendance count',
        'booking',
        'Avoid last-minute dropouts and pool funds for deposits',
        undefined,
        'deliverable',
        false,
        undefined,
        ['organiser', 'co_organiser']
      );
    }

    // Context-Aware Activity Deliverables
    if (context.activitySightseeing !== false && context.activitySightseeing !== 'false') {
      if (isStagOrGroupParty) {
        addMilestone(
          'T-21d',
          -21 * 24 * 60,
          'Shortlist & book group activity (e.g. Karting / Brewery / Boat / Paintball)',
          'booking',
          'Lock in group activity slot, waivers, and deposit with provider',
          undefined,
          'deliverable',
          true,
          [
            'Go-Karting Grand Prix',
            'Paintball / Laser Combat',
            'Private Craft Brewery Tour & VIP Tasting',
            'Private Boat / Yacht Cruise',
            'Axe Throwing & Arcade Bar',
            'Escape Room Tournament',
            'VIP Nightclub Table'
          ],
          ['organiser', 'co_organiser'],
          'activity'
        );

        addMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Reserve group dinner restaurant & confirm table deposit',
          'booking',
          'Book large group dining table with set menu or deposit',
          undefined,
          'deliverable',
          true,
          [
            'Steakhouse & Grill',
            'Craft Beer Pub & Burgers',
            'Tapas & Sharing Platters',
            'Private Dining Room'
          ],
          ['organiser', 'co_organiser'],
          'reservation'
        );
      } else {
        addMilestone(
          'T-21d',
          -21 * 24 * 60,
          'Book activities, tours & excursions',
          'booking',
          'Secure bookings, time slots, and passes for destination activities',
          undefined,
          'deliverable',
          true,
          [
            'Guided City Walking Tour',
            'Museum & Cultural Passes',
            'Boat / Water Excursion',
            'Outdoor Adventure / Hike',
            'Food & Wine Tasting'
          ],
          ['organiser', 'co_organiser'],
          'activity'
        );
      }
    }

    if (context.activityHikingExcursion === true || context.activityHikingExcursion === 'true') {
      addMilestone('T-21d', -21 * 24 * 60, 'Plan hiking trails & outdoor routes', 'prep', 'Map out hiking trails, check weather forecasts, and download offline maps', undefined, 'milestone');
    }
    if (context.activityWaterSports === true || context.activityWaterSports === 'true') {
      addMilestone('T-21d', -21 * 24 * 60, 'Book beach, snorkel & water sports excursions', 'booking', 'Reserve boat tours, snorkel gear rentals, or water activity spots', undefined, 'deliverable', true, ['Jet Ski Tour', 'Scuba Diving / Snorkel Boat', 'Surfing / Paddleboard Session']);
    }

    // Separate Gear Buying Checklists with Examples (sunscreen, hiking boots, snorkel gear, adapters)
    if (context.gearSunscreen !== false && context.gearSunscreen !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy sunscreen & beach essentials (e.g. SPF 50, hats)', 'shopping', 'Purchase reef-safe sunscreen, sunglasses, and beach wear', undefined, 'milestone');
    }
    if (context.gearHikingBoots !== false && context.gearHikingBoots !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy hiking boots & outdoor gear (e.g. wool socks)', 'shopping', 'Break in hiking boots, purchase moisture-wicking socks and daypacks', undefined, 'milestone');
    }
    if (context.gearSnorkelGear === true || context.gearSnorkelGear === 'true') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy snorkel gear & water accessories', 'shopping', 'Purchase travel snorkel mask, dry bag, and quick-dry towels', undefined, 'milestone');
    }
    if (context.gearSkiGear === true || context.gearSkiGear === 'true') {
      addMilestone('T-14d', -14 * 24 * 60, 'Rent ski gear & pack thermal layers (e.g. goggles, base layers)', 'shopping', 'Reserve skis/snowboard equipment rentals, pack thermal base layers, helmets, and ski goggles', undefined, 'deliverable', true, ['Equipment Rental Package', 'Thermal Base Layers & Goggles']);
    }
    if (context.gearAdapters !== false && context.gearAdapters !== 'false') {
      addMilestone('T-14d', -14 * 24 * 60, 'Buy universal power adapters & chargers', 'shopping', 'Acquire country-specific electrical plug adapters and portable power banks', undefined, 'milestone');
    }

    addMilestone('T-3d', -3 * 24 * 60, 'Packing essentials & roaming setup', 'prep', 'Pack clothes, toiletries, chargers, and activate roaming/eSIM', undefined, 'milestone');
    addMilestone('T-1d', -1 * 24 * 60, 'Online check-in & out-of-office setup', 'logistics', 'Check in for flights 24h prior, download offline maps, and set email out-of-office', undefined, 'milestone');
    const returnBaseDate = context.returnDate || eventDate;
    addMilestone('T-Return-1d', -1 * 24 * 60, 'Return trip prep & flight status check', 'logistics', 'Verify return flight status, pack return luggage, and plan hotel check-out', returnBaseDate, 'milestone');
    addMilestone('T-2h', -120, 'Departure buffer & home lockup', 'logistics', 'Final luggage zip, lock house, travel to airport / terminal', undefined, 'milestone');
    if (context.customNote && context.customNote.trim()) {
      addMilestone('T-5d', -5 * 24 * 60, `Travel prep: ${context.customNote.trim()}`, 'prep', `Travel custom requirement: ${context.customNote.trim()}`, undefined, 'milestone');
    }
    if (Array.isArray(context.customItems)) {
      context.customItems.forEach((ci: string, idx: number) => {
        if (ci && ci.trim()) {
          addMilestone(`T-${4 + idx}d`, -(4 + idx) * 24 * 60, `Task: ${ci.trim()}`, 'prep', `Custom user task: ${ci.trim()}`, undefined, 'milestone');
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
  else if (category === 'kids_hobbies') {
    addMilestone('T-14d', -14 * 24 * 60, 'Confirm Registration & Submit Waivers', 'booking', 'Submit player registration and sign medical emergency waiver');
    addMilestone('T-7d', -7 * 24 * 60, 'RSVP & Arrange Transport', 'logistics', 'Coordinate carpooling, venue route, and arrival schedule');
    addMilestone('T-2d', -2 * 24 * 60, 'Pack Uniform & Shinguards', 'prep', 'Clean game jersey, inspect boots/shinguards, and pack snacks');
    addMilestone('T-2h', -120, 'Departure Buffer & Check-In', 'logistics', 'Arrive early at pitch/court for warmups and coach check-in');
  }
  else if (category === 'kids_school') {
    addMilestone('T-14d', -14 * 24 * 60, 'Buy Project Materials & Supplies', 'shopping', 'Buy poster boards, craft supplies, and review rubric requirements');
    addMilestone('T-7d', -7 * 24 * 60, 'Assemble Display Board & Complete Draft', 'prep', 'Mount summaries, graphs, and photos on presentation board');
    addMilestone('T-2d', -2 * 24 * 60, 'Rehearse Presentation & Pack Display', 'prep', 'Run through timed speech rehearsal and pack project securely');
    addMilestone('T-1d', -1 * 24 * 60, 'Sign Permission Slip & Final Pack', 'admin', 'Sign teacher permission form and pack folder into backpack');
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
    context.customItems.forEach((ci: string) => {
      if (ci && typeof ci === 'string' && ci.trim()) {
        const itemText = ci.trim();
        const title = itemText.startsWith('Task:') ? itemText : itemText;
        if (!milestones.some(m => m.title.toLowerCase() === title.toLowerCase() || m.title.toLowerCase().includes(itemText.toLowerCase()))) {
          const timing = inferTaskTimingLocally(itemText, '', event.title || '');
          const offsetMins = timing.unit === 'weeks'
            ? -timing.amount * 7 * 24 * 60
            : timing.unit === 'hours'
            ? -timing.amount * 60
            : -timing.amount * 24 * 60;
          addMilestone(timing.badge, offsetMins, title, timing.category, timing.reason);
        }
      }
    });
  }

  // Sort milestones chronologically (earliest first, which means largest negative offset first)
  const sorted = milestones.sort((a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime());
  return attachDeliverablesToMilestones(sorted);
}

/**
 * Attaches 1 to 3 explicit Deliverables (tangible outputs) to each Milestone Checkpoint gate
 * and formats raw imperative titles into state checkpoint titles.
 */
export function attachDeliverablesToMilestones(rawMilestones: TMinusMilestone[]): TMinusMilestone[] {
  return rawMilestones.map((ms) => {
    // If deliverables already explicitly provided, ensure maximum rule of 1-3 deliverables
    if (ms.deliverables && ms.deliverables.length > 0) {
      return {
        ...ms,
        deliverables: ms.deliverables.slice(0, 3),
      };
    }

    const tLower = (ms.title || '').toLowerCase();
    const deliverables: Deliverable[] = [];

    // Derive 1 to 3 tangible outputs based on the checkpoint topic
    if (tLower.includes('invite') || tLower.includes('rsvp') || tLower.includes('headcount') || tLower.includes('guest')) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Sent invitation links & RSVPs tracked',
        type: 'coordination',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Confirmed headcount & dietary requirements noted',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
    } else if (
      tLower.includes('venue') ||
      tLower.includes('lodging') ||
      tLower.includes('hotel') ||
      tLower.includes('airbnb') ||
      tLower.includes('restaurant') ||
      tLower.includes('table') ||
      tLower.includes('reserve') ||
      tLower.includes('deposit')
    ) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Signed booking confirmation or rental voucher',
        type: 'booking',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Deposit receipt & arrival access code saved',
        type: 'purchase',
        is_completed: ms.status === 'completed',
      });
    } else if (
      tLower.includes('flight') ||
      tLower.includes('transit') ||
      tLower.includes('carpool') ||
      tLower.includes('train') ||
      tLower.includes('tickets')
    ) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Transit tickets & boarding passes downloaded',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Departure times & meeting spot shared with group',
        type: 'coordination',
        is_completed: ms.status === 'completed',
      });
    } else if (
      tLower.includes('gift') ||
      tLower.includes('present') ||
      tLower.includes('card') ||
      tLower.includes('kitty') ||
      tLower.includes('funds')
    ) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Purchased gift receipt & tracking confirmed',
        type: 'purchase',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Handwritten card written & gift wrapped',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
    } else if (
      tLower.includes('cake') ||
      tLower.includes('food') ||
      tLower.includes('drink') ||
      tLower.includes('catering') ||
      tLower.includes('beverage') ||
      tLower.includes('grocery')
    ) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Bakery or catering order confirmed with pickup time',
        type: 'purchase',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Drinks, ice, and glassware ready',
        type: 'purchase',
        is_completed: ms.status === 'completed',
      });
    } else if (
      tLower.includes('soccer') ||
      tLower.includes('shinguard') ||
      tLower.includes('jersey') ||
      tLower.includes('cleat') ||
      tLower.includes('boot') ||
      tLower.includes('sport') ||
      tLower.includes('match') ||
      tLower.includes('game') ||
      tLower.includes('tournament') ||
      tLower.includes('uniform') ||
      tLower.includes('athletic') ||
      tLower.includes('gear') ||
      tLower.includes('swimming') ||
      tLower.includes('gym')
    ) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Clean uniform / jersey, shorts & socks packed in kit bag',
        type: 'purchase',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Boots / cleats, shin guards, filled water bottle & match snacks ready',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
    } else if (
      tLower.includes('pack') ||
      tLower.includes('luggage') ||
      tLower.includes('outfit') ||
      tLower.includes('costume') ||
      tLower.includes('wardrobe') ||
      tLower.includes('clothes') ||
      tLower.includes('suitcase')
    ) {
      // Check if it is explicitly an international flight / overseas journey
      const isInternational = tLower.includes('passport') || tLower.includes('roaming') || tLower.includes('international') || tLower.includes('overseas') || tLower.includes('flight') || tLower.includes('visa');
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Outfits & daily clothes selected and packed',
        type: 'coordination',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: isInternational ? 'Passport, roaming eSIM, & travel toiletries packed' : 'Toiletries, phone charger & personal essentials packed',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
    } else if (tLower.includes('activity') || tLower.includes('tour') || tLower.includes('excursion') || tLower.includes('boat')) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Booked excursion tickets & admission vouchers',
        type: 'booking',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Waivers signed & meeting point details shared',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
    } else if (tLower.includes('sitter') || tLower.includes('dog') || tLower.includes('pet') || tLower.includes('boarding') || tLower.includes('kennel')) {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: 'Confirmed pet sitter / boarding reservation',
        type: 'booking',
        is_completed: ms.status === 'completed',
      });
      deliverables.push({
        deliverable_id: `del_${ms.id}_2`,
        title: 'Vaccination records & feeding instructions prepared',
        type: 'document',
        is_completed: ms.status === 'completed',
      });
    } else {
      deliverables.push({
        deliverable_id: `del_${ms.id}_1`,
        title: `Completed prep step: ${ms.title}`,
        type: ms.category === 'booking' ? 'booking' : ms.category === 'shopping' ? 'purchase' : ms.category === 'logistics' ? 'document' : 'coordination',
        is_completed: ms.status === 'completed',
      });
    }

    // Convert raw imperative verbs into past-participle / state checkpoint titles:
    let stateCheckpointTitle = ms.title;
    if (/^book\s+/i.test(stateCheckpointTitle)) {
      stateCheckpointTitle = stateCheckpointTitle.replace(/^book\s+/i, '') + ' Booked & Confirmed';
    } else if (/^reserve\s+/i.test(stateCheckpointTitle)) {
      stateCheckpointTitle = stateCheckpointTitle.replace(/^reserve\s+/i, '') + ' Reserved & Locked';
    } else if (/^order\s+/i.test(stateCheckpointTitle)) {
      stateCheckpointTitle = stateCheckpointTitle.replace(/^order\s+/i, '') + ' Ordered & Tracked';
    } else if (/^buy\s+/i.test(stateCheckpointTitle)) {
      stateCheckpointTitle = stateCheckpointTitle.replace(/^buy\s+/i, '') + ' Purchased';
    } else if (/^send\s+/i.test(stateCheckpointTitle)) {
      stateCheckpointTitle = stateCheckpointTitle.replace(/^send\s+/i, '') + ' Sent';
    } else if (/^pack\s+/i.test(stateCheckpointTitle)) {
      stateCheckpointTitle = stateCheckpointTitle.replace(/^pack\s+/i, '') + ' Packed & Ready';
    }

    return {
      ...ms,
      title: stateCheckpointTitle,
      deliverables: deliverables.slice(0, 3),
    };
  });
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
    'PRODID:-//Ahead Of Time Preparation Assistant//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${event.title} + Ahead Of Time Milestones`,
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
  ics.push(`DESCRIPTION:Event prepared with Ahead Of Time.\\nStatus: ${event.status}\\nCategory: ${event.category}`);
  if (event.location) ics.push(`LOCATION:${event.location}`);
  ics.push('STATUS:CONFIRMED');
  ics.push('END:VEVENT');

  // Milestone Events
  (event.milestones || []).forEach((ms) => {
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
    const delivText = ms.deliverables && ms.deliverables.length > 0
      ? `\\n\\nDELIVERABLES:\\n` + ms.deliverables.map((d) => `• [${d.is_completed ? 'X' : ' '}] ${d.title} (${d.type})`).join('\\n')
      : '';
    ics.push(`DESCRIPTION:Ahead Of Time Milestone for ${event.title}\\nCategory: ${ms.category}\\nCheckpoint: ${ms.description || 'Milestone gate'}${delivText}`);
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
  
  const milestones = event.milestones || [];
  if (milestones.length === 0) {
    if (event.watchpoint) {
      lines.push(`🔍 *Watchpoint Active:* ${event.watchpoint.expectedAction}`);
      lines.push(`⏰ *Target Window:* ${event.watchpoint.targetAnnouncementWindow}`);
    } else {
      lines.push(`• Milestone schedule pending intake confirmation.`);
    }
  } else {
    milestones.forEach((ms) => {
      const check = ms.status === 'completed' ? '✅' : '⏳';
      const formattedDate = formatDisplayDate(ms.calculatedDate, true);
      lines.push(`${check} *${ms.tMinusLabel}* (${formattedDate}) — ${ms.title}`);
      if (ms.description) {
        lines.push(`   _${ms.description}_`);
      }
    });
  }

  lines.push('');
  lines.push(`_Generated by Ahead Of Time Preparation Assistant_`);
  return lines.join('\n');
}

/**
 * Hierarchical Context Decomposition Engine for complex queries and multi-track milestones.
 * Decomposes multi-day trips and nested micro-events into structured parent/child models.
 */
export function decomposeComplexTripIntent(
  message: string,
  referenceDateISO: string = new Date().toISOString(),
  userRole?: UserEventRole
): StructuredPlanningPayload | null {
  const msgLower = (message || '').toLowerCase();
  
  // Detect role if not explicitly passed
  let role: UserEventRole = userRole || 'organiser';
  if (/i('m| am) a guest|as (a )?guest|just attending|invited/i.test(msgLower)) {
    role = 'guest';
  } else if (/co-organiser|co-organizer|co organiser|co organizer|helping organise/i.test(msgLower)) {
    role = 'co_organiser';
  }

  // Check if this is a trip, multi-day span, or contains sub-task/activity requirements
  const isTripIntent = 
    /stag\s*(party|do)?|bachelor|bachelorette|hen\s*(party|do)?|trip|vacation|holiday|getaway|conference|retreat|weekend/i.test(message) ||
    /from\s+.*?to\s+/i.test(message) ||
    /day\s*\d+|2nd\s*day|second\s*day|3rd\s*day|third\s*day/i.test(message);

  if (!isTripIntent) return null;

  const baseRef = new Date(referenceDateISO);
  const safeBase = isNaN(baseRef.getTime()) ? new Date('2026-09-01T03:20:00Z') : baseRef;

  // 1. Date Range Extraction
  let startDateStr = '';
  let endDateStr = '';

  const isoRangeMatch = message.match(/from\s+([0-9]{4}-[0-9]{2}-[0-9]{2})\s+to\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (isoRangeMatch) {
    startDateStr = isoRangeMatch[1];
    endDateStr = isoRangeMatch[2];
  } else {
    // Check for placeholder or month/day ranges
    const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
    const monthRangeRegex = new RegExp(`(?:from\\s+)?(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:to|-)\\s+(?:(${monthNames})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`, 'i');
    const mMatch = message.match(monthRangeRegex);
    if (mMatch) {
      const startMonth = mMatch[1];
      const startDay = parseInt(mMatch[2], 10);
      const endMonth = mMatch[3] || startMonth;
      const endDay = parseInt(mMatch[4], 10);
      const year = mMatch[5] ? parseInt(mMatch[5], 10) : safeBase.getFullYear();
      
      const sDate = new Date(`${startMonth} ${startDay}, ${year}`);
      const eDate = new Date(`${endMonth} ${endDay}, ${year}`);
      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
        startDateStr = sDate.toISOString().substring(0, 10);
        endDateStr = eDate.toISOString().substring(0, 10);
      }
    }
  }

  // If placeholder like [Date X] to [Date Y] or no explicit dates, anchor a 3-day weekend 4 weeks from reference date
  if (!startDateStr || !endDateStr) {
    const s = new Date(safeBase);
    s.setDate(s.getDate() + 25);
    const currentDay = s.getDay();
    const daysUntilFriday = (5 - currentDay + 7) % 7;
    s.setDate(s.getDate() + (daysUntilFriday || 7));
    
    const e = new Date(s);
    e.setDate(e.getDate() + 2); // 3-day weekend (Friday to Sunday)

    startDateStr = s.toISOString().substring(0, 10);
    endDateStr = e.toISOString().substring(0, 10);
  }

  // Calculate day-level target dates
  const startObj = new Date(startDateStr + 'T12:00:00Z');
  const day2Obj = new Date(startObj);
  day2Obj.setDate(day2Obj.getDate() + 1);
  const day2DateStr = day2Obj.toISOString().substring(0, 10);

  // Determine Archetype & Macro Title
  let archetype = 'Trip';
  let macroTitle = 'Group Trip Horizon';
  if (/stag\s*(party|do)?|bachelor/i.test(message)) {
    archetype = 'Stag Party / Bachelor Trip';
    macroTitle = 'Stag Party Weekend';
  } else if (/hen\s*(party|do)?|bachelorette/i.test(message)) {
    archetype = 'Bachelorette / Hen Party';
    macroTitle = 'Bachelorette Weekend Getaway';
  } else if (/conference|summit/i.test(message)) {
    archetype = 'Conference & Summit';
    macroTitle = 'Conference & Industry Summit';
  } else if (/family|vacation|holiday/i.test(message)) {
    archetype = 'Family Vacation';
    macroTitle = 'Vacation & Holiday Getaway';
  }

  // Check destination
  const destMatch = message.match(/(?:to|in)\s+([A-Z][a-zA-Z\s]{2,20}?)(?:\s+(?:from|with|for|,|\.|$))/);
  const destination = destMatch ? destMatch[1].trim() : undefined;
  if (destination) {
    macroTitle = `${macroTitle} (${destination})`;
  }

  // 2. Unpack Embedded Sub-Events
  const subEvents: SubEvent[] = [];
  if (/2nd\s*day|second\s*day|day\s*2/i.test(message)) {
    subEvents.push({
      title: 'Day 2 Group Activity',
      relative_day: 'Day 2',
      target_date: day2DateStr,
      description: 'Highlight group activity or excursion requiring advance reservation',
    });
  }
  if (/dinner|supper|restaurant/i.test(message)) {
    subEvents.push({
      title: 'Saturday Group Dinner Reservation',
      relative_day: 'Day 2 Evening',
      target_date: day2DateStr,
      description: 'Group dining reservation with fixed menu or deposit',
    });
  }
  if (/theme|costume|fancy\s*dress/i.test(message)) {
    subEvents.push({
      title: 'Themed Night & Costumes',
      relative_day: 'Day 2 Night',
      target_date: day2DateStr,
      description: 'Coordinated group outfits or fancy dress',
    });
  }

  if (subEvents.length === 0) {
    subEvents.push({
      title: 'Day 2 In-Trip Activity',
      relative_day: 'Day 2',
      target_date: day2DateStr,
      description: 'Core group event requiring dedicated booking lead time',
    });
  }

  // 3. Multi-Track Milestone Generation
  const milestones: StructuredMilestone[] = [];

  const getMilestoneDate = (tMinusDays: number) => {
    const d = new Date(startObj);
    d.setDate(d.getDate() - tMinusDays);
    return d.toISOString().substring(0, 10);
  };

  const activityTitle = subEvents[0]?.title || 'Day 2 activity';
  const activityRefinementOptions = [
    'Go-Karting Grand Prix',
    'Paintball / Laser Combat',
    'Private Craft Brewery Tour & VIP Tasting',
    'Private Boat / Yacht Cruise',
    'Axe Throwing & Arcade Bar',
    'Escape Room Tournament',
    'VIP Nightclub Table'
  ];

  // Tailor based on User Role (Organiser vs Co-Organiser vs Guest)
  if (role === 'guest') {
    milestones.push({
      task: 'Confirm trip attendance & RSVP to organiser',
      target_date: getMilestoneDate(30),
      t_minus_days: 30,
      scope: 'macro',
      tag: 'RSVP',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['guest'],
      description: 'Lock in your place on the trip and confirm bed allocation.',
    });

    milestones.push({
      task: 'Transfer deposit / share of group kitty to organiser',
      target_date: getMilestoneDate(21),
      t_minus_days: 21,
      scope: 'macro',
      tag: 'Finance',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['guest'],
      description: 'Send your portion of lodging and activity deposits to the lead organiser.',
    });

    milestones.push({
      task: 'Book personal travel / flights & coordinate arrival times',
      target_date: getMilestoneDate(21),
      t_minus_days: 21,
      scope: 'macro',
      tag: 'Travel',
      kind: 'deliverable',
      needsRefinement: true,
      refinementOptions: ['Direct Flight', 'Train / Rail Pass', 'Carpool with Group', 'Driving Solo'],
      applicableRoles: ['guest'],
      description: 'Book your flight or train to match the group airport arrival window.',
    });

    milestones.push({
      task: 'Check weekend party dress code & activity gear',
      target_date: getMilestoneDate(7),
      t_minus_days: 7,
      scope: 'micro',
      tag: 'Prep',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['guest'],
      description: 'Prepare coordinated outfits, swimwear, or specific activity footwear.',
    });

    milestones.push({
      task: 'Luggage packing & roaming eSIM setup',
      target_date: getMilestoneDate(3),
      t_minus_days: 3,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['guest'],
      description: 'Pack personal gear, passport with 6+ months validity, and download offline maps.',
    });

    milestones.push({
      task: 'Departure buffer & meet group at transit hub',
      target_date: getMilestoneDate(0),
      t_minus_days: 0,
      scope: 'macro',
      tag: 'Departure',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['guest'],
      description: 'Head to the airport or station with buffer time to meet the trip crew.',
    });
  } else if (role === 'co_organiser') {
    milestones.push({
      task: 'Align with lead organiser & claim assigned tracks',
      target_date: getMilestoneDate(30),
      t_minus_days: 30,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['co_organiser'],
      description: 'Divide responsibility for activity reservations, transfers, and communication.',
    });

    milestones.push({
      task: `Shortlist & reserve ${activityTitle}`,
      target_date: getMilestoneDate(21),
      t_minus_days: 21,
      scope: 'micro',
      tag: 'Activity',
      kind: 'deliverable',
      needsRefinement: true,
      refinementOptions: activityRefinementOptions,
      deliverableType: 'activity',
      applicableRoles: ['organiser', 'co_organiser'],
      description: 'Reserve prime weekend slot (Karting, Brewery, Boat, Paintball) and lock in deposit.',
    });

    milestones.push({
      task: 'Chase unconfirmed RSVPs & help collect group kitty',
      target_date: getMilestoneDate(14),
      t_minus_days: 14,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['co_organiser'],
      description: 'Support lead organiser in gathering deposits and confirming final numbers.',
    });

    milestones.push({
      task: `Confirm final headcount, waiver forms & time slot for ${activityTitle}`,
      target_date: getMilestoneDate(7),
      t_minus_days: 7,
      scope: 'micro',
      tag: 'Reservations',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['organiser', 'co_organiser'],
      description: 'Check waiver links and confirm party arrival window with provider.',
    });

    milestones.push({
      task: 'Coordinate shared rides & meeting point with lead organiser',
      target_date: getMilestoneDate(3),
      t_minus_days: 3,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['co_organiser'],
      description: 'Confirm transit schedule from airport/station to accommodation.',
    });

    milestones.push({
      task: 'Personal luggage packing & gear check',
      target_date: getMilestoneDate(2),
      t_minus_days: 2,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['co_organiser'],
      description: 'Pack essentials and verify group party props/supplies.',
    });
  } else {
    // Default Organiser
    milestones.push({
      task: 'Book flights / group transport & lodging',
      target_date: getMilestoneDate(30),
      t_minus_days: 30,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'deliverable',
      needsRefinement: true,
      refinementOptions: ['Group Airbnb / Villa Rental', 'Central Hotel Room Block', 'Budget Hostel Pods', 'Self-booked Individual Lodging'],
      deliverableType: 'lodging',
      applicableRoles: ['organiser'],
      description: 'Secures accommodation and peak transit rates before prices surge or rooms sell out.',
    });

    milestones.push({
      task: `Shortlist & reserve ${activityTitle}`,
      target_date: getMilestoneDate(21),
      t_minus_days: 21,
      scope: 'micro',
      tag: 'Activity',
      kind: 'deliverable',
      needsRefinement: true,
      refinementOptions: activityRefinementOptions,
      deliverableType: 'activity',
      applicableRoles: ['organiser', 'co_organiser'],
      description: 'Prime group slots (Karting, Brewery, Boat, Paintball) sell out 3 weeks ahead.',
    });

    milestones.push({
      task: 'Collect group kitty & lock in attendance count',
      target_date: getMilestoneDate(14),
      t_minus_days: 14,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['organiser'],
      description: 'Avoids last-minute dropouts and provides working funds for activity deposits.',
    });

    milestones.push({
      task: `Confirm final headcount, waiver forms & time slot for ${activityTitle}`,
      target_date: getMilestoneDate(7),
      t_minus_days: 7,
      scope: 'micro',
      tag: 'Reservations',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['organiser', 'co_organiser'],
      description: 'Ensures provider can accommodate exact party size and signs liability releases ahead of time.',
    });

    milestones.push({
      task: 'Coordinate arrival times, shared cabs & meeting point',
      target_date: getMilestoneDate(7),
      t_minus_days: 7,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'deliverable',
      needsRefinement: false,
      applicableRoles: ['organiser'],
      description: 'Aligns group flights/trains and schedules seamless airport-to-hotel transfers.',
    });

    milestones.push({
      task: 'Trip luggage packing & travel logistics briefing',
      target_date: getMilestoneDate(3),
      t_minus_days: 3,
      scope: 'macro',
      tag: 'Logistics',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['organiser', 'co_organiser', 'guest'],
      description: 'Pack weather-appropriate attire, roaming SIMs, and distribute weekend itinerary.',
    });

    milestones.push({
      task: `Finalize dress code, gear & transport for ${activityTitle}`,
      target_date: getMilestoneDate(2),
      t_minus_days: 2,
      scope: 'micro',
      tag: 'Supplies',
      kind: 'milestone',
      needsRefinement: false,
      applicableRoles: ['organiser', 'co_organiser', 'guest'],
      description: 'Verifies required footwear, safety equipment, and rideshare pickup points.',
    });
  }

  // Sort milestones chronologically (earliest action first)
  milestones.sort((a, b) => b.t_minus_days - a.t_minus_days);

  const tailored_options = [
    'Outdoor Paintball & Quad Biking (High adrenaline; peak weekend slots require 3-week reservation)',
    'Private Craft Brewery Tour & VIP Tasting (Relaxed & social; includes local guide and tasting flights)',
    'Escape Room Challenge & Axe Throwing Tournament (Indoor & weatherproof; competitive group bracket)',
  ];

  const roleLabel = role === 'guest' ? 'Guest / Attendee' : role === 'co_organiser' ? 'Co-Organiser' : 'Lead Organiser';

  const conversational_response = `I've decomposed your request into a hierarchical multi-track plan for **${roleLabel}**:\n\n` +
    `• **Macro Trip Horizon:** ${macroTitle} from ${startDateStr} to ${endDateStr} (${role === 'guest' ? 'guest attendance & personal bookings' : 'operational travel, lodging & kitty'}).\n` +
    `• **Track B Micro Specifics:** ${role === 'guest' ? 'Dress code coordination & personal gear.' : 'Advance reservation runway for group activity.'}\n\n` +
    `To nail down the Day 2 activity, here are 3 tailored concepts suited for group trips:\n` +
    `1. *Outdoor Paintball & Quad Biking* (Adrenaline)\n` +
    `2. *Private Brewery Tour & Tasting* (Social)\n` +
    `3. *Escape Room & Axe Throwing* (Indoor competition)\n\n` +
    `Which direction fits your group best, or do you have another activity in mind?`;

  return {
    macro_event: {
      title: macroTitle,
      start_date: startDateStr,
      end_date: endDateStr,
      type: archetype,
      destination,
    },
    sub_events: subEvents,
    milestones,
    conversational_response,
    tailored_options,
  };
}

