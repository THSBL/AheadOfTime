import React, { useState } from 'react';
import { 
  Trash2, 
  Calendar, 
  X, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  ShieldCheck,
  Layers,
  ArrowRight,
  Smartphone,
  CheckSquare,
  Square,
  Info
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { executeSafePlanDeletion } from '../services/googleCalendar';
import { formatDisplayDate } from '../utils/tminusRules';

interface DeleteEventModalProps {
  event: CalendarEvent;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDeleteAppOnly: (eventId: string) => void;
  onConfirmDeleteCalendarOnly: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
  onConfirmDeleteAppAndCalendar: (
    eventId: string, 
    cleanupSummary?: { calCount: number; taskCount: number },
    options?: { deleteMainEvent?: boolean; deleteTasks?: boolean }
  ) => void;
}

export const DeleteEventModal: React.FC<DeleteEventModalProps> = ({
  event,
  isOpen,
  onClose,
  onConfirmDeleteAppOnly,
  onConfirmDeleteCalendarOnly,
  onConfirmDeleteAppAndCalendar,
}) => {
  // Preset defaults:
  // - Where: BOTH App & Calendar selected (true)
  // - Which: ONLY Tasks selected (true), Main Event is false
  const [deleteFromApp, setDeleteFromApp] = useState<boolean>(true);
  const [deleteFromCalendar, setDeleteFromCalendar] = useState<boolean>(true);
  const [deleteTasks, setDeleteTasks] = useState<boolean>(true);
  const [deleteMainEvent, setDeleteMainEvent] = useState<boolean>(false);

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasGoogleSync = Boolean(
    event.googleEventId || 
    event.syncedToGoogleAt || 
    (event.milestones && event.milestones.some((m) => m.googleCalendarEventId || m.googleTaskId))
  );

  const taskCount = event.milestones?.length || 0;
  const token = getStoredAccessToken();
  const isGoogleConnected = Boolean(token && !isTokenExpired());

  // Validation: must select at least 1 location and at least 1 item
  const hasLocationSelected = deleteFromApp || deleteFromCalendar;
  const hasItemSelected = deleteTasks || deleteMainEvent;
  const isFormValid = hasLocationSelected && hasItemSelected;

  // Execute deletion based on checklist options
  const handleExecuteDeletion = async () => {
    if (!isFormValid) return;

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      let cleanup = { calCount: 0, taskCount: 0 };

      // 1. If Google Calendar deletion is selected and account is connected
      if (deleteFromCalendar && (isGoogleConnected || hasGoogleSync) && token) {
        setDeletionStatus('Cleaning up requested items from Google Calendar & Tasks...');
        const result = await executeSafePlanDeletion(token, event, {
          deleteFromPrimaryCalendar: deleteMainEvent,
          deleteMainEvent: deleteMainEvent,
          deleteTasks: deleteTasks,
        });
        cleanup = {
          calCount: result.deletedPrimaryEvent ? 1 : 0,
          taskCount: result.deletedTasksCount,
        };
      }

      // 2. Routing to proper App state update
      if (deleteFromApp && deleteFromCalendar) {
        onConfirmDeleteAppAndCalendar(event.id, cleanup, {
          deleteMainEvent,
          deleteTasks,
        });
      } else if (deleteFromApp && !deleteFromCalendar) {
        onConfirmDeleteAppOnly(event.id);
      } else if (!deleteFromApp && deleteFromCalendar) {
        onConfirmDeleteCalendarOnly(event.id, cleanup);
      }

      onClose();
    } catch (err: any) {
      console.error('Error executing deletion checklist:', err);
      setErrorMessage(err?.message || 'Failed to complete deletion.');
    } finally {
      setIsDeleting(false);
      setDeletionStatus(null);
    }
  };

  // Generate dynamic live explanation string
  const getSummaryDescription = () => {
    if (!hasLocationSelected && !hasItemSelected) {
      return 'Please choose where and which items you would like to delete.';
    }
    if (!hasLocationSelected) {
      return 'Please select at least one location (App and/or Calendar).';
    }
    if (!hasItemSelected) {
      return 'Please select which items to delete (Tasks and/or Main Event).';
    }

    const itemsText = deleteTasks && deleteMainEvent
      ? `the main event "${event.title}" and all ${taskCount} prep tasks`
      : deleteTasks
        ? `all ${taskCount} preparation tasks`
        : `the main event "${event.title}"`;

    const locationsText = deleteFromApp && deleteFromCalendar
      ? 'Ahead of Time and Google Calendar & Tasks'
      : deleteFromApp
        ? 'Ahead of Time only (Google Calendar remains untouched)'
        : 'Google Calendar & Tasks only (Ahead of Time remains untouched)';

    const safetyNote = (!deleteMainEvent && (deleteFromCalendar || deleteFromApp))
      ? ` Your main event "${event.title}" on ${formatDisplayDate(event.eventDate)} will remain intact.`
      : '';

    return `Will delete ${itemsText} from ${locationsText}.${safetyNote}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-rose-50/85 border-b border-rose-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                What do you want to delete?
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Customize deletion targets &amp; scope
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          
          {/* Target Event Context Chip */}
          <div className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Target Event
              </span>
              <h4 className="text-sm font-black text-slate-900 truncate">
                {event.title}
              </h4>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-mono font-bold text-slate-700 block">
                {formatDisplayDate(event.eventDate)}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {taskCount} prep tasks
              </span>
            </div>
          </div>

          {/* Section 1: WHERE TO DELETE */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              1. Where to delete from:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Checkbox: From App */}
              <label 
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  deleteFromApp 
                    ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70 shadow-2xs' 
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={deleteFromApp}
                  onChange={(e) => setDeleteFromApp(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <Smartphone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>From the App</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                    Ahead of Time workspace &amp; radar
                  </p>
                </div>
              </label>

              {/* Checkbox: From Google Calendar */}
              <label 
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  deleteFromCalendar 
                    ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70 shadow-2xs' 
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={deleteFromCalendar}
                  onChange={(e) => setDeleteFromCalendar(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>From Calendar</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                    Google Calendar &amp; Google Tasks
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: WHICH EVENTS / ITEMS TO DELETE */}
          <div className="space-y-2.5 pt-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              2. Which items to delete:
            </label>

            <div className="space-y-2">
              {/* Checkbox: Tasks (Preselected) */}
              <label 
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  deleteTasks 
                    ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70 shadow-2xs' 
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={deleteTasks}
                  onChange={(e) => setDeleteTasks(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <CheckSquare className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Preparation Tasks ({taskCount} items)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                    Countdown checkpoints, checklist milestones, reminders &amp; prep blocks
                  </p>
                </div>
              </label>

              {/* Checkbox: Main Event (Unchecked by default) */}
              <label 
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                  deleteMainEvent 
                    ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70 shadow-2xs' 
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={deleteMainEvent}
                  onChange={(e) => setDeleteMainEvent(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                      <Calendar className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      <span>Main Target Event ("{event.title}")</span>
                    </div>
                    {!deleteMainEvent && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.2 rounded-full shrink-0">
                        Kept intact
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                    The primary appointment / target event entry itself
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Live Dynamic Action Summary Box */}
          <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed transition-all ${
            isFormValid 
              ? 'bg-slate-50/90 border-slate-200 text-slate-700' 
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-start gap-2">
              <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isFormValid ? 'text-sky-600' : 'text-amber-600'}`} />
              <p className="font-medium text-[11px] sm:text-xs">
                {getSummaryDescription()}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Progress / Loading */}
          {isDeleting && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 text-xs text-blue-800 font-bold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{deletionStatus || 'Executing selected cleanup actions...'}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            Cancel
          </button>

          <button
            onClick={handleExecuteDeletion}
            disabled={!isFormValid || isDeleting}
            className={`px-5 py-2.5 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              deleteMainEvent 
                ? 'bg-rose-700 hover:bg-rose-800 shadow-rose-700/25' 
                : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {deleteMainEvent 
                ? 'Delete Event & Prep Plan' 
                : 'Delete Selected Tasks'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

