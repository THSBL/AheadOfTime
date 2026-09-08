import { OnboardingProfile, FamilyStructure, CalendarTypeScope } from '../types';

export interface PromptPreset {
  id: string;
  title: string;
  shortTitle?: string;
  category: 'birthday_party' | 'hosting_visitors' | 'travel_trip' | 'project_deadline' | 'booking_trip' | 'subscription' | 'maintenance' | 'kids_school' | 'kids_hobbies' | 'custom';
  modeExpected: 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED';
  prompt: string;
  icon: string;
  emoji: string;
  description: string;
  whoLabel: string;
  whoPlaceholder: string;
  whenLabel: string;
  badge?: string;
  subPresets?: PromptPreset[];
}

/**
 * 1. BASELINE PRESETS CATALOGUE
 */
export const PRESET_PARTY: PromptPreset = {
  id: 'birthday',
  title: 'Party',
  shortTitle: 'Party',
  category: 'birthday_party',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Party celebration for [who] on [date]',
  icon: 'Cake',
  emoji: '🎉',
  description: 'Celebrations, birthdays, dinners & party lead times.',
  whoLabel: 'Who or what occasion is the party for?',
  whoPlaceholder: 'e.g. Maya & Liam Wedding, Dad 60th, Sarah Anniversary',
  whenLabel: 'When is the party date?'
};

export const PRESET_FRIENDS: PromptPreset = {
  id: 'friends',
  title: 'Friends Visiting',
  shortTitle: 'Friends',
  category: 'hosting_visitors',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Friends visiting: [who] staying from [date]',
  icon: 'Users',
  emoji: '👥',
  description: 'Hosting, house prep, dining spots & guest arrivals.',
  whoLabel: 'Who is visiting?',
  whoPlaceholder: 'e.g. Alex & Sarah, College friends',
  whenLabel: 'When are they arriving?'
};

export const PRESET_TRIP: PromptPreset = {
  id: 'trip',
  title: 'Trip',
  shortTitle: 'Trip',
  category: 'travel_trip',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Trip to [who] on [date]',
  icon: 'Plane',
  emoji: '✈️',
  description: 'Vacations, getaways, travel packing & bookings.',
  whoLabel: 'Where are you traveling?',
  whoPlaceholder: 'e.g. Tokyo, South of France, Barcelona',
  whenLabel: 'When is the departure date?'
};

export const PRESET_PROJECT: PromptPreset = {
  id: 'project',
  title: 'Project Management',
  shortTitle: 'Project',
  category: 'project_deadline',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Project launch for [who] on [date]',
  icon: 'Rocket',
  emoji: '🚀',
  description: 'Launches, sprints, onboarding runways & code freezes.',
  whoLabel: 'What is the project milestone / deliverable?',
  whoPlaceholder: 'e.g. Mobile App v2.0 Launch, Q3 Investor Deck',
  whenLabel: 'When is the target deadline date?'
};

export const PRESET_SUBSCRIPTION: PromptPreset = {
  id: 'subscription',
  title: 'Subscription',
  shortTitle: 'Subscription',
  category: 'subscription',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Subscription cancellation check for [who] before renewal on [date]',
  icon: 'CreditCard',
  emoji: '💳',
  description: 'Trial reviews, renewal cancellation windows & billing cycles.',
  whoLabel: 'Which subscription or service?',
  whoPlaceholder: 'e.g. Netflix, Equinox Gym, Adobe Creative Cloud, Amazon Prime',
  whenLabel: 'When does the renewal or billing cycle end?'
};

export const PRESET_MAINTENANCE: PromptPreset = {
  id: 'maintenance',
  title: 'Maintenance',
  shortTitle: 'Maintenance',
  category: 'maintenance',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Maintenance service for [who] on [date]',
  icon: 'Wrench',
  emoji: '🔧',
  description: 'Home/car service checkpoints, routine upkeep & inspections.',
  whoLabel: 'What requires maintenance?',
  whoPlaceholder: 'e.g. Car Oil Change & Inspection, Home AC Filter & Coil Check',
  whenLabel: 'Target service or maintenance date?'
};

/**
 * KIDS SUB-PRESETS (Rule A)
 */
export const PRESET_KIDS_SCHOOL: PromptPreset = {
  id: 'kids_school',
  title: 'Kids: School',
  shortTitle: 'School',
  category: 'kids_school',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Kids school event: [who] on [date]',
  icon: 'GraduationCap',
  emoji: '🎒',
  description: 'Book Week, spirit days, science projects, parent-teacher reviews.',
  whoLabel: 'Which child and school event / project?',
  whoPlaceholder: 'e.g. Leo Book Week costume, Maya Science Fair project, Term 3 Review',
  whenLabel: 'When is the school event or project deadline?'
};

export const PRESET_KIDS_HOBBIES: PromptPreset = {
  id: 'kids_hobbies',
  title: 'Kids: Hobbies',
  shortTitle: 'Hobbies',
  category: 'kids_hobbies',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Kids hobby / sports event: [who] on [date]',
  icon: 'Trophy',
  emoji: '⚽',
  description: 'Tournaments, gear checks, recital prep, transport pooling.',
  whoLabel: 'Which child, tournament, or recital?',
  whoPlaceholder: 'e.g. Maya Soccer Tournament, Leo Piano Recital, Swim Club Finals',
  whenLabel: 'When is the tournament or recital date?'
};

export const PRESET_KIDS: PromptPreset = {
  id: 'kids',
  title: 'Kids',
  shortTitle: 'Kids',
  category: 'kids_school',
  modeExpected: 'CREATE_AND_INTAKE',
  prompt: 'Kids activity prep for [who] on [date]',
  icon: 'Sparkles',
  emoji: '🧸',
  description: 'School events, costume days, sports tournaments & recital runways.',
  whoLabel: 'Which child and activity?',
  whoPlaceholder: 'e.g. Leo Book Week, Maya Soccer Finals, Science Project',
  whenLabel: 'When is the target event date?',
  subPresets: [PRESET_KIDS_SCHOOL, PRESET_KIDS_HOBBIES]
};

/**
 * Normalizes any profile object (legacy or new) to standard technical schema
 */
export function normalizeProfile(profile?: Partial<OnboardingProfile> | null): {
  family_structure: FamilyStructure;
  calendar_type: CalendarTypeScope;
} {
  let family_structure: FamilyStructure = 'single';
  let calendar_type: CalendarTypeScope = 'personal';

  if (profile) {
    if (profile.family_structure) {
      family_structure = profile.family_structure;
    } else if (profile.familyStatus) {
      const fs = profile.familyStatus.toLowerCase();
      if (fs.includes('kid') || fs.includes('family') || fs.includes('parent') || fs.includes('couple with kids')) {
        family_structure = 'family_with_kids';
      } else if (fs.includes('couple')) {
        family_structure = 'couple';
      } else {
        family_structure = 'single';
      }
    }

    if (profile.calendar_type) {
      calendar_type = profile.calendar_type;
    } else if (profile.calendarType) {
      const ct = profile.calendarType.toLowerCase();
      if (ct.includes('mixed')) {
        calendar_type = 'mixed';
      } else if (ct.includes('business') || ct.includes('work')) {
        calendar_type = 'business';
      } else {
        calendar_type = 'personal';
      }
    }
  }

  return { family_structure, calendar_type };
}

export interface CategorizedPresets {
  primary: PromptPreset[];
  secondary: PromptPreset[];
  all: PromptPreset[];
  hasKids: boolean;
  hasProject: boolean;
  canImportSpreadsheet: boolean;
  isPersonalOnly: boolean;
  familyStructure: FamilyStructure;
  calendarType: CalendarTypeScope;
}

/**
 * Dynamic Preset Categorization Engine
 */
export function getCategorizedPresets(profile?: Partial<OnboardingProfile> | null): CategorizedPresets {
  const { family_structure, calendar_type } = normalizeProfile(profile);
  const isPersonalOnly = calendar_type === 'personal';
  const hasKids = family_structure === 'family_with_kids';
  const hasProject = !isPersonalOnly;
  const canImportSpreadsheet = !isPersonalOnly;

  // Baseline primary presets
  const primary: PromptPreset[] = [
    PRESET_PARTY,
    PRESET_FRIENDS,
    PRESET_TRIP,
  ];

  // Rule C: Retain Project Management for Mixed or Business
  if (hasProject) {
    primary.push(PRESET_PROJECT);
  }

  // Rule A: Kids Profiling (Inject into primary when family with kids)
  if (hasKids) {
    primary.push(PRESET_KIDS_SCHOOL);
    primary.push(PRESET_KIDS_HOBBIES);
  }

  let secondary: PromptPreset[] = [];

  if (isPersonalOnly) {
    // Rule B: Suppress Project Management & Elevate Subscription and Maintenance
    primary.push(PRESET_SUBSCRIPTION);
    primary.push(PRESET_MAINTENANCE);
  } else {
    // Keep Subscription & Maintenance in high-utility secondary slot
    secondary = [PRESET_SUBSCRIPTION, PRESET_MAINTENANCE];
  }

  const all = [...primary, ...secondary];

  return {
    primary,
    secondary,
    all,
    hasKids,
    hasProject,
    canImportSpreadsheet,
    isPersonalOnly,
    familyStructure: family_structure,
    calendarType: calendar_type,
  };
}

/**
 * Pure selector function that returns the filtered, ordered array of presets
 * strictly based on Rules A, B, and C
 */
export function getVisiblePresets(profile?: Partial<OnboardingProfile> | null): PromptPreset[] {
  const { primary, secondary } = getCategorizedPresets(profile);
  return [...primary, ...secondary];
}

// Backwards-compatible legacy exports
export const EVENT_PRESETS: PromptPreset[] = [
  PRESET_PARTY,
  PRESET_FRIENDS,
  PRESET_TRIP,
  PRESET_PROJECT,
];

export const SMALL_PRESETS: PromptPreset[] = [
  PRESET_SUBSCRIPTION,
  PRESET_MAINTENANCE,
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

