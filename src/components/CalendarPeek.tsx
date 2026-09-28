import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Circle, MapPin, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { dayKey } from '../utils/calendarView';
import { getCleanEventTitle } from '../utils/tminusRules';

export interface PeekTarget {
  eventId: string;
  /** Set for a task; absent for the event itself. */
  milestoneId?: string;
  /** Where it was clicked, to place the card next to it. */
  anchor: { top: number; left: number; bottom: number; right: number };
}

interface CalendarPeekProps {
  target: PeekTarget;
  events: CalendarEvent[];
  today: string;
  onClose: () => void;
  onPeek: (target: PeekTarget) => void;
  onOpenEvent: (eventId: string) => void;
  onOpenTask: (eventId: string, milestoneId: string) => void;
  onToggleTask?: (eventId: string, milestoneId: string) => void;
}

const longDate = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const WIDTH = 320;

/**
 * A quick look from the calendar: what a task says and which event it
 * belongs to (or an event's next tasks), with Mark done and Open plan -
 * without leaving the calendar.
 */
export const CalendarPeek: React.FC<CalendarPeekProps> = ({ target, events, today, onClose, onPeek, onOpenEvent, onOpenTask, onToggleTask }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const event = events.find((e) => e.id === target.eventId);
  const milestone = target.milestoneId ? event?.milestones?.find((m) => m.id === target.milestoneId) : undefined;

  // Beside the clicked item when there's room, else below/above it; always on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const a = target.anchor;
    let left = a.right + 8;
    let top = a.top - 8;
    if (left + WIDTH > vw - 12) left = a.left - WIDTH - 8;
    if (left < 12) {
      left = Math.min(Math.max(12, a.left), vw - WIDTH - 12);
      top = a.bottom + 8;
      if (top + h > vh - 12) top = a.top - h - 8;
    }
    top = Math.min(Math.max(12, top), vh - h - 12);
    setPos({ top, left: Math.max(12, left) });
  }, [target, milestone?.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Next tick, so the click that opened it doesn't close it.
    const t = window.setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.clearTimeout(t);
    };
  }, [onClose]);

  if (!event) return null;
  const eventTitle = getCleanEventTitle(event.title, event.category, event.context);
  const active = (event.milestones || []).filter((m) => m.isActive !== false);
  const doneCount = active.filter((m) => m.status === 'completed').length;

  let body: React.ReactNode;
  if (milestone) {
    const due = dayKey(milestone.calculatedDate);
    const done = milestone.status === 'completed';
    const late = !done && due < today;
    const deliverables = (milestone.deliverables || []).slice(0, 4);
    body = (
      <>
        <button
          type="button"
          onClick={() => onPeek({ eventId: event.id, anchor: target.anchor })}
          className="text-left text-[11px] font-bold text-slate-500 hover:text-[#182A42] cursor-pointer"
          title="Show this event"
        >
          {eventTitle} · {longDate(event.eventDate)}
        </button>
        <h3 className={`text-base font-black leading-snug text-[#182A42] ${done ? 'line-through text-slate-400' : ''}`}>{milestone.title}</h3>
        <p className="text-xs">
          <span className="text-slate-500">Due </span>
          <b className={late ? 'text-rose-600' : 'text-slate-800'}>{longDate(due)}</b>
          {late && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[10px] font-bold">Late</span>}
          {done && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-aot-sage/30 text-[#447463] text-[10px] font-bold">Done</span>}
        </p>
        {milestone.description && <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{milestone.description}</p>}
        {deliverables.length > 0 && (
          <ul className="space-y-1">
            {deliverables.map((d) => (
              <li key={d.deliverable_id} className="flex items-start gap-1.5 text-xs text-slate-700">
                {d.is_completed ? <Check className="w-3.5 h-3.5 mt-px text-[#447463] shrink-0" /> : <Circle className="w-3 h-3 mt-0.5 text-slate-300 shrink-0" />}
                <span className={d.is_completed ? 'line-through text-slate-400' : ''}>{d.title}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 pt-1">
          {onToggleTask && (
            <button
              type="button"
              onClick={() => onToggleTask(event.id, milestone.id)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                done ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-[#182A42] text-white hover:bg-slate-800'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              {done ? 'Mark not done' : 'Mark done'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenTask(event.id, milestone.id)}
            className="flex-1 py-2 rounded-xl text-xs font-bold border border-[#182A42] text-[#182A42] hover:bg-slate-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Open plan <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </>
    );
  } else {
    const next = active
      .filter((m) => m.status !== 'completed')
      .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate))
      .slice(0, 3);
    body = (
      <>
        <h3 className="text-base font-black leading-snug text-[#182A42]">{eventTitle}</h3>
        <p className="text-xs text-slate-700">
          <b>{longDate(event.eventDate)}</b>
          {event.eventTime && <span> · {event.eventTime}</span>}
          {event.endDate && event.endDate !== event.eventDate && <span> - {longDate(event.endDate)}</span>}
        </p>
        {event.location && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {event.location}
          </p>
        )}
        {active.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {doneCount} of {active.length} tasks done{next.length > 0 ? ' · next up' : ''}
            </p>
            {next.map((m) => {
              const due = dayKey(m.calculatedDate);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPeek({ eventId: event.id, milestoneId: m.id, anchor: target.anchor })}
                  className="w-full text-left flex items-start gap-2 text-xs rounded-lg px-1.5 py-1 hover:bg-slate-50 cursor-pointer"
                >
                  <span className={`mt-[3px] w-2.5 h-2.5 rounded-[3px] border-[1.5px] shrink-0 ${due < today ? 'border-rose-500' : 'border-slate-400'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-800 font-semibold">{m.title}</span>
                    <span className={`block text-[10.5px] ${due < today ? 'text-rose-600' : 'text-slate-500'}`}>{longDate(due)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => onOpenEvent(event.id)}
          className="w-full py-2 rounded-xl text-xs font-bold bg-[#182A42] text-white hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          Open plan <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={milestone ? milestone.title : eventTitle}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
      className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 space-y-2.5 animate-in fade-in zoom-in-95 duration-100"
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-2.5 right-2.5 p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
        <X className="w-4 h-4" />
      </button>
      <div className="pr-6 space-y-2.5">{body}</div>
    </div>
  );
};
