import React, { useState } from 'react';
import { 
  Trash2, 
  Calendar, 
  X, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  CalendarX, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { deleteEventFromGoogleCalendar } from '../services/googleCalendar';
import { formatDisplayDate } from '../utils/tminusRules';

interface DeleteEventModalProps {
  event: CalendarEvent;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDeleteAppOnly: (eventId: string) => void;
  onConfirmDeleteCalendarOnly: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
  onConfirmDeleteAppAndCalendar: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
}

export const DeleteEventModal: React.FC<DeleteEventModalProps> = ({
  event,
  isOpen,
  onClose,
  onConfirmDeleteAppOnly,
  onConfirmDeleteCalendarOnly,
  onConfirmDeleteAppAndCalendar,
}) => {
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

  // Execute deletion from Google Calendar API
  const executeGoogleCalendarWipe = async (): Promise<{ calCount: number; taskCount: number }> => {
    const activeToken = getStoredAccessToken();
    if (!activeToken) {
      throw new Error('Google Calendar is not connected. Please connect your Google account in Settings.');
    }
    setDeletionStatus('Cleaning up target event & prep tasks from Google Calendar agenda...');
    const result = await deleteEventFromGoogleCalendar(activeToken, event);
    return {
      calCount: result.deletedCalendarEvents,
      taskCount: result.deletedTasks,
    };
  };

  // Option 1: Delete from App & Google Calendar (Recommended)
  const handleDeleteBoth = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      let cleanup = { calCount: 0, taskCount: 0 };
      if (isGoogleConnected || hasGoogleSync) {
        cleanup = await executeGoogleCalendarWipe();
      }
      onConfirmDeleteAppAndCalendar(event.id, cleanup);
      onClose();
    } catch (err: any) {
      console.error('Error during 2-way deletion:', err);
      setErrorMessage(err?.message || 'Failed to delete from Google Calendar. You can still delete from app only.');
    } finally {
      setIsDeleting(false);
      setDeletionStatus(null);
    }
  };

  // Option 2: Delete from Google Calendar ONLY
  const handleDeleteCalendarOnly = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const cleanup = await executeGoogleCalendarWipe();
      onConfirmDeleteCalendarOnly(event.id, cleanup);
      onClose();
    } catch (err: any) {
      console.error('Error deleting from Google Calendar only:', err);
      setErrorMessage(err?.message || 'Failed to remove from Google Calendar.');
    } finally {
      setIsDeleting(false);
      setDeletionStatus(null);
    }
  };

  // Option 3: Delete from App ONLY
  const handleDeleteAppOnly = () => {
    onConfirmDeleteAppOnly(event.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                Delete Event &amp; Sync Cleanup
              </h3>
              <p className="text-xs text-slate-500">
                Two-way synchronization &amp; agenda cleanup
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
        <div className="p-6 space-y-5">
          {/* Target Event Info Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Target Event
              </span>
              <span className="text-xs font-semibold text-slate-600">
                {formatDisplayDate(event.eventDate)}
              </span>
            </div>
            <h4 className="text-base font-black text-slate-900 leading-snug">
              {event.title}
            </h4>

            {/* Sync Badge */}
            <div className="pt-2 border-t border-slate-200 flex items-center gap-2 flex-wrap text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium">
                <Layers className="w-3.5 h-3.5 text-red-500" />
                <span>{taskCount} Preparation Tasks</span>
              </div>
              {hasGoogleSync && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Linked in Google Calendar</span>
                </div>
              )}
            </div>
          </div>

          {/* Explanation Alert */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Keep your Google Agenda clean</p>
              <p className="text-amber-800 leading-relaxed">
                Deleting from both T-Minus and your Google Calendar prevents old preparation milestones from lingering in your agenda and overflowing your calendar.
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
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 text-xs text-blue-800 font-semibold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{deletionStatus || 'Communicating with Google Calendar & Google Tasks...'}</span>
            </div>
          )}

          {/* Deletion Actions Options */}
          {!isDeleting && (
            <div className="space-y-2.5">
              {/* Option 1: Delete App & Google Calendar */}
              <button
                onClick={handleDeleteBoth}
                className="w-full text-left p-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-semibold shadow-md shadow-rose-600/25 flex items-center justify-between group transition-all cursor-pointer"
              >
                <div className="space-y-0.5 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-200" />
                    <span className="text-sm font-bold">Delete from App &amp; Google Calendar</span>
                    <span className="text-[10px] bg-rose-500/80 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-rose-100 font-normal leading-relaxed">
                    Wipes 1 target event + all {taskCount} prep tasks from your Google Agenda &amp; Google Tasks.
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-rose-200 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>

              {/* Option 2: Delete from Google Calendar Only */}
              {hasGoogleSync && (
                <button
                  onClick={handleDeleteCalendarOnly}
                  className="w-full text-left p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-800 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <CalendarX className="w-4 h-4 text-slate-500" />
                      <span className="text-xs font-bold text-slate-900">Remove from Google Calendar Only</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Clears your Google Agenda items while keeping this event safe inside T-Minus.
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
                </button>
              )}

              {/* Option 3: Delete from App Only */}
              <button
                onClick={handleDeleteAppOnly}
                className="w-full text-left p-3 bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-600 rounded-2xl transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="space-y-0.5 min-w-0 pr-3">
                  <span className="text-xs font-bold text-slate-700">Delete from App Only</span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Removes the event from T-Minus without altering Google Calendar.
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
