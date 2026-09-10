import React from 'react';
import { Sparkles, ArrowRight, Plus, CheckCircle2, Calendar as CalendarIcon } from 'lucide-react';
import { CalendarEvent } from '../types';
import { formatDisplayDate, getCountdownStatus, sortEventsUpcomingFirst } from '../utils/tminusRules';
import {
  computeOverallAheadStatus,
  computeNextBestAction,
  computeAheadStatus,
  AheadLevel,
} from '../utils/readiness';

interface MyWeekAheadProps {
  events: CalendarEvent[];
  currentReferenceDate: string;
  onSelectEvent: (eventId: string) => void;
  onOpenNewEventModal: () => void;
}

const AHEAD_STYLES: Record<AheadLevel, { badge: string; dot: string }> = {
  at_risk: { badge: 'text-rose-800 bg-rose-100 border-rose-300', dot: 'bg-rose-500' },
  attention: { badge: 'text-amber-900 bg-amber-100 border-amber-300', dot: 'bg-amber-500' },
  on_track: { badge: 'text-emerald-900 bg-emerald-100 border-emerald-300', dot: 'bg-emerald-500' },
  ahead: { badge: 'text-emerald-900 bg-emerald-100 border-emerald-300', dot: 'bg-emerald-500' },
  ready: { badge: 'text-slate-700 bg-slate-100 border-slate-300', dot: 'bg-slate-400' },
};

export const MyWeekAhead: React.FC<MyWeekAheadProps> = ({
  events,
  currentReferenceDate,
  onSelectEvent,
  onOpenNewEventModal,
}) => {
  const activeEvents = events.filter((e) => e.status !== 'completed');

  if (activeEvents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full milky-glass border border-white/80 rounded-3xl p-6 text-center text-slate-500 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-3 shadow-xs">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Nothing ahead yet</h3>
        <p className="text-xs sm:text-sm text-slate-500 mb-4 max-w-xs leading-relaxed">
          Create your first event and Ahead Of Time will build a preparation plan and track it here.
        </p>
        <button
          onClick={onOpenNewEventModal}
          className="bg-[#0f172a] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm shadow-slate-900/25 transition-all"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Event</span>
        </button>
      </div>
    );
  }

  const overall = computeOverallAheadStatus(activeEvents, currentReferenceDate);
  const nextBestAction = computeNextBestAction(activeEvents, currentReferenceDate);

  const perEvent = sortEventsUpcomingFirst(activeEvents, currentReferenceDate).map((event) => ({
    event,
    status: computeAheadStatus(event, currentReferenceDate),
  }));

  const needsAttention = perEvent.filter((e) => e.status.level === 'at_risk' || e.status.level === 'attention');
  const alreadyAhead = perEvent.filter((e) => e.status.level === 'ahead' || e.status.level === 'ready');
  const comingUp = perEvent.filter(
    (e) => !needsAttention.includes(e) && !alreadyAhead.includes(e)
  );

  return (
    <div className="flex-1 flex flex-col h-full milky-glass border border-sky-200/80 rounded-3xl overflow-hidden shadow-xs w-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
        {/* AHEAD - overall readiness */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ahead</p>
          <div className="flex items-center gap-2">
            <span className="text-lg sm:text-xl">{overall.emoji}</span>
            <h2 className="text-base sm:text-lg font-black text-slate-900">{overall.label}</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">{overall.summary}</p>
        </div>

        {/* Next Best Action */}
        {nextBestAction && (
          <button
            type="button"
            onClick={() => onSelectEvent(nextBestAction.eventId)}
            className={`w-full text-left p-4 sm:p-5 rounded-2xl border shadow-xs transition-all hover:shadow-md active:scale-[0.99] cursor-pointer ${
              nextBestAction.isOverdue
                ? 'bg-rose-50/80 border-rose-200'
                : nextBestAction.importance === 'critical'
                ? 'bg-amber-50/80 border-amber-200'
                : 'bg-sky-50/70 border-sky-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Next best action</p>
                <p className="text-sm sm:text-base font-black text-slate-900 truncate">{nextBestAction.title}</p>
                <p className="text-xs text-slate-600">{nextBestAction.reason}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    nextBestAction.isOverdue ? 'text-rose-800 bg-rose-100' : 'text-slate-700 bg-white border border-slate-200'
                  }`}
                >
                  {nextBestAction.dueLabel}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </button>
        )}

        {/* Needs Attention */}
        {needsAttention.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Needs attention</h3>
            <div className="space-y-2">
              {needsAttention.map(({ event, status }) => (
                <EventRow key={event.id} event={event} status={status} currentReferenceDate={currentReferenceDate} onSelectEvent={onSelectEvent} />
              ))}
            </div>
          </div>
        )}

        {/* Coming Up */}
        {comingUp.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Coming up</h3>
            <div className="space-y-2">
              {comingUp.map(({ event, status }) => (
                <EventRow key={event.id} event={event} status={status} currentReferenceDate={currentReferenceDate} onSelectEvent={onSelectEvent} />
              ))}
            </div>
          </div>
        )}

        {/* Already Ahead */}
        {alreadyAhead.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Already ahead</span>
            </h3>
            <div className="space-y-2">
              {alreadyAhead.map(({ event, status }) => (
                <EventRow key={event.id} event={event} status={status} currentReferenceDate={currentReferenceDate} onSelectEvent={onSelectEvent} compact />
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onOpenNewEventModal}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          <span>Plan something new</span>
        </button>
      </div>
    </div>
  );
};

const EventRow: React.FC<{
  event: CalendarEvent;
  status: ReturnType<typeof computeAheadStatus>;
  currentReferenceDate: string;
  onSelectEvent: (eventId: string) => void;
  compact?: boolean;
}> = ({ event, status, currentReferenceDate, onSelectEvent, compact }) => {
  const countdown = getCountdownStatus(event.eventDate, currentReferenceDate);
  const style = AHEAD_STYLES[status.level];

  return (
    <button
      type="button"
      onClick={() => onSelectEvent(event.id)}
      className={`w-full text-left p-3 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 shadow-2xs transition-all flex items-center gap-3 cursor-pointer ${
        compact ? 'opacity-80' : ''
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{event.title}</p>
        <p className="text-[11px] text-slate-500">
          {formatDisplayDate(event.eventDate)} · {countdown.label}
        </p>
      </div>
      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${style.badge}`}>
        {status.completedCount}/{status.totalCount}
      </span>
    </button>
  );
};

export default MyWeekAhead;
