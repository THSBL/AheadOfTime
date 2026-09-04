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

export const INITIAL_EVENTS: any[] = [];
