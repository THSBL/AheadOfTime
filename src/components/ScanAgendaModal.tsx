import { recordAgendaScan } from '../services/agendaScanRecord';
import { assessCalendarEntry, trimToBirthdayReminderPlan, ENTRY_KIND_LABELS, type EntryKind, type ScanVerdict } from '../utils/eventEligibility';
import { readScanPrefs, saveScanPrefs } from '../services/scanPrefs';
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
import { fetchGoogleCalendarEvents, fetchPrimaryCalendarProfile, GoogleCalendarProfile, GoogleCalendarEventItem } from '../services/googleCalendar';
import { getStoredAccessToken, isTokenExpired, requestGoogleCalendarToken, getStoredClientId, clearGoogleSession } from '../services/googleAuth';
import { detectEventCategory, formatDisplayDate, getCleanEventTitle } from '../utils/tminusRules';
import { generateDeterministicMilestones } from '../utils/deterministicMilestoneGenerator';
import { normalizeProfile } from '../data/samplePresets';
import { getCurrentUser, loadUserEvents, setCurrentUser as setGlobalCurrentUser, AuthUser } from '../services/accountManager';
import { groupTripEntries, describeTripEntry } from '../utils/tripGrouping';
import { completeTasksEvidencedByCalendar } from '../utils/calendarEvidence';
import { isServerCalendarLinked, scanAgendaViaServer, ServerCalendarUnavailable } from '../services/serverCalendar';
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
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface ScannedEventItem extends GoogleCalendarEventItem {
  detectedCategory: EventCategory;
  /** What kind of entry it is, and plan / not sure / skip (utils/eventEligibility.ts). */
  kind: EntryKind;
  verdict: ScanVerdict;
  reason: string;
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
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [profile, setProfile] = useState<GoogleCalendarProfile | null>(null);
  const [scannedEvents, setScannedEvents] = useState<ScannedEventItem[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, boolean>>({});
  const [showAlreadyImported, setShowAlreadyImported] = useState<boolean>(false);
  const [showSkipped, setShowSkipped] = useState<boolean>(false);
  const [scanPrefs, setScanPrefs] = useState(readScanPrefs);
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
        let assessment = item.tripParts
          ? { kind: 'trip' as EntryKind, category: 'travel_trip' as EventCategory, verdict: (diffDays >= 2 ? 'plan' : 'skip') as ScanVerdict, reason: 'Trip' }
          : assessCalendarEntry({ title, description: desc, daysAway: diffDays, durationDays, calendarType: calendar_type }, scanPrefs);

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

  // Birthdays: plain reminders are left out until the user asks for them.
  const setBirthdayPref = (birthdays: 'skip' | 'plan') => {
    const next = { ...scanPrefs, birthdays };
    setScanPrefs(next);
    saveScanPrefs(next);
    setScannedEvents((prev) =>
      prev.map((e) =>
        e.kind !== 'birthday_reminder'
          ? e
          : { ...e, verdict: birthdays === 'plan' && e.diffDays >= 2 ? 'plan' : 'skip', reason: birthdays === 'plan' ? 'Birthday: a card or gift' : 'Birthday reminder' }
      )
    );
    setSelectedEventIds((prev) => {
      const updated = { ...prev };
      scannedEvents.forEach((e) => {
        if (e.kind === 'birthday_reminder' && !e.isAlreadyInDashboard) updated[e.id] = birthdays === 'plan' && e.diffDays >= 2;
      });
      return updated;
    });
  };

  // How many /api/event/deep-refine calls run at once during import - no
  // existing precedent in this codebase for a single Gemini prompt covering
  // multiple distinct calendar events, so this stays N parallel single-event
  // calls (each with its own already-proven local fallback) rather than a
  // novel batched prompt. Bounded so importing a large selection doesn't
  // fire dozens of simultaneous requests.
  const IMPORT_CONCURRENCY = 4;

  // Per-event: try the Gemini-backed replan first (this is a brand-new,
  // never-touched event, so there's no existing completion state to lose -
  // a fresh-generate call is the right shape here, same as
  // EventCreationWizard's new-event path), falling back to the local
  // heuristic on any failure so one bad network call can't drop an event
  // from the import.
  const refineImportedEvent = async (draft: CalendarEvent): Promise<TMinusMilestone[]> => {
    try {
      const res = await fetch('/api/event/deep-refine', {
        method: 'POST',
        headers: aiJsonHeaders(),
        body: JSON.stringify({ event: draft }),
      });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      if (data?.event?.milestones?.length) {
        return data.event.milestones;
      }
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

  const handleImportSelected = async () => {
    const selectedItems = scannedEvents.filter((item) => selectedEventIds[item.id] && !item.isAlreadyInDashboard);
    const draftEvents: CalendarEvent[] = selectedItems.map((item) => {
      const startDateStr = item.start?.dateTime || item.start?.date || '';
      const eventDateStr = startDateStr ? startDateStr.substring(0, 10) : '';
      const eventTimeStr = startDateStr.includes('T') ? startDateStr.substring(11, 16) : '10:00';

      if (item.tripParts) {
        const endExclusive = item.end?.date || eventDateStr;
        const last = new Date(`${endExclusive}T12:00:00Z`);
        last.setUTCDate(last.getUTCDate() - 1);
        const firstTimed = item.tripParts.find((p) => p.start?.dateTime);
        return {
          id: `gcal-${item.id}`,
          title: item.summary,
          eventDate: eventDateStr,
          endDate: last.toISOString().slice(0, 10),
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as CalendarEvent;
    });

    setIsImporting(true);
    setImportProgress({ done: 0, total: draftEvents.length });

    const eventsToImport: CalendarEvent[] = new Array(draftEvents.length);
    let completedCount = 0;
    for (let i = 0; i < draftEvents.length; i += IMPORT_CONCURRENCY) {
      const chunk = draftEvents.slice(i, i + IMPORT_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (draft) => {
          const source = selectedItems.find((item) => `gcal-${item.id}` === draft.id);
          // A birthday reminder gets the gift and card steps, not a party plan.
          const refined = await refineImportedEvent(draft);
          const planned = source?.kind === 'birthday_reminder' ? trimToBirthdayReminderPlan(refined) : refined;
          // Tasks already due at import that the calendar shows as arranged
          // (the hotel stay is in it) start out done - trips only.
          const evidenceEntries = draft.category === 'travel_trip' && source ? source.tripParts || [source] : [];
          const milestones = evidenceEntries.length
            ? completeTasksEvidencedByCalendar(planned, evidenceEntries, draft, [draft.title, draft.location || ''])
            : planned;
          completedCount += 1;
          setImportProgress({ done: completedCount, total: draftEvents.length });
          return { ...draft, milestones };
        })
      );
      chunkResults.forEach((evt, idx) => {
        eventsToImport[i + idx] = evt;
      });
    }

    setIsImporting(false);
    setImportProgress(null);
    onImportTrackedEvents(eventsToImport);
    onClose();
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

  const selectedCount = Object.keys(selectedEventIds).filter((id) => {
    if (!selectedEventIds[id]) return false;
    const item = scannedEvents.find((e) => e.id === id);
    return item && !item.isAlreadyInDashboard;
  }).length;

  // What the rows fold away as: "routine, public holidays, birthdays".
  const skippedSummary = Array.from(
    new Set(
      skippedGroup.map((e) =>
        e.kind === 'public_holiday' ? 'public holidays' : e.kind === 'birthday_reminder' ? 'birthdays' : e.reason === 'Too soon to prepare' ? 'too soon' : 'routine'
      )
    )
  ).join(', ');

  const renderRow = (item: ScannedEventItem) => {
    const tracked = item.isAlreadyInDashboard;
    const isSelected = tracked || (selectedEventIds[item.id] ?? false);
    const startDate = item.start?.dateTime || item.start?.date || '';
    const unsure = item.verdict === 'unsure';
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
            <span
              className={`px-1.5 py-px rounded-full text-[10.5px] font-bold ${
                unsure ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {ENTRY_KIND_LABELS[item.kind]}
              {unsure ? '?' : ''}
            </span>
            {tracked && <span className="text-[10.5px] font-bold text-[#447463]">Already added</span>}
          </span>
          {item.tripParts && (
            <span className="block text-[11px] text-slate-400 truncate" title={item.tripParts.map((p) => p.summary).join(' · ')}>
              {item.tripParts.length} calendar entries grouped into one trip
            </span>
          )}
          {!tracked && item.verdict !== 'plan' && <span className="block text-[11px] text-slate-400">{item.reason}</span>}
        </span>
      </button>
    );
  };

  const sectionTitle = (label: string, count: number) => (
    <p className="flex items-center justify-between px-1 pt-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
      <span>{label}</span>
      <span className="font-mono">{count}</span>
    </p>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#f7f8fa] border border-slate-200 w-full max-w-xl rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900 max-h-[90dvh] sm:max-h-[85vh]">
        {/* Header: what was scanned, in one line */}
        <div className="px-4 py-3.5 bg-[#182A42] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-black tracking-tight">Your agenda</h2>
            <p className="text-xs text-slate-300 truncate">
              {!connected
                ? 'Connect Google Calendar to scan'
                : isLoading
                  ? 'Scanning…'
                  : hasScanned
                    ? `${scanMonths} months · ${fresh.length} new ${fresh.length === 1 ? 'entry' : 'entries'} · ${planGroup.length} worth planning`
                    : profile?.id || ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-2 overflow-y-auto flex-1 overscroll-contain">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {!connected ? (
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
          ) : isLoading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 text-[#182A42] animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Reading your calendar…</p>
            </div>
          ) : hasScanned && totalScannedCount > 0 && fresh.length === 0 && !showAlreadyImported ? (
            <div className="p-6 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
              <CheckCircle2 className="w-6 h-6 text-[#447463] mx-auto" />
              <p className="text-sm font-bold text-slate-900">Everything is already in Ahead Of Time</p>
              <button type="button" onClick={() => setShowAlreadyImported(true)} className="text-xs font-semibold text-slate-600 underline underline-offset-2 cursor-pointer">
                Show the {totalScannedCount} entries
              </button>
            </div>
          ) : (
            <>
              {/* Birthdays: left out unless the user wants them */}
              {birthdaysLeftOut > 0 && (
                <div className="p-3 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600 space-y-1.5">
                  <p>
                    <b className="text-slate-900">
                      {birthdaysLeftOut} {birthdaysLeftOut === 1 ? 'birthday' : 'birthdays'} left out.
                    </b>{' '}
                    Want to plan birthdays too?
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Tip: add "gift", "party" or "prep" to a birthday in your calendar and we'll plan that one.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBirthdayPref('plan')}
                    className="px-3 py-1.5 rounded-lg bg-[#182A42] text-white text-xs font-bold cursor-pointer"
                  >
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
                  {sectionTitle('Worth planning', planGroup.length)}
                  {planGroup.map(renderRow)}
                </>
              )}
              {unsureGroup.length > 0 && (
                <>
                  {sectionTitle('Not sure', unsureGroup.length)}
                  {unsureGroup.map(renderRow)}
                </>
              )}
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
          )}
        </div>

        {/* Footer: how far to look, and the one action */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
          {connected && (
            <select
              aria-label="How far ahead to scan"
              value={scanMonths}
              disabled={isLoading || isImporting}
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
          <button
            onClick={onClose}
            disabled={isImporting}
            className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 rounded-xl text-xs font-bold cursor-pointer"
          >
            Close
          </button>
          {connected && totalScannedCount > 0 && (
            <button
              onClick={handleImportSelected}
              disabled={selectedCount === 0 || isImporting}
              className="flex-1 px-4 py-2.5 bg-[#182A42] hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Adding{importProgress ? ` ${importProgress.done} of ${importProgress.total}` : '…'}</span>
                </>
              ) : (
                <span>
                  Add {selectedCount} {selectedCount === 1 ? 'plan' : 'plans'}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
