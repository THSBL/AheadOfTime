export type OperationalMode = 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED';

export type EventCategory = 
  | 'birthday_party' 
  | 'hosting_visitors' 
  | 'festival_concert' 
  | 'travel_trip' 
  | 'dinner_social' 
  | 'project_deadline'
  | 'booking_trip'
  | 'subscription'
  | 'maintenance'
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
  | 'admin';

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
}

export interface WatchpointData {
  targetAnnouncementWindow: string;
  expectedAction: string;
  checkDate: string;
  historicalContext?: string;
}

export type FocusMode = 'welcome' | 'new-event' | 'adjust-event';

export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  eventDate: string; // YYYY-MM-DD
  eventTime?: string; // HH:mm
  location?: string;
  status: 'intake_pending' | 'milestones_active' | 'research_watchpoint' | 'completed';
  needsRefinement?: boolean;
  refinedAt?: string;
  googleEventId?: string;
  googleEventLink?: string;
  syncedToGoogleAt?: string;
  googleMilestoneCount?: number;
  context: {
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
}

export interface ProcessAgentResponsePayload {
  mode: OperationalMode;
  replyText: string;
  focusText?: string;
  additionText?: string;
  event: CalendarEvent;
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

