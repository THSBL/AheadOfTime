import React, { useState } from 'react';
import { CheckCircle2, CalendarClock } from 'lucide-react';
import { formatDisplayDate } from '../utils/tminusRules';

export interface CatchUpCardItem {
  milestoneId: string;
  title: string;
}

/**
 * The one-time "already done?" check for an event that was added close to
 * its date (see isLateFromStart in utils/readiness.ts): its tasks were due
 * before it was even added, so they are not overdue work - most are often
 * already done (the hotel is booked). Tick what's done; "Plan the rest"
 * spreads whatever is left over the days before the event.
 */
export const CatchUpCard: React.FC<{
  eventTitle: string;
  eventDate?: string;
  items: CatchUpCardItem[];
  /** Hide the event line (on the event's own page). */
  hideEventTitle?: boolean;
  onMarkDone: (milestoneIds: string[]) => void;
  onPlanRest: (milestoneIds: string[]) => void;
  onSelectEvent?: () => void;
}> = ({ eventTitle, eventDate, items, hideEventTitle, onMarkDone, onPlanRest, onSelectEvent }) => {
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 5;
  const visible = showAll ? items : items.slice(0, VISIBLE);
  const allIds = items.map((i) => i.milestoneId);

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 border-l-4 border-l-amber-300 shadow-2xs">
      <div className="px-3 pt-2.5 pb-1.5">
        {!hideEventTitle && (
          <button
            type="button"
            onClick={onSelectEvent}
            className="text-sm font-bold text-slate-900 text-left hover:underline cursor-pointer"
          >
            {eventTitle}
            {eventDate && <span className="font-medium text-slate-500"> · {formatDisplayDate(eventDate)}</span>}
          </button>
        )}
        <p className="text-xs text-slate-500">
          {items.length === 1 ? 'This task was' : `These ${items.length} tasks were`} due before you added {hideEventTitle ? 'this event' : 'it'}. Tick off what's already done.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((item) => (
          <label key={item.milestoneId} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={false}
              onChange={() => onMarkDone([item.milestoneId])}
              className="w-4 h-4 rounded border-slate-300 cursor-pointer shrink-0"
              aria-label={`Already done: ${item.title}`}
            />
            <span className="text-sm text-slate-800 min-w-0">{item.title}</span>
          </label>
        ))}
      </div>
      {items.length > VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 text-left cursor-pointer"
        >
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => onMarkDone(allIds)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          All done
        </button>
        <button
          type="button"
          onClick={() => onPlanRest(allIds)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#182A42] hover:bg-slate-800 cursor-pointer"
          title="Spread the remaining tasks over the days before the event"
        >
          <CalendarClock className="w-3.5 h-3.5" />
          Plan the rest
        </button>
      </div>
    </div>
  );
};
