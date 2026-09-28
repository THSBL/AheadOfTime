import React, { useEffect, useState } from 'react';
import { Trash2, Loader2, X, AlertTriangle, ArrowLeft } from 'lucide-react';
import { CalendarEvent } from '../types';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';
import { executeSafePlanDeletion } from '../services/googleCalendar';
import { isEventInCalendar } from '../utils/pushStatus';

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

/**
 * Three plain choices, safest first and selected by default:
 *   app         - remove from Ahead Of Time only; Google is untouched
 *   tasks       - also remove the prep tasks from Google; the event stays
 *   everything  - also delete the event itself from Google Calendar
 * The button says exactly what will happen, and "everything" takes a
 * second step that names each event, so the user's own appointment is
 * never removed by a skimmed checkbox.
 */
type Choice = 'app' | 'tasks' | 'everything';

/** Came from the user's own calendar (Scan agenda), not created by a push from the app. */
function isImportedFromCalendar(event: CalendarEvent): boolean {
  return event.id.startsWith('gcal-') || (isEventInCalendar(event) && !event.syncedToGoogleAt);
}

const hasTasksInGoogle = (event: CalendarEvent) =>
  (event.milestones || []).some((m) => Boolean(m.googleTaskId || m.googleCalendarEventId));

export const BulkDeleteModal: React.FC<BulkDeleteModalProps> = ({
  isOpen,
  onClose,
  selectedEventIds,
  events,
  onConfirmDeleteAppOnly,
  onConfirmDeleteAppAndCalendar,
}) => {
  const [choice, setChoice] = useState<Choice>('app');
  const [confirmingEvents, setConfirmingEvents] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Every opening starts from the safe choice.
  useEffect(() => {
    if (isOpen) {
      setChoice('app');
      setConfirmingEvents(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen || selectedEventIds.length === 0) return null;

  const selectedEvents = events.filter((e) => selectedEventIds.includes(e.id));
  const count = selectedEvents.length;
  const planWord = count === 1 ? 'plan' : 'plans';
  const eventWord = count === 1 ? 'event' : 'events';

  const token = getStoredAccessToken();
  const isGoogleConnected = Boolean(token && !isTokenExpired());
  const anyTasksInGoogle = selectedEvents.some(hasTasksInGoogle);
  const eventsInCalendar = selectedEvents.filter(isEventInCalendar);
  const importedEvents = eventsInCalendar.filter(isImportedFromCalendar);

  const options: Array<{ id: Choice; title: string; detail: string; available: boolean; unavailable?: string }> = [
    {
      id: 'app',
      title: 'Remove from Ahead Of Time only',
      detail: 'Your Google Calendar and Tasks stay exactly as they are.',
      available: true,
    },
    {
      id: 'tasks',
      title: 'Also remove the prep tasks from Google',
      detail: `Your ${eventWord} ${count === 1 ? 'stays' : 'stay'} in your calendar.`,
      available: isGoogleConnected && anyTasksInGoogle,
      unavailable: !anyTasksInGoogle ? 'No prep tasks of these plans are in Google.' : 'Connect Google Calendar to do this.',
    },
    {
      id: 'everything',
      title: `Also delete the ${eventWord} from Google Calendar`,
      detail: 'Removes the appointment itself. You confirm each one on the next step.',
      available: isGoogleConnected && eventsInCalendar.length > 0,
      unavailable: eventsInCalendar.length === 0 ? `${count === 1 ? 'This event is' : 'These events are'} not in your Google Calendar.` : 'Connect Google Calendar to do this.',
    },
  ];

  const buttonLabel =
    choice === 'app'
      ? `Remove ${count} ${planWord} · keep calendar`
      : choice === 'tasks'
        ? `Remove ${planWord} + tasks · keep ${eventWord}`
        : `Next: confirm ${eventWord}`;

  const runDelete = async (deleteMainEvent: boolean) => {
    setIsDeleting(true);
    setErrorMessage(null);
    let calCount = 0;
    let taskCount = 0;
    try {
      for (let i = 0; i < selectedEvents.length; i++) {
        const ev = selectedEvents[i];
        setDeletionStatus(`Cleaning up ${i + 1} of ${count}: ${ev.title}…`);
        try {
          const res = await executeSafePlanDeletion(token!, ev, {
            deleteFromPrimaryCalendar: deleteMainEvent,
            deleteMainEvent,
            deleteTasks: true,
          });
          if (res.deletedPrimaryEvent) calCount += 1;
          taskCount += res.deletedTasksCount;
        } catch (gErr) {
          console.warn(`Failed to clean up ${ev.title} in Google:`, gErr);
        }
      }
      onConfirmDeleteAppAndCalendar(selectedEventIds, { calCount, taskCount }, { deleteMainEvent, deleteTasks: true });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not clean up Google Calendar.');
    } finally {
      setIsDeleting(false);
      setDeletionStatus(null);
    }
  };

  const handlePrimary = () => {
    if (choice === 'app') {
      onConfirmDeleteAppOnly(selectedEventIds);
      onClose();
    } else if (choice === 'tasks') {
      void runDelete(false);
    } else {
      setConfirmingEvents(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden text-slate-900 animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="bulk-delete-title" className="text-base font-black text-slate-900 leading-tight">
              {confirmingEvents ? `Delete from your Google Calendar?` : `Remove ${count} ${planWord}`}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {selectedEvents.map((e) => e.title).join(', ')}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close"
            className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {!confirmingEvents ? (
            <div className="space-y-2" role="radiogroup" aria-label="What to remove">
              {options.map((opt) => {
                const selected = choice === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-all select-none ${
                      !opt.available
                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                        : selected
                          ? opt.id === 'everything'
                            ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-200 cursor-pointer'
                            : 'bg-slate-50 border-[#182A42] ring-1 ring-[#182A42] cursor-pointer'
                          : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="bulk-delete-choice"
                      checked={selected}
                      disabled={!opt.available}
                      onChange={() => setChoice(opt.id)}
                      className={`w-4 h-4 mt-0.5 shrink-0 cursor-pointer ${opt.id === 'everything' ? 'accent-rose-600' : 'accent-[#182A42]'}`}
                    />
                    <span className="min-w-0">
                      <span className={`block text-sm font-bold ${opt.id === 'everything' ? 'text-rose-700' : 'text-slate-900'}`}>{opt.title}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{opt.available ? opt.detail : opt.unavailable}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-900 leading-relaxed">
                  {eventsInCalendar.length === 1 ? 'This appointment is' : 'These appointments are'} removed from your Google Calendar,
                  for you and for anyone you invited. This can't be undone from Ahead Of Time.
                </p>
              </div>
              <ul className="space-y-1.5">
                {eventsInCalendar.map((ev) => (
                  <li key={ev.id} className="px-3 py-2 rounded-xl border border-slate-200">
                    <p className="text-sm font-bold text-slate-900">{ev.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {ev.eventDate}
                      {isImportedFromCalendar(ev) && ' · was in your calendar before Ahead Of Time: this is your own appointment'}
                    </p>
                  </li>
                ))}
              </ul>
              {importedEvents.length > 0 && (
                <p className="text-xs text-slate-600">
                  Only want the plan gone? Go back and pick "Also remove the prep tasks from Google" instead.
                </p>
              )}
            </div>
          )}

          {errorMessage && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">{errorMessage}</div>}

          {isDeleting && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 text-xs text-slate-700 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{deletionStatus || 'Cleaning up…'}</span>
            </div>
          )}
        </div>

        {/* Footer: the button says what will happen */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          {confirmingEvents ? (
            <button
              onClick={() => setConfirmingEvents(false)}
              disabled={isDeleting}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
          )}

          {confirmingEvents ? (
            <button
              onClick={() => void runDelete(true)}
              disabled={isDeleting}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {eventsInCalendar.length === 1
                  ? `Delete "${eventsInCalendar[0].title}"`
                  : `Delete ${eventsInCalendar.length} events from calendar`}
              </span>
            </button>
          ) : (
            <button
              onClick={handlePrimary}
              disabled={isDeleting || !options.find((o) => o.id === choice)?.available}
              className={`px-4 py-2.5 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                choice === 'everything' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#182A42] hover:bg-slate-800'
              }`}
            >
              {choice !== 'everything' && <Trash2 className="w-4 h-4" />}
              <span>{buttonLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
