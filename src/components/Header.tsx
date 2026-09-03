import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  Plus, 
  RotateCcw, 
  CheckCircle2, 
  CalendarDays,
  Sparkles,
  Home,
  RefreshCw
} from 'lucide-react';
import { formatDisplayDate } from '../utils/tminusRules';
import { CalendarEvent } from '../types';

interface HeaderProps {
  currentReferenceDate: string;
  onReferenceDateChange: (newDate: string) => void;
  onResetData: () => void;
  onOpenNewEventModal: () => void;
  onOpenScanAgenda?: () => void;
  onOpenGoogleCalendarSync?: () => void;
  isGoogleConnected?: boolean;
  isSyncingWithGoogle?: boolean;
  onTriggerGoogleSync?: () => void;
  lastSyncTime?: Date | null;
  activeEventsCount: number;
  pendingMilestonesCount: number;
  watchpointsCount: number;
  focusMode: 'welcome' | 'new-event' | 'adjust-event';
  onSetFocusMode: (mode: 'welcome' | 'new-event' | 'adjust-event') => void;
  events?: CalendarEvent[];
}

export const Header: React.FC<HeaderProps> = ({
  currentReferenceDate,
  onReferenceDateChange,
  onResetData,
  onOpenNewEventModal,
  onOpenScanAgenda,
  onOpenGoogleCalendarSync,
  isGoogleConnected,
  isSyncingWithGoogle,
  onTriggerGoogleSync,
  lastSyncTime,
  activeEventsCount,
  focusMode,
  onSetFocusMode,
  events = [],
}) => {
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateInputVal, setDateInputVal] = useState(currentReferenceDate.substring(0, 10));

  const handleDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateInputVal) {
      onReferenceDateChange(`${dateInputVal}T09:00:00.000Z`);
      setIsEditingDate(false);
    }
  };

  const handleResetToToday = () => {
    const today = new Date().toISOString();
    setDateInputVal(today.substring(0, 10));
    onReferenceDateChange(today);
    setIsEditingDate(false);
  };

  // Determine furthest month covered by the agenda
  const getFurthestMonth = (): string => {
    if (events && events.length > 0) {
      const timestamps = events
        .map((e) => new Date(e.eventDate).getTime())
        .filter((t) => !isNaN(t));
      if (timestamps.length > 0) {
        const maxTime = Math.max(...timestamps);
        const maxDate = new Date(maxTime);
        return maxDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    }
    const ref = new Date(currentReferenceDate);
    if (!isNaN(ref.getTime())) {
      const horizon = new Date(ref);
      horizon.setMonth(horizon.getMonth() + 3);
      return horizon.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return 'December 2026';
  };

  // Determine date of last update
  const getLastUpdateText = (): string => {
    if (lastSyncTime) {
      return lastSyncTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    const ref = new Date(currentReferenceDate);
    if (!isNaN(ref.getTime())) {
      return ref.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return 'Sep 1';
  };

  return (
    <header className="milky-glass border-b border-white/80 sticky top-0 z-30 shadow-xs text-slate-900" id="main-header">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2">
        <div className="flex items-center justify-between gap-4">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            {focusMode !== 'welcome' && (
              <button
                onClick={() => onSetFocusMode('welcome')}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer mr-1"
                title="Back to Home Screen"
              >
                <Home className="w-5 h-5" />
              </button>
            )}
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 flex items-center justify-center text-white font-bold shadow-xs">
              <Clock className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  T-Minus
                </h1>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs ring-2 ring-white" title="Active & Ready" />
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Combined Date & Agenda Status Capsule */}
            <div className="bg-white/85 backdrop-blur-md border border-white/90 rounded-full px-3 sm:px-3.5 py-1.5 flex items-center gap-2 text-xs sm:text-sm text-slate-700 shadow-xs">
              {isEditingDate ? (
                <form onSubmit={handleDateSubmit} className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateInputVal}
                    onChange={(e) => setDateInputVal(e.target.value)}
                    className="bg-white text-slate-800 text-xs px-2 py-0.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-900 font-mono"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="bg-[#0f172a] hover:bg-slate-800 text-white px-2.5 py-0.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingDate(false)}
                    className="text-slate-400 hover:text-slate-700 text-xs px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  {/* Calendar / Sync status trigger */}
                  <button
                    onClick={onOpenGoogleCalendarSync}
                    className="flex items-center gap-1.5 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer text-left"
                    title="Google Calendar & Tasks Synchronization Settings"
                  >
                    <div className="relative">
                      <CalendarDays className="w-4 h-4 text-sky-600 shrink-0" />
                      {isGoogleConnected && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white" title="Google Account Connected" />
                      )}
                    </div>
                    <span className="font-semibold text-slate-900 text-xs sm:text-sm">
                      Agenda up to date until <span className="text-sky-950 font-bold">{getFurthestMonth()}</span>
                    </span>
                    <span className="text-slate-400 text-[11px] sm:text-xs font-medium">
                      (last update: {getLastUpdateText()})
                    </span>
                  </button>

                  {/* Change reference date link */}
                  <button
                    onClick={() => setIsEditingDate(true)}
                    title="Change reference date"
                    className="text-xs text-sky-700 hover:text-sky-900 font-semibold ml-0.5 hover:underline cursor-pointer"
                  >
                    Change
                  </button>

                  {/* Optional sync refresh icon if Google Calendar is connected */}
                  {isGoogleConnected && onTriggerGoogleSync && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerGoogleSync();
                      }}
                      disabled={isSyncingWithGoogle}
                      className="p-1 hover:bg-sky-50 text-sky-700 rounded-full transition-colors cursor-pointer border-l border-slate-200/80 pl-1.5"
                      title={
                        isSyncingWithGoogle
                          ? 'Checking Google Calendar & Tasks for completed tasks...'
                          : lastSyncTime
                          ? `Refresh completed tasks from Google (Last checked: ${lastSyncTime.toLocaleTimeString()})`
                          : 'Sync completed tasks from Google Calendar & Tasks'
                      }
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWithGoogle ? 'animate-spin text-sky-800' : ''}`} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Scan for existing events in your agenda Action (moved here per blue arrow) */}
            {onOpenScanAgenda && (
              <button
                onClick={onOpenScanAgenda}
                id="btn-scan-agenda"
                className="bg-sky-50/90 hover:bg-sky-100/90 text-sky-950 border border-sky-200/90 text-xs sm:text-sm font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                title="Scan for existing events in your agenda"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span className="hidden md:inline">Scan agenda</span>
                <span className="md:hidden">Scan</span>
              </button>
            )}

            {/* New Event Button with #0f172a Accent */}
            <button
              onClick={onOpenNewEventModal}
              id="btn-manual-event"
              className="bg-[#0f172a] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm shadow-slate-900/20 transition-all cursor-pointer hover:shadow-md hover:shadow-slate-900/25"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">New Event</span>
            </button>

            {/* Reset / Clear Button */}
            <button
              onClick={onResetData}
              id="btn-reset-demo"
              title="Reset to clean bare minimum"
              className="bg-white/80 hover:bg-white text-slate-400 hover:text-slate-700 p-2 rounded-full border border-white/90 shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
