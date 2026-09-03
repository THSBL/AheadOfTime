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
  CreditCard
} from 'lucide-react';
import { CalendarEvent, EventCategory, TMinusMilestone } from '../types';
import { fetchGoogleCalendarEvents, fetchPrimaryCalendarProfile, GoogleCalendarProfile, GoogleCalendarEventItem } from '../services/googleCalendar';
import { getStoredAccessToken, isTokenExpired, requestGoogleCalendarToken, getStoredClientId, clearGoogleSession } from '../services/googleAuth';
import { detectEventCategory, generateHeuristicMilestones, formatDisplayDate } from '../utils/tminusRules';

interface ScanAgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentReferenceDate: string;
  onImportTrackedEvents: (events: CalendarEvent[]) => void;
  isGoogleConnected: boolean;
  onOpenGoogleCalendarSync: () => void;
}

interface ScannedEventItem extends GoogleCalendarEventItem {
  detectedCategory: EventCategory;
  isRoutine: boolean;
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
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [profile, setProfile] = useState<GoogleCalendarProfile | null>(null);
  const [scannedEvents, setScannedEvents] = useState<ScannedEventItem[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<'all' | 'actionable' | 'parties' | 'trips' | 'hosting' | 'deadlines' | 'routine'>('actionable');
  const [scanMonths, setScanMonths] = useState<number>(6);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState<boolean>(false);

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

      // 3. Evaluate each event with T-Minus rules
      const refTime = new Date(currentReferenceDate).getTime();
      const scannedList: ScannedEventItem[] = (items || []).map((item) => {
        const title = item.summary || 'Untitled Event';
        const desc = item.description || '';
        const startDateStr = item.start?.dateTime || item.start?.date || '';
        const eventDateStr = startDateStr ? startDateStr.substring(0, 10) : '';
        const eventTimeStr = startDateStr.includes('T') ? startDateStr.substring(11, 16) : '10:00';
        
        const eventTime = new Date(eventDateStr || currentReferenceDate).getTime();
        const diffDays = Math.max(0, Math.round((eventTime - refTime) / (1000 * 60 * 60 * 24)));

        // Detect routine work / repetitive meetings to ignore by default
        const lowerTitle = title.toLowerCase();
        const isRoutine = 
          /standup|1:1|sync|weekly|daily|scrum|catchup|status check|office hours|all hands|retrospective|retro\b/i.test(lowerTitle) ||
          /dentist|cleaning|doctor|vet\b|haircut|dry clean/i.test(lowerTitle);

        const category = detectEventCategory(title, desc);

        // Create temporary event structure to generate preview milestones
        const tempEvent: CalendarEvent = {
          id: `temp-${item.id}`,
          title,
          eventDate: eventDateStr,
          eventTime: eventTimeStr,
          category,
          status: 'milestones_active',
          location: item.location || '',
          context: {},
          milestones: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const previewMilestones = generateHeuristicMilestones(tempEvent, tempEvent.id, eventDateStr, eventTimeStr);

        const shouldTrackByDefault = !isRoutine && diffDays >= 2;

        return {
          ...item,
          detectedCategory: category,
          isRoutine,
          shouldTrackByDefault,
          diffDays,
          previewMilestones,
        };
      });

      setScannedEvents(scannedList);
      setHasScanned(true);

      // Select actionable events by default
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
    setSelectedEventIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSelectAllInFilter = (filterType: typeof activeFilter) => {
    const updated: Record<string, boolean> = { ...selectedEventIds };
    getFilteredEvents(filterType).forEach((item) => {
      updated[item.id] = true;
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
    const selectedItems = scannedEvents.filter((item) => selectedEventIds[item.id]);
    const eventsToImport: CalendarEvent[] = selectedItems.map((item) => {
      const startDateStr = item.start?.dateTime || item.start?.date || '';
      const eventDateStr = startDateStr ? startDateStr.substring(0, 10) : '';
      const eventTimeStr = startDateStr.includes('T') ? startDateStr.substring(11, 16) : '10:00';

      const newEvt: CalendarEvent = {
        id: `gcal-${item.id}`,
        title: item.summary || 'Upcoming Event',
        eventDate: eventDateStr,
        eventTime: eventTimeStr,
        category: item.detectedCategory,
        status: 'milestones_active',
        location: item.location || '',
        googleEventId: item.id,
        context: {},
        milestones: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      newEvt.milestones = generateHeuristicMilestones(newEvt, newEvt.id, eventDateStr, eventTimeStr);
      return newEvt;
    });

    onImportTrackedEvents(eventsToImport);
    onClose();
  };

  if (!isOpen) return null;

  const totalCount = scannedEvents.length;
  const actionableCount = scannedEvents.filter((e) => !e.isRoutine && e.shouldTrackByDefault).length;
  const selectedCount = Object.values(selectedEventIds).filter(Boolean).length;
  const filteredEvents = getFilteredEvents(activeFilter);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900 max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Scan for Existing Agenda Events</span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                Detect upcoming calendar events and automatically reverse-engineer prep milestones
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          
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
                  Prep Ready ({actionableCount})
                </button>

                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  All Scanned ({totalCount})
                </button>

                <button
                  onClick={() => setActiveFilter('parties')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'parties'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  Parties
                </button>

                <button
                  onClick={() => setActiveFilter('trips')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'trips'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  Trips
                </button>

                <button
                  onClick={() => setActiveFilter('deadlines')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'deadlines'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  Deadlines
                </button>

                <button
                  onClick={() => setActiveFilter('routine')}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    activeFilter === 'routine'
                      ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-500 border-slate-200'
                  }`}
                >
                  Routine
                </button>
              </div>

              {/* Select All / Deselect All Controls */}
              <div className="flex items-center justify-between text-xs p-2.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-600 font-bold">Selection:</span>
                  <button
                    onClick={() => handleSelectAllInFilter(activeFilter)}
                    className="px-2 py-0.5 bg-white hover:bg-sky-50 text-slate-800 font-bold rounded-lg border border-slate-200 shadow-2xs cursor-pointer"
                  >
                    Select In View
                  </button>
                  <button
                    onClick={() => handleDeselectAllInFilter(activeFilter)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-lg border border-slate-200 shadow-2xs cursor-pointer"
                  >
                    Deselect In View
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
              ) : filteredEvents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                  No events found in this category.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filteredEvents.map((item) => {
                    const isSelected = selectedEventIds[item.id] ?? false;
                    const startDate = item.start?.dateTime || item.start?.date || '';

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleSelect(item.id)}
                        className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                          isSelected
                            ? 'bg-white border-sky-300 shadow-2xs ring-1 ring-sky-300/40'
                            : 'bg-slate-50/70 border-slate-200 opacity-75'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(item.id)}
                            className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer mt-0.5"
                          />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {item.summary || 'Untitled Event'}
                              </h4>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                {item.detectedCategory.replace('_', ' ')}
                              </span>
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

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isSelected ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {isSelected ? 'Import' : 'Skip'}
                        </span>
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
            {connected && totalCount > 0 ? (
              <span>Selected for T-Minus: <strong className="text-slate-900">{selectedCount}</strong> / {totalCount}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>

            {connected && totalCount > 0 && (
              <button
                onClick={handleImportSelected}
                disabled={selectedCount === 0}
                className="px-5 py-2.5 bg-[#0f172a] hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <span>Import &amp; Generate Runways ({selectedCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
