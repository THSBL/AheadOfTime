import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Check, 
  Clock, 
  ExternalLink, 
  AlertCircle, 
  X, 
  Loader2, 
  CalendarDays, 
  ListChecks, 
  LogIn, 
  LogOut,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Trash2,
  Layers
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { 
  requestGoogleCalendarToken, 
  getStoredAccessToken, 
  clearGoogleSession, 
  isTokenExpired, 
  isAuthErrorMessage,
  DEFAULT_CLIENT_ID
} from '../services/googleAuth';
import { 
  syncEventToGoogleCalendar, 
  fetchPrimaryCalendarProfile, 
  wipeMilestoneCalendarEventsOnly,
  GoogleCalendarProfile,
  SyncResult
} from '../services/googleCalendar';
import { syncGoogleTasksWithLocalEvents, TaskSyncSummary } from '../services/googleTasks';
import { formatDisplayDate } from '../utils/tminusRules';

interface GoogleCalendarSyncProps {
  events: CalendarEvent[];
  selectedEventId?: string;
  onUpdateEvent?: (updated: CalendarEvent) => void;
  onUpdateAllEvents?: (updatedEvents: CalendarEvent[]) => void;
  onClose?: () => void;
}

export const GoogleCalendarSync: React.FC<GoogleCalendarSyncProps> = ({
  events,
  selectedEventId,
  onUpdateEvent,
  onUpdateAllEvents,
  onClose,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(getStoredAccessToken());
  const [calendarProfile, setCalendarProfile] = useState<GoogleCalendarProfile | null>(() => {
    const saved = sessionStorage.getItem('gcal_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState<boolean>(false);
  const [syncMode, setSyncMode] = useState<'single' | 'batch'>(selectedEventId ? 'single' : (events.length > 1 ? 'batch' : 'single'));
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>(() => events.map(e => e.id));
  const [isPullingCompletions, setIsPullingCompletions] = useState<boolean>(false);
  const [completionSyncReport, setCompletionSyncReport] = useState<string | null>(null);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState<boolean>(false);
  const [cleanDuplicatesReport, setCleanDuplicatesReport] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncSuccessResult, setSyncSuccessResult] = useState<{
    eventTitle: string;
    eventCount: number;
    taskCount: number;
    calendarLink?: string;
  } | null>(null);
  const [batchSuccessResult, setBatchSuccessResult] = useState<{
    eventCount: number;
    taskCount: number;
    calendarLink?: string;
  } | null>(null);

  // Determine active event to push
  const activeEvent = selectedEventId 
    ? events.find((e) => e.id === selectedEventId) || events[0]
    : events[0];

  const prepTasks = activeEvent?.milestones || [];
  const taskCount = prepTasks.length;

  const toggleBatchId = (id: string) => {
    setSelectedBatchIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllBatch = () => {
    setSelectedBatchIds(events.map(e => e.id));
  };

  const handleDeselectAllBatch = () => {
    setSelectedBatchIds([]);
  };

  const handleBatchPushToCalendar = async () => {
    const eventsToPush = events.filter(e => selectedBatchIds.includes(e.id));
    if (eventsToPush.length === 0) return;

    setIsBatchSyncing(true);
    setAuthError(null);
    setBatchSuccessResult(null);

    try {
      let token = accessToken;
      if (!token || isTokenExpired()) {
        const res = await requestGoogleCalendarToken(DEFAULT_CLIENT_ID);
        token = res.accessToken;
        setAccessToken(token);
      }

      const timeZone = calendarProfile?.timeZone || 'Europe/Amsterdam';
      let updatedEventsList = [...events];
      let totalTasksPushed = 0;
      let lastLink = '';

      for (const ev of eventsToPush) {
        const result: SyncResult = await syncEventToGoogleCalendar(
          token,
          ev,
          timeZone,
          { milestoneFormat: 'tasks_only' }
        );
        totalTasksPushed += (ev.milestones || []).length;
        if (result.mainEventLink) {
          lastLink = result.mainEventLink;
        }
        if (result.updatedEvent) {
          updatedEventsList = updatedEventsList.map(item => item.id === result.updatedEvent!.id ? result.updatedEvent! : item);
        }
      }

      if (onUpdateAllEvents) {
        onUpdateAllEvents(updatedEventsList);
      }

      setBatchSuccessResult({
        eventCount: eventsToPush.length,
        taskCount: totalTasksPushed,
        calendarLink: lastLink || 'https://calendar.google.com',
      });
    } catch (err: any) {
      console.error('Failed to batch push to Google Calendar:', err);
      if (isAuthErrorMessage(err)) {
        setAccessToken(null);
        clearGoogleSession();
        setAuthError('Google session expired. Please sign in again.');
      } else {
        setAuthError(`Failed to push to calendar: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setIsBatchSyncing(false);
    }
  };

  useEffect(() => {
    const token = getStoredAccessToken();
    if (token && !isTokenExpired()) {
      setAccessToken(token);
      fetchPrimaryCalendarProfile(token)
        .then((profile) => {
          if (profile) {
            setCalendarProfile(profile);
            sessionStorage.setItem('gcal_profile', JSON.stringify(profile));
          }
        })
        .catch((err) => {
          if (isAuthErrorMessage(err)) {
            setAccessToken(null);
            clearGoogleSession();
          }
        });
    }
  }, []);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await requestGoogleCalendarToken(DEFAULT_CLIENT_ID);
      setAccessToken(res.accessToken);
      const profile = await fetchPrimaryCalendarProfile(res.accessToken);
      if (profile) {
        setCalendarProfile(profile);
        sessionStorage.setItem('gcal_profile', JSON.stringify(profile));
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('popup_closed_by_user') || errMsg.includes('Popup window closed')) {
        setAuthError('Sign-in popup was closed before completing authorization.');
      } else if (errMsg.includes('403') || errMsg.includes('access_denied')) {
        setAuthError('Google 403: Make sure your email is added as a Test User in Google Cloud Console.');
      } else {
        setAuthError(errMsg || 'Failed to sign in to Google Calendar.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = () => {
    clearGoogleSession();
    setAccessToken(null);
    setCalendarProfile(null);
    setSyncSuccessResult(null);
    setAuthError(null);
  };

  const handlePushToCalendar = async () => {
    if (!activeEvent) return;
    setIsSyncing(true);
    setAuthError(null);
    setSyncSuccessResult(null);

    try {
      let token = accessToken;
      if (!token || isTokenExpired()) {
        const res = await requestGoogleCalendarToken(DEFAULT_CLIENT_ID);
        token = res.accessToken;
        setAccessToken(token);
      }

      const timeZone = calendarProfile?.timeZone || 'Europe/Amsterdam';
      // Use 'tasks_only' to ensure milestones are pushed strictly to Google Tasks and NOT duplicated as calendar event blocks
      const result: SyncResult = await syncEventToGoogleCalendar(
        token,
        activeEvent,
        timeZone,
        { milestoneFormat: 'tasks_only' }
      );

      if (result.updatedEvent && onUpdateEvent) {
        onUpdateEvent(result.updatedEvent);
      }

      setSyncSuccessResult({
        eventTitle: activeEvent.title,
        eventCount: 1,
        taskCount: prepTasks.length,
        calendarLink: result.mainEventLink || 'https://calendar.google.com',
      });
    } catch (err: any) {
      console.error('Failed to push to Google Calendar:', err);
      if (isAuthErrorMessage(err)) {
        setAccessToken(null);
        clearGoogleSession();
        setAuthError('Google session expired. Please sign in again.');
      } else {
        setAuthError(`Failed to push to calendar: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCleanDuplicateTaskEvents = async () => {
    let token = accessToken || getStoredAccessToken();
    if (!token || isTokenExpired()) {
      await handleSignIn();
      token = getStoredAccessToken();
    }
    if (!token) return;

    setIsCleaningDuplicates(true);
    setCleanDuplicatesReport(null);
    try {
      const res = await wipeMilestoneCalendarEventsOnly(token);
      if (res.deletedCount > 0) {
        setCleanDuplicatesReport(`Removed ${res.deletedCount} duplicate task event${res.deletedCount > 1 ? 's' : ''} from your calendar. Your tasks remain safely in Google Tasks!`);
      } else {
        setCleanDuplicatesReport('No duplicate task event blocks found on your calendar.');
      }
    } catch (err: any) {
      console.error('Error cleaning duplicate calendar events:', err);
      setCleanDuplicatesReport(`Cleanup failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const handlePullCompletions = async () => {
    if (!accessToken && !getStoredAccessToken()) {
      await handleSignIn();
      return;
    }
    const token = accessToken || getStoredAccessToken();
    if (!token) return;

    setIsPullingCompletions(true);
    setCompletionSyncReport(null);
    try {
      const summary: TaskSyncSummary = await syncGoogleTasksWithLocalEvents(token, events);
      if (onUpdateAllEvents && summary.updatedEvents) {
        onUpdateAllEvents(summary.updatedEvents);
      }
      if (summary.completedCount > 0) {
        setCompletionSyncReport(
          `Synced ${summary.completedCount} completed task${
            summary.completedCount > 1 ? 's' : ''
          } from Google Tasks!`
        );
      } else {
        setCompletionSyncReport('All tasks are in sync with Google Calendar & Tasks.');
      }
    } catch (err: any) {
      console.error('Failed to sync completions from Google:', err);
      setCompletionSyncReport(`Sync failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsPullingCompletions(false);
    }
  };

  if (!activeEvent) {
    return (
      <div className="p-6 bg-white rounded-3xl border border-slate-200 text-center space-y-4">
        <p className="text-sm text-slate-500 font-medium">No active event selected to push.</p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-sky-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      
      {/* Header */}
      <div className="px-6 py-4.5 bg-sky-50/50 border-b border-sky-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-800 shadow-2xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">
              Push to Google Calendar
            </h3>
            <p className="text-xs text-slate-500">
              Sync your event &amp; reverse-engineered prep schedule
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-sky-100/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">

        {/* Auth Error Banner */}
        {authError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-semibold">{authError}</p>
              <p className="text-rose-600/90 text-[11px]">
                Tip: If the popup closed automatically, ensure popups are allowed in your browser and select the Google account you wish to connect.
              </p>
            </div>
            <button
              onClick={() => setAuthError(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-bold ml-1 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Connected Account Bar */}
        <div className="p-3.5 bg-sky-50/40 rounded-2xl border border-sky-100 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${accessToken ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-amber-400'}`} />
            <div className="truncate">
              <span className="text-slate-500 font-medium">Calendar Account: </span>
              <strong className="text-slate-800 font-semibold truncate">
                {calendarProfile?.id || (accessToken ? 'Connected (Primary Calendar)' : 'Not Connected')}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {accessToken ? (
              <>
                <button
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="text-xs text-sky-800 hover:text-sky-950 font-bold cursor-pointer underline underline-offset-2"
                  title="Switch to a different Google Account"
                >
                  {isSigningIn ? 'Switching...' : 'Switch Account'}
                </button>
                <span className="text-sky-200">|</span>
                <button
                  onClick={handleSignOut}
                  className="text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 font-semibold cursor-pointer"
                  title="Disconnect Google Account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="px-3 py-1.5 bg-[#0f172a] hover:bg-slate-800 text-white font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                {isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                <span>Connect Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Bidirectional Sync Status & Quick Pull Card */}
        {accessToken && (
          <div className="p-4 bg-sky-50/70 border border-sky-200/90 rounded-2xl space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center text-sky-700">
                  <RefreshCw className={`w-4 h-4 ${isPullingCompletions ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                    Bidirectional Task Completion Sync
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Tasks checked off in Google Calendar or Tasks automatically mark as complete in T-Minus
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handlePullCompletions}
                  disabled={isPullingCompletions}
                  className="px-3 py-1.5 bg-white hover:bg-sky-100 text-sky-950 border border-sky-200 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  title="Fetch latest task completion statuses from Google Tasks"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPullingCompletions ? 'animate-spin text-sky-800' : ''}`} />
                  <span>{isPullingCompletions ? 'Syncing...' : 'Sync Completions'}</span>
                </button>

                <button
                  onClick={handleCleanDuplicateTaskEvents}
                  disabled={isCleaningDuplicates}
                  className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  title="Remove any older duplicate task event blocks from Google Calendar"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isCleaningDuplicates ? 'animate-spin text-rose-600' : ''}`} />
                  <span>{isCleaningDuplicates ? 'Cleaning...' : 'Clean Duplicate Events'}</span>
                </button>
              </div>
            </div>

            {completionSyncReport && (
              <div className="p-2.5 bg-white rounded-xl border border-sky-200 text-xs font-medium text-slate-700 flex items-center gap-2 animate-in fade-in duration-150">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{completionSyncReport}</span>
              </div>
            )}

            {cleanDuplicatesReport && (
              <div className="p-2.5 bg-white rounded-xl border border-amber-200 text-xs font-medium text-amber-900 flex items-center gap-2 animate-in fade-in duration-150">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{cleanDuplicatesReport}</span>
              </div>
            )}
          </div>
        )}

        {/* Mode Selector Tabs (Single vs Batch Multiple) */}
        {events.length > 1 && (
          <div className="flex bg-sky-100/70 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => { setSyncMode('single'); setSyncSuccessResult(null); setBatchSuccessResult(null); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                syncMode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 text-sky-700" />
              <span>Single Event</span>
            </button>
            <button
              type="button"
              onClick={() => { setSyncMode('batch'); setSyncSuccessResult(null); setBatchSuccessResult(null); }}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                syncMode === 'batch' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-sky-700" />
              <span>Batch Push ({events.length} Events)</span>
            </button>
          </div>
        )}

        {syncMode === 'batch' ? (
          <>
            {batchSuccessResult ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-4 animate-in fade-in duration-200">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-emerald-950">
                    Batch Push Successful!
                  </h4>
                  <p className="text-xs sm:text-sm text-emerald-800 max-w-sm mx-auto">
                    Successfully synced <strong>{batchSuccessResult.eventCount} events</strong> and added <strong>{batchSuccessResult.taskCount} preparation tasks</strong> to Google Calendar & Tasks!
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1">
                  {batchSuccessResult.calendarLink && (
                    <a
                      href={batchSuccessResult.calendarLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Open in Google Calendar</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100/50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 bg-sky-50 border border-sky-200/90 rounded-2xl space-y-1 text-sky-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky-600" />
                      <h4 className="text-sm font-bold">
                        Batch Push Multiple Events ({selectedBatchIds.length} of {events.length} Selected)
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button type="button" onClick={handleSelectAllBatch} className="text-sky-700 hover:underline font-semibold cursor-pointer">Select All</button>
                      <span className="text-sky-300">|</span>
                      <button type="button" onClick={handleDeselectAllBatch} className="text-slate-500 hover:underline font-semibold cursor-pointer">Deselect All</button>
                    </div>
                  </div>
                  <p className="text-xs text-sky-800 leading-relaxed pl-6">
                    Select which events you want to push to Google Calendar simultaneously. Each selected event will add its target date event and all prep tasks to Google Tasks.
                  </p>
                </div>

                {/* Events Checklist */}
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {events.map((ev) => {
                    const isSelected = selectedBatchIds.includes(ev.id);
                    const evTaskCount = (ev.milestones || []).length;
                    return (
                      <div
                        key={ev.id}
                        onClick={() => toggleBatchId(ev.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected ? 'bg-sky-50/70 border-sky-300 shadow-2xs' : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-slate-300 text-sky-900 focus:ring-sky-900 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {ev.title}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>📅 {formatDisplayDate(ev.eventDate)}</span>
                              <span>•</span>
                              <span>📋 {evTaskCount} prep tasks</span>
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold text-sky-900 bg-sky-100/80 px-2 py-1 rounded-lg shrink-0">
                          {ev.category}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleBatchPushToCalendar}
                    disabled={isBatchSyncing || isSigningIn || selectedBatchIds.length === 0}
                    className="px-6 py-3 rounded-2xl bg-[#0f172a] hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-slate-900/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isBatchSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Pushing {selectedBatchIds.length} Events...</span>
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="w-4 h-4" />
                        <span>Push {selectedBatchIds.length} Events to Calendar</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          /* Single Event View */
          <>
            {/* Success State */}
            {syncSuccessResult ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-4 animate-in fade-in duration-200">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-emerald-950">
                    Pushed Successfully!
                  </h4>
                  <p className="text-xs sm:text-sm text-emerald-800 max-w-sm mx-auto">
                    Created <strong>1 Target Deadline Event</strong> ({syncSuccessResult.eventTitle}) on your calendar and added <strong>{syncSuccessResult.taskCount} checkable tasks</strong> to Google Tasks (no duplicate event blocks).
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-1">
                  {syncSuccessResult.calendarLink && (
                    <a
                      href={syncSuccessResult.calendarLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Open in Google Calendar</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100/50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Clear Push Summary Box */}
                <div className="p-4 bg-sky-50 border border-sky-200/90 rounded-2xl space-y-1 text-sky-950">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <h4 className="text-sm font-bold">
                      Clean Calendar Sync: 1 Main Event + {taskCount} Google Tasks
                    </h4>
                  </div>
                  <p className="text-xs text-sky-800 leading-relaxed pl-6">
                    <strong>1 Calendar Event:</strong> Scheduled on your target event date ({activeEvent.eventDate}).<br />
                    <strong>{taskCount} Preparation Tasks:</strong> Pushed strictly to Google Tasks with due dates and checkboxes (preventing duplicate event blocks from crowding your calendar).
                  </p>
                </div>

                {/* Event & Tasks Preview Breakdown */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Sync Preview Breakdown
                  </div>

                  <div className="bg-slate-50/80 rounded-2xl border border-sky-100 divide-y divide-slate-200/80 overflow-hidden">
                    {/* 1. Main Target Event */}
                    <div className="p-3.5 flex items-center justify-between gap-3 bg-white">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-sky-100 text-slate-900 flex items-center justify-center font-bold text-xs shrink-0">
                          🎯
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-sky-950 uppercase tracking-wider bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/80">
                              1 Main Calendar Event
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {activeEvent.title}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Target Date: {formatDisplayDate(activeEvent.eventDate)} {activeEvent.eventTime ? `at ${activeEvent.eventTime}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="font-mono text-xs font-semibold text-slate-700 shrink-0">
                        {activeEvent.eventDate}
                      </div>
                    </div>

                    {/* 2. Tasks List */}
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {prepTasks.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No prep tasks calculated for this event.
                        </div>
                      ) : (
                        prepTasks.map((task, idx) => (
                          <div key={task.id || idx} className="p-3 flex items-center justify-between gap-3 hover:bg-sky-50/50 transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="font-mono text-[10px] font-bold text-sky-950 bg-sky-50 border border-sky-200/80 px-2 py-0.5 rounded-md shrink-0">
                                {task.tMinusLabel}
                              </span>
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {task.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 shrink-0">
                                Google Task
                              </span>
                              <div className="font-mono text-xs text-slate-500 shrink-0">
                                {formatDisplayDate(task.calculatedDate)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePushToCalendar}
                    disabled={isSyncing || isSigningIn}
                    className="px-6 py-3 rounded-2xl bg-[#0f172a] hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-slate-900/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Pushing to Calendar...</span>
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="w-4 h-4" />
                        <span>Push 1 Event + {taskCount} Tasks</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
};
