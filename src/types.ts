export type OperationalMode = 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED' | 'NORMAL';

export type EventCategory = 
  | 'birthday_party' 
  | 'hosting_visitors' 
  | 'friends_family'
  | 'hobbies'
  | 'festival_concert' 
  | 'travel_trip' 
  | 'dinner_social' 
  | 'project_deadline'
  | 'booking_trip'
  | 'subscription'
  | 'maintenance'
  | 'kids_school'
  | 'kids_hobbies'
  | 'custom';

export type MilestoneCategory = 
  | 'logistics' 
  | 'gift' 
  | 'booking' 
  | 'shopping' 
  | 'prep' 
  | 'watchpoint' 
  | 'costume'
  | 'tickets'
  | 'review'
  | 'marketing'
  | 'work'
  | 'admin'
  | 'project_deadline'
  | 'qa'
  | 'operations'
  | 'general';

export interface IntakeOption {
  label: string;
  value: string;
  description?: string;
}

export interface IntakeQuestion {
  id: string;
  question: string;
  parameterKey: string;
  options?: IntakeOption[];
  answered?: boolean;
  selectedAnswer?: string;
}

export interface MacroEventData {
  title: string;
  start_date: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  type: string; // e.g. "Trip", "Stag Party", "Conference", "Celebration"
  destination?: string;
  archetype?: string;
}

export interface SubEvent {
  id?: string;
  title: string;
  relative_day?: string; // e.g. "Day 2", "Saturday night"
  target_date: string; // YYYY-MM-DD
  description?: string;
}

export type UserEventRole = 'organiser' | 'co_organiser' | 'guest';
export type TaskItemKind = 'milestone' | 'deliverable';
export type DeliverableType = 'booking' | 'purchase' | 'document' | 'coordination';

export interface Deliverable {
  deliverable_id: string;
  title: string; // Tangible output (e.g., "Confirmed Airbnb reservation code")
  type: DeliverableType;
  is_completed: boolean;
}

export interface RunwayMilestoneGate {
  milestone_title: string; // State checkpoint (e.g., "Lodging & Transit Locked")
  t_minus_days: number;
  target_date: string; // YYYY-MM-DD
  status: 'pending' | 'completed';
  deliverables: Deliverable[];
}

export interface EventRunwayPlan {
  event_title: string;
  target_date: string;
  runway: RunwayMilestoneGate[];
}

export interface StructuredMilestone {
  task: string;
  target_date: string;
  t_minus_days: number;
  scope: 'macro' | 'micro';
  tag: 'Logistics' | 'Activity' | 'Reservations' | 'Supplies' | string;
  description?: string;
  kind?: TaskItemKind;
  needsRefinement?: boolean;
  deliverableType?: 'reservation' | 'activity' | 'booking' | 'shopping' | 'logistics' | 'general' | string;
  refinementOptions?: string[];
  applicableRoles?: UserEventRole[];
  deliverables?: Deliverable[];
}

export interface StructuredPlanningPayload {
  macro_event: MacroEventData;
  sub_events: SubEvent[];
  milestones: StructuredMilestone[];
  conversational_response: string;
  tailored_options?: string[];
  runway?: RunwayMilestoneGate[];
}

export interface TMinusMilestone {
  id: string;
  eventId: string;
  tMinusLabel: string; // e.g. "T-60d", "T-30d", "T-14d", "T-10d", "T-7d", "T-3d", "T-2d", "T-1d", "T-2h", "WATCHPOINT"
  tMinusOffsetMinutes: number; // e.g. -43200 for T-30d
  calculatedDate: string; // ISO date format YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  title: string;
  description?: string;
  category: MilestoneCategory;
  status: 'pending' | 'completed' | 'skipped';
  completedAt?: string;
  googleCalendarEventId?: string;
  googleTaskId?: string;
  scope?: 'macro' | 'micro';
  tag?: 'Logistics' | 'Activity' | 'Reservations' | 'Supplies' | string;
  relativeDay?: string;
  kind?: TaskItemKind;
  needsRefinement?: boolean;
  deliverableType?: 'reservation' | 'activity' | 'booking' | 'shopping' | 'logistics' | 'general' | string;
  refinementOptions?: string[];
  applicableRoles?: UserEventRole[];
  deliverables?: Deliverable[];
}

export interface WatchpointData {
  targetAnnouncementWindow: string;
  expectedAction: string;
  checkDate: string;
  historicalContext?: string;
}

export type FocusMode = 'welcome' | 'new-event' | 'adjust-event';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom_dates' | 'custom_interval';

export interface EventRecurrenceConfig {
  isRecurring: boolean;
  frequency?: RecurrenceFrequency;
  recurrencePatternText?: string; // e.g., "Every Saturday", "Every 2 weeks", "Every month on the 1st"
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  customDates?: string[]; // list of exact YYYY-MM-DD dates for the recurring occurrences
  intervalWeeks?: number;
  occurrencesCount?: number; // how many cycles to project (default e.g. 4)
}

export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  eventDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  eventTime?: string; // HH:mm
  location?: string;
  userRole?: UserEventRole;
  status: 'intake_pending' | 'milestones_active' | 'research_watchpoint' | 'completed';
  needsRefinement?: boolean;
  refinedAt?: string;
  googleEventId?: string;
  googleEventLink?: string;
  syncedToGoogleAt?: string;
  googleMilestoneCount?: number;
  macroEvent?: MacroEventData;
  subEvents?: SubEvent[];
  structuredPayload?: StructuredPlanningPayload;
  tailoredOptions?: string[];
  recurrence?: EventRecurrenceConfig;
  context: {
    userRole?: UserEventRole;
    giftType?: 'group' | 'solo' | 'none' | string;
    theme?: string;
    isThemed?: boolean | string;
    cakeStrategy?: string;
    neededItems?: string[] | string;
    guestCount?: number;
    isCamping?: boolean;
    travelNeeded?: boolean;
    diningPlan?: string;
    notes?: string;
    [key: string]: any;
  };
  intakeQuestions?: IntakeQuestion[];
  milestones: TMinusMilestone[];
  watchpoint?: WatchpointData;
  rawInputSnippet?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  focusText?: string;
  additionText?: string;
  timestamp: string;
  mode?: OperationalMode;
  associatedEventId?: string;
  intakeQuestions?: IntakeQuestion[];
  generatedMilestones?: TMinusMilestone[];
  structuredPayload?: StructuredPlanningPayload;
  conversationalResponse?: string;
  tailoredOptions?: string[];
  isVoiceMemo?: boolean;
  voiceAudioUrl?: string;
  voiceDurationSeconds?: number;
}

export interface ProcessAgentInputPayload {
  message: string;
  audioBase64?: string;
  mimeType?: string;
  currentReferenceDate: string; // ISO string
  activeEvents?: CalendarEvent[];
  targetEventId?: string;
  intakeAnswer?: {
    questionId: string;
    parameterKey: string;
    answerValue: string;
  };
  batchAnswers?: {
    parameterKey: string;
    answerValue: string;
  }[];
  // Subset of the user's OnboardingProfile relevant to planning (e.g. home
  // location for international-destination / travel-distance detection in
  // tminusRules.ts). Only the fields the planner actually consumes belong
  // here - not the full profile.
  userProfile?: {
    homeZipOrLocation?: string;
  };
}

export interface ProcessAgentResponsePayload {
  mode: OperationalMode;
  replyText: string;
  focusText?: string;
  additionText?: string;
  event: CalendarEvent;
  structuredPayload?: StructuredPlanningPayload;
  tailoredOptions?: string[];
  transcribedText?: string;
  explanation?: string;
}

export interface UserOnboardingProfile {
  has_kids: boolean;
  track_trips: boolean;
  track_hosting: boolean;
  custom_focus_areas: string[]; // e.g. ["marathons", "music festivals"]
}

export type EventTopicKey = 
  | 'parties_celebrations'
  | 'trips_getaways'
  | 'hosting_guests'
  | 'kids_school'
  | 'custom_focus'
  | 'projects_milestones'
  | 'routine_ignored';

export interface EvaluatedCalendarEvent {
  id: string;
  rawTitle: string;
  cleanTitle: string;
  eventDate: string; // YYYY-MM-DD
  eventTime?: string;
  location?: string;
  topic: EventTopicKey;
  topicLabel: string;
  topicIcon: string;
  diffDays: number;
  isBeyondMinHorizon: boolean; // >= 7 days
  should_track: boolean;
  reasoning: string;
  withheld: boolean; // user selectable to withhold app interaction
  intake_needed: boolean;
  intake_prompt?: string;
  milestones: TMinusMilestone[];
  messaging_dispatch: {
    whatsapp_text: string;
    telegram_text: string;
    app_link: string;
  };
  originalCalendarItem?: any;
}

export interface EvaluationTopicGroup {
  topicKey: EventTopicKey;
  label: string;
  icon: string;
  description: string;
  events: EvaluatedCalendarEvent[];
  allSelected: boolean;
}

export type AgeRange = '18–25' | '26–35' | '36–50' | '51+';

// Technical specification schema types
export type FamilyStructure = 'single' | 'couple' | 'family_with_kids';
export type CalendarTypeScope = 'personal' | 'mixed' | 'business';

// Questionnaire & UI display labels
export type FamilyStatus = 'Single' | 'Couple' | 'Family with kids' | 'Couple with kids';
export type CalendarType = 'Personal' | 'Mixed (Personal & Work)' | 'Business' | 'Personal only' | 'Business only';

export interface OnboardingProfile {
  ageRange?: AgeRange;
  // Core technical schema
  family_structure?: FamilyStructure;
  calendar_type?: CalendarTypeScope;

  // Location / home base for travel distance & drive buffer estimation
  homeZipOrLocation?: string;

  // Display & legacy backwards compatibility
  familyStatus?: FamilyStatus;
  calendarType?: CalendarType;
  privacyConsentAccepted?: boolean;
  completedAt?: string;
}

export interface CookieConsentSettings {
  hasConsented: boolean;
  functional: boolean;
  analytics: boolean;
  timestamp?: string;
}

// Custom T-Minus Template Presets & Spreadsheet Importer Types
export interface CustomPresetMilestone {
  id: string;
  task: string;
  t_minus_days: number; // e.g. 30 for T-30d, 0 for launch day, -7 for Day +7
  tag: string; // e.g. "QA", "Legal", "Design", "Marketing", "Logistics", "Operations"
  description?: string;
  kind?: TaskItemKind;
  scope?: 'macro' | 'micro';
  deliverableType?: string;
}

export interface CustomPreset {
  id: string;
  title: string;
  name?: string; // friendly alias for title
  description?: string;
  category: MilestoneCategory | string;
  tags: string[];
  milestones: CustomPresetMilestone[];
  createdAt: string;
  updatedAt: string;
  isBuiltIn?: boolean;
  author?: string;
}

export interface SpreadsheetColumnMapping {
  taskCol: string;
  offsetCol?: string;
  tagCol?: string;
  descCol?: string;
}

