export interface PromptPreset {
  id: string;
  title: string;
  category: 'birthday_party' | 'hosting_visitors' | 'travel_trip' | 'project_deadline' | 'booking_trip' | 'subscription' | 'maintenance' | 'custom';
  modeExpected: 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED';
  prompt: string;
  icon: string;
  emoji: string;
  description: string;
  whoLabel: string;
  whoPlaceholder: string;
  whenLabel: string;
}

export const EVENT_PRESETS: PromptPreset[] = [
  {
    id: 'birthday',
    title: 'Party (Birthday / Wedding / Anniversary...)',
    category: 'birthday_party',
    modeExpected: 'CREATE_AND_INTAKE',
    prompt: 'Party celebration for [who] on [date]',
    icon: 'Cake',
    emoji: '🎉',
    description: 'Gift strategies, costume themes, bakery orders & party lead times.',
    whoLabel: 'Who or what occasion is the party for?',
    whoPlaceholder: 'e.g. Maya & Liam Wedding, Dad 60th, Sarah Anniversary',
    whenLabel: 'When is the party date?'
  },
  {
    id: 'friends',
    title: 'Friends visiting',
    category: 'hosting_visitors',
    modeExpected: 'CREATE_AND_INTAKE',
    prompt: 'Friends visiting: [who] staying from [date]',
    icon: 'Users',
    emoji: '👥',
    description: 'Dinner reservations, guest room prep, accommodation recommendations & groceries.',
    whoLabel: 'Who is visiting?',
    whoPlaceholder: 'e.g. Alex & Sarah, College friends',
    whenLabel: 'When are they arriving?'
  },
  {
    id: 'trip',
    title: 'Trip / Holiday',
    category: 'travel_trip',
    modeExpected: 'CREATE_AND_INTAKE',
    prompt: 'Trip to [who] on [date]',
    icon: 'Plane',
    emoji: '✈️',
    description: 'Passports, return dates, separate activities & gear buying checklists (sunscreen, boots).',
    whoLabel: 'Where are you traveling?',
    whoPlaceholder: 'e.g. Tokyo, South of France, Barcelona',
    whenLabel: 'When is the departure date?'
  },
  {
    id: 'project',
    title: 'Project management',
    category: 'project_deadline',
    modeExpected: 'CREATE_AND_INTAKE',
    prompt: 'Project launch for [who] on [date]',
    icon: 'Rocket',
    emoji: '🚀',
    description: 'Stakeholder reviews, QA code freezes, collateral & release runbooks.',
    whoLabel: 'What is the project milestone / deliverable?',
    whoPlaceholder: 'e.g. Mobile App v2.0 Launch, Q3 Investor Deck',
    whenLabel: 'When is the target deadline date?'
  },
];

export const SMALL_PRESETS: PromptPreset[] = [
  {
    id: 'subscription',
    title: 'Subscription cancellation',
    category: 'subscription',
    modeExpected: 'CREATE_AND_INTAKE',
    prompt: 'Subscription cancellation check for [who] before renewal on [date]',
    icon: 'CreditCard',
    emoji: '💳',
    description: 'Notice periods, contract terms, billing cutoff dates & data exports.',
    whoLabel: 'Which subscription or service?',
    whoPlaceholder: 'e.g. Netflix, Equinox Gym, Adobe Creative Cloud, Amazon Prime',
    whenLabel: 'When does the renewal or billing cycle end?'
  },
  {
    id: 'maintenance',
    title: 'Maintenance (car, AC)',
    category: 'maintenance',
    modeExpected: 'CREATE_AND_INTAKE',
    prompt: 'Maintenance service for [who] on [date]',
    icon: 'Wrench',
    emoji: '🔧',
    description: 'Vehicle oil change & inspection, home AC filter check, seasonal service.',
    whoLabel: 'What requires maintenance?',
    whoPlaceholder: 'e.g. Car Oil Change & Inspection, Home AC Filter & Coil Check',
    whenLabel: 'Target service or maintenance date?'
  }
];

export const QUICK_OPTIONS = [
  {
    id: 'subscription',
    title: 'Subscription cancellation',
    emoji: '💳',
    prompt: 'Subscription cancellation check for unused streaming, gym, or SaaS services.',
    category: 'custom'
  },
  {
    id: 'maintenance',
    title: 'Maintenance (car, AC)',
    emoji: '🔧',
    prompt: 'Schedule car oil change, AC filter check, and home maintenance reminder.',
    category: 'custom'
  },
  {
    id: 'investment',
    title: 'Investment plan review',
    emoji: '📈',
    prompt: 'Review investment portfolio, rebalance assets, and check retirement contributions.',
    category: 'custom'
  }
];

export const SAMPLE_PRESETS: PromptPreset[] = EVENT_PRESETS;

export const INITIAL_EVENTS: any[] = [
  {
    id: 'evt-maya-birthday',
    title: "Maya's 30th Birthday Party",
    category: 'birthday_party',
    eventDate: '2026-09-10',
    eventTime: '19:00',
    location: 'Hackney Loft, London',
    status: 'milestones_active',
    context: {
      giftType: 'solo',
      isThemed: true,
      theme: '90s Retro',
      cakeStrategy: 'custom_cake',
      transportType: 'taxi',
    },
    milestones: [
      {
        id: 'ms-maya-1',
        eventId: 'evt-maya-birthday',
        tMinusLabel: 'T-14d',
        tMinusOffsetMinutes: -20160,
        calculatedDate: '2026-08-27T19:00:00.000Z',
        title: 'Order birthday gift online',
        description: 'Select vintage Polaroid camera & custom vinyl record with shipping buffer',
        category: 'shopping',
        status: 'pending'
      },
      {
        id: 'ms-maya-2',
        eventId: 'evt-maya-birthday',
        tMinusLabel: 'T-7d',
        tMinusOffsetMinutes: -10080,
        calculatedDate: '2026-09-03T19:00:00.000Z',
        title: 'Order custom bakery cake',
        description: 'Confirm 90s theme cake design with Violet Bakery',
        category: 'shopping',
        status: 'pending'
      },
      {
        id: 'ms-maya-3',
        eventId: 'evt-maya-birthday',
        tMinusLabel: 'T-2d',
        tMinusOffsetMinutes: -2880,
        calculatedDate: '2026-09-08T19:00:00.000Z',
        title: 'Wrap gift & write birthday card',
        description: 'Prepare retro card and ribbon wrapping',
        category: 'prep',
        status: 'pending'
      },
      {
        id: 'ms-maya-4',
        eventId: 'evt-maya-birthday',
        tMinusLabel: 'T-2h',
        tMinusOffsetMinutes: -120,
        calculatedDate: '2026-09-10T17:00:00.000Z',
        title: 'Pre-book taxi / rideshare',
        description: 'Schedule taxi with 20min buffer to venue',
        category: 'logistics',
        status: 'pending'
      }
    ],
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z'
  },
  {
    id: 'evt-alex-sarah',
    title: "Alex & Sarah Visiting Weekend",
    category: 'hosting_visitors',
    eventDate: '2026-10-16',
    eventTime: '17:00',
    location: 'London',
    status: 'milestones_active',
    context: {
      diningPlan: 'reservations',
      guestCount: 2
    },
    milestones: [
      {
        id: 'ms-alex-1',
        eventId: 'evt-alex-sarah',
        tMinusLabel: 'T-30d',
        tMinusOffsetMinutes: -43200,
        calculatedDate: '2026-09-16T17:00:00.000Z',
        title: 'Book restaurant reservations',
        description: 'Reserve dinner tables for Friday and Saturday night',
        category: 'booking',
        status: 'pending'
      },
      {
        id: 'ms-alex-2',
        eventId: 'evt-alex-sarah',
        tMinusLabel: 'T-7d',
        tMinusOffsetMinutes: -10080,
        calculatedDate: '2026-10-09T17:00:00.000Z',
        title: 'Confirm arrival time & dietary preferences',
        description: 'Check arrival trains and breakfast requests',
        category: 'prep',
        status: 'pending'
      },
      {
        id: 'ms-alex-3',
        eventId: 'evt-alex-sarah',
        tMinusLabel: 'T-3d',
        tMinusOffsetMinutes: -4320,
        calculatedDate: '2026-10-13T17:00:00.000Z',
        title: 'Buy breakfast groceries & drinks',
        description: 'Stock coffee, fresh bread, fruit, and snacks',
        category: 'shopping',
        status: 'pending'
      },
      {
        id: 'ms-alex-4',
        eventId: 'evt-alex-sarah',
        tMinusLabel: 'T-1d',
        tMinusOffsetMinutes: -1440,
        calculatedDate: '2026-10-15T17:00:00.000Z',
        title: 'Prepare guest room & fresh towels',
        description: 'Make bed with clean linens and check Wi-Fi password card',
        category: 'prep',
        status: 'pending'
      }
    ],
    createdAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z'
  }
];
