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
  getMilestoneSyncFormat,
  setMilestoneSyncFormat,
  GoogleCalendarProfile,
  SyncResult,
  MilestoneSyncFormat
} from '../services/googleCalendar';
import { syncGoogleTasksWithLocalEvents, TaskSyncSummary } from '../services/googleTasks';
import { isServerCalendarLinked, pushEventViaServer, ServerCalendarUnavailable } from '../services/serverCalendar';
import { formatDisplayDate } from '../utils/tminusRules';
import { setCurrentUser as setGlobalCurrentUser, AuthUser } from '../services/accountManager';

interface GoogleCalendarSyncProps {
  events?: CalendarEvent[];
  existingEvents?: CalendarEvent[];
  selectedEventId?: string;
  onUpdateEvent?: (updated: CalendarEvent) => void;
  onUpdateAllEvents?: (updatedEvents: CalendarEvent[]) => void;
  onSyncComplete?: (syncedEvents: CalendarEvent[]) => void;
  onClose?: () => void;
}

export const GoogleCalendarSync: React.FC<GoogleCalendarSyncProps> = ({
  events: propEvents,
  existingEvents,
  selectedEventId,
  onUpdateEvent,
  onUpdateAllEvents,
  onSyncComplete,
  onClose,
}) => {
  const events = propEvents || existingEvents || [];
  const [accessToken, setAccessToken] = useState<string | null>(getStoredAccessToken());
  // Background Sync linked: pushes run on the server with the stored Google
  // grant, so no browser token (or sign-in popup) is needed.
  const [serverLinked, setServerLinked] = useState<boolean>(false);
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
  const [milestoneSyncFormat, setMilestoneSyncFormatState] = useState<MilestoneSyncFormat>(() => getMilestoneSyncFormat());
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

  const handleMilestoneSyncFormatChange = (format: MilestoneSyncFormat) => {
    setMilestoneSyncFormatState(format);
    setMilestoneSyncFormat(format);
  };

  // Shared preference control: Google Tasks (recommended - doesn't compete
  // for space on the calendar grid) vs a 30-minute timed Calendar Event
  // block per milestone. Rendered above the push button in both single and
  // batch mode so the choice applies no matter which flow is used.
  // One compact labelled row per choice: label left, control right.
  const settingRow = (label: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs font-bold text-slate-500 shrink-0">{label}</span>
      <div className="min-w-0 flex justify-end">{control}</div>
    </div>
  );
  const selectClass =
    'max-w-full bg-white text-slate-900 text-xs font-semibold pl-3 pr-8 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-400 cursor-pointer truncate';

  const renderMilestoneFormatToggle = () =>
    settingRow(
      'Tasks as',
      <select
        aria-label="Show preparation tasks in Google as"
        value={milestoneSyncFormat === 'tasks_only' ? 'tasks_only' : 'timed'}
        onChange={(e) => handleMilestoneSyncFormatChange(e.target.value as MilestoneSyncFormat)}
        className={selectClass}
      >
        <option value="tasks_only">Google Tasks: checkable to-dos (recommended)</option>
        <option value="timed">Calendar events: 30-minute blocks</option>
      </select>
    );

  // Determine active event to push
  const activeEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId) || events[0]
    : events[0];

  const prepTasks = activeEvent?.milestones || [];
  const taskCount = prepTasks.length;

  // How many items (main event + milestones) a push would actually create,
  // vs. items already synced from a previous push that will be left alone.
  const countPendingItems = (ev: CalendarEvent): number => {
    const mainPending = !ev.googleEventId || ev.googleEventId.startsWith('local_') ? 1 : 0;
    const milestonePending = (ev.milestones || []).filter((m) => !m.googleTaskId).length;
    return mainPending + milestonePending;
  };

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

  const pushTimeZone = (): string =>
    calendarProfile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';

  // Server first (Background Sync grant); the browser's own Google token
  // only when the server can't act for this account.
  const pushOneEvent = async (ev: CalendarEvent, timeZone: string): Promise<SyncResult> => {
    if (serverLinked) {
      try {
        return await pushEventViaServer(ev, timeZone, milestoneSyncFormat);
      } catch (err) {
        if (!(err instanceof ServerCalendarUnavailable)) throw err;
        setServerLinked(false);
      }
    }
    let token = accessToken;
    if (!token || isTokenExpired()) {
      const res = await requestGoogleCalendarToken(DEFAULT_CLIENT_ID);
      token = res.accessToken;
      setAccessToken(token);
    }
    return syncEventToGoogleCalendar(token, ev, timeZone, { milestoneFormat: milestoneSyncFormat });
  };

  const handleBatchPushToCalendar = async () => {
    const eventsToPush = events.filter(e => selectedBatchIds.includes(e.id));
    if (eventsToPush.length === 0) return;

    const pendingCount = eventsToPush.reduce((sum, ev) => sum + countPendingItems(ev), 0);
    const confirmMessage = pendingCount === 0
      ? 'These events are already fully synced to Google Calendar - there is nothing new to push. Push again anyway?'
      : `We found ${pendingCount} new ${pendingCount === 1 ? 'item' : 'items'} to push across ${eventsToPush.length} event${eventsToPush.length === 1 ? '' : 's'} (already-synced items won't be duplicated). Push this now?`;
    if (!window.confirm(confirmMessage)) return;

    setIsBatchSyncing(true);
    setAuthError(null);
    setBatchSuccessResult(null);

    try {
      const timeZone = pushTimeZone();
      let updatedEventsList = [...events];
      let totalTasksPushed = 0;
      let lastLink = '';

      for (const ev of eventsToPush) {
        const result: SyncResult = await pushOneEvent(ev, timeZone);
        totalTasksPushed += result.totalTasksPushed;
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
    let cancelled = false;
    isServerCalendarLinked().then((linked) => {
      if (!cancelled) setServerLinked(linked);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        // This modal only ever updated its OWN local state - it never told
        // the rest of the app whose account this now is, so App.tsx's
        // currentUser/events stayed on whatever was previously cached (a
        // real cross-account privacy bug: signing into a different Google
        // account from this "Push to Calendar" modal still showed the
        // PREVIOUS account's calendar everywhere else in the app).
        // setGlobalCurrentUser dispatches aot_account_switched, which
        // App.tsx listens for to reload events strictly scoped to this
        // profile's own email.
        if (profile.id) {
          const userEmail = profile.id.toLowerCase().trim();
          const user: AuthUser = {
            id: userEmail,
            email: userEmail,
            name: profile.summary || profile.id,
            timeZone: profile.timeZone,
            provider: 'google',
            connectedAt: new Date().toISOString(),
          };
          setGlobalCurrentUser(user);
        }
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
    // Same gap as sign-in, in reverse: this app has no non-Google identity
    // to fall back to, so disconnecting Google here IS signing out - the
    // app-wide identity (and its cached events) must not keep showing as
    // if still connected.
    setGlobalCurrentUser(null);
  };

  const handlePushToCalendar = async () => {
    if (!activeEvent) return;

    const pendingCount = countPendingItems(activeEvent);
    const confirmMessage = pendingCount === 0
      ? 'This event is already fully synced to Google Calendar - there is nothing new to push. Push again anyway?'
      : `We found ${pendingCount} new ${pendingCount === 1 ? 'item' : 'items'} to push (already-synced items won't be duplicated). Push this now?`;
    if (!window.confirm(confirmMessage)) return;

    setIsSyncing(true);
    setAuthError(null);
    setSyncSuccessResult(null);

    try {
      const result: SyncResult = await pushOneEvent(activeEvent, pushTimeZone());

      if (result.updatedEvent && onUpdateEvent) {
        onUpdateEvent(result.updatedEvent);
      }

      setSyncSuccessResult({
        eventTitle: activeEvent.title,
        eventCount: 1,
        taskCount: result.totalTasksPushed,
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
      const parts: string[] = [];
      if (summary.completedCount > 0) {
        parts.push(`${summary.completedCount} completed`);
      }
      if (summary.uncompletedCount > 0) {
        parts.push(`${summary.uncompletedCount} reopened`);
      }
      if (summary.skippedCount > 0) {
        parts.push(`${summary.skippedCount} skipped (deleted in Google Tasks)`);
      }
      setCompletionSyncReport(
        parts.length > 0
          ? `Synced from Google Tasks: ${parts.join(', ')}.`
          : 'All tasks are in sync with Google Calendar & Tasks.'
      );
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
            {syncMode === 'single' && activeEvent && (
              <p className="text-xs text-slate-500 truncate">{activeEvent.title}</p>
            )}
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

      <div className="p-5 space-y-4">

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

        {/* Account and what to push: one compact row each */}
        <div className="divide-y divide-slate-100 border-y border-slate-100">
          {settingRow(
            'Account',
            accessToken || serverLinked ? (
              <select
                aria-label="Google account"
                value="current"
                disabled={isSigningIn}
                onChange={(e) => {
                  if (e.target.value === 'switch') void handleSignIn();
                  if (e.target.value === 'disconnect') handleSignOut();
                }}
                className={selectClass}
              >
                <option value="current">
                  {isSigningIn ? 'Switching…' : calendarProfile?.id || (serverLinked && !accessToken ? 'Connected via Background Sync' : 'Google Calendar')}
                </option>
                <option value="switch">Switch account…</option>
                {accessToken && <option value="disconnect">Disconnect</option>}
              </select>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="px-3 py-2 bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                <span>Connect Google</span>
              </button>
            )
          )}
          {events.length > 1 &&
            settingRow(
              'Push',
              <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5">
                {(['single', 'batch'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setSyncMode(mode); setSyncSuccessResult(null); setBatchSuccessResult(null); }}
                    aria-pressed={syncMode === mode}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      syncMode === mode ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'single' ? 'This event' : `Several (${events.length})`}
                  </button>
                ))}
              </div>
            )}
          {!(syncMode === 'single' ? syncSuccessResult : batchSuccessResult) && renderMilestoneFormatToggle()}
        </div>

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
                      className="px-4 py-2 bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
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
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">{selectedBatchIds.length} of {events.length} selected</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSelectAllBatch} className="text-sky-700 hover:underline font-semibold cursor-pointer">All</button>
                    <span className="text-slate-300">|</span>
                    <button type="button" onClick={handleDeselectAllBatch} className="text-slate-500 hover:underline font-semibold cursor-pointer">None</button>
                  </div>
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
                        className={`px-3 py-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
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
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {formatDisplayDate(ev.eventDate)} · {evTaskCount} {evTaskCount === 1 ? 'task' : 'tasks'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5">
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
                    className="px-6 py-3 rounded-2xl bg-[#182A42] hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-slate-900/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isBatchSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Pushing {selectedBatchIds.length} Events...</span>
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="w-4 h-4" />
                        <span>Push {selectedBatchIds.length} {selectedBatchIds.length === 1 ? 'event' : 'events'}</span>
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
                      className="px-4 py-2 bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
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
                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5">
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
                    className="px-6 py-3 rounded-2xl bg-[#182A42] hover:bg-slate-800 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-slate-900/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Pushing to Calendar...</span>
                      </>
                    ) : (
                      <>
                        <CalendarIcon className="w-4 h-4" />
                        <span>Push event + {taskCount} {milestoneSyncFormat === 'tasks_only' ? 'tasks' : 'blocks'}</span>
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
