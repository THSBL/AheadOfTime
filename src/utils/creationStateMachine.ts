import { Deliverable, EventCategory, TMinusMilestone } from '../types.js';
import { calculateOffsetDate } from './tminusRules.js';

export type CanonicalCategory =
  | 'party'
  | 'friends_visiting'
  | 'friends_family'
  | 'hobbies'
  | 'trip'
  | 'kids_school'
  | 'kids_hobbies'
  | 'subscription'
  | 'maintenance'
  | 'project_management'
  | 'work_projects';

export interface CategoryOption {
  id: CanonicalCategory;
  label: string;
  emoji: string;
  badgeLabel: string;
  internalCategory: EventCategory;
  description: string;
}

export const CANONICAL_CATEGORIES: CategoryOption[] = [
  {
    id: 'party',
    label: 'Party',
    emoji: '🎉',
    badgeLabel: 'Party & Celebration',
    internalCategory: 'birthday_party',
    description: 'Birthdays, weddings, dinners, and milestone celebrations',
  },
  {
    id: 'friends_visiting',
    label: 'Friends / Family Visit',
    emoji: '🏡',
    badgeLabel: 'Friends / Family Visit',
    internalCategory: 'hosting_visitors',
    description: 'Hosting guests at home, or visiting family and friends',
  },
  {
    id: 'hobbies',
    label: 'Hobbies',
    emoji: '🏅',
    badgeLabel: 'Hobbies & Sports',
    internalCategory: 'hobbies',
    description: 'Sports tournaments, race prep, outdoor trips, gigs, and craft workshops',
  },
  {
    id: 'project_management',
    label: 'Work / Projects',
    emoji: '📊',
    badgeLabel: 'Work / Projects',
    internalCategory: 'project_deadline',
    description: 'Launches, sprints, onboarding runways, and deterministic workflows',
  },
  {
    id: 'subscription',
    label: 'Subscriptions',
    emoji: '💳',
    badgeLabel: 'Subscription Review',
    internalCategory: 'subscription',
    description: 'Notice cutoffs, free trials, renewal reviews, and billing cycles',
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    emoji: '🔧',
    badgeLabel: 'Service & Maintenance',
    internalCategory: 'maintenance',
    description: 'Vehicle service, home inspections, seasonal upkeep, and quotes',
  },
  {
    id: 'kids_school',
    label: 'Kids: School',
    emoji: '🎒',
    badgeLabel: 'Kids: School',
    internalCategory: 'kids_school',
    description: 'Theme days, science fairs, presentations, and parent-teacher reviews',
  },
  {
    id: 'kids_hobbies',
    label: 'Kids: Hobbies',
    emoji: '⚽',
    badgeLabel: 'Kids: Hobbies',
    internalCategory: 'kids_hobbies',
    description: 'Youth matches, tournaments, recitals, carpooling, and kit readiness',
  },
  {
    id: 'trip',
    label: 'Trip & Travel',
    emoji: '✈️',
    badgeLabel: 'Trip & Travel',
    internalCategory: 'travel_trip',
    description: 'Vacations, getaways, accommodations, luggage, and excursions',
  },
];

export interface RefinementQuestion {
  id: string;
  label: string;
  question: string;
  placeholder: string;
  chips: string[];
  allowMultiple?: boolean;
}

export const CATEGORY_REFINEMENT_QUESTIONS: Record<CanonicalCategory, RefinementQuestion[]> = {
  party: [
    {
      id: 'rsvps',
      label: 'Guest List & RSVPs',
      question: 'Who is attending and how are RSVPs tracked?',
      placeholder: 'e.g., Send WhatsApp invite link, track headcount of ~15...',
      chips: ['Send digital invites', 'Track group RSVPs', 'Close family only', 'Attending as guest'],
      allowMultiple: false,
    },
    {
      id: 'food_drinks',
      label: 'Food, Drinks & Cake',
      question: 'What is the food and beverage plan?',
      placeholder: 'e.g., Order bakery cake, party grocery run, restaurant reservation...',
      chips: ['Order bakery cake', 'Party grocery & drinks run', 'Restaurant reservation', 'Potluck / BYOB'],
      allowMultiple: true,
    },
    {
      id: 'gifts_details',
      label: 'Gift & Celebration Details',
      question: 'Is there a gift, card, or special theme?',
      placeholder: 'e.g., Buy solo present + card, group money pool, costume theme...',
      chips: ['Buy celebratory gift & card', 'Organize group gift pool', 'Themed attire / costume', 'No gifts requested'],
      allowMultiple: true,
    },
  ],

  friends_visiting: [
    {
      id: 'hosting_or_visiting',
      label: 'Hosting or Visiting?',
      question: 'Are you hosting them, or are you visiting/staying with them?',
      placeholder: 'e.g., Hosting at our home, staying with them, hotel stay...',
      chips: ['Hosting guests at home', 'Visiting / staying with them'],
      allowMultiple: false,
    },
    {
      id: 'lodging_prep',
      label: 'Guest Room, Linens & Travel Prep',
      question: 'What preparation is needed for the stay?',
      placeholder: 'e.g., Fresh bedsheets & towels, stock guest toiletries, book travel tickets...',
      chips: ['Fresh bedsheets & guest towels', 'Stock guest toiletries & charger', 'Book transit / flight tickets', 'Plan travel driving route'],
      allowMultiple: true,
    },
    {
      id: 'dining_host_gift',
      label: 'Meal Plans, Local Bookings & Host Gift',
      question: 'What meals, reservations, or host gifts are planned?',
      placeholder: 'e.g., Reserve Friday restaurant, grocery run for breakfast, buy host gift...',
      chips: ['Reserve local restaurant table', 'Stock breakfast & coffee essentials', 'Buy host gift & write card', 'Pack travel luggage & outfits'],
      allowMultiple: true,
    },
  ],

  friends_family: [
    {
      id: 'hosting_or_visiting',
      label: 'Hosting or Visiting?',
      question: 'Are you hosting them, or are you visiting/staying with them?',
      placeholder: 'e.g., Hosting at our home, staying with them, hotel stay...',
      chips: ['Hosting guests at home', 'Visiting / staying with them'],
      allowMultiple: false,
    },
    {
      id: 'lodging_prep',
      label: 'Guest Room, Linens & Travel Prep',
      question: 'What preparation is needed for the stay?',
      placeholder: 'e.g., Fresh bedsheets & towels, stock guest toiletries, book travel tickets...',
      chips: ['Fresh bedsheets & guest towels', 'Stock guest toiletries & charger', 'Book transit / flight tickets', 'Plan travel driving route'],
      allowMultiple: true,
    },
    {
      id: 'dining_host_gift',
      label: 'Meal Plans, Local Bookings & Host Gift',
      question: 'What meals, reservations, or host gifts are planned?',
      placeholder: 'e.g., Reserve Friday restaurant, grocery run for breakfast, buy host gift...',
      chips: ['Reserve local restaurant table', 'Stock breakfast & coffee essentials', 'Buy host gift & write card', 'Pack travel luggage & outfits'],
      allowMultiple: true,
    },
  ],

  hobbies: [
    {
      id: 'activity_type',
      label: 'Activity & Schedule',
      question: 'What type of hobby or event is this?',
      placeholder: 'e.g., Half marathon race, tennis club championship, jazz gig, woodworking workshop...',
      chips: ['Sports tournament / match', 'Race / marathon prep', 'Musical gig / performance', 'Outdoor / camping trip', 'Craft workshop / class'],
      allowMultiple: false,
    },
    {
      id: 'gear_readiness',
      label: 'Gear & Equipment Check',
      question: 'What specialized gear, uniform, or kit needs preparation?',
      placeholder: 'e.g., Clean kit & sports uniform, tune instrument, inspect outdoor equipment...',
      chips: ['Clean kit & sports uniform', 'Inspect & pack equipment', 'Prep nutrition & hydration', 'Download offline route / sheets'],
      allowMultiple: true,
    },
    {
      id: 'logistics_entry',
      label: 'Registrations & Logistics',
      question: 'Any entry fees, transport, or venue bookings?',
      placeholder: 'e.g., Confirm entry fee paid, book hotel near finish line, spectator tickets...',
      chips: ['Confirm registration entry', 'Book travel / lodging', 'Parent / spectator tickets', 'DIY / local meetup'],
      allowMultiple: true,
    },
  ],

  kids_hobbies: [
    {
      id: 'transport',
      label: 'Carpooling & Travel',
      question: 'How is transport being handled for the event?',
      placeholder: 'e.g., Joining David\'s carpool, driving personal car, team bus...',
      chips: ['Driving our family', 'Arranging carpool', 'Team bus / shared transit', 'Local venue / walk'],
      allowMultiple: false,
    },
    {
      id: 'gear',
      label: 'Uniform & Gear Readiness',
      question: 'What specific gear or clothing needs to be ready?',
      placeholder: 'e.g., Wash shin guards & team jersey, pack cleats, prep water bottle...',
      chips: ['Clean kit & jersey', 'Pack boots / shinguards', 'Prep labelled water & snacks', 'Spare uniform pack'],
      allowMultiple: true,
    },
    {
      id: 'tickets',
      label: 'Spectator & Attendance Logistics',
      question: 'Any spectator tickets, waivers, or registration fees?',
      placeholder: 'e.g., Submit medical waiver, buy spectator wristbands, pay coach fee...',
      chips: ['Signed medical waiver', 'Parent spectator tickets', 'Coach tournament fee', 'No paperwork needed'],
      allowMultiple: true,
    },
  ],

  kids_school: [
    {
      id: 'supplies',
      label: 'Project Materials & Supplies',
      question: 'What supplies, poster board, or materials are needed?',
      placeholder: 'e.g., Buy tri-fold display board, print color diagrams, craft paper...',
      chips: ['Tri-fold board & markers', 'Science experiment kit', 'Character costume & props', 'No extra supplies needed'],
      allowMultiple: true,
    },
    {
      id: 'presentation',
      label: 'Presentation & Rehearsal Prep',
      question: 'Is there a presentation, script, or review to practice?',
      placeholder: 'e.g., 5-min practice run-through with timer, memorize flashcards...',
      chips: ['Timed practice run-through', 'Review rubric checklist', 'Memorize speech lines', 'Independent study check'],
      allowMultiple: true,
    },
    {
      id: 'permissions',
      label: 'School Submission & Permissions',
      question: 'Any permission slip, parent review, or teacher form?',
      placeholder: 'e.g., Sign parent consent slip, submit project rubric on portal...',
      chips: ['Signed permission slip', 'Parent review sign-off', 'School portal file upload', 'No approvals needed'],
      allowMultiple: false,
    },
  ],

  subscription: [
    {
      id: 'notice_cutoff',
      label: 'Renewal & Notice Deadline',
      question: 'What is the cancellation or renewal cutoff date?',
      placeholder: 'e.g., Must cancel 48h before billing, end of 30-day free trial...',
      chips: ['Cancel before trial ends', 'Audit yearly renewal cost', 'Check 30-day notice rule', 'Review plan tier'],
      allowMultiple: false,
    },
    {
      id: 'data_billing',
      label: 'Account Data & Billing Method',
      question: 'Do you need to export data or change payment method?',
      placeholder: 'e.g., Download invoices, export customer lists, remove card on file...',
      chips: ['Download receipts / invoices', 'Export personal data', 'Remove payment card', 'No data backup needed'],
      allowMultiple: true,
    },
  ],

  maintenance: [
    {
      id: 'booking',
      label: 'Service Provider & Booking',
      question: 'Who is doing the service and is the appointment locked?',
      placeholder: 'e.g., Call local garage for quote, book online appointment slot...',
      chips: ['Book appointment slot', 'Request written price quote', 'Confirm replacement parts in stock', 'DIY maintenance task'],
      allowMultiple: false,
    },
    {
      id: 'prep',
      label: 'Prep & Logistics',
      question: 'What needs to be prepped before service?',
      placeholder: 'e.g., Clean vehicle interior, clear access around unit, gather service history...',
      chips: ['Gather warranty / logbook', 'Clear physical access area', 'Plan alternate transport', 'Check fluid / filter type'],
      allowMultiple: true,
    },
  ],

  project_management: [
    {
      id: 'scope_review',
      label: 'Scope & Stakeholder Sign-Off',
      question: 'Who needs to review or sign off on deliverables?',
      placeholder: 'e.g., Client review meeting, internal lead sign-off, demo walkthrough...',
      chips: ['Client review sign-off', 'Internal team sync demo', 'Executive stakeholder approval', 'Solo delivery'],
      allowMultiple: false,
    },
    {
      id: 'qa_release',
      label: 'Quality Check & Release Notes',
      question: 'What testing, QA, or documentation is required?',
      placeholder: 'e.g., Staging QA pass, write release notes, verify deployment runbook...',
      chips: ['QA test pass on staging', 'Write release documentation', 'Data backup & rollback plan', 'Final presentation deck check'],
      allowMultiple: true,
    },
  ],

  work_projects: [
    {
      id: 'scope_review',
      label: 'Scope & Stakeholder Sign-Off',
      question: 'Who needs to review or sign off on deliverables?',
      placeholder: 'e.g., Client review meeting, internal lead sign-off, demo walkthrough...',
      chips: ['Client review sign-off', 'Internal team sync demo', 'Executive stakeholder approval', 'Solo delivery'],
      allowMultiple: false,
    },
    {
      id: 'qa_release',
      label: 'Quality Check & Release Notes',
      question: 'What testing, QA, or documentation is required?',
      placeholder: 'e.g., Staging QA pass, write release notes, verify deployment runbook...',
      chips: ['QA test pass on staging', 'Write release documentation', 'Data backup & rollback plan', 'Final presentation deck check'],
      allowMultiple: true,
    },
  ],

  trip: [
    {
      id: 'lodging',
      label: 'Lodging & Stay',
      question: 'Where are you staying and is the booking confirmed?',
      placeholder: 'e.g., Hotel reservation, Airbnb confirmation, campsite reserved...',
      chips: ['Hotel booked & confirmed', 'Airbnb / Vacation rental', 'Staying with friends / family', 'Need to book stay'],
      allowMultiple: false,
    },
    {
      id: 'transport',
      label: 'Transport Mode',
      question: 'What is the primary mode of travel?',
      placeholder: 'e.g., Flight + airport transfer, driving personal car, rail tickets...',
      chips: ['Flight & boarding passes', 'Road trip / Personal car', 'Train / Rail tickets', 'Rental car needed'],
      allowMultiple: false,
    },
    {
      id: 'activities',
      label: 'Planned Activities & Gear',
      question: 'What planned day activities or gear need advance prep?',
      placeholder: 'e.g., Book museum tickets, pack hiking boots, renew passport...',
      chips: ['Pack weather gear & outfits', 'Book excursion / tour passes', 'Passport validity & visa check', 'Casual / unstructured'],
      allowMultiple: true,
    },
  ],
};

/**
 * Classifies submitted title strictly into one of the canonical categories
 */
export function classifySubmittedTitle(title: string, presetHint?: string): CanonicalCategory {
  if (presetHint) {
    if (presetHint === 'hobbies') return 'hobbies';
    if (presetHint === 'kids_hobbies') return 'kids_hobbies';
    if (presetHint === 'kids_school' || presetHint === 'school') return 'kids_school';
    if (presetHint === 'trip' || presetHint === 'travel_trip') return 'trip';
    if (presetHint === 'party' || presetHint === 'birthday' || presetHint === 'birthday_party') return 'party';
    if (presetHint === 'friends' || presetHint === 'friends_visiting' || presetHint === 'friends_family' || presetHint === 'hosting_visitors') return 'friends_visiting';
    if (presetHint === 'subscription') return 'subscription';
    if (presetHint === 'maintenance') return 'maintenance';
    if (presetHint === 'project' || presetHint === 'project_deadline' || presetHint === 'work_projects') return 'project_management';
  }

  const text = (title || '').toLowerCase();

  // 1. Kids: School
  if (
    /\b(school|science fair|book week|spirit day|spelling bee|math olympiad|open house|pta|parent-teacher|report card|homework|field trip|class project|grade|kindergarten|elementary|high school|exam|school play|costume parade|revision)\b/i.test(
      text
    )
  ) {
    return 'kids_school';
  }

  // 2. Kids: Hobbies (when explicitly child-referenced)
  if (
    /\b(kid|child|son|daughter|junior|youth|leo|maya|u\d+|under-\d+)\b/i.test(text) &&
    /\b(soccer|football|basketball|baseball|hockey|tennis|swimming|swim|karate|judo|taekwondo|dance|ballet|gymnastics|piano|violin|recital|tournament|match|meet)\b/i.test(text)
  ) {
    return 'kids_hobbies';
  }

  // 3. Adult / General Hobbies
  if (
    /\b(marathon|half marathon|5k|10k|triathlon|ironman|race prep|running|cycling|bike race|tennis tournament|golf tournament|bouldering|climbing|camping trip|outdoor trip|fishing trip|pottery|woodworking|workshop|guitar gig|concert gig|band rehearsal|choir performance|craft workshop|photography walk)\b/i.test(
      text
    )
  ) {
    return 'hobbies';
  }

  // General Sports / Hobbies fallback
  if (
    /\b(soccer|football|basketball|baseball|softball|hockey|lacrosse|rugby|tennis|swimming|swim|karate|judo|taekwondo|martial arts|dance|ballet|gymnastics|cheerleading|piano|violin|guitar|choir|band|recital|tournament|championship|match|meet|game|practice|rehearsal|scouts?|athletics|cross country|track)\b/i.test(
      text
    )
  ) {
    return 'hobbies';
  }

  // 4. Trip & Travel
  if (
    /\b(trip|vacation|holiday|travel|flight|flights|hotel|airbnb|getaway|resort|weekend away|road trip|camping|campsite|backpacking|city trip|visit to\b|fly to\b)/i.test(
      text
    )
  ) {
    return 'trip';
  }

  // 5. Friends & Family Visiting / Hosting
  if (
    /\b(visiting|visitor|visitors|staying with|hosting|guests|in town|sleepover|friends over|weekend with|family visiting|friends visit|family visit)\b/i.test(
      text
    )
  ) {
    return 'friends_visiting';
  }

  // 6. Subscriptions
  if (
    /\b(subscription|renewal|free trial|gym trial|membership|recurring charge|billing renewal|cancel|gym membership|saas|software subscription)\b/i.test(
      text
    )
  ) {
    return 'subscription';
  }

  // 7. Maintenance & Service
  if (
    /\b(service|car service|oil change|inspection|dentist|dental|doctor|checkup|vet|veterinarian|mechanic|hvac|boiler|plumber|electrician|garage|tire|brakes|m\.o\.t|mot|repairs?)\b/i.test(
      text
    )
  ) {
    return 'maintenance';
  }

  // 8. Work / Projects & Deadlines
  if (
    /\b(project|deadline|sprint|demo|release|launch|milestone|presentation|pitch|hackathon|audit|client review|deliverable|staging|qa freeze|deployment|rollout|onboarding)\b/i.test(
      text
    )
  ) {
    return 'project_management';
  }

  // 9. Party & Celebrations
  if (
    /\b(party|birthday|bday|b-day|turning \d+|sweet 16|anniversary|celebration|wedding|reception|baby shower|bridal shower|bachelor|bachelorette|housewarming|gathering|dinner party|fiesta)\b/i.test(
      text
    )
  ) {
    return 'party';
  }

  // Default fallback if unclassified
  return 'party';
}

/**
 * Extract multiple answers from either an array or comma-separated string
 */
export function extractAnswerList(val: string | string[] | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((s) => s.trim()).filter(Boolean);
  }
  return val
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Generate ultra-pragmatic, concrete milestones & crisp checklist deliverables
 * Tone standard: 3–5 words past-participle format for milestone titles; 1–3 actionable items for deliverables.
 */
export function generateConcreteEventMilestones(
  title: string,
  eventDate: string,
  eventTime: string = '19:00',
  category: CanonicalCategory,
  answers: Record<string, string | string[]>,
  eventId: string
): TMinusMilestone[] {
  const milestones: TMinusMilestone[] = [];

  const createMilestone = (
    label: string,
    offsetMinutes: number,
    msTitle: string,
    cat: 'logistics' | 'booking' | 'shopping' | 'prep' | 'admin',
    description: string,
    deliverables: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[]
  ): TMinusMilestone => {
    const calcDate = calculateOffsetDate(eventDate, eventTime, offsetMinutes);
    const msId = `ms-${eventId}-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now() % 10000}-${Math.random().toString(36).substring(2, 5)}`;
    
    const formattedDeliverables: Deliverable[] = deliverables.map((d, idx) => ({
      deliverable_id: `del_${msId}_${idx + 1}`,
      title: d.title,
      type: d.type,
      is_completed: false,
    }));

    return {
      id: msId,
      eventId,
      tMinusLabel: label,
      tMinusOffsetMinutes: offsetMinutes,
      calculatedDate: calcDate,
      title: msTitle,
      description,
      category: cat,
      status: 'pending',
      deliverables: formattedDeliverables,
    };
  };

  switch (category) {
    // 1. PARTY (Birthdays, weddings, dinners, milestone celebrations)
    case 'party': {
      const isWedding = /\b(wedding|marriage|matrimony|bridal|reception)\b/i.test(title) ||
        Object.values(answers).some((v) => typeof v === 'string' && /\bwedding|bridal gown|wedding dress\b/i.test(v));

      if (isWedding) {
        // WEDDING RUNWAY (Realistic 6-12 month preparation lead time)
        milestones.push(
          createMilestone(
            'T-9m',
            -270 * 24 * 60,
            'Wedding Venue & Ceremony Location Booked',
            'booking',
            'Lock in ceremony and reception venue contracts and schedule deposits.',
            [
              { title: 'Sign venue agreement and pay initial deposit', type: 'booking' },
              { title: 'Confirm ceremony time window and vendor access rules', type: 'document' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-8m',
            -240 * 24 * 60,
            'Wedding Dress & Custom Attire Ordered',
            'shopping',
            'Order made-to-measure wedding dress and custom suits to allow for production and alterations.',
            [
              { title: 'Order wedding dress or custom tuxedo from boutique', type: 'purchase' },
              { title: 'Schedule first alteration and fitting dates with tailor', type: 'booking' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-8m',
            -240 * 24 * 60,
            'Photographer & Videographer Booked',
            'booking',
            'Lock in photographer and videographer for ceremony and reception coverage.',
            [
              { title: 'Sign photography contract and agree on hours of coverage', type: 'booking' },
              { title: 'Draft key shot wishlist and schedule engagement shoot', type: 'document' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-6m',
            -180 * 24 * 60,
            'Save the Dates Sent',
            'coordination' as any,
            'Send save the date cards to give guests time to book travel and lodging.',
            [
              { title: 'Send save the dates digitally or via mail', type: 'coordination' },
              { title: 'Set up wedding website with hotel recommendations', type: 'document' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-8w',
            -56 * 24 * 60,
            'First Dress Fitting & Alterations Completed',
            'shopping',
            'Attend first major garment fitting with wedding shoes and undergarments.',
            [
              { title: 'Complete first tailoring fitting for hem, waist, and bustle', type: 'purchase' },
              { title: 'Confirm final collection appointment with tailor', type: 'booking' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-6w',
            -42 * 24 * 60,
            'Marriage License & Legal Paperwork Filed',
            'admin',
            'Submit marriage license application at city hall or civil registry.',
            [
              { title: 'Gather certified birth certificates and official photo IDs', type: 'document' },
              { title: 'Complete marriage registry appointment and obtain license', type: 'document' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-3w',
            -21 * 24 * 60,
            'Final RSVPs & Seating Chart Locked',
            'coordination' as any,
            'Finalize guest headcount with caterer and arrange table seating plan.',
            [
              { title: 'Submit final dietary counts and meal choices to caterer', type: 'coordination' },
              { title: 'Print final table cards and seating chart display', type: 'document' },
            ]
          )
        );

        milestones.push(
          createMilestone(
            'T-1d',
            -1 * 24 * 60,
            'Wedding Rehearsal & Rings Ready',
            'prep',
            'Run ceremony rehearsal with wedding party and prep rings and vows.',
            [
              { title: 'Pack wedding rings, vows, marriage license, and emergency kit', type: 'document' },
              { title: 'Rehearse ceremony walk-through with wedding party', type: 'coordination' },
            ]
          )
        );

        break;
      }

      // STANDARD CELEBRATIONS & PARTIES
      // T-21d: Invites & Headcount
      const rsvpItems = extractAnswerList(answers.rsvps);
      const inviteDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: rsvpItems.length > 0
            ? `Sent invitations: ${rsvpItems.join(', ')}`
            : 'Send digital invitations and track group RSVPs',
          type: 'coordination',
        },
        { title: 'Track dietary requirements and headcount', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-21d',
          -21 * 24 * 60,
          'Invitations & RSVPs Sent',
          'booking',
          'Send invitations to guests and coordinate attendee headcount.',
          inviteDelivs
        )
      );

      // T-10d: Gift & Card
      const giftItems = extractAnswerList(answers.gifts_details);
      const giftDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (giftItems.length > 0) {
        giftItems.forEach((item) => {
          giftDelivs.push({
            title: /^(buy|order|organize|prepare)/i.test(item) ? item : `Gift details: ${item}`,
            type: 'purchase',
          });
        });
        giftDelivs.push({ title: 'Write celebratory card & wrap gift', type: 'document' });
      } else {
        giftDelivs.push(
          { title: 'Order celebration gift online with tracking', type: 'purchase' },
          { title: 'Write celebratory card & wrap gift', type: 'document' }
        );
      }
      milestones.push(
        createMilestone(
          'T-10d',
          -10 * 24 * 60,
          'Celebratory Gift & Card Purchased',
          'shopping',
          'Order celebratory gift online and write card.',
          giftDelivs
        )
      );

      // T-4d: Cake & Beverages
      const foodItems = extractAnswerList(answers.food_drinks);
      const cakeDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (foodItems.length > 0) {
        foodItems.forEach((item) => {
          cakeDelivs.push({
            title: /^(order|buy|pick up|reserve)/i.test(item) ? item : `Food/Drinks: ${item}`,
            type: 'purchase',
          });
        });
      } else {
        cakeDelivs.push(
          { title: 'Order bakery cake and schedule pickup window', type: 'purchase' },
          { title: 'Pick up party drinks, mixers, and fresh ice bags', type: 'purchase' }
        );
      }
      milestones.push(
        createMilestone(
          'T-4d',
          -4 * 24 * 60,
          'Cake & Beverages Secured',
          'shopping',
          'Lock in bakery cake order and buy party refreshments.',
          cakeDelivs
        )
      );

      // T-2h: Setup & Chill
      milestones.push(
        createMilestone(
          'T-2h',
          -120,
          'Venue & Beverages Prepped',
          'prep',
          'Chill drinks on ice, set out glasses, and prepare music playlist.',
          [
            { title: 'Chill beverages on ice and set up glassware', type: 'purchase' },
          ]
        )
      );
      break;
    }

    // 2. FRIENDS / FAMILY VISIT (Discriminates Hosting vs Visiting)
    case 'friends_visiting':
    case 'friends_family': {
      const hostingOrVisitingVal = Array.isArray(answers.hosting_or_visiting) 
        ? answers.hosting_or_visiting[0] 
        : (answers.hosting_or_visiting || '');
      
      const isVisiting = /visit|staying with|their place/i.test(hostingOrVisitingVal);

      if (isVisiting) {
        // --- VISITING RUNWAY: Focuses on travel arrangements, host gift, and packing ---
        
        // T-7d: Travel Arrangements
        const lodgingDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
          { title: 'Confirm flight / train tickets or driving route', type: 'booking' },
          { title: 'Confirm arrival timeline and schedule with host', type: 'coordination' },
        ];
        milestones.push(
          createMilestone(
            'T-7d',
            -7 * 24 * 60,
            'Travel Arrangements & Transit Locked',
            'booking',
            'Lock in transportation tickets and coordinate arrival timeline with host.',
            lodgingDelivs
          )
        );

        // T-3d: Host Gift
        const giftDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
          { title: 'Buy thoughtful host gift, wine, or specialty treats', type: 'purchase' },
          { title: 'Write handwritten thank-you card for host', type: 'document' },
        ];
        milestones.push(
          createMilestone(
            'T-3d',
            -3 * 24 * 60,
            'Host Gift & Supplies Purchased',
            'shopping',
            'Purchase a thoughtful host gift and prepare greeting card.',
            giftDelivs
          )
        );

        // T-1d: Luggage Packing
        milestones.push(
          createMilestone(
            'T-1d',
            -1 * 24 * 60,
            'Host Gift & Bags Packed',
            'prep',
            'Pack suitcase with weather-appropriate clothing and pack host gift securely.',
            [
              { title: 'Pack suitcase with weather attire and chargers', type: 'purchase' },
              { title: 'Pack host gift & card securely in luggage', type: 'document' },
            ]
          )
        );

        // T-2h: Departure Buffer
        milestones.push(
          createMilestone(
            'T-2h',
            -120,
            'Departure Buffer & Route Checked',
            'logistics',
            'Depart with travel buffer and send ETA update message to host.',
            [
              { title: 'Send ETA message to host and check traffic route', type: 'coordination' },
            ]
          )
        );
      } else {
        // --- HOSTING RUNWAY: Focuses on home prep, guest room, meal plans, and local bookings ---
        
        // T-7d: Guest Bedroom
        const roomDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
          { title: 'Wash fresh bedsheets and set out clean bath towels', type: 'coordination' },
          { title: 'Stock guest room with spare charger & Wi-Fi card', type: 'document' },
        ];
        milestones.push(
          createMilestone(
            'T-7d',
            -7 * 24 * 60,
            'Guest Room & Linens Ready',
            'prep',
            'Prepare guest room with fresh linens, clean towels, and essential amenities.',
            roomDelivs
          )
        );

        // T-3d: Meals & Fridge
        const dinDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
          { title: 'Book table at favorite local restaurant', type: 'booking' },
          { title: 'Stock fridge with breakfast essentials & coffee beans', type: 'purchase' },
        ];
        milestones.push(
          createMilestone(
            'T-3d',
            -3 * 24 * 60,
            'Meal Plans & Fridge Stocked',
            'shopping',
            'Plan weekend meals, book dinner reservation, and grocery shop for breakfast.',
            dinDelivs
          )
        );

        // T-1d: Arrival Coordination
        milestones.push(
          createMilestone(
            'T-1d',
            -1 * 24 * 60,
            'Arrival Logistics & Access Coordinated',
            'logistics',
            'Confirm train/flight arrival time and share home entry door code.',
            [
              { title: 'Confirm arrival time and share entry door code', type: 'coordination' },
            ]
          )
        );

        // T-2h: Welcome Prep
        milestones.push(
          createMilestone(
            'T-2h',
            -120,
            'Welcome Buffer & Refreshments Set',
            'prep',
            'Set out fresh glasses and prepare welcome drinks for guest arrival.',
            [
              { title: 'Set out clean glasses and welcome refreshments', type: 'purchase' },
            ]
          )
        );
      }
      break;
    }

    // 3. HOBBIES (Sports tournaments, race prep, outdoor trips, musical gigs, craft workshops)
    case 'hobbies': {
      // T-14d: Registration & Entry
      const entryItems = extractAnswerList(answers.logistics_entry);
      const entryDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: entryItems.length > 0 
            ? `Registration entry: ${entryItems.join(', ')}`
            : 'Confirm tournament or race entry registration & fees',
          type: 'booking',
        },
        { title: 'Review event schedule, rules, and entry waivers', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Registration & Entry Confirmed',
          'booking',
          'Submit registration paperwork and confirm roster entry.',
          entryDelivs
        )
      );

      // T-7d: Travel & Logistics
      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'Travel & Schedule Coordinated',
          'logistics',
          'Finalize travel arrangements, driver schedule, and arrival window.',
          [
            { title: 'Confirm transport plan and parking or lodging slot', type: 'booking' },
            { title: 'Check venue address, spectator passes & directions', type: 'document' },
          ]
        )
      );

      // T-2d: Gear & Kit
      const gearItems = extractAnswerList(answers.gear_readiness);
      const gearDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (gearItems.length > 0) {
        gearItems.forEach((item) => {
          gearDelivs.push({
            title: /^(prep|pack|clean|inspect|buy)/i.test(item) ? item : `Gear prep: ${item}`,
            type: 'purchase',
          });
        });
      } else {
        gearDelivs.push(
          { title: 'Clean uniform / sports kit & inspect equipment', type: 'purchase' },
          { title: 'Prep electrolyte hydration and nutrition snacks', type: 'purchase' }
        );
      }
      milestones.push(
        createMilestone(
          'T-2d',
          -2 * 24 * 60,
          'Gear & Equipment Checked',
          'prep',
          'Ensure sports kit, uniform, safety gear, and nutrition are packed.',
          gearDelivs
        )
      );

      // T-2h: Departure Buffer & Warmup
      milestones.push(
        createMilestone(
          'T-2h',
          -120,
          'Departure Buffer & Warmup Observed',
          'logistics',
          'Leave with travel buffer and arrive on time for check-in and warm-up.',
          [
            { title: 'Arrive 45 minutes early for check-in & warmup', type: 'coordination' },
          ]
        )
      );
      break;
    }

    // 4. WORK / PROJECTS (Launches, sprints, onboarding runways, deterministic workflows)
    case 'project_management':
    case 'work_projects': {
      // T-14d: Scope & Review
      const scopeItems = extractAnswerList(answers.scope_review);
      const scopeDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: scopeItems.length > 0
            ? `Review criteria: ${scopeItems.join(', ')}`
            : 'Lock acceptance criteria with lead stakeholders',
          type: 'coordination',
        },
        { title: 'Send calendar invitations for milestone demo sync', type: 'booking' },
      ];
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Scope & Review Criteria Locked',
          'booking',
          'Finalize acceptance criteria and schedule stakeholder sign-off.',
          scopeDelivs
        )
      );

      // T-5d: Staging QA & Notes
      const qaItems = extractAnswerList(answers.qa_release);
      const qaDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (qaItems.length > 0) {
        qaItems.forEach((item) => {
          qaDelivs.push({
            title: /^(execute|run|draft|write|verify)/i.test(item) ? item : `QA: ${item}`,
            type: 'document',
          });
        });
      } else {
        qaDelivs.push(
          { title: 'Execute full QA test pass on staging environment', type: 'document' },
          { title: 'Draft release notes and verify rollback runbook', type: 'document' }
        );
      }
      milestones.push(
        createMilestone(
          'T-5d',
          -5 * 24 * 60,
          'Staging QA & Runbook Verified',
          'prep',
          'Execute regression testing and prepare customer-facing documentation.',
          qaDelivs
        )
      );

      // T-1d: Stakeholder Approvals
      milestones.push(
        createMilestone(
          'T-1d',
          -1 * 24 * 60,
          'Stakeholder Approvals & Launch Locked',
          'admin',
          'Obtain written go/no-go approval and confirm go-live timeline.',
          [
            { title: 'Obtain written sign-off approval from project leads', type: 'document' },
          ]
        )
      );
      break;
    }

    // 5. SUBSCRIPTIONS (Trial cancellation cutoffs, annual renewal review milestones)
    case 'subscription': {
      // T-14d: Terms Review
      const noticeItems = extractAnswerList(answers.notice_cutoff);
      const termsDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: noticeItems.length > 0
            ? `Renewal notice: ${noticeItems.join(', ')}`
            : 'Confirm renewal billing date and minimum notice cancellation window',
          type: 'document',
        },
        { title: 'Audit annual usage to decide renew vs cancel', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Notice Cutoff & Terms Reviewed',
          'admin',
          'Check cancellation policy, billing schedule, and contract cutoff dates.',
          termsDelivs
        )
      );

      // T-7d: Export Data
      const dataItems = extractAnswerList(answers.data_billing);
      const dataDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (dataItems.length > 0) {
        dataItems.forEach((item) => {
          dataDelivs.push({
            title: /^(download|export|remove|save)/i.test(item) ? item : `Account task: ${item}`,
            type: 'document',
          });
        });
      } else {
        dataDelivs.push({ title: 'Download past payment receipts and export stored user data', type: 'document' });
      }
      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'Account Data & Invoices Exported',
          'admin',
          'Save invoices and export account files before cancellation.',
          dataDelivs
        )
      );

      // T-2d: Cancel
      milestones.push(
        createMilestone(
          'T-2d',
          -2 * 24 * 60,
          'Formal Cancellation Request Submitted',
          'admin',
          'Submit cancellation request in portal and retain confirmation email.',
          [
            { title: 'Cancel subscription via settings portal & save receipt', type: 'document' },
          ]
        )
      );
      break;
    }

    // 6. MAINTENANCE (Vehicle service, home inspections, seasonal upkeep checkpoints)
    case 'maintenance': {
      // T-10d: Booking
      const bookingItems = extractAnswerList(answers.booking);
      const maintDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: bookingItems.length > 0
            ? `Service booking: ${bookingItems.join(', ')}`
            : 'Book service slot with certified technician or garage',
          type: 'booking',
        },
        { title: 'Obtain upfront cost estimate and confirm parts', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-10d',
          -10 * 24 * 60,
          'Service Appointment & Quote Locked',
          'booking',
          'Schedule maintenance appointment and verify pricing and parts availability.',
          maintDelivs
        )
      );

      // T-1d: Prep
      const prepItems = extractAnswerList(answers.prep);
      const prepDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (prepItems.length > 0) {
        prepItems.forEach((item) => {
          prepDelivs.push({
            title: /^(gather|clear|plan|check|clean)/i.test(item) ? item : `Prep: ${item}`,
            type: 'prep' as any,
          });
        });
      } else {
        prepDelivs.push({ title: 'Clear physical work access area or empty vehicle boot', type: 'prep' as any });
      }
      prepDelivs.push({ title: 'Locate equipment warranty papers or service logbook', type: 'document' });
      milestones.push(
        createMilestone(
          'T-1d',
          -1 * 24 * 60,
          'Workspace & Logbook Prepped',
          'prep',
          'Clear workspace access and locate service records.',
          prepDelivs
        )
      );

      // T-0d: Complete
      milestones.push(
        createMilestone(
          'T-0d',
          0,
          'Service Completed & Records Archived',
          'admin',
          'Drop off, inspect completed service, and verify itemized invoice.',
          [
            { title: 'Inspect completed work & archive itemized invoice', type: 'document' },
          ]
        )
      );
      break;
    }

    // KIDS: SCHOOL
    case 'kids_school': {
      const supplyItems = extractAnswerList(answers.supplies);
      const supplyDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (supplyItems.length > 0) {
        supplyItems.forEach((item) => {
          supplyDelivs.push({
            title: /^(buy|gather|order|prep)/i.test(item) ? item : `Buy supplies: ${item}`,
            type: 'purchase',
          });
        });
        supplyDelivs.push({ title: 'Review school assignment rubric and milestone dates', type: 'document' });
      } else {
        supplyDelivs.push(
          { title: 'Buy tri-fold poster board, craft paper, and markers', type: 'purchase' },
          { title: 'Review school assignment rubric and milestone dates', type: 'document' }
        );
      }
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Materials & Supplies Purchased',
          'shopping',
          'Purchase display materials, craft supplies, or project components.',
          supplyDelivs
        )
      );

      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'Display Board & Draft Assembled',
          'prep',
          'Mount summaries, diagrams, and titles onto the presentation board.',
          [
            { title: 'Mount project summaries, photos, and charts on board', type: 'document' },
            { title: 'Parent review and check against rubric requirements', type: 'coordination' },
          ]
        )
      );

      const rehearseItems = extractAnswerList(answers.presentation);
      const rehearseDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (rehearseItems.length > 0) {
        rehearseItems.forEach((item) => {
          rehearseDelivs.push({
            title: /^(practice|rehearse|review)/i.test(item) ? item : `Rehearsal: ${item}`,
            type: 'coordination',
          });
        });
      } else {
        rehearseDelivs.push({ title: 'Practice 5-minute verbal walkthrough with timer', type: 'coordination' });
      }
      rehearseDelivs.push({ title: 'Pack finished project board in protective transport bag', type: 'document' });
      milestones.push(
        createMilestone(
          'T-2d',
          -2 * 24 * 60,
          'Presentation Rehearsed & Display Packed',
          'prep',
          'Practice verbal presentation and safely pack project display.',
          rehearseDelivs
        )
      );

      const permItems = extractAnswerList(answers.permissions);
      const permDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (permItems.length > 0) {
        permItems.forEach((item) => {
          permDelivs.push({
            title: /^(sign|complete|submit)/i.test(item) ? item : `School form: ${item}`,
            type: 'document',
          });
        });
      } else {
        permDelivs.push({ title: 'Sign parent consent slip & pack into school folder', type: 'document' });
      }
      milestones.push(
        createMilestone(
          'T-1d',
          -1 * 24 * 60,
          'Permission Slip Signed & Packed',
          'admin',
          'Complete final teacher authorizations and pack backpack for tomorrow.',
          permDelivs
        )
      );
      break;
    }

    // KIDS: HOBBIES
    case 'kids_hobbies': {
      const waiverDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        { title: 'Submit completed participation waiver & emergency form', type: 'document' },
        { title: 'Confirm tournament entry registration with organizers', type: 'booking' },
      ];
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Participation Waivers & Entry Confirmed',
          'booking',
          'Submit participation paperwork and confirm player roster registration.',
          waiverDelivs
        )
      );

      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'Carpooling & Schedule Finalized',
          'logistics',
          'Finalize travel arrangements, driver schedule, and arrival window.',
          [
            { title: 'Confirm seat in carpool or vehicle travel plan', type: 'coordination' },
            { title: 'Check venue address, parking instructions & arrival time', type: 'document' },
          ]
        )
      );

      const gearItems = extractAnswerList(answers.gear);
      const gearDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (gearItems.length > 0) {
        gearItems.forEach((item) => {
          gearDelivs.push({
            title: /^(prep|pack|clean|wash|buy|check)/i.test(item) ? item : `Pack & prep: ${item}`,
            type: 'purchase',
          });
        });
      } else {
        gearDelivs.push(
          { title: 'Wash clean jersey, pack shin guards & athletic footwear', type: 'purchase' },
          { title: 'Pack labelled water bottle & high-energy match snacks', type: 'purchase' }
        );
      }
      milestones.push(
        createMilestone(
          'T-2d',
          -2 * 24 * 60,
          'Uniform & Competition Kit Packed',
          'prep',
          'Ensure clean sports jersey, shin guards, and water bottle are packed.',
          gearDelivs
        )
      );

      milestones.push(
        createMilestone(
          'T-2h',
          -120,
          'Arrival Buffer & Warmup Observed',
          'logistics',
          'Leave with travel buffer and arrive on time for coach check-in.',
          [
            { title: 'Arrive 30 minutes before kickoff for coach warm-up', type: 'coordination' },
          ]
        )
      );
      break;
    }

    // TRIP & TRAVEL (Auxiliary)
    case 'trip': {
      milestones.push(
        createMilestone(
          'T-30d',
          -30 * 24 * 60,
          'Flights & Accommodations Locked',
          'booking',
          'Secure primary accommodations and transit tickets.',
          [
            { title: 'Confirm hotel or Airbnb booking & archive voucher', type: 'booking' },
            { title: 'Book flight / train tickets and select seats', type: 'booking' },
          ]
        )
      );

      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Passports & Key Activities Confirmed',
          'booking',
          'Verify official travel credentials and book limited excursion slots.',
          [
            { title: 'Check passport 6-month validity & travel insurance', type: 'document' },
            { title: 'Book high-demand museum, tour, or dinner reservations', type: 'booking' },
          ]
        )
      );

      milestones.push(
        createMilestone(
          'T-3d',
          -3 * 24 * 60,
          'Luggage & Travel Passes Packed',
          'prep',
          'Pack clothing, tech cables, and download offline maps and passes.',
          [
            { title: 'Pack suitcase with weather attire and charging adapters', type: 'purchase' },
            { title: 'Activate roaming eSIM and download offline maps', type: 'document' },
          ]
        )
      );

      milestones.push(
        createMilestone(
          'T-3h',
          -180,
          'Airport Departure Buffer Observed',
          'logistics',
          'Head to terminal with buffer for security screening and bag drop.',
          [
            { title: 'Arrive at airport 2.5 hours early for baggage drop', type: 'coordination' },
          ]
        )
      );
      break;
    }
  }

  // Sort chronologically (earliest milestone first: largest negative offset)
  return milestones.sort((a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime());
}
