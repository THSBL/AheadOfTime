import React, { useState } from 'react';
import { 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  X, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  Smartphone, 
  Calendar, 
  CheckSquare, 
  Info 
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { executeSafePlanDeletion } from '../services/googleCalendar';

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEventIds: string[];
  events: CalendarEvent[];
  onConfirmDeleteAppOnly: (eventIds: string[]) => void;
  onConfirmDeleteAppAndCalendar: (
    eventIds: string[], 
    cleanupSummary: { calCount: number; taskCount: number },
    options?: { deleteMainEvent?: boolean; deleteTasks?: boolean }
  ) => void;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  onClose,
  selectedEventIds,
  events,
  onConfirmDeleteAppOnly,
  onConfirmDeleteAppAndCalendar,
}) => {
  // Preset defaults:
  // - Where: BOTH App & Calendar selected (true)
  // - Which: ONLY Tasks selected (true), Main Events is false
  const [deleteFromApp, setDeleteFromApp] = useState<boolean>(true);
  const [deleteFromCalendar, setDeleteFromCalendar] = useState<boolean>(true);
  const [deleteTasks, setDeleteTasks] = useState<boolean>(true);
  const [deleteMainEvent, setDeleteMainEvent] = useState<boolean>(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || selectedEventIds.length === 0) return null;

  const selectedEvents = events.filter((e) => selectedEventIds.includes(e.id));
  const count = selectedEvents.length;
  const totalTasksCount = selectedEvents.reduce((acc, ev) => acc + (ev.milestones?.length || 0), 0);

  const token = getStoredAccessToken();
  const isGoogleConnected = Boolean(token && !isTokenExpired());

  // Validation: must select at least 1 location and at least 1 item
  const hasLocationSelected = deleteFromApp || deleteFromCalendar;
  const hasItemSelected = deleteTasks || deleteMainEvent;
  const isFormValid = hasLocationSelected && hasItemSelected;

  const handleExecuteBulkDelete = async () => {
    if (!isFormValid) return;

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      let totalCalCount = 0;
      let totalTaskCount = 0;

      if (deleteFromCalendar && isGoogleConnected && token) {
        for (let i = 0; i < selectedEvents.length; i++) {
          const ev = selectedEvents[i];
          setDeletionStatus(`Cleaning up ${i + 1} of ${count}: ${ev.title}...`);
          try {
            const res = await executeSafePlanDeletion(token, ev, {
              deleteFromPrimaryCalendar: deleteMainEvent,
              deleteMainEvent: deleteMainEvent,
              deleteTasks: deleteTasks,
            });
            if (res.deletedPrimaryEvent) totalCalCount += 1;
            totalTaskCount += res.deletedTasksCount;
          } catch (gErr) {
            console.warn(`Failed to delete event ${ev.title} from Google Calendar:`, gErr);
          }
        }
      }

      if (deleteFromApp) {
        onConfirmDeleteAppAndCalendar(
          selectedEventIds, 
          { calCount: totalCalCount, taskCount: totalTaskCount },
          { deleteMainEvent, deleteTasks }
        );
      } else {
        // Calendar only cleanup
        onClose();
      }
      onClose();
    } catch (err: any) {
      console.error('Bulk deletion error:', err);
      setErrorMessage(err?.message || 'Failed to clean up Google Calendar.');
    } finally {
      setIsDeleting(false);
      setDeletionStatus(null);
    }
  };

  const getSummaryDescription = () => {
    if (!hasLocationSelected || !hasItemSelected) {
      return 'Please choose at least one location and one item type to delete.';
    }

    const itemsText = deleteTasks && deleteMainEvent
      ? `all ${count} events and ${totalTasksCount} prep tasks`
      : deleteTasks
        ? `all ${totalTasksCount} prep tasks across ${count} events`
        : `the ${count} target event entries`;

    const locationsText = deleteFromApp && deleteFromCalendar
      ? 'Ahead of Time and Google Calendar & Tasks'
      : deleteFromApp
        ? 'Ahead of Time only (Google Calendar remains untouched)'
        : 'Google Calendar & Tasks only';

    const safetyNote = !deleteMainEvent
      ? ' Your main appointments will stay safely on your calendar.'
      : '';

    return `Will delete ${itemsText} from ${locationsText}.${safetyNote}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden text-slate-900 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-rose-50/85 border-b border-rose-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                What do you want to delete?
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Bulk cleanup for {count} selected plan{count > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDeleting}
            className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          
          {/* Selected Events Preview */}
          <div className="max-h-28 overflow-y-auto space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Selected Plans ({count}) &bull; {totalTasksCount} total tasks
            </div>
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="text-xs font-bold text-slate-800 truncate flex items-center gap-2 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="truncate">{ev.title}</span>
                <span className="text-[10px] text-slate-400 font-normal ml-auto shrink-0">{ev.eventDate}</span>
              </div>
            ))}
          </div>

          {/* Section 1: WHERE */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              1. Where to delete from:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                deleteFromApp 
                  ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
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
                  <p className="text-[11px] text-slate-500 mt-0.5">Ahead of Time dashboard</p>
                </div>
              </label>

              <label className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                deleteFromCalendar 
                  ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
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
                  <p className="text-[11px] text-slate-500 mt-0.5">Google Calendar &amp; Tasks</p>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: WHICH */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              2. Which items to delete:
            </label>

            <div className="space-y-2">
              <label className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                deleteTasks 
                  ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="checkbox"
                  checked={deleteTasks}
                  onChange={(e) => setDeleteTasks(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5 cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                    <CheckSquare className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Preparation Tasks ({totalTasksCount} total)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Removes countdown checkpoints and prep reminders</p>
                </div>
              </label>

              <label className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                deleteMainEvent 
                  ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-200/70' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}>
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
                      <span>Main Target Events ({count} appointments)</span>
                    </div>
                    {!deleteMainEvent && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.2 rounded-full">
                        Kept intact
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Removes the original event entries themselves</p>
                </div>
              </label>
            </div>
          </div>

          {/* Dynamic Action Summary */}
          <div className={`p-3 rounded-2xl border text-xs leading-relaxed ${
            isFormValid ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-start gap-2">
              <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isFormValid ? 'text-sky-600' : 'text-amber-600'}`} />
              <p className="font-medium text-[11px]">
                {getSummaryDescription()}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              {errorMessage}
            </div>
          )}

          {isDeleting && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-blue-800 font-bold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{deletionStatus || 'Cleaning up sub-calendar tasks...'}</span>
            </div>
          )}
        </div>

        {/* Action Buttons Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            Cancel
          </button>

          <button
            onClick={handleExecuteBulkDelete}
            disabled={!isFormValid || isDeleting}
            className={`px-5 py-2.5 text-white font-black text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              deleteMainEvent ? 'bg-rose-700 hover:bg-rose-800 shadow-rose-700/25' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {deleteMainEvent 
                ? `Delete ${count} Events & Plans` 
                : `Delete Tasks (${count} Plans)`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};

