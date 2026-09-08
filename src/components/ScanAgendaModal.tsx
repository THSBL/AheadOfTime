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
  EyeOff
} from 'lucide-react';
import { CalendarEvent, EventCategory, TMinusMilestone, OnboardingProfile } from '../types';
import { fetchGoogleCalendarEvents, fetchPrimaryCalendarProfile, GoogleCalendarProfile, GoogleCalendarEventItem } from '../services/googleCalendar';
import { getStoredAccessToken, isTokenExpired, requestGoogleCalendarToken, getStoredClientId, clearGoogleSession } from '../services/googleAuth';
import { detectEventCategory, generateHeuristicMilestones, formatDisplayDate, getCleanEventTitle } from '../utils/tminusRules';
import { deepRefineEventLocally } from '../utils/deepRefine';
import { normalizeProfile } from '../data/samplePresets';

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

interface ScannedEventItem extends GoogleCalendarEventItem {
  detectedCategory: EventCategory;
  isRoutine: boolean;
  isAlreadyInDashboard: boolean;
  shouldTrackByDefault: boolean;
  diffDays: number;
  previewMilestones: TMinusMilestone[];
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
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [profile, setProfile] = useState<GoogleCalendarProfile | null>(null);
  const [scannedEvents, setScannedEvents] = useState<ScannedEventItem[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'actionable' | 'parties' | 'trips' | 'hosting' | 'deadlines' | 'routine'>('actionable');
  const [showAlreadyImported, setShowAlreadyImported] = useState<boolean>(false);
  const [scanMonths, setScanMonths] = useState<number>(initialScanMonths);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState<boolean>(false);

  useEffect(() => {
    if (initialScanMonths) {
      setScanMonths(initialScanMonths);
    }
  }, [initialScanMonths]);

  const token = getStoredAccessToken();
  const connected = Boolean(token && !isTokenExpired());

  const handleScanAgenda = async (monthsOverride?: number) => {
    setIsLoading(true);
    setErrorMsg(null);
    const monthsToUse = monthsOverride !== undefined ? monthsOverride : scanMonths;
    if (monthsOverride !== undefined) {
      setScanMonths(monthsOverride);
    }
    try {
      const activeToken = getStoredAccessToken();
      if (!activeToken || isTokenExpired()) {
        setErrorMsg('Google Calendar session is not active. Please connect your Google account.');
        setIsLoading(false);
        return;
      }

      // 1. Fetch profile
      const prof = await fetchPrimaryCalendarProfile(activeToken);
      setProfile(prof);

      // 2. Fetch upcoming events
      const minDate = new Date(currentReferenceDate).toISOString();
      const maxDate = new Date(new Date(currentReferenceDate).getTime() + monthsToUse * 30 * 24 * 60 * 60 * 1000).toISOString();
      const items = await fetchGoogleCalendarEvents(activeToken, 150, minDate, maxDate);

      // 3. Evaluate each event with T-Minus rules and deduplicate against existing dashboard events
      let currentDashboardEvents = existingEvents;
      if (!currentDashboardEvents || currentDashboardEvents.length === 0) {
        try {
          const stored = localStorage.getItem('tminus_events_v2');
          if (stored) currentDashboardEvents = JSON.parse(stored);
        } catch {
          // ignore
        }
      }
      const liveDashboardEvents = currentDashboardEvents || [];

      const refTime = new Date(currentReferenceDate).getTime();
      const scannedList: ScannedEventItem[] = (items || []).map((item) => {
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
        const filterWorkNoise = calendar_type !== 'business';
        const flagsKids = family_structure === 'family_with_kids';

        const isWorkRoutine = filterWorkNoise && 
          /standup|1:1|sync|weekly|daily|scrum|catchup|status check|office hours|all hands|retrospective|retro\b/i.test(lowerTitle);
        const isPersonalRoutine = /dentist|cleaning|doctor|vet\b|haircut|dry clean/i.test(lowerTitle);
        const isRoutine = isWorkRoutine || isPersonalRoutine;

        // If couple with kids, prioritize school and youth events
        const isKidsPriority = flagsKids && /school|costume|spirit|rehearsal|recital|tournament|sports|camp|halloween/i.test(lowerTitle);

        const category = detectEventCategory(title, desc);

        // Deduplication against dashboard
        const alreadyInDashboard = isEventAlreadyInDashboard(item, liveDashboardEvents);

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
          context: {},
          milestones: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const previewMilestones = deepRefineEventLocally(tempEvent);

        // Only track by default if it's actionable AND not already present in the dashboard
        const shouldTrackByDefault = !alreadyInDashboard && (isKidsPriority || !isRoutine) && diffDays >= 2;

        return {
          ...item,
          detectedCategory: category,
          isRoutine,
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

      const hasActionable = scannedList.some((i) => i.shouldTrackByDefault);
      setActiveFilter(hasActionable ? 'actionable' : 'all');
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

  const handleSelectAllInFilter = (filterType: typeof activeFilter) => {
    const updated: Record<string, boolean> = { ...selectedEventIds };
    getFilteredEvents(filterType).forEach((item) => {
      if (!item.isAlreadyInDashboard) {
        updated[item.id] = true;
      }
    });
    setSelectedEventIds(updated);
  };

  const handleDeselectAllInFilter = (filterType: typeof activeFilter) => {
    const updated: Record<string, boolean> = { ...selectedEventIds };
    getFilteredEvents(filterType).forEach((item) => {
      updated[item.id] = false;
    });
    setSelectedEventIds(updated);
  };

  const getFilteredEvents = (filter: typeof activeFilter) => {
    return scannedEvents.filter((e) => {
      // If not explicitly toggled to show already imported items, hide them
      if (!showAlreadyImported && e.isAlreadyInDashboard) return false;

      if (filter === 'all') return true;
      if (filter === 'actionable') return !e.isRoutine && e.shouldTrackByDefault;
      if (filter === 'parties') return e.detectedCategory === 'birthday_party';
      if (filter === 'trips') return e.detectedCategory === 'travel_trip';
      if (filter === 'hosting') return e.detectedCategory === 'hosting_visitors';
      if (filter === 'deadlines') return e.detectedCategory === 'project_deadline';
      if (filter === 'routine') return e.isRoutine;
      return true;
    });
  };

  const handleImportSelected = () => {
    const selectedItems = scannedEvents.filter((item) => selectedEventIds[item.id] && !item.isAlreadyInDashboard);
    const eventsToImport: CalendarEvent[] = selectedItems.map((item) => {
      const startDateStr = item.start?.dateTime || item.start?.date || '';
      const eventDateStr = startDateStr ? startDateStr.substring(0, 10) : '';
      const eventTimeStr = startDateStr.includes('T') ? startDateStr.substring(11, 16) : '10:00';

      const newEvt: CalendarEvent = {
        id: `gcal-${item.id}`,
        title: getCleanEventTitle(item.summary, item.detectedCategory),
        eventDate: eventDateStr,
        eventTime: eventTimeStr,
        category: item.detectedCategory,
        status: 'milestones_active',
        needsRefinement: true,
        location: item.location || '',
        googleEventId: item.id,
        context: {},
        milestones: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      newEvt.milestones = deepRefineEventLocally(newEvt);
      return newEvt;
    });

    onImportTrackedEvents(eventsToImport);
    onClose();
  };

  if (!isOpen) return null;

  const totalScannedCount = scannedEvents.length;
  const alreadyImportedCount = scannedEvents.filter((e) => e.isAlreadyInDashboard).length;
  const eligibleEvents = scannedEvents.filter((e) => !e.isAlreadyInDashboard);
  const eligibleCount = eligibleEvents.length;

  const actionableCount = eligibleEvents.filter((e) => !e.isRoutine && e.shouldTrackByDefault).length;
  const partiesCount = eligibleEvents.filter((e) => e.detectedCategory === 'birthday_party').length;
  const tripsCount = eligibleEvents.filter((e) => e.detectedCategory === 'travel_trip').length;
  const hostingCount = eligibleEvents.filter((e) => e.detectedCategory === 'hosting_visitors').length;
  const deadlinesCount = eligibleEvents.filter((e) => e.detectedCategory === 'project_deadline').length;
  const routineCount = eligibleEvents.filter((e) => e.isRoutine).length;

  const selectedCount = Object.keys(selectedEventIds).filter((id) => {
    if (!selectedEventIds[id]) return false;
    const item = scannedEvents.find((e) => e.id === id);
    return item && !item.isAlreadyInDashboard;
  }).length;

  const filteredEvents = getFilteredEvents(activeFilter);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900 max-h-[88dvh] sm:max-h-[85vh]">
        
        {/* Header */}
        <div className="p-3.5 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-xs shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-black tracking-tight text-white truncate">
                Scan Calendar Agenda
              </h2>
              <p className="text-xs text-slate-300 font-medium hidden sm:block truncate">
                Detect upcoming calendar events and automatically build backward preparation milestones
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1 overscroll-contain">
          
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Calendar Connection Status & Controls */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connected Google Calendar</div>
              <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                {connected ? (profile?.id || profile?.summary || 'Connected Google Calendar') : 'Not Connected'}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                connected ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}>
                {connected ? 'Linked' : 'Unlinked'}
              </span>

              {!connected ? (
                <button
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="px-3 py-1.5 bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isSigningIn ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                  <span>Link Calendar</span>
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  title="Disconnect"
                >
                  <Unlink className="w-3 h-3 text-rose-600" />
                  <span>Disconnect</span>
                </button>
              )}
            </div>
          </div>

          {/* Scanned Events Breakdown */}
          {connected && (
            <div className="space-y-4">
              
              {/* Scan Time Window Selector */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-sky-700" />
                  <span>Scan Horizon:</span>
                </div>
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                  {[3, 6, 12].map((m) => (
                    <button
                      key={m}
                      onClick={() => handleScanAgenda(m)}
                      disabled={isLoading}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        scanMonths === m ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {m} Months
                    </button>
                  ))}
                </div>
              </div>

              {/* Deduplication Status Notice */}
              {alreadyImportedCount > 0 && (
                <div className="p-3 bg-sky-50/90 border border-sky-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-sky-950 font-medium">
                    <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
                    <span>
                      <strong>Deduplication active:</strong> Showing <strong>{eligibleCount}</strong> new eligible event{eligibleCount === 1 ? '' : 's'}. ({alreadyImportedCount} event{alreadyImportedCount === 1 ? '' : 's'} already in your dashboard {alreadyImportedCount === 1 ? 'was' : 'were'} filtered out).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAlreadyImported(!showAlreadyImported)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-800 hover:text-sky-950 underline underline-offset-2 shrink-0 cursor-pointer"
                  >
                    {showAlreadyImported ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide tracked</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Show {alreadyImportedCount} already tracked</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Classification Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setActiveFilter('actionable')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'actionable'
                      ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  Actionable ({actionableCount})
                </button>

                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  {showAlreadyImported ? `All (${totalScannedCount})` : `All Eligible (${eligibleCount})`}
                </button>

                {partiesCount > 0 && (
                  <button
                    onClick={() => setActiveFilter('parties')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                      activeFilter === 'parties'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Parties ({partiesCount})
                  </button>
                )}

                {tripsCount > 0 && (
                  <button
                    onClick={() => setActiveFilter('trips')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                      activeFilter === 'trips'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Trips ({tripsCount})
                  </button>
                )}

                {hostingCount > 0 && (
                  <button
                    onClick={() => setActiveFilter('hosting')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                      activeFilter === 'hosting'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Hosting ({hostingCount})
                  </button>
                )}

                {deadlinesCount > 0 && (
                  <button
                    onClick={() => setActiveFilter('deadlines')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                      activeFilter === 'deadlines'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Deadlines ({deadlinesCount})
                  </button>
                )}

                {routineCount > 0 && (
                  <button
                    onClick={() => setActiveFilter('routine')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                      activeFilter === 'routine'
                        ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-200'
                    }`}
                  >
                    Routine ({routineCount})
                  </button>
                )}
              </div>

              {/* Select All / Deselect All Controls */}
              <div className="flex items-center justify-between text-xs p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-600 font-bold">Selection:</span>
                  <button
                    onClick={() => handleSelectAllInFilter(activeFilter)}
                    className="px-2 py-0.5 bg-white hover:bg-sky-50 text-slate-800 font-bold rounded-lg border border-slate-200 shadow-2xs cursor-pointer"
                  >
                    Select Eligible
                  </button>
                  <button
                    onClick={() => handleDeselectAllInFilter(activeFilter)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-lg border border-slate-200 shadow-2xs cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
                <div className="text-xs font-bold text-slate-700 font-mono">
                  {selectedCount} Selected
                </div>
              </div>

              {/* Events List */}
              {isLoading ? (
                <div className="py-10 text-center space-y-2">
                  <Loader2 className="w-6 h-6 text-sky-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">Scanning agenda events & calculating lead times...</p>
                </div>
              ) : totalScannedCount > 0 && eligibleCount === 0 && !showAlreadyImported ? (
                /* All Caught Up State */
                <div className="p-8 text-center bg-slate-50/80 border border-slate-200 rounded-3xl space-y-3 my-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">All Calendar Events Already Tracked!</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      All {totalScannedCount} upcoming events found on your Google Calendar are already present in your Ahead Of Time dashboard. No duplicate or unimported events require action.
                    </p>
                  </div>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAlreadyImported(true)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      View {totalScannedCount} Tracked Items
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-1.5 bg-[#0e1d2c] hover:bg-[#162a3f] text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                    >
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                  No eligible new events found in this view.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filteredEvents.map((item) => {
                    const isAlreadyTracked = item.isAlreadyInDashboard;
                    const isSelected = selectedEventIds[item.id] ?? false;
                    const startDate = item.start?.dateTime || item.start?.date || '';

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (!isAlreadyTracked) handleToggleSelect(item.id);
                        }}
                        className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                          isAlreadyTracked
                            ? 'bg-slate-50/80 border-slate-200/80 opacity-75 cursor-default'
                            : isSelected
                            ? 'bg-white border-sky-300 shadow-2xs ring-1 ring-sky-300/40 cursor-pointer'
                            : 'bg-slate-50/70 border-slate-200 opacity-85 hover:opacity-100 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isAlreadyTracked ? true : isSelected}
                            disabled={isAlreadyTracked}
                            onChange={() => {
                              if (!isAlreadyTracked) handleToggleSelect(item.id);
                            }}
                            className={`w-4 h-4 rounded mt-0.5 ${
                              isAlreadyTracked 
                                ? 'text-emerald-600 bg-emerald-50 border-emerald-300 cursor-not-allowed opacity-80' 
                                : 'text-slate-900 focus:ring-slate-900 cursor-pointer'
                            }`}
                          />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {item.summary || 'Untitled Event'}
                              </h4>
                              {isAlreadyTracked ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  Already in Dashboard
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                  {item.detectedCategory.replace('_', ' ')}
                                </span>
                              )}
                              {item.diffDays > 0 && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  in {item.diffDays}d
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-500 truncate">
                              {startDate ? formatDisplayDate(startDate.substring(0, 10)) : 'No date'}
                              {item.location ? ` • ${item.location}` : ''}
                            </p>

                            {item.previewMilestones.length > 0 && (
                              <div className="text-[10px] text-sky-800 font-medium">
                                Milestones: {item.previewMilestones.slice(0, 4).map((m) => m.tMinusLabel).join(' → ')}
                              </div>
                            )}
                          </div>
                        </div>

                        {isAlreadyTracked ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-slate-200/80 text-slate-600">
                            Tracked
                          </span>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            isSelected ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-600'
                          }`}>
                            {isSelected ? 'Import' : 'Skip'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {alreadyImportedCount > 0 && (
              <span className="hidden sm:inline">
                {eligibleCount} eligible new item{eligibleCount === 1 ? '' : 's'} to track
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>

            {connected && totalScannedCount > 0 && (
              <button
                onClick={handleImportSelected}
                disabled={selectedCount === 0}
                className="px-4 sm:px-5 py-2 sm:py-2.5 bg-[#0e1d2c] hover:bg-[#162a3f] disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <span className="sm:hidden">Import ({selectedCount})</span>
                <span className="hidden sm:inline">Import &amp; Generate Timelines ({selectedCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
