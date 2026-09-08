export type OperationalMode = 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED' | 'NORMAL';

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
  relative_day?: string;
  target_date: string; // YYYY-MM-DD
  description?: string;
}

export type UserEventRole = 'organiser' | 'co_organiser' | 'guest';
export type TaskItemKind = 'milestone' | 'deliverable';
export type DeliverableType = 'booking' | 'purchase' | 'document' | 'coordination';

export interface Deliverable {
  deliverable_id: string;
  title: string;
  type: DeliverableType;
  is_completed: boolean;
}

export interface RunwayMilestoneGate {
  milestone_title: string;
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
  tMinusLabel: string;
  tMinusOffsetMinutes: number;
  calculatedDate: string;
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
