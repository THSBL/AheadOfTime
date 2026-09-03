import React, { useState } from 'react';
import { Trash2, AlertTriangle, Loader2, X, CheckCircle2, ArrowRight } from 'lucide-react';
import { CalendarEvent } from '../types';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { deleteEventFromGoogleCalendar } from '../services/googleCalendar';

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEventIds: string[];
  events: CalendarEvent[];
  onConfirmDeleteAppOnly: (eventIds: string[]) => void;
  onConfirmDeleteAppAndCalendar: (eventIds: string[], cleanupSummary: { calCount: number; taskCount: number }) => void;
}

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  onClose,
  selectedEventIds,
  events,
  onConfirmDeleteAppOnly,
  onConfirmDeleteAppAndCalendar,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || selectedEventIds.length === 0) return null;

  const selectedEvents = events.filter((e) => selectedEventIds.includes(e.id));
  const count = selectedEvents.length;

  const token = getStoredAccessToken();
  const isGoogleConnected = Boolean(token && !isTokenExpired());

  const handleAppOnly = () => {
    onConfirmDeleteAppOnly(selectedEventIds);
    onClose();
  };

  const handleAppAndCalendar = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      let totalCalCount = 0;
      let totalTaskCount = 0;

      if (isGoogleConnected) {
        for (let i = 0; i < selectedEvents.length; i++) {
          const ev = selectedEvents[i];
          setDeletionStatus(`Cleaning up event ${i + 1} of ${count}: ${ev.title}...`);
          try {
            const res = await deleteEventFromGoogleCalendar(token!, ev);
            totalCalCount += res.deletedCalendarEvents;
            totalTaskCount += res.deletedTasks;
          } catch (gErr) {
            console.warn(`Failed to delete event ${ev.title} from Google Calendar:`, gErr);
          }
        }
      }

      onConfirmDeleteAppAndCalendar(selectedEventIds, { calCount: totalCalCount, taskCount: totalTaskCount });
      onClose();
    } catch (err: any) {
      console.error('Bulk deletion error:', err);
      setErrorMessage(err?.message || 'Failed to clean up Google Calendar.');
    } finally {
      setIsDeleting(false);
      setDeletionStatus(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white border border-slate-200 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden text-slate-900 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Delete {count} Selected Event{count > 1 ? 's' : ''}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Manage active agenda records
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
        <div className="p-6 space-y-4">
          
          {/* User's Exact Requested Pop-up Message */}
          <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-2xl text-xs text-amber-950 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5 font-medium leading-relaxed">
              <p>
                You will only delete {count === 1 ? 'this event' : `these ${count} events`} from the app. If you want to delete {count === 1 ? 'this' : 'them'} from your calendar as well, click on the other button.
              </p>
            </div>
          </div>

          {/* Selected Events Preview */}
          <div className="max-h-36 overflow-y-auto space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="text-xs font-bold text-slate-800 truncate flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="truncate">{ev.title}</span>
                <span className="text-[10px] text-slate-400 font-normal ml-auto shrink-0">{ev.eventDate}</span>
              </div>
            ))}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              {errorMessage}
            </div>
          )}

          {isDeleting && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2.5 text-xs text-blue-800 font-bold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{deletionStatus || 'Cleaning up events from Google Calendar...'}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleAppOnly}
              disabled={isDeleting}
              className="w-full py-3 px-4 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all shadow-2xs flex items-center justify-between cursor-pointer disabled:opacity-50"
            >
              <span>Delete from App Only ({count})</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={handleAppAndCalendar}
              disabled={isDeleting}
              className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-between cursor-pointer disabled:opacity-50"
            >
              <span>Delete from App &amp; Google Calendar ({count})</span>
              <Trash2 className="w-3.5 h-3.5 text-rose-200" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
