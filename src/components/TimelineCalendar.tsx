import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { addDaysKey, dayKey, eventBarsForWeek, itemsForDay, type CalendarItem, type EventBar } from '../utils/calendarView';
import { formatDisplayDate } from '../utils/tminusRules';
import { CalendarPeek, type PeekTarget } from './CalendarPeek';

export type CalendarSpan = 'month' | 'week';

interface TimelineCalendarProps {
  events: CalendarEvent[];
  currentReferenceDate: string;
  span: CalendarSpan;
  onSpanChange: (span: CalendarSpan) => void;
  /** Event picked in Active Events: its items stand out, the rest steps back. */
  highlightEventId: string | null;
  onOpenEvent: (eventId: string) => void;
  onOpenTask: (eventId: string, milestoneId: string) => void;
  /** Mark a task done / not done straight from the quick look. */
  onToggleTask?: (eventId: string, milestoneId: string) => void;
  /** First and last day on screen, so Active Events can show only what's in view. */
  onRangeChange: (start: string, end: string) => void;
  /** The day the view is on, kept by the parent so returning from an event lands on the same month. */
  cursor: string | null;
  onCursorChange: (day: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_ITEMS = 3;
// Event bars: one row each, the same row across every day of the event.
const LANE_PX = 26;
const DAY_HEADER_PX = 26;

/** Monday on or before the given day. */
function mondayOf(key: string): string {
  const weekday = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysKey(key, -weekday);
}

function monthLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shortDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Timeline & Tasks on a month or week grid (desktop). Events are navy bars
 * on their day(s); tasks are rows with a checkbox square - red when late,
 * struck through when done. Clicking either opens the event's detail view.
 */
export const TimelineCalendar: React.FC<TimelineCalendarProps> = ({
  events,
  currentReferenceDate,
  span,
  onSpanChange,
  highlightEventId,
  onOpenEvent,
  onOpenTask,
  onToggleTask,
  onRangeChange,
  cursor: cursorProp,
  onCursorChange,
}) => {
  const today = dayKey(new Date(currentReferenceDate).toISOString());
  const cursor = cursorProp || today;
  const setCursor = (next: string | ((c: string) => string)) => onCursorChange(typeof next === 'function' ? next(cursor) : next);

  const { start, days, title } = useMemo(() => {
    if (span === 'week') {
      const first = mondayOf(cursor);
      return { start: first, days: 7, title: `${shortDate(first)} - ${shortDate(addDaysKey(first, 6))}` };
    }
    const firstOfMonth = `${cursor.slice(0, 7)}-01`;
    const first = mondayOf(firstOfMonth);
    const [y, m] = cursor.split('-').map(Number);
    const lastOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    // Whole weeks from the Monday before the 1st through the last day (4-6 rows).
    const dayCount = (Date.parse(`${lastOfMonth}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000 + 1;
    return { start: first, days: Math.ceil(dayCount / 7) * 7, title: monthLabel(firstOfMonth) };
  }, [cursor, span]);

  const end = addDaysKey(start, days - 1);
  useEffect(() => {
    onRangeChange(start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const move = (dir: 1 | -1) => {
    if (span === 'week') setCursor((c) => addDaysKey(c, 7 * dir));
    else {
      const d = new Date(`${cursor.slice(0, 7)}-15T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + dir);
      setCursor(d.toISOString().slice(0, 10));
    }
  };

  // A click opens a quick look first; "Open plan" in it goes to the full plan.
  const [peek, setPeek] = useState<PeekTarget | null>(null);
  const closePeek = useCallback(() => setPeek(null), []);
  const openPeek = (e: React.MouseEvent, eventId: string, milestoneId?: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPeek({ eventId, milestoneId, anchor: { top: r.top, left: r.left, bottom: r.bottom, right: r.right } });
  };
  const isPeeked = (item: CalendarItem) =>
    peek !== null && peek.eventId === item.event.id && (item.kind === 'event' ? !peek.milestoneId : peek.milestoneId === item.milestone.id);

  const isHighlighted = (item: CalendarItem) => highlightEventId !== null && item.event.id === highlightEventId;
  const dimming = highlightEventId !== null;

  const renderItem = (item: CalendarItem) => {
    const lit = isHighlighted(item);
    // With an event picked, its items get room (full title, more detail) and
    // everything else shrinks to one faded line.
    const compact = dimming && !lit;
    const clamp = compact ? 'truncate' : lit || span === 'week' ? '' : 'line-clamp-2';

    if (item.kind === 'event') {
      const ev = item.event;
      return (
        <button
          key={item.key}
          type="button"
          onClick={(e) => openPeek(e, ev.id)}
          aria-haspopup="dialog"
          title={`${ev.title} · ${formatDisplayDate(ev.eventDate)}`}
          className={`w-full text-left rounded-md px-1.5 py-1 text-[11.5px] font-bold leading-snug transition-all cursor-pointer ${isPeeked(item) ? 'outline outline-2 outline-offset-1 outline-[#447463]' : ''} ${
            lit
              ? 'bg-[#182A42] text-white ring-2 ring-aot-sage ring-offset-1'
              : compact
                ? 'bg-slate-200 text-slate-500 opacity-60'
                : 'bg-[#182A42] text-white hover:bg-slate-800'
          }`}
        >
          <span className={`block ${clamp}`}>{ev.title}</span>
          {lit && ev.eventTime && <span className="block text-[10.5px] font-semibold text-slate-300">{ev.eventTime}</span>}
        </button>
      );
    }

    const m = item.milestone;
    const done = m.status === 'completed';
    return (
      <button
        key={item.key}
        type="button"
        onClick={(e) => openPeek(e, item.event.id, m.id)}
        aria-haspopup="dialog"
        title={`${m.title} · ${item.event.title}${item.carried ? ` · late, was due ${shortDate(dayKey(m.calculatedDate))}` : ''}`}
        className={`w-full text-left rounded-md px-1.5 py-1 text-[11.5px] leading-snug flex items-start gap-1.5 transition-all cursor-pointer ${isPeeked(item) ? 'outline outline-2 outline-offset-1 outline-[#447463] bg-white' : ''} ${
          lit
            ? 'bg-aot-sage/25 ring-2 ring-[#182A42] ring-inset font-semibold'
            : compact
              ? 'opacity-30'
              : 'hover:bg-slate-100'
        } ${done ? 'text-slate-400' : item.late ? 'text-rose-700' : 'text-slate-800'}`}
      >
        <span
          className={`mt-[3px] w-2.5 h-2.5 rounded-[3px] border-[1.5px] shrink-0 ${
            done ? 'bg-aot-sage border-aot-sage' : item.late ? 'border-rose-500' : 'border-slate-400'
          }`}
        />
        <span className="min-w-0">
          <span className={`block ${clamp} ${done ? 'line-through' : ''}`}>{m.title}</span>
          {(lit || (span === 'week' && !compact)) && (
            <span className="block text-[10.5px] font-normal text-slate-500">
              {item.event.title}
              {item.carried && ` · late, was ${shortDate(dayKey(m.calculatedDate))}`}
            </span>
          )}
          {!lit && !compact && span === 'month' && item.carried && (
            <span className="block text-[10px] font-semibold text-rose-600">late · was {shortDate(dayKey(m.calculatedDate))}</span>
          )}
        </span>
      </button>
    );
  };

  const renderBar = (bar: EventBar) => {
    const ev = bar.event;
    const lit = highlightEventId !== null && ev.id === highlightEventId;
    const compact = dimming && !lit;
    const peeked = peek !== null && peek.eventId === ev.id && !peek.milestoneId;
    return (
      <button
        key={`${ev.id}-${bar.startCol}`}
        type="button"
        onClick={(e) => openPeek(e, ev.id)}
        aria-haspopup="dialog"
        title={`${ev.title} · ${formatDisplayDate(ev.eventDate)}${ev.endDate && ev.endDate !== ev.eventDate ? ` – ${formatDisplayDate(ev.endDate)}` : ''}`}
        style={{ gridColumn: `${bar.startCol + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }}
        className={`pointer-events-auto mx-1 h-[22px] self-center px-1.5 text-left text-[11.5px] font-bold leading-[22px] truncate transition-all cursor-pointer ${
          bar.continuesBefore ? 'rounded-l-none -ml-px' : 'rounded-l-md'
        } ${bar.continuesAfter ? 'rounded-r-none -mr-px' : 'rounded-r-md'} ${
          peeked ? 'outline outline-2 outline-offset-1 outline-[#447463]' : ''
        } ${
          lit
            ? 'bg-[#182A42] text-white ring-2 ring-aot-sage ring-offset-1'
            : compact
              ? 'bg-slate-200 text-slate-500 opacity-60'
              : 'bg-[#182A42] text-white hover:bg-slate-800'
        }`}
      >
        {bar.continuesBefore ? '← ' : ''}
        {ev.title}
        {ev.eventTime && !bar.continuesBefore ? <span className="ml-1 font-semibold opacity-70">{ev.eventTime}</span> : null}
      </button>
    );
  };

  const inMonth = (key: string) => span === 'week' || key.slice(0, 7) === cursor.slice(0, 7);

  return (
    <div className="flex-1 flex flex-col h-full bg-white rounded-3xl overflow-hidden shadow-xs border border-slate-200/80">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => move(-1)} aria-label={span === 'week' ? 'Previous week' : 'Previous month'} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#182A42] cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => move(1)} aria-label={span === 'week' ? 'Next week' : 'Next month'} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#182A42] cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setCursor(today)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-[#182A42] cursor-pointer">
            Today
          </button>
          <h2 className="ml-2 text-base font-black text-[#182A42]">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#182A42]" />Event</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] border-[1.5px] border-slate-400" />Task</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] border-[1.5px] border-rose-500" />Late</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] bg-aot-sage" />Done</span>
          </div>
          <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5" role="group" aria-label="Calendar range">
            {(['week', 'month'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={span === s}
                onClick={() => onSpanChange(s)}
                className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  span === s ? 'bg-white text-[#182A42] shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {s === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 px-2 pt-2 pb-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
        {WEEKDAYS.map((d) => (
          <span key={d} className="px-1.5">{d}</span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-t border-slate-100">
          {Array.from({ length: days / 7 }, (_, w) => {
            const weekStart = addDaysKey(start, w * 7);
            const weekCells = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
            const bars = eventBarsForWeek(events, weekStart);
            const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
            return (
              <div key={weekStart} className="relative grid grid-cols-7 gap-px bg-slate-100 border-b border-slate-100">
                {weekCells.map((key) => {
                  // Events are the bars above; the day itself lists its tasks.
                  const tasks = itemsForDay(events, key, today).filter((i) => i.kind === 'task');
                  const lit = tasks.filter(isHighlighted);
                  const rest = tasks.filter((i) => !isHighlighted(i));
                  const limit = span === 'week' ? Infinity : Math.max(0, MONTH_ITEMS - lit.length);
                  const shown = [...lit, ...rest.slice(0, limit)];
                  const hidden = tasks.length - shown.length;
                  return (
                    <div
                      key={key}
                      className={`p-1.5 space-y-1 ${span === 'week' ? 'min-h-[460px]' : 'min-h-[112px]'} ${inMonth(key) ? 'bg-white' : 'bg-slate-50/70'}`}
                    >
                      <div className="px-1 flex items-center justify-between" style={{ height: DAY_HEADER_PX - 6 }}>
                        <span
                          className={`text-xs font-bold ${
                            key === today ? 'bg-[#182A42] text-white rounded-full px-1.5' : inMonth(key) ? 'text-slate-600' : 'text-slate-300'
                          }`}
                        >
                          {Number(key.slice(8, 10))}
                        </span>
                      </div>
                      {lanes > 0 && <div aria-hidden="true" style={{ height: lanes * LANE_PX }} />}
                      {shown.map(renderItem)}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCursor(key);
                            onSpanChange('week');
                          }}
                          className="px-1.5 text-[11px] font-bold text-slate-500 hover:text-[#182A42] cursor-pointer"
                        >
                          +{hidden} more
                        </button>
                      )}
                    </div>
                  );
                })}
                {bars.length > 0 && (
                  <div
                    className="absolute inset-x-0 grid grid-cols-7 gap-px pointer-events-none"
                    style={{ top: DAY_HEADER_PX + 2, gridAutoRows: `${LANE_PX}px` }}
                  >
                    {bars.map(renderBar)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {peek && (
        <CalendarPeek
          target={peek}
          events={events}
          today={today}
          onClose={closePeek}
          onPeek={setPeek}
          onOpenEvent={(id) => {
            setPeek(null);
            onOpenEvent(id);
          }}
          onOpenTask={(eventId, milestoneId) => {
            setPeek(null);
            onOpenTask(eventId, milestoneId);
          }}
          onToggleTask={onToggleTask}
        />
      )}
    </div>
  );
};
