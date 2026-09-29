import { recordAgendaScan } from '../services/agendaScanRecord';
import { assessCalendarEntry, trimToBirthdayReminderPlan, ENTRY_KIND_LABELS, type EntryKind, type ScanVerdict } from '../utils/eventEligibility';
import { readScanPrefs, saveScanPrefs } from '../services/scanPrefs';
import { useUserProfile } from '../contexts/UserProfileContext';
import { learnFromAnswers } from '../utils/teachRules';
import type { EntryInput, ScanPrefs } from '../utils/eventEligibility';
import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CalendarDays, 
  Check, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  LogIn, 
  ArrowRight, 
  RefreshCw, 
  Unlink, 
  Layers, 
  Target, 
  CheckCircle2, 
  Filter,
  XCircle,
  Clock,
  Cake,
  Plane,
  Users,
  Briefcase,
  Wrench,
  CreditCard,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { CalendarEvent, EventCategory, TMinusMilestone, OnboardingProfile } from '../types';
import { fetchGoogleCalendarEvents, fetchPrimaryCalendarProfile, getMilestoneSyncFormat, syncEventToGoogleCalendar, GoogleCalendarProfile, GoogleCalendarEventItem, SyncResult } from '../services/googleCalendar';
import { getStoredAccessToken, isTokenExpired, requestGoogleCalendarToken, getStoredClientId, clearGoogleSession } from '../services/googleAuth';
import { detectEventCategory, formatDisplayDate, getCleanEventTitle } from '../utils/tminusRules';
import { generateDeterministicMilestones } from '../utils/deterministicMilestoneGenerator';
import { normalizeProfile } from '../data/samplePresets';
import { getCurrentUser, loadUserEvents, setCurrentUser as setGlobalCurrentUser, AuthUser } from '../services/accountManager';
import { groupTripEntries, describeTripEntry } from '../utils/tripGrouping';
import { completeTasksEvidencedByCalendar } from '../utils/calendarEvidence';
import { isServerCalendarLinked, pushEventViaServer, scanAgendaViaServer, ServerCalendarUnavailable } from '../services/serverCalendar';
import { aiJsonHeaders, readAiRefusal } from '../services/aiRequest';

/**
 * Robust check to determine if a Google Calendar item is already tracked in the dashboard.
 * Compares Google Event IDs, synthesized IDs, and normalized Title + Date combinations.
 */
export function isEventAlreadyInDashboard(
  item: GoogleCalendarEventItem,
  existingEvents: CalendarEvent[]
): boolean {
  if (!existingEvents || existingEvents.length === 0) return false;

  const gcalId = item.id;
  const startDateStr = item.start?.dateTime || item.start?.date || '';
  const itemDate = startDateStr ? startDateStr.substring(0, 10) : '';

  const normalize = (str: string) =>
    (str || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normRaw = normalize(item.summary || '');
  const detectedCategory = detectEventCategory(item.summary || '', item.description || '');
  const normClean = normalize(getCleanEventTitle(item.summary || '', detectedCategory));

  return existingEvents.some((existing) => {
    // 1. Direct googleEventId match
    if (existing.googleEventId && existing.googleEventId === gcalId) return true;
    if (existing.id === `gcal-${gcalId}` || existing.id === gcalId) return true;
    // Part of a trip imported earlier as one grouped event.
    if (Array.isArray(existing.context?.calendarEntryIds) && existing.context.calendarEntryIds.includes(gcalId)) return true;

    // 2. Normalized Title + Date Match
    const normExisting = normalize(existing.title || '');
    if (existing.eventDate && itemDate) {
      const isDateExact = existing.eventDate === itemDate;
      const isDateClose = Math.abs(new Date(existing.eventDate).getTime() - new Date(itemDate).getTime()) <= 86400000;

      if (isDateExact) {
        if (normExisting === normRaw || normExisting === normClean) return true;
        if (normRaw.length >= 4 && normExisting.includes(normRaw)) return true;
        if (normClean.length >= 4 && normExisting.includes(normClean)) return true;
        if (normExisting.length >= 4 && normRaw.includes(normExisting)) return true;
        if (normExisting.length >= 4 && normClean.includes(normExisting)) return true;
      } else if (isDateClose) {
        // Within 1 day (timezone shift) and identical title
        if (normExisting === normRaw || normExisting === normClean) return true;
      }
    }

    // 3. Fallback: substantial title (>6 chars) match across the board
    if (normExisting.length > 6 && (normExisting === normRaw || normExisting === normClean)) {
      return true;
    }

    return false;
  });
}

interface ScanAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentReferenceDate: string;
  onImportTrackedEvents: (events: CalendarEvent[]) => void;
  isGoogleConnected: boolean;
  onOpenGoogleCalendarSync: () => void;
  existingEvents?: CalendarEvent[];
  onboardingProfile?: OnboardingProfile | null;
  initialScanMonths?: number;
  /** Plans came back from Google with their task ids (step 4). */
  onEventsUpdated?: (events: CalendarEvent[]) => void;
  /** The flow ended with these plans added: show them. */
  onFlowFinished?: (events: CalendarEvent[]) => void;
}

type FlowStep = 'import' | 'plan' | 'check' | 'sync' | 'auto';
const FLOW_STEPS: Array<{ id: FlowStep; label: string }> = [
  { id: 'import', label: 'Import' },
  { id: 'plan', label: 'Plan' },
  { id: 'check', label: 'Check' },
  { id: 'sync', label: 'Sync' },
  { id: 'auto', label: 'Auto' },
];

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface PlannedRow {
  item: ScannedEventItem;
  /** The finished plan; null while it is being made. */
  event: CalendarEvent | null;
}

interface ScannedEventItem extends GoogleCalendarEventItem {
  detectedCategory: EventCategory;
  /** What kind of entry it is, and plan / not sure / skip (utils/eventEligibility.ts). */
  kind: EntryKind;
  verdict: ScanVerdict;
  reason: string;
  /** What the rules judged, to judge again after the user teaches us (trips grouped by us have none). */
  assessInput: EntryInput | null;
  isAlreadyInDashboard: boolean;
  shouldTrackByDefault: boolean;
  diffDays: number;
  previewMilestones: TMinusMilestone[];
  /** Set when this row is one trip grouped from several calendar entries (utils/tripGrouping.ts). */
  tripParts?: GoogleCalendarEventItem[];
}

export const ScanAgendaModal: React.FC<ScanAgendaModalProps> = ({
  isOpen,
  onClose,
  currentReferenceDate,
  onImportTrackedEvents,
  isGoogleConnected,
  onOpenGoogleCalendarSync,
  existingEvents,
  onboardingProfile,
  initialScanMonths = 6,
  onEventsUpdated,
  onFlowFinished,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [profile, setProfile] = useState<GoogleCalendarProfile | null>(null);
  const [scannedEvents, setScannedEvents] = useState<ScannedEventItem[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, boolean>>({});
  const [showAlreadyImported, setShowAlreadyImported] = useState<boolean>(false);
  const [showSkipped, setShowSkipped] = useState<boolean>(false);
  const { profile: storedProfile, saveProfile } = useUserProfile();
  const [scanPrefs, setScanPrefs] = useState<ScanPrefs>(() => storedProfile?.scanPrefs || readScanPrefs());
  // Kept in this browser and in the profile (so Background Sync's daily scan uses them too).
  const persistPrefs = (next: ScanPrefs) => {
    setScanPrefs(next);
    saveScanPrefs(next);
    saveProfile({ ...(storedProfile || {}), scanPrefs: next });
  };
  const [scanMonths, setScanMonths] = useState<number>(initialScanMonths);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  useEffect(() => {
    if (initialScanMonths) {
      setScanMonths(initialScanMonths);
    }
  }, [initialScanMonths]);

  const token = getStoredAccessToken();
  // Background Sync linked: the server reads the calendar with the stored
  // Google grant, so the scan works without a live browser token.
  const [serverLinked, setServerLinked] = useState<boolean>(false);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    isServerCalendarLinked().then((linked) => {
      if (!cancelled) setServerLinked(linked);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);
  const connected = Boolean(token && !isTokenExpired()) || serverLinked;

  const handleScanAgenda = async (monthsOverride?: number) => {
    setIsLoading(true);
    setErrorMsg(null);
    const monthsToUse = monthsOverride !== undefined ? monthsOverride : scanMonths;
    if (monthsOverride !== undefined) {
      setScanMonths(monthsOverride);
    }
    try {
      const minDate = new Date(currentReferenceDate).toISOString();
      const maxDate = new Date(new Date(currentReferenceDate).getTime() + monthsToUse * 30 * 24 * 60 * 60 * 1000).toISOString();

      // Server first (Background Sync grant): the signed-in app account is
      // already the identity there, so no account switch is needed.
      let serverScan: Awaited<ReturnType<typeof scanAgendaViaServer>> | null = null;
      if (serverLinked) {
        try {
          serverScan = await scanAgendaViaServer(minDate, maxDate, 150);
        } catch (err) {
          if (!(err instanceof ServerCalendarUnavailable)) throw err;
          setServerLinked(false);
        }
      }

      let items: GoogleCalendarEventItem[];
      if (serverScan) {
        setProfile(serverScan.profile);
        items = serverScan.items;
      } else {
        const activeToken = getStoredAccessToken();
        if (!activeToken || isTokenExpired()) {
          setErrorMsg('Google Calendar session is not active. Please connect your Google account.');
          setIsLoading(false);
          return;
        }

        // 1. Fetch profile
        const prof = await fetchPrimaryCalendarProfile(activeToken);
        setProfile(prof);
        // Same cross-account gap fixed in GoogleCalendarSync/
        // GoogleCalendarIntegrationCard: this modal only updated its OWN
        // local profile state, never the app-wide identity - scanning while
        // signed into a DIFFERENT Google account than App.tsx's cached
        // currentUser meant found events could get merged/persisted under
        // the wrong account entirely. setGlobalCurrentUser dispatches
        // aot_account_switched, which App.tsx listens for to reload events
        // strictly scoped to this profile's own email before any scan
        // results get merged in.
        if (prof?.id) {
          const userEmail = prof.id.toLowerCase().trim();
          const user: AuthUser = {
            id: userEmail,
            email: userEmail,
            name: prof.summary || prof.id,
            timeZone: prof.timeZone,
            provider: 'google',
            connectedAt: new Date().toISOString(),
          };
          setGlobalCurrentUser(user);
        }

        // 2. Fetch upcoming events
        items = await fetchGoogleCalendarEvents(activeToken, 150, minDate, maxDate);
      }

      // 3. Evaluate each event with T-Minus rules and deduplicate against existing dashboard events
      let currentDashboardEvents = existingEvents;
      if (!currentDashboardEvents || currentDashboardEvents.length === 0) {
        const user = getCurrentUser();
        if (user?.id) {
          currentDashboardEvents = loadUserEvents(user.id);
        }
      }
      const liveDashboardEvents = currentDashboardEvents || [];

      const refTime = new Date(currentReferenceDate).getTime();
      const { calendar_type: profileCalendar } = normalizeProfile(onboardingProfile);
      const isRoutineTitle = (title: string) =>
        (profileCalendar !== 'business' && /standup|1:1|sync|weekly|daily|scrum|catchup|status check|office hours|all hands|retrospective|retro\b/i.test(title)) ||
        /dentist|cleaning|doctor|vet\b|haircut|dry clean/i.test(title);
      // One trip in the calendar is often several entries (stays, transfers,
      // tours); group them so the trip gets one plan instead of one per entry.
      // Entries already in the app are left out of grouping.
      // The calendar answered: remember how far this scan reached (header).
      recordAgendaScan(maxDate);
      const newItems = (items || []).filter((item) => !isEventAlreadyInDashboard(item, liveDashboardEvents));
      const { trips } = groupTripEntries(newItems, {
        isTripCategory: (item) => detectEventCategory(item.summary || '', item.description || '') === 'travel_trip',
        canJoinTrip: (item) => !isRoutineTitle((item.summary || '').toLowerCase()),
      });
      const groupedIds = new Set(trips.flatMap((trip) => trip.entries.map((e) => e.id)));
      const tripItems: (GoogleCalendarEventItem & { tripParts: GoogleCalendarEventItem[] })[] = trips.map((trip) => {
        const endExclusive = new Date(`${trip.endDate}T12:00:00Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        return {
          id: `trip-${trip.entries[0].id}`,
          summary: trip.title,
          description: trip.entries.map(describeTripEntry).join('\n'),
          location: trip.destination || '',
          start: { date: trip.startDate },
          end: { date: endExclusive.toISOString().slice(0, 10) },
          tripParts: trip.entries,
        } as GoogleCalendarEventItem & { tripParts: GoogleCalendarEventItem[] };
      });
      const rowsToScan: (GoogleCalendarEventItem & { tripParts?: GoogleCalendarEventItem[] })[] = [
        ...(items || []).filter((item) => !groupedIds.has(item.id)),
        ...tripItems,
      ].sort((a, b) => (a.start?.dateTime || a.start?.date || '').localeCompare(b.start?.dateTime || b.start?.date || ''));

      const scannedList: ScannedEventItem[] = rowsToScan.map((item) => {
        const title = item.summary || 'Untitled Event';
        const desc = item.description || '';
        const startDateStr = item.start?.dateTime || item.start?.date || '';
        const eventDateStr = startDateStr ? startDateStr.substring(0, 10) : '';
        const eventTimeStr = startDateStr.includes('T') ? startDateStr.substring(11, 16) : '10:00';
        
        const eventTime = new Date(eventDateStr || currentReferenceDate).getTime();
        const diffDays = Math.max(0, Math.round((eventTime - refTime) / (1000 * 60 * 60 * 24)));

        // Detect routine work / repetitive meetings with profile calibration
        const lowerTitle = title.toLowerCase();
        const { family_structure, calendar_type } = normalizeProfile(onboardingProfile);
        const flagsKids = family_structure === 'family_with_kids';

        // Which entries deserve a plan, and what kind they are: the same
        // rules the daily Background Sync scan uses (utils/eventEligibility.ts).
        const endStr = item.end?.date || item.end?.dateTime || '';
        const durationDays = endStr && eventDateStr
          ? Math.max(1, Math.round((new Date(endStr.substring(0, 10)).getTime() - new Date(eventDateStr).getTime()) / 86400000))
          : 1;
        const assessInput: EntryInput | null = item.tripParts ? null : { title, description: desc, daysAway: diffDays, durationDays, calendarType: calendar_type };
        let assessment = assessInput
          ? assessCalendarEntry(assessInput, scanPrefs)
          : { kind: 'trip' as EntryKind, category: 'travel_trip' as EventCategory, verdict: (diffDays >= 2 ? 'plan' : 'skip') as ScanVerdict, reason: 'Trip' };

        // Families: school and kids' events are worth a look even when vague.
        const isKidsPriority = flagsKids && /school|costume|spirit|rehearsal|recital|tournament|sports|camp|halloween/i.test(lowerTitle);
        if (isKidsPriority && assessment.verdict === 'unsure') assessment = { ...assessment, verdict: 'plan' };

        const category = assessment.category;

        // Deduplication against dashboard (a grouped trip's parts were all new)
        const alreadyInDashboard = item.tripParts ? false : isEventAlreadyInDashboard(item, liveDashboardEvents);

        // Create temporary event structure to generate preview milestones using deep domain logic
        const tempEvent: CalendarEvent = {
          id: `temp-${item.id}`,
          title,
          eventDate: eventDateStr,
          eventTime: eventTimeStr,
          category,
          status: 'milestones_active',
          needsRefinement: true,
          location: item.location || '',
          context: { hasPet: onboardingProfile?.hasPet },
          milestones: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const previewMilestones = generateDeterministicMilestones({
          eventId: tempEvent.id,
          title: tempEvent.title,
          eventDate: tempEvent.eventDate,
          eventTime: tempEvent.eventTime,
          location: tempEvent.location,
          category: tempEvent.category,
          context: tempEvent.context,
        });

        // Only track by default if it's actionable AND not already present in the dashboard
        const shouldTrackByDefault = !alreadyInDashboard && assessment.verdict === 'plan';

        return {
          ...item,
          detectedCategory: category,
          kind: assessment.kind,
          verdict: assessment.verdict,
          reason: assessment.reason,
          assessInput,
          isAlreadyInDashboard: alreadyInDashboard,
          shouldTrackByDefault,
          diffDays,
          previewMilestones,
        };
      });

      setScannedEvents(scannedList);
      setHasScanned(true);

      // Select eligible actionable events by default
      const initialSelected: Record<string, boolean> = {};
      scannedList.forEach((item) => {
        initialSelected[item.id] = item.shouldTrackByDefault;
      });
      setSelectedEventIds(initialSelected);

    } catch (err: any) {
      console.error('Error scanning agenda:', err);
      setErrorMsg(err?.message || 'Failed to scan agenda from Google Calendar.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && connected) {
      handleScanAgenda();
    } else if (isOpen && !connected) {
      setHasScanned(false);
      setScannedEvents([]);
      setProfile(null);
    }
  }, [isOpen, connected]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMsg(null);
    try {
      const res = await requestGoogleCalendarToken(getStoredClientId());
      if (res && res.accessToken) {
        await handleScanAgenda();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to sign in to Google Calendar.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDisconnect = () => {
    clearGoogleSession();
    setHasScanned(false);
    setScannedEvents([]);
    setProfile(null);
  };

  const handleToggleSelect = (id: string) => {
    const item = scannedEvents.find((e) => e.id === id);
    if (item?.isAlreadyInDashboard) return; // Prevent toggling already tracked items
    setSelectedEventIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Judge every entry again with new prefs, and tick what is now "plan".
  const reassessAll = (prefs: ScanPrefs) => {
    const updated = scannedEvents.map((e) => {
      if (!e.assessInput) return e;
      const a = assessCalendarEntry(e.assessInput, prefs);
      return { ...e, kind: a.kind, verdict: a.verdict, reason: a.reason, detectedCategory: a.category };
    });
    setScannedEvents(updated);
    setSelectedEventIds((prev) => {
      const next = { ...prev };
      updated.forEach((e) => {
        if (!e.isAlreadyInDashboard) next[e.id] = e.verdict === 'plan';
      });
      return next;
    });
  };

  // Birthdays: plain reminders are left out until the user asks for them.
  const setBirthdayPref = (birthdays: 'skip' | 'plan') => {
    const next = { ...scanPrefs, birthdays };
    persistPrefs(next);
    reassessAll(next);
  };


  // ---------------------------------------------------------------------
  // The guided flow: Import -> Plan -> Check -> Sync -> Auto. Same steps in
  // onboarding and every Scan agenda.
  // ---------------------------------------------------------------------
  const [step, setStep] = useState<FlowStep>('import');
  const [planned, setPlanned] = useState<PlannedRow[]>([]);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, ScanVerdict>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<CalendarEvent[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState<{ tasks: number; plans: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notifyFrequency, setNotifyFrequency] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep('import');
    setPlanned([]);
    setIncluded({});
    setAnswers({});
    setExpandedId(null);
    setAccepted([]);
    setWeekStart(null);
    setSyncDone(null);
    setSyncError(null);
  }, [isOpen]);

  // How many /api/event/deep-refine calls run at once while planning.
  const PLAN_CONCURRENCY = 4;
  const MAX_QUESTIONS = 5;

  // Per event: the AI plan first, the local engine on any failure, so one
  // bad network call can't drop an event.
  const refineImportedEvent = async (draft: CalendarEvent): Promise<TMinusMilestone[]> => {
    try {
      const res = await fetch('/api/event/deep-refine', {
        method: 'POST',
        headers: aiJsonHeaders(),
        body: JSON.stringify({ event: draft }),
      });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      if (data?.event?.milestones?.length) return data.event.milestones;
      throw new Error('Empty milestone plan returned');
    } catch (e) {
      console.warn('Deep-refine import notice, using local engine:', e);
      return generateDeterministicMilestones({
        eventId: draft.id,
        title: draft.title,
        eventDate: draft.eventDate,
        eventTime: draft.eventTime,
        location: draft.location,
        category: draft.category,
        context: draft.context,
      });
    }
  };

  const draftFor = (item: ScannedEventItem): CalendarEvent => {
    const startDateStr = item.start?.dateTime || item.start?.date || '';
    const eventDateStr = startDateStr ? startDateStr.substring(0, 10) : '';
    const eventTimeStr = startDateStr.includes('T') ? startDateStr.substring(11, 16) : '10:00';
    const now = new Date().toISOString();
    if (item.tripParts) {
      const endExclusive = item.end?.date || eventDateStr;
      const firstTimed = item.tripParts.find((p) => p.start?.dateTime);
      return {
        id: `gcal-${item.id}`,
        title: item.summary,
        eventDate: eventDateStr,
        endDate: shiftDay(endExclusive, -1),
        eventTime: firstTimed?.start?.dateTime?.substring(11, 16) || '10:00',
        category: 'travel_trip',
        status: 'milestones_active',
        needsRefinement: true,
        location: item.location || '',
        context: {
          hasPet: onboardingProfile?.hasPet,
          ...(item.location ? { destination: item.location } : {}),
          // What the calendar already holds for this trip: the planner
          // treats these as arranged, and a later scan recognises them.
          calendarEntries: item.tripParts.map(describeTripEntry),
          calendarEntryIds: item.tripParts.map((p) => p.id),
        },
        milestones: [],
        createdAt: now,
        updatedAt: now,
      } as CalendarEvent;
    }
    return {
      id: `gcal-${item.id}`,
      title: getCleanEventTitle(item.summary, item.detectedCategory),
      eventDate: eventDateStr,
      eventTime: eventTimeStr,
      category: item.detectedCategory,
      status: 'milestones_active',
      needsRefinement: true,
      location: item.location || '',
      googleEventId: item.id,
      context: { hasPet: onboardingProfile?.hasPet },
      milestones: [],
      createdAt: now,
      updatedAt: now,
    } as CalendarEvent;
  };

  const planItem = async (item: ScannedEventItem): Promise<CalendarEvent> => {
    const draft = draftFor(item);
    const refined = await refineImportedEvent(draft);
    // A birthday reminder gets the gift and card steps, not a party plan.
    const plannedMs = item.kind === 'birthday_reminder' ? trimToBirthdayReminderPlan(refined) : refined;
    // Tasks already due that the calendar shows as arranged start out done (trips only).
    const evidence = draft.category === 'travel_trip' ? item.tripParts || [item] : [];
    const milestones = evidence.length ? completeTasksEvidencedByCalendar(plannedMs, evidence, draft, [draft.title, draft.location || '']) : plannedMs;
    return { ...draft, milestones };
  };

  /** One question per kind of entry we're unsure about; unclear entries are asked by name. */
  const questionKey = (item: ScannedEventItem) => (item.kind === 'other' ? `title:${(item.summary || '').toLowerCase().trim()}` : `kind:${item.kind}`);

  const startPlanning = async (items: ScannedEventItem[]) => {
    const rows: PlannedRow[] = items.map((item) => ({ item, event: null }));
    setPlanned(rows);
    setIncluded(Object.fromEntries(items.map((i) => [i.id, true])));
    setStep('plan');
    for (let i = 0; i < items.length; i += PLAN_CONCURRENCY) {
      await Promise.all(
        items.slice(i, i + PLAN_CONCURRENCY).map(async (item) => {
          const event = await planItem(item);
          setPlanned((prev) => prev.map((r) => (r.item.id === item.id ? { ...r, event } : r)));
        })
      );
    }
  };

  const isAccepted = (r: PlannedRow) =>
    Boolean(r.event) && included[r.item.id] !== false && (r.item.verdict !== 'unsure' || answers[questionKey(r.item)] === 'plan');

  const finish = (events: CalendarEvent[]) => {
    onFlowFinished?.(events);
    onClose();
  };

  const confirmChecked = () => {
    // Every answer becomes a rule, so the next scan asks fewer questions.
    const answeredRows = planned.filter((r) => r.item.verdict === 'unsure' && answers[questionKey(r.item)]);
    if (answeredRows.length > 0) {
      const next = learnFromAnswers(
        scanPrefs,
        answeredRows.map((r) => ({ title: r.item.summary || '', guessedKind: r.item.kind, kind: r.item.kind, verdict: answers[questionKey(r.item)] }))
      );
      persistPrefs(next);
    }
    const acc = planned.filter(isAccepted).map((r) => r.event as CalendarEvent);
    setAccepted(acc);
    if (acc.length === 0) {
      onClose();
      return;
    }
    onImportTrackedEvents(acc);
    setStep('sync');
  };

  const pendingTasksOf = (ev: CalendarEvent) =>
    (ev.milestones || []).filter((m) => m.isActive !== false && m.status === 'pending' && !m.googleTaskId);
  const syncTaskCount = accepted.reduce((n, e) => n + pendingTasksOf(e).length, 0);

  const syncAll = async () => {
    setIsSyncing(true);
    setSyncError(null);
    const format = getMilestoneSyncFormat();
    const timeZone = profile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
    let useServer = serverLinked;
    const updated: CalendarEvent[] = [];
    let tasks = 0;
    try {
      for (const ev of accepted) {
        let result: SyncResult | null = null;
        if (useServer) {
          try {
            result = await pushEventViaServer(ev, timeZone, format);
          } catch (err) {
            if (!(err instanceof ServerCalendarUnavailable)) throw err;
            useServer = false;
          }
        }
        if (!result) {
          let tokenNow = getStoredAccessToken();
          if (!tokenNow || isTokenExpired()) tokenNow = (await requestGoogleCalendarToken(getStoredClientId())).accessToken;
          result = await syncEventToGoogleCalendar(tokenNow as string, ev, timeZone, { milestoneFormat: format });
        }
        tasks += result.totalTasksPushed;
        if (result.updatedEvent) updated.push(result.updatedEvent);
      }
      if (updated.length) {
        onEventsUpdated?.(updated);
        setAccepted((prev) => prev.map((e) => updated.find((u) => u.id === e.id) || e));
      }
      setSyncDone({ tasks, plans: accepted.length });
    } catch (err: any) {
      setSyncError(err?.message ? `Couldn't sync: ${err.message}` : "Couldn't sync to your calendar. Try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const afterSync = () => {
    if (serverLinked) finish(accepted);
    else setStep('auto');
  };

  useEffect(() => {
    if (step !== 'auto') return;
    fetch('/api/auth/notify-prefs', { headers: aiJsonHeaders(), cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => d?.ok && setNotifyFrequency(d.prefs?.frequency || 'off'))
      .catch(() => undefined);
  }, [step]);

  const saveFrequency = (frequency: string) => {
    setNotifyFrequency(frequency);
    fetch('/api/auth/notify-prefs', { method: 'PUT', headers: aiJsonHeaders(), body: JSON.stringify({ prefs: { frequency } }) }).catch(() => undefined);
  };

  const turnOnBackgroundSync = async () => {
    setIsLinking(true);
    try {
      let tokenNow = getStoredAccessToken();
      if (!tokenNow || isTokenExpired()) tokenNow = (await requestGoogleCalendarToken(getStoredClientId())).accessToken;
      const res = await fetch('/api/auth/google/authorize', { headers: { Authorization: `Bearer ${tokenNow}` } });
      const data = await res.json();
      if (data.ok && data.authorizeUrl) {
        // The plans are already saved; Google sends the user back to the app.
        onFlowFinished?.(accepted);
        window.location.href = data.authorizeUrl;
        return;
      }
      setSyncError(data.error || 'Could not start Background Sync.');
    } catch (err: any) {
      setSyncError(err?.message || 'Could not start Background Sync.');
    }
    setIsLinking(false);
  };

  if (!isOpen) return null;

  const totalScannedCount = scannedEvents.length;
  const alreadyImported = scannedEvents.filter((e) => e.isAlreadyInDashboard);
  const byDate = (a: ScannedEventItem, b: ScannedEventItem) =>
    (a.start?.dateTime || a.start?.date || '').localeCompare(b.start?.dateTime || b.start?.date || '');
  const fresh = scannedEvents.filter((e) => !e.isAlreadyInDashboard).sort(byDate);
  const planGroup = fresh.filter((e) => e.verdict === 'plan');
  const unsureGroup = fresh.filter((e) => e.verdict === 'unsure');
  const skippedGroup = fresh.filter((e) => e.verdict === 'skip');
  const birthdaysLeftOut = skippedGroup.filter((e) => e.kind === 'birthday_reminder').length;
  const birthdaysPlanned = fresh.filter((e) => e.kind === 'birthday_reminder' && e.verdict === 'plan').length;

  const chosenItems = fresh.filter((e) => e.verdict !== 'unsure' && selectedEventIds[e.id]);
  // The unsure entries we'll ask about in step 3 (one question per kind).
  const askKeys = Array.from(new Set(unsureGroup.filter((e) => e.diffDays >= 2).map(questionKey))).slice(0, MAX_QUESTIONS);
  const askItems = unsureGroup.filter((e) => askKeys.includes(questionKey(e)));

  // What the rows fold away as: "routine, public holidays, birthdays".
  const skippedSummary = Array.from(
    new Set(
      skippedGroup.map((e) =>
        e.kind === 'public_holiday' ? 'public holidays' : e.kind === 'birthday_reminder' ? 'birthdays' : e.reason === 'Too soon to prepare' ? 'too soon' : 'routine'
      )
    )
  ).join(', ');

  const dateOf = (item: ScannedEventItem) => (item.start?.dateTime || item.start?.date || '').substring(0, 10);
  const firstTask = (ev: CalendarEvent | null) =>
    ev ? [...pendingTasksOf(ev)].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate))[0] : undefined;
  const planSummary = (ev: CalendarEvent | null) => {
    if (!ev) return 'Planning…';
    const open = pendingTasksOf(ev);
    const first = firstTask(ev);
    return `${open.length} ${open.length === 1 ? 'task' : 'tasks'}${first ? ` · first ${formatDisplayDate(first.calculatedDate.slice(0, 10))}` : ''}`;
  };

  const renderRow = (item: ScannedEventItem) => {
    const tracked = item.isAlreadyInDashboard;
    const isSelected = tracked || (selectedEventIds[item.id] ?? false);
    const startDate = item.start?.dateTime || item.start?.date || '';
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => !tracked && handleToggleSelect(item.id)}
        disabled={tracked}
        aria-pressed={isSelected}
        className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-2xl border transition-all ${
          tracked
            ? 'bg-slate-50 border-slate-200 opacity-70 cursor-default'
            : isSelected
              ? 'bg-white border-[#182A42]/40 shadow-2xs cursor-pointer'
              : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
        }`}
      >
        <span
          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
            tracked ? 'bg-aot-sage border-aot-sage text-[#182A42]' : isSelected ? 'bg-[#182A42] border-[#182A42] text-white' : 'border-slate-300'
          }`}
        >
          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900 leading-snug">{item.summary || 'Untitled event'}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11.5px] text-slate-500">
            <span>
              {startDate ? formatDisplayDate(startDate.substring(0, 10)) : 'No date'}
              {item.tripParts && item.end?.date ? ` – ${formatDisplayDate(shiftDay(item.end.date, -1))}` : ''}
            </span>
            <span className="px-1.5 py-px rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600">{ENTRY_KIND_LABELS[item.kind]}</span>
            {tracked && <span className="text-[10.5px] font-bold text-[#447463]">Already added</span>}
          </span>
          {item.tripParts && (
            <span className="block text-[11px] text-slate-400 truncate" title={item.tripParts.map((p) => p.summary).join(' · ')}>
              {item.tripParts.length} calendar entries grouped into one trip
            </span>
          )}
          {!tracked && item.verdict === 'skip' && <span className="block text-[11px] text-slate-400">{item.reason}</span>}
        </span>
      </button>
    );
  };

  const sectionTitle = (label: string, count: number | string) => (
    <p className="flex items-center justify-between px-1 pt-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
      <span>{label}</span>
      <span className="font-mono">{count}</span>
    </p>
  );

  // ---- step bodies ------------------------------------------------------

  const importBody = () => {
    if (!connected) {
      return (
        <div className="p-5 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <p className="text-sm text-slate-600">Connect Google Calendar and we'll find the events worth preparing for.</p>
          <button
            onClick={handleSignIn}
            disabled={isSigningIn}
            className="px-4 py-2 bg-[#182A42] hover:bg-slate-800 text-white font-bold text-sm rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Connect Google Calendar
          </button>
        </div>
      );
    }
    if (isLoading) {
      return (
        <div className="py-12 text-center space-y-2">
          <Loader2 className="w-6 h-6 text-[#182A42] animate-spin mx-auto" />
          <p className="text-xs text-slate-500">Reading your calendar…</p>
        </div>
      );
    }
    if (hasScanned && totalScannedCount > 0 && fresh.length === 0 && !showAlreadyImported) {
      return (
        <div className="p-6 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
          <CheckCircle2 className="w-6 h-6 text-[#447463] mx-auto" />
          <p className="text-sm font-bold text-slate-900">Everything is already in Ahead Of Time</p>
          <button type="button" onClick={() => setShowAlreadyImported(true)} className="text-xs font-semibold text-slate-600 underline underline-offset-2 cursor-pointer">
            Show the {totalScannedCount} entries
          </button>
        </div>
      );
    }
    return (
      <>
        {hasScanned && fresh.length > 0 && (
          <p className="px-1 text-lg font-black text-[#182A42] leading-snug">
            We found {planGroup.length} {planGroup.length === 1 ? 'event' : 'events'} worth preparing for
          </p>
        )}
        {birthdaysLeftOut > 0 && (
          <div className="p-3 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <p>
              <b className="text-slate-900">
                {birthdaysLeftOut} {birthdaysLeftOut === 1 ? 'birthday' : 'birthdays'} left out.
              </b>{' '}
              Want to plan birthdays too?
            </p>
            <p className="text-[11px] text-slate-500">Tip: add "gift", "party" or "prep" to a birthday in your calendar and we'll plan that one.</p>
            <button type="button" onClick={() => setBirthdayPref('plan')} className="px-3 py-1.5 rounded-lg bg-[#182A42] text-white text-xs font-bold cursor-pointer">
              Plan birthdays too
            </button>
          </div>
        )}
        {birthdaysPlanned > 0 && scanPrefs.birthdays === 'plan' && (
          <p className="px-1 text-[11px] text-slate-500">
            Birthdays get a small plan (card or gift).{' '}
            <button type="button" onClick={() => setBirthdayPref('skip')} className="font-semibold underline underline-offset-2 cursor-pointer">
              Leave birthdays out
            </button>
          </p>
        )}
        {planGroup.length > 0 && (
          <>
            {sectionTitle('Worth preparing for', planGroup.length)}
            {planGroup.map(renderRow)}
          </>
        )}
        {unsureGroup.length > 0 && sectionTitle(askItems.length ? 'Not sure · we ask in step 3' : 'Not sure', unsureGroup.length)}
        {skippedGroup.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              aria-expanded={showSkipped}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:border-slate-400 cursor-pointer"
            >
              <span>
                Skipped ({skippedGroup.length}){skippedSummary ? `: ${skippedSummary}` : ''}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">{showSkipped ? 'Hide' : 'Show'}</span>
            </button>
            {showSkipped && skippedGroup.map(renderRow)}
          </>
        )}
        {alreadyImported.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowAlreadyImported((v) => !v)}
              className="px-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-2 cursor-pointer"
            >
              {showAlreadyImported ? 'Hide' : 'Show'} {alreadyImported.length} already in Ahead Of Time
            </button>
            {showAlreadyImported && alreadyImported.sort(byDate).map(renderRow)}
          </>
        )}
        {hasScanned && totalScannedCount === 0 && (
          <p className="p-5 text-center text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl">Nothing found in the next {scanMonths} months.</p>
        )}
      </>
    );
  };

  const readyCount = planned.filter((r) => r.event).length;
  const planBody = () => (
    <>
      <p className="px-1 text-lg font-black text-[#182A42]">
        {readyCount} of {planned.length} plans ready
      </p>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full bg-[#182A42] rounded-full transition-all duration-500" style={{ width: `${planned.length ? (readyCount / planned.length) * 100 : 0}%` }} />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {planned.map((r) => (
          <div key={r.item.id} className="flex items-center gap-3 px-3 py-2.5">
            {r.event ? (
              <span className="w-5 h-5 rounded-full bg-aot-sage text-[#182A42] flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 stroke-[3]" />
              </span>
            ) : (
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
            )}
            <div className="min-w-0">
              <p className={`text-sm font-bold truncate ${r.event ? 'text-[#182A42]' : 'text-slate-500'}`}>{r.item.summary}</p>
              <p className="text-[11.5px] text-slate-500">{planSummary(r.event)}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const questionRows = askKeys.map((key) => planned.find((r) => questionKey(r.item) === key)).filter(Boolean) as PlannedRow[];
  const planRows = planned.filter((r) => r.item.verdict !== 'unsure');
  const onPlans = planned.filter(isAccepted);
  const onTaskCount = onPlans.reduce((n, r) => n + (r.event ? pendingTasksOf(r.event).length : 0), 0);

  const checkBody = () => (
    <>
      {questionRows.length > 0 && (
        <>
          {sectionTitle('Should we plan these?', `${questionRows.length} ${questionRows.length === 1 ? 'type' : 'types'}`)}
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {questionRows.map((r) => {
              const key = questionKey(r.item);
              const answer = answers[key];
              const first = firstTask(r.event);
              return (
                <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="inline-block px-1.5 py-px rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-600">
                      {r.item.kind === 'other' ? 'Unclear entry' : ENTRY_KIND_LABELS[r.item.kind]}
                    </span>
                    <p className="mt-1 text-sm font-bold text-[#182A42] truncate">{r.item.summary}</p>
                    <p className="text-[11.5px] text-slate-500 truncate">
                      {formatDisplayDate(dateOf(r.item))}
                      {first ? ` · plan: ${first.title}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0" role="group" aria-label={`Plan ${r.item.summary}?`}>
                    <button
                      type="button"
                      aria-pressed={answer === 'skip'}
                      aria-label="Leave these out"
                      onClick={() => setAnswers((a) => ({ ...a, [key]: 'skip' }))}
                      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-xs cursor-pointer ${answer === 'skip' ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-rose-600'}`}
                    >
                      <X className="w-4 h-4 stroke-[3]" />
                    </button>
                    <button
                      type="button"
                      aria-pressed={answer === 'plan'}
                      aria-label="Plan these"
                      onClick={() => setAnswers((a) => ({ ...a, [key]: 'plan' }))}
                      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-xs cursor-pointer ${answer === 'plan' ? 'bg-[#182A42] text-white' : 'bg-white border border-slate-200 text-[#447463]'}`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="px-3 py-2 rounded-xl bg-[#eef6f3] border border-[#cfe3dc] text-[12px] text-[#20463a] leading-relaxed">
            Your answer becomes a rule: <b>✓ plan things like this</b> or <b>✕ leave them out</b>, from now on. Unclear entries are remembered by name. Change any
            rule in Settings → Your calendar habits.
          </p>
        </>
      )}
      {sectionTitle(`Plans · ${onPlans.length} on`, `${onTaskCount} tasks`)}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {planRows.map((r) => {
          const on = included[r.item.id] !== false;
          const open = expandedId === r.item.id;
          const tasks = r.event ? [...pendingTasksOf(r.event)].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate)) : [];
          return (
            <div key={r.item.id} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setExpandedId(open ? null : r.item.id)} aria-expanded={open} className="min-w-0 flex-1 text-left cursor-pointer">
                  <p className={`text-sm font-bold truncate ${on ? 'text-[#182A42]' : 'text-slate-400'}`}>{r.item.summary}</p>
                  <p className="text-[11.5px] text-slate-500">{on ? planSummary(r.event) : 'Switched off'}</p>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Include ${r.item.summary}`}
                  onClick={() => setIncluded((prev) => ({ ...prev, [r.item.id]: !on }))}
                  className={`relative w-10 h-6 rounded-full shrink-0 transition-colors cursor-pointer ${on ? 'bg-[#447463]' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-1'}`} />
                </button>
              </div>
              {open && tasks.length > 0 && (
                <ul className="mt-2 pt-1 border-t border-dashed border-slate-200">
                  {tasks.map((m) => (
                    <li key={m.id} className="flex items-start gap-2 py-1.5 text-xs">
                      <span className="mt-0.5 w-3.5 h-3.5 rounded border-2 border-slate-300 shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-800">{m.title}</span>
                        <span className="block text-[11px] text-slate-500">{formatDisplayDate(m.calculatedDate.slice(0, 10))}</span>
                      </span>
                    </li>
                  ))}
                  <li className="pt-1 text-[11px] text-slate-400">You can change tasks later in the plan.</li>
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  // Sync: a week of what lands in the calendar, before anything is written.
  const today = new Date(currentReferenceDate).toISOString().slice(0, 10);
  const allTasks = accepted.flatMap((ev) => pendingTasksOf(ev).map((m) => ({ m, ev })));
  const mondayOf = (day: string) => {
    const wd = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
    return shiftDay(day, -wd);
  };
  const firstWeek = mondayOf(
    allTasks.map((t) => t.m.calculatedDate.slice(0, 10)).filter((d) => d >= today).sort()[0] || today
  );
  const week = weekStart || firstWeek;
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDay(week, i));
  const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const weekLabel = `${new Date(`${week}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${shiftDay(week, 6)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;

  const syncBody = () => (
    <>
      {syncDone ? (
        <div className="p-5 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
          <span className="w-10 h-10 rounded-full bg-aot-sage text-[#182A42] flex items-center justify-center mx-auto">
            <Check className="w-5 h-5 stroke-[3]" />
          </span>
          <p className="text-base font-black text-[#182A42]">
            Synced {syncDone.tasks} {syncDone.tasks === 1 ? 'task' : 'tasks'} to your calendar
          </p>
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#182A42] text-[#182A42] text-xs font-bold hover:bg-slate-50"
          >
            Open Google Calendar <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-black text-[#182A42]">{weekLabel}</p>
            <div className="flex gap-1">
              <button type="button" aria-label="Previous week" onClick={() => setWeekStart(shiftDay(week, -7))} className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-[#182A42] cursor-pointer">
                ‹
              </button>
              <button type="button" aria-label="Next week" onClick={() => setWeekStart(shiftDay(week, 7))} className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-[#182A42] cursor-pointer">
                ›
              </button>
            </div>
          </div>
          {/* Phones: one row per day; wider screens: a week grid. */}
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-1">
            {weekDays.map((d) => {
              const dayTasks = allTasks.filter((t) => t.m.calculatedDate.slice(0, 10) === d);
              const dayEvents = accepted.filter((ev) => ev.eventDate === d);
              return (
                <div
                  key={d}
                  className={`flex sm:block items-start gap-2 sm:min-h-[120px] rounded-lg border p-1.5 sm:p-1 ${d === today ? 'border-[#182A42] bg-white' : 'border-slate-200 bg-white'} ${
                    dayTasks.length + dayEvents.length === 0 ? 'opacity-60' : ''
                  }`}
                >
                  <p className="w-14 sm:w-auto shrink-0 text-[11px] sm:text-[9.5px] font-bold text-slate-400 sm:mb-1 pt-0.5 sm:pt-0">{shortDay(d)}</p>
                  <div className="flex-1 min-w-0 sm:contents">
                  {dayEvents.map((ev) => (
                    <p key={ev.id} className="mb-1 px-1.5 sm:px-1 py-0.5 rounded bg-[#182A42] text-white text-[11px] sm:text-[9.5px] font-bold leading-tight sm:line-clamp-3" title={`${ev.title} (your event, stays as is)`}>
                      {ev.title}
                    </p>
                  ))}
                  {dayTasks.map(({ m, ev }) => (
                    <p key={m.id} className="mb-1 px-1.5 sm:px-1 py-0.5 rounded bg-aot-sage/35 border-l-2 border-[#447463] text-[#1e3a32] text-[11px] sm:text-[9.5px] font-bold leading-tight sm:line-clamp-3" title={`${m.title} · ${ev.title}`}>
                      {m.title}
                    </p>
                  ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="px-3 py-2 rounded-xl bg-[#eef6f3] border border-[#cfe3dc] text-[12px] text-[#20463a] leading-relaxed">
            <b>{syncTaskCount} tasks</b> from <b>{accepted.length} {accepted.length === 1 ? 'plan' : 'plans'}</b> go into <b>Google Calendar</b>. Your own events aren't changed.
          </p>
        </>
      )}
      {syncError && <p className="px-1 text-xs font-semibold text-rose-600">{syncError}</p>}
    </>
  );

  const autoBody = () => (
    <>
      <p className="px-1 text-lg font-black text-[#182A42] leading-snug">Want us to keep watching your calendar?</p>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#182A42]">Background Sync</p>
            <p className="text-[11.5px] text-slate-500">We check your calendar every day and tell you about new events worth preparing for. Plans made in Telegram sync by themselves.</p>
          </div>
          {serverLinked ? (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-aot-sage text-[#20463a]">On</span>
          ) : (
            <button
              type="button"
              onClick={turnOnBackgroundSync}
              disabled={isLinking}
              className="px-3 py-1.5 rounded-lg bg-[#182A42] text-white text-xs font-bold cursor-pointer disabled:opacity-60 shrink-0"
            >
              {isLinking ? 'Opening…' : 'Turn on'}
            </button>
          )}
        </div>
        <div className="px-3 py-3 space-y-2">
          <div>
            <p className="text-sm font-bold text-[#182A42]">Tell me what's new</p>
            <p className="text-[11.5px] text-slate-500">An update with what's coming up. Time and channel can be changed in Settings → Updates.</p>
          </div>
          <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5" role="radiogroup" aria-label="How often">
            {[
              ['off', 'Off'],
              ['daily', 'Daily'],
              ['weekly', 'Weekly'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={notifyFrequency === value}
                onClick={() => saveFrequency(value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${notifyFrequency === value ? 'bg-white text-[#182A42] shadow-xs' : 'text-slate-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-900 leading-relaxed">
        You can always run these steps yourself with <b>Scan agenda</b>.
      </p>
      {syncError && <p className="px-1 text-xs font-semibold text-rose-600">{syncError}</p>}
    </>
  );

  const HEAD: Record<FlowStep, { title: string; sub: string }> = {
    import: {
      title: 'Scan your agenda',
      sub: !connected
        ? 'Connect Google Calendar to scan'
        : isLoading
          ? 'Scanning…'
          : hasScanned
            ? `${scanMonths} months · ${fresh.length} new ${fresh.length === 1 ? 'entry' : 'entries'}`
            : profile?.id || '',
    },
    plan: { title: 'Making your plans', sub: 'About 20 seconds' },
    check: { title: 'Your plans are ready', sub: "Switch off anything you don't need" },
    sync: { title: syncDone ? 'In your calendar' : 'Sync to your calendar', sub: syncDone ? 'Done' : "This is what we'll add" },
    auto: { title: 'Stay ahead automatically', sub: 'You can change this any time in Settings' },
  };
  const stepIndex = FLOW_STEPS.findIndex((s) => s.id === step);
  const primary = 'flex-1 px-4 py-2.5 bg-[#182A42] hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer';
  const quiet = 'px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 rounded-xl text-xs font-bold cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200">
      <div className="relative bg-[#f7f8fa] border border-slate-200 w-full max-w-xl rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900 h-[90dvh] sm:h-auto max-h-[90dvh] sm:max-h-[85vh] sm:min-h-[560px]">
        {/* Header: step title and the five-step bar */}
        <div className="px-4 pt-3.5 pb-3 bg-[#182A42] text-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black tracking-tight">{HEAD[step].title}</h2>
              <p className="text-xs text-slate-300 truncate">{HEAD[step].sub}</p>
            </div>
            <button
              onClick={() => (step === 'import' || step === 'plan' ? onClose() : finish(accepted))}
              disabled={step === 'plan' && readyCount < planned.length}
              aria-label="Close"
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1" aria-label={`Step ${stepIndex + 1} of 5`}>
            {FLOW_STEPS.map((s, i) => (
              <div key={s.id}>
                <div className={`h-1 rounded-full ${i < stepIndex ? 'bg-aot-sage' : i === stepIndex ? 'bg-white' : 'bg-white/20'}`} />
                <p className={`mt-1 text-[10px] font-bold ${i === stepIndex ? 'text-white' : 'text-slate-400'}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 sm:p-4 space-y-2 overflow-y-auto flex-1 overscroll-contain">
          {errorMsg && step === 'import' && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}
          {step === 'import' && importBody()}
          {step === 'plan' && planBody()}
          {step === 'check' && checkBody()}
          {step === 'sync' && syncBody()}
          {step === 'auto' && autoBody()}
        </div>

        {/* Footer: one main button per step */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
          {step === 'import' && (
            <>
              {connected && (
                <select
                  aria-label="How far ahead to scan"
                  value={scanMonths}
                  disabled={isLoading}
                  onChange={(e) => handleScanAgenda(Number(e.target.value))}
                  className="px-2.5 py-2.5 rounded-xl bg-slate-100 text-xs font-bold text-[#182A42] border-0 cursor-pointer"
                >
                  {[3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {m} months
                    </option>
                  ))}
                </select>
              )}
              <button onClick={onClose} className={quiet}>
                Close
              </button>
              {connected && totalScannedCount > 0 && (
                <button onClick={() => startPlanning([...chosenItems, ...askItems])} disabled={chosenItems.length + askItems.length === 0 || isLoading} className={primary}>
                  {chosenItems.length > 0
                    ? `Make plans for ${chosenItems.length} ${chosenItems.length === 1 ? 'event' : 'events'}`
                    : 'Next: check the unsure ones'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {step === 'plan' && (
            <button onClick={() => setStep('check')} disabled={readyCount < planned.length} className={primary}>
              {readyCount < planned.length ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Planning {readyCount} of {planned.length}
                </>
              ) : (
                <>
                  Check the plans <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
          {step === 'check' && (
            <button onClick={confirmChecked} className={primary}>
              {onPlans.length === 0 ? 'Close, add nothing' : <>Next: see it in your calendar <ArrowRight className="w-4 h-4" /></>}
            </button>
          )}
          {step === 'sync' &&
            (syncDone ? (
              <button onClick={afterSync} className={primary}>
                {serverLinked ? 'Done, show my plans' : 'Next'} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex-1 flex flex-col gap-1.5">
                <button onClick={syncAll} disabled={isSyncing || syncTaskCount === 0} className={primary}>
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Syncing…
                    </>
                  ) : (
                    `Sync ${syncTaskCount} ${syncTaskCount === 1 ? 'task' : 'tasks'} to Google Calendar`
                  )}
                </button>
                <button onClick={afterSync} disabled={isSyncing} className="text-xs font-bold text-slate-500 hover:text-slate-800 py-1 cursor-pointer">
                  Not now, keep them pending sync
                </button>
              </div>
            ))}
          {step === 'auto' && (
            <button onClick={() => finish(accepted)} className={primary}>
              Done, show my plans <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
