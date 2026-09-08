import { Deliverable, EventCategory, TMinusMilestone } from '../types';
import { calculateOffsetDate } from './tminusRules';

export type CanonicalCategory =
  | 'party'
  | 'friends_visiting'
  | 'trip'
  | 'kids_school'
  | 'kids_hobbies'
  | 'subscription'
  | 'maintenance'
  | 'project_management';

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
    description: 'Birthdays, anniversaries, dinners, and milestones',
  },
  {
    id: 'friends_visiting',
    label: 'Friends Visiting',
    emoji: '🏡',
    badgeLabel: 'Friends Visiting',
    internalCategory: 'hosting_visitors',
    description: 'Guest bedrooms, dining, groceries, and weekend hosting',
  },
  {
    id: 'trip',
    label: 'Trip',
    emoji: '✈️',
    badgeLabel: 'Trip & Travel',
    internalCategory: 'travel_trip',
    description: 'Flights, accommodations, luggage, and excursions',
  },
  {
    id: 'kids_school',
    label: 'Kids: School',
    emoji: '🎒',
    badgeLabel: 'Kids: School',
    internalCategory: 'kids_school',
    description: 'Science fairs, Book Week, presentations, and permissions',
  },
  {
    id: 'kids_hobbies',
    label: 'Kids: Hobbies',
    emoji: '⚽',
    badgeLabel: 'Kids: Hobbies',
    internalCategory: 'kids_hobbies',
    description: 'Tournaments, matches, dance recitals, carpooling, and uniforms',
  },
  {
    id: 'subscription',
    label: 'Subscription',
    emoji: '📱',
    badgeLabel: 'Subscription Review',
    internalCategory: 'subscription',
    description: 'Notice cutoffs, free trials, renewal dates, and data backups',
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    emoji: '🔧',
    badgeLabel: 'Service & Maintenance',
    internalCategory: 'maintenance',
    description: 'Car servicing, home HVAC, dental checkups, and quotes',
  },
  {
    id: 'project_management',
    label: 'Project Management',
    emoji: '📊',
    badgeLabel: 'Project Management',
    internalCategory: 'project_deadline',
    description: 'Stakeholder sign-offs, sprint releases, staging QA, and demos',
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
      chips: ['Buy solo present & card', 'Organize group gift pool', 'Themed attire / costume', 'No gifts requested'],
      allowMultiple: true,
    },
  ],

  friends_visiting: [
    {
      id: 'bedroom',
      label: 'Guest Bedroom & Linen Readiness',
      question: 'How is the sleeping arrangement set up?',
      placeholder: 'e.g., Wash fresh bedsheets, set out clean bath towels & toiletries...',
      chips: ['Clean sheets & fresh towels', 'Prep spare room / sofa bed', 'Stock guest toiletries', 'Guest room ready'],
      allowMultiple: true,
    },
    {
      id: 'dining',
      label: 'Dining & Groceries',
      question: 'What are the dining plans during their stay?',
      placeholder: 'e.g., Reserve Friday dinner table, stock breakfast favorites & coffee...',
      chips: ['Reserve local restaurant', 'Stock breakfast & snacks', 'Plan home-cooked dinner', 'Flexible dining'],
      allowMultiple: true,
    },
    {
      id: 'itinerary',
      label: 'Arrival Logistics & Itinerary',
      question: 'How are they arriving and what activities are planned?',
      placeholder: 'e.g., Pick up at train station at 6pm, sightsee downtown Saturday...',
      chips: ['Station / airport pickup', 'Share Wi-Fi & door entry code', 'City sightseeing & walking tour', 'Relaxed home hangout'],
      allowMultiple: true,
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
};

/**
 * Classifies submitted title strictly into one of the 8 canonical categories
 */
export function classifySubmittedTitle(title: string, presetHint?: string): CanonicalCategory {
  // If user launched from a preset or presetHint is given
  if (presetHint) {
    if (presetHint === 'kids_hobbies' || presetHint === 'hobbies') return 'kids_hobbies';
    if (presetHint === 'kids_school' || presetHint === 'school') return 'kids_school';
    if (presetHint === 'trip' || presetHint === 'travel_trip') return 'trip';
    if (presetHint === 'party' || presetHint === 'birthday' || presetHint === 'birthday_party') return 'party';
    if (presetHint === 'friends' || presetHint === 'hosting_visitors') return 'friends_visiting';
    if (presetHint === 'subscription') return 'subscription';
    if (presetHint === 'maintenance') return 'maintenance';
    if (presetHint === 'project' || presetHint === 'project_deadline') return 'project_management';
  }

  const text = (title || '').toLowerCase();

  // 1. Kids: Hobbies & Sports
  if (
    /\b(soccer|football|basketball|baseball|softball|hockey|lacrosse|rugby|tennis|swimming|swim|karate|judo|taekwondo|martial arts|dance|ballet|gymnastics|cheerleading|piano|violin|guitar|choir|band|recital|tournament|championship|match|meet|game|practice|rehearsal|scouts?|athletics|cross country|track)\b/i.test(
      text
    )
  ) {
    return 'kids_hobbies';
  }

  // 2. Kids: School
  if (
    /\b(school|science fair|book week|spirit day|spelling bee|math olympiad|open house|pta|parent-teacher|report card|homework|field trip|class project|grade|kindergarten|elementary|high school|exam|school play|costume parade|revision)\b/i.test(
      text
    )
  ) {
    return 'kids_school';
  }

  // 3. Trip & Travel
  if (
    /\b(trip|vacation|holiday|travel|flight|flights|hotel|airbnb|getaway|resort|weekend away|road trip|camping|campsite|backpacking|city trip|visit to\b|fly to\b)/i.test(
      text
    )
  ) {
    return 'trip';
  }

  // 4. Friends Visiting / Hosting
  if (
    /\b(visiting|visitor|visitors|staying with|hosting|guests|in town|sleepover|friends over|weekend with|family visiting)\b/i.test(
      text
    )
  ) {
    return 'friends_visiting';
  }

  // 5. Subscription
  if (
    /\b(subscription|renewal|free trial|gym trial|membership|recurring charge|billing renewal|cancel|gym membership|saas|software subscription)\b/i.test(
      text
    )
  ) {
    return 'subscription';
  }

  // 6. Maintenance & Service
  if (
    /\b(service|car service|oil change|inspection|dentist|dental|doctor|checkup|vet|veterinarian|mechanic|hvac|boiler|plumber|electrician|garage|tire|brakes|m\.o\.t|mot|repairs?)\b/i.test(
      text
    )
  ) {
    return 'maintenance';
  }

  // 7. Project Management & Deadlines
  if (
    /\b(project|deadline|sprint|demo|release|launch|milestone|presentation|pitch|hackathon|audit|client review|deliverable|staging|qa freeze|deployment|rollout)\b/i.test(
      text
    )
  ) {
    return 'project_management';
  }

  // 8. Party & Celebrations
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
    case 'kids_hobbies': {
      // T-14d: Registration & Waivers
      const waiverDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        { title: 'Submit completed participation waiver & emergency form', type: 'document' },
        { title: 'Confirm tournament entry registration with organizers', type: 'booking' },
      ];
      const ticketItems = extractAnswerList(answers.tickets);
      if (ticketItems.length > 0) {
        ticketItems.forEach((t) => {
          waiverDelivs.push({ title: t, type: 'document' });
        });
      }
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Confirm Registration & Submit Waivers',
          'booking',
          'Submit participation paperwork and confirm player roster registration.',
          waiverDelivs
        )
      );

      // T-7d: RSVP & Transport
      const transportItems = extractAnswerList(answers.transport);
      const transportDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: transportItems.length > 0
            ? `Confirm transport: ${transportItems.join(', ')}`
            : 'Confirm seat in carpool or vehicle travel plan',
          type: 'coordination',
        },
        { title: 'Check venue address, parking instructions & arrival time', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'RSVP & Arrange Transport',
          'logistics',
          'Finalize travel arrangements, driver schedule, and arrival window.',
          transportDelivs
        )
      );

      // T-2d: Pack Uniform & Shinguards
      const gearItems = extractAnswerList(answers.gear);
      const gearDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (gearItems.length > 0) {
        gearItems.forEach((item) => {
          gearDelivs.push({
            title: /^(prep|pack|clean|wash|buy|check)/i.test(item) ? item : `Pack & prep: ${item}`,
            type: 'purchase',
          });
        });
        if (!gearItems.some((i) => /water|snack/i.test(i))) {
          gearDelivs.push({ title: 'Pack labelled water bottle & high-energy match snacks', type: 'purchase' });
        }
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
          'Pack Uniform & Shinguards',
          'prep',
          'Ensure clean competition apparel, safety equipment, and nutrition are packed.',
          gearDelivs
        )
      );

      // T-2h: Departure Buffer
      milestones.push(
        createMilestone(
          'T-2h',
          -120,
          'Departure Buffer & Check-In',
          'logistics',
          'Leave with travel buffer and arrive on time for coach check-in.',
          [
            { title: 'Arrive 30 minutes before kickoff for coach warm-up', type: 'coordination' },
          ]
        )
      );
      break;
    }

    case 'kids_school': {
      // T-14d: Supplies
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
          'Buy Project Materials & Supplies',
          'shopping',
          'Purchase display materials, craft supplies, or project components.',
          supplyDelivs
        )
      );

      // T-7d: Build & Draft
      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'Assemble Display Board & Complete Draft',
          'prep',
          'Mount summaries, diagrams, and titles onto the presentation board.',
          [
            { title: 'Mount project summaries, photos, and charts on board', type: 'document' },
            { title: 'Parent review and check against rubric requirements', type: 'coordination' },
          ]
        )
      );

      // T-2d: Rehearsal
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
          'Rehearse Presentation & Pack Display',
          'prep',
          'Practice verbal presentation and safely pack project display.',
          rehearseDelivs
        )
      );

      // T-1d: Permissions
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
          'Sign Permission Slip & Final Pack',
          'admin',
          'Complete final teacher authorizations and pack backpack for tomorrow.',
          permDelivs
        )
      );
      break;
    }

    case 'trip': {
      // T-30d: Flights & Stay
      const lodgingItems = extractAnswerList(answers.lodging);
      const transitItems = extractAnswerList(answers.transport);
      const bookDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: lodgingItems.length > 0
            ? `Confirm lodging: ${lodgingItems.join(', ')}`
            : 'Confirm hotel or Airbnb booking & archive voucher',
          type: 'booking',
        },
        {
          title: transitItems.length > 0
            ? `Confirm transit: ${transitItems.join(', ')}`
            : 'Book flight / train tickets and select seats',
          type: 'booking',
        },
      ];
      milestones.push(
        createMilestone(
          'T-30d',
          -30 * 24 * 60,
          'Book Flights & Stay',
          'booking',
          'Secure primary accommodations and transit tickets.',
          bookDelivs
        )
      );

      // T-14d: Passports & Activities
      const actItems = extractAnswerList(answers.activities);
      const actDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        { title: 'Check passport 6-month validity & download travel insurance', type: 'document' },
      ];
      if (actItems.length > 0) {
        actItems.forEach((item) => {
          actDelivs.push({
            title: /^(book|reserve|pack|check)/i.test(item) ? item : `Reserve activity: ${item}`,
            type: 'booking',
          });
        });
      } else {
        actDelivs.push({ title: 'Book high-demand museum, tour, or dinner reservations', type: 'booking' });
      }
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Check Passports & Book Key Activities',
          'booking',
          'Verify official travel credentials and book limited excursion slots.',
          actDelivs
        )
      );

      // T-3d: Luggage & Boarding Passes
      milestones.push(
        createMilestone(
          'T-3d',
          -3 * 24 * 60,
          'Pack Luggage & Download Boarding Passes',
          'prep',
          'Pack clothing, tech cables, and download offline maps and passes.',
          [
            { title: 'Pack suitcase with weather attire and charging adapters', type: 'purchase' },
            { title: 'Activate international roaming eSIM and download offline maps', type: 'document' },
          ]
        )
      );

      // T-3h: Airport Buffer
      milestones.push(
        createMilestone(
          'T-3h',
          -180,
          'Airport Departure Buffer & Check-In',
          'logistics',
          'Head to terminal with buffer for security screening and bag drop.',
          [
            { title: 'Arrive at airport 2.5 hours early for baggage drop', type: 'coordination' },
          ]
        )
      );
      break;
    }

    case 'party': {
      // T-21d: Invites
      const rsvpItems = extractAnswerList(answers.rsvps);
      const inviteDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: rsvpItems.length > 0
            ? `Dispatched invites: ${rsvpItems.join(', ')}`
            : 'Send digital invitation link & setup RSVP tracker',
          type: 'coordination',
        },
        { title: 'Track dietary restrictions and attendee headcount', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-21d',
          -21 * 24 * 60,
          'Send Invitations & Track RSVPs',
          'booking',
          'Dispatch invitations to guests and coordinate headcount.',
          inviteDelivs
        )
      );

      // T-10d: Present & Card
      const giftItems = extractAnswerList(answers.gifts_details);
      const giftDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (giftItems.length > 0) {
        giftItems.forEach((item) => {
          giftDelivs.push({
            title: /^(buy|order|organize|prepare)/i.test(item) ? item : `Gift details: ${item}`,
            type: 'purchase',
          });
        });
        giftDelivs.push({ title: 'Write heartfelt celebratory card and prepare gift wrapping', type: 'document' });
      } else {
        giftDelivs.push(
          { title: 'Order birthday gift online with parcel delivery tracking', type: 'purchase' },
          { title: 'Write heartfelt celebratory card and prepare gift wrapping', type: 'document' }
        );
      }
      milestones.push(
        createMilestone(
          'T-10d',
          -10 * 24 * 60,
          'Buy Present & Card',
          'shopping',
          'Order celebratory gift and write handwritten card.',
          giftDelivs
        )
      );

      // T-4d: Cake & Drinks
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
          { title: 'Pick up party drinks, snacks, mixers, and fresh ice bags', type: 'purchase' }
        );
      }
      milestones.push(
        createMilestone(
          'T-4d',
          -4 * 24 * 60,
          'Order Cake & Buy Party Beverages',
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
          'Setup Venue & Chill Drinks',
          'prep',
          'Chill drinks on ice, set out glasses, and prepare music playlist.',
          [
            { title: 'Chill beverages on ice and set up table presentation', type: 'prep' as any },
          ]
        )
      );
      break;
    }

    case 'friends_visiting': {
      // T-7d: Guest Bedroom
      const bedroomItems = extractAnswerList(answers.bedroom);
      const roomDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (bedroomItems.length > 0) {
        bedroomItems.forEach((item) => {
          roomDelivs.push({
            title: /^(wash|clean|prep|stock|set out)/i.test(item) ? item : `Bedroom prep: ${item}`,
            type: 'coordination',
          });
        });
      } else {
        roomDelivs.push({ title: 'Put fresh sheets on guest bed and set out clean bath towels', type: 'coordination' });
      }
      roomDelivs.push({ title: 'Stock guest nightstand with spare phone charger and Wi-Fi password card', type: 'document' });
      milestones.push(
        createMilestone(
          'T-7d',
          -7 * 24 * 60,
          'Clean Guest Room & Wash Bedding',
          'prep',
          'Prepare guest room with fresh linens, towels, and toiletries.',
          roomDelivs
        )
      );

      // T-3d: Stock Fridge & Dining
      const diningItems = extractAnswerList(answers.dining);
      const dinDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (diningItems.length > 0) {
        diningItems.forEach((item) => {
          dinDelivs.push({
            title: /^(book|reserve|stock|plan)/i.test(item) ? item : `Dining prep: ${item}`,
            type: 'booking',
          });
        });
      } else {
        dinDelivs.push(
          { title: 'Book table at favorite local restaurant for Friday night', type: 'booking' },
          { title: 'Stock fridge with breakfast essentials, fruit, and coffee beans', type: 'purchase' }
        );
      }
      milestones.push(
        createMilestone(
          'T-3d',
          -3 * 24 * 60,
          'Stock Fridge & Reserve Restaurant',
          'shopping',
          'Plan meals, make dinner reservation, and grocery shop for breakfast.',
          dinDelivs
        )
      );

      // T-1d: Arrival & Key
      const itinItems = extractAnswerList(answers.itinerary);
      const arrDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [];
      if (itinItems.length > 0) {
        itinItems.forEach((item) => {
          arrDelivs.push({
            title: /^(confirm|share|pick up|coordinate)/i.test(item) ? item : `Arrival prep: ${item}`,
            type: 'coordination',
          });
        });
      } else {
        arrDelivs.push({ title: 'Confirm train/flight arrival time and share entry door code', type: 'coordination' });
      }
      milestones.push(
        createMilestone(
          'T-1d',
          -1 * 24 * 60,
          'Coordinate Arrival & Share Door Code',
          'logistics',
          'Confirm station/airport pickup logistics and coordinate key handover.',
          arrDelivs
        )
      );
      break;
    }

    case 'subscription': {
      // T-14d: Terms
      const noticeItems = extractAnswerList(answers.notice_cutoff);
      const termsDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: noticeItems.length > 0
            ? `Renewal notice: ${noticeItems.join(', ')}`
            : 'Confirm renewal billing date and minimum notice cancellation window',
          type: 'document',
        },
        { title: 'Audit monthly/annual usage to decide renew vs cancel', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Review Renewal Terms & Cancellation Cutoff',
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
          'Export Data & Download Invoices',
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
          'Submit Formal Cancellation',
          'admin',
          'Submit cancellation request in portal and retain confirmation email.',
          [
            { title: 'Cancel subscription via settings portal and save confirmation receipt', type: 'document' },
          ]
        )
      );
      break;
    }

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
        { title: 'Obtain upfront cost estimate and confirm replacement parts', type: 'document' },
      ];
      milestones.push(
        createMilestone(
          'T-10d',
          -10 * 24 * 60,
          'Book Service Appointment & Get Quote',
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
          'Clear Area & Gather Logbook',
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
          'Complete Service & Check Invoice',
          'admin',
          'Drop off, inspect completed service, and verify itemized invoice.',
          [
            { title: 'Inspect completed work, verify warning light reset, and archive invoice', type: 'document' },
          ]
        )
      );
      break;
    }

    case 'project_management': {
      // T-14d: Scope
      const scopeItems = extractAnswerList(answers.scope_review);
      const scopeDelivs: { title: string; type: 'booking' | 'purchase' | 'document' | 'coordination' }[] = [
        {
          title: scopeItems.length > 0
            ? `Review criteria: ${scopeItems.join(', ')}`
            : 'Lock acceptance criteria with lead stakeholders',
          type: 'coordination',
        },
        { title: 'Send calendar invitations for final milestone review', type: 'booking' },
      ];
      milestones.push(
        createMilestone(
          'T-14d',
          -14 * 24 * 60,
          'Lock Scope & Schedule Stakeholder Review',
          'booking',
          'Finalize acceptance criteria and schedule final stakeholder sign-off.',
          scopeDelivs
        )
      );

      // T-5d: QA
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
          { title: 'Draft release notes and verify production deployment checklist', type: 'document' }
        );
      }
      milestones.push(
        createMilestone(
          'T-5d',
          -5 * 24 * 60,
          'Run Staging QA & Draft Release Notes',
          'prep',
          'Execute regression testing and prepare customer-facing documentation.',
          qaDelivs
        )
      );

      // T-1d: Sign-off
      milestones.push(
        createMilestone(
          'T-1d',
          -1 * 24 * 60,
          'Final Stakeholder Sign-Off & Launch Buffer',
          'admin',
          'Obtain written go/no-go approval and confirm go-live timeline.',
          [
            { title: 'Obtain written sign-off approval from project leads', type: 'document' },
          ]
        )
      );
      break;
    }
  }

  // Sort chronologically (earliest first: largest negative offset)
  return milestones.sort((a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime());
}
