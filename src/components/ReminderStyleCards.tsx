import React from 'react';
import { CalendarClock, CheckSquare } from 'lucide-react';
import type { ReminderPrefs, ReminderStyle } from '../utils/planLink';
import { REMINDER_MINUTES, shortDay } from '../utils/planLink';

/**
 * "Show your prep tasks as…": Tasks or Events, each as a small picture of
 * a calendar day - a line at the top of the day, or a block at the chosen
 * hour - so the difference is seen, not read. Events also ask when and
 * for how long (used for every reminder).
 */

const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`).flatMap((h) => [h, h.replace(':00', ':30')]);

function DayPicture({ style, title, date, time }: { style: ReminderStyle; title: string; date: string; time: string }) {
  const hour = Number(time.slice(0, 2));
  const rows = [hour - 1, hour, hour + 1].map((h) => `${String(Math.max(0, Math.min(23, h))).padStart(2, '0')}:00`);
  return (
    <span aria-hidden="true" className="block bg-white border border-slate-200 rounded-lg overflow-hidden text-left">
      <span className="block text-[10px] font-extrabold text-slate-500 px-2 py-1 border-b border-slate-200 uppercase">{shortDay(date) || 'Sat 22 Nov'}</span>
      <span className="block h-[29px] p-1 border-b border-slate-200">
        {style === 'tasks' && (
          <span className="flex items-center gap-1.5 bg-aot-green-200 text-[#182A42] text-[11px] font-extrabold px-1.5 py-1 rounded">
            <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[#182A42] shrink-0" />
            <span className="truncate">{title}</span>
          </span>
        )}
      </span>
      {rows.map((h, i) => (
        <span key={h} className={`flex h-[22px] items-stretch ${i < 2 ? 'border-b border-slate-100' : ''}`}>
          {style === 'events' && i === 1 ? (
            <span className="flex-1 m-0.5 bg-aot-sage text-[#182A42] text-[10px] font-extrabold rounded px-1.5 truncate leading-[18px]">
              {time} {title}
            </span>
          ) : (
            <span className="text-[9px] text-slate-400 px-1.5 pt-0.5">{h}</span>
          )}
        </span>
      ))}
    </span>
  );
}

export const ReminderStyleCards: React.FC<{
  prefs: ReminderPrefs;
  onChange: (prefs: ReminderPrefs) => void;
  /** The plan's next prep task, shown in the pictures. */
  sample: { title: string; date: string };
}> = ({ prefs, onChange, sample }) => {
  const card = (style: ReminderStyle) =>
    `text-left flex flex-col gap-2 p-3 rounded-2xl border-2 cursor-pointer transition-colors ${
      prefs.style === style ? 'border-[#182A42] bg-aot-green-50' : 'border-slate-200 bg-white hover:border-slate-300'
    }`;
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Show prep tasks as">
        <button type="button" aria-pressed={prefs.style === 'tasks'} onClick={() => onChange({ ...prefs, style: 'tasks' })} className={card('tasks')}>
          <span className="flex items-center gap-1.5 text-[15px] font-black text-[#182A42]">
            <CheckSquare className="w-[18px] h-[18px]" /> Tasks
          </span>
          <DayPicture style="tasks" title={sample.title} date={sample.date} time={prefs.time} />
          <span className="text-xs font-semibold text-slate-700">On the day. No time blocked.</span>
        </button>
        <button type="button" aria-pressed={prefs.style === 'events'} onClick={() => onChange({ ...prefs, style: 'events' })} className={card('events')}>
          <span className="flex items-center gap-1.5 text-[15px] font-black text-[#182A42]">
            <CalendarClock className="w-[18px] h-[18px]" /> Events
          </span>
          <DayPicture style="events" title={sample.title} date={sample.date} time={prefs.time} />
          <span className="text-xs font-semibold text-slate-700">{prefs.minutes} min, at a time you pick.</span>
        </button>
      </div>
      {prefs.style === 'events' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 bg-aot-green-50 rounded-xl px-3 py-2">
          <label htmlFor="reminder-time" className="font-bold">At</label>
          <select
            id="reminder-time"
            value={prefs.time}
            onChange={(e) => onChange({ ...prefs, time: e.target.value })}
            className="min-h-9 border border-slate-300 rounded-lg px-2 bg-white text-xs"
          >
            {(HOURS.includes(prefs.time) ? HOURS : [prefs.time, ...HOURS]).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <label htmlFor="reminder-length" className="font-bold">for</label>
          <select
            id="reminder-length"
            value={prefs.minutes}
            onChange={(e) => onChange({ ...prefs, minutes: Number(e.target.value) })}
            className="min-h-9 border border-slate-300 rounded-lg px-2 bg-white text-xs"
          >
            {REMINDER_MINUTES.map((m) => (
              <option key={m} value={m}>{m === 60 ? '1 hour' : `${m} min`}</option>
            ))}
          </select>
          <span className="text-slate-500">Used for every reminder.</span>
        </div>
      )}
    </div>
  );
};
