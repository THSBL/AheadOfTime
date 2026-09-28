import React, { useState } from 'react';
import { Sparkles, Plus, Check, CheckCircle2, Calendar as CalendarIcon, FileText, Gift, Plane, ClipboardList, PhoneCall, Layers, ChevronDown, Search, CalendarClock, Clock } from 'lucide-react';
import { CalendarEvent, TMinusMilestone } from '../types';
import { formatDisplayDate, getCountdownStatus, sortEventsUpcomingFirst } from '../utils/tminusRules';
import {
  computeAheadStatus,
  computeSimpleAheadStatus,
  computeOverdueMilestones,
  computeWeeklyMilestonePreview,
  computeCatchUpGroups,
  computeWeekProgress,
  spreadCatchUpDates,
  WeekProgress,
  prepareWeekViewEvents,
  isEventOver,
  AheadLevel,
  ActionTheme,
  SimpleAheadLevel,
  UpcomingMilestoneItem,
  MilestoneCluster,
  WeeklyMilestoneBucket,
  THEME_LABELS,
} from '../utils/readiness';
import { CatchUpCard } from './CatchUpCard';

const THEME_ICONS: Record<ActionTheme, React.ElementType> = {
  bookings_logistics: Plane,
  purchases_gifts_supplies: Gift,
  deliverables_preparation: ClipboardList,
  outreach_communication: PhoneCall,
  administration: FileText,
  packing_essentials: Layers,
  other: Layers,
};

// A clear week isn't a hole to fill - rotate a short line that says so,
// rather than defaulting to a single fixed message.
const EMPTY_WEEK_LINES = [
  "Nothing ahead. That's what being ahead looks like.",
  'A clear week is a finished one. Nothing left to prep.',
  "No prep needed right now - that's the goal, not a gap.",
];

/** Picks a stable line for the session's reference date rather than
 * reshuffling on every re-render. */
function pickStableLine(lines: string[], currentReferenceDate: string): string {
  return lines[new Date(currentReferenceDate).getDate() % lines.length];
}

interface MyWeekAheadProps {
  events: CalendarEvent[];
  currentReferenceDate: string;
  onSelectEvent: (eventId: string) => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  onOpenNewEventModal: () => void;
  onOpenScanAgenda: () => void;
  onUpdateMilestone?: (eventId: string, updatedMilestone: TMinusMilestone) => void;
}

const AHEAD_STYLES: Record<AheadLevel, { badge: string; dot: string; iconBg: string; border: string }> = {
  at_risk: { badge: 'text-rose-800 bg-rose-100 border-rose-300', dot: 'bg-rose-500', iconBg: 'bg-rose-100 text-rose-700', border: 'border-l-rose-500' },
  attention: { badge: 'text-amber-900 bg-amber-100 border-amber-300', dot: 'bg-amber-500', iconBg: 'bg-amber-100 text-amber-700', border: 'border-l-amber-500' },
  on_track: { badge: 'text-emerald-900 bg-emerald-100 border-emerald-300', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500' },
  ahead: { badge: 'text-emerald-900 bg-emerald-100 border-emerald-300', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500' },
  not_yet_due: { badge: 'text-indigo-900 bg-indigo-100 border-indigo-300', dot: 'bg-indigo-400', iconBg: 'bg-indigo-100 text-indigo-700', border: 'border-l-indigo-400' },
  ready: { badge: 'text-slate-700 bg-slate-100 border-slate-300', dot: 'bg-slate-400', iconBg: 'bg-slate-100 text-slate-500', border: 'border-l-slate-300' },
};

// Ring colour follows the week's actual progress: amber for the first
// third, sage in the middle, the app's green once two thirds are done.
const PROGRESS_COLORS: Record<WeekProgress['tone'], string> = {
  low: '#d97706',
  mid: '#6fa596',
  high: '#447463',
  done: '#447463',
};

/** Done / total of this week's work, as a ring whose fill and colour are the real progress. */
const WeekProgressRing: React.FC<{ progress: WeekProgress }> = ({ progress }) => {
  const size = 52;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = PROGRESS_COLORS[progress.tone];
  const label = progress.total === 0 ? 'Nothing due this week' : `${progress.done} of ${progress.total} done this week`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label} title={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6ebf0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress.ratio)}
          style={{ transition: 'stroke-dashoffset 400ms ease, stroke 400ms ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-900">
        {progress.tone === 'done' ? <Check className="w-5 h-5 stroke-[3]" style={{ color }} /> : `${progress.done}/${progress.total}`}
      </span>
    </div>
  );
};

/**
 * The task's own topic - shown on every single row, clustered or not, so a
 * task never loses its category just because it's standing alone (only a
 * 2+ item cluster used to carry a visible label).
 */
const ThemeTag: React.FC<{ theme: ActionTheme }> = ({ theme }) => {
  const Icon = THEME_ICONS[theme];
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full mt-0.5 max-w-full">
      <Icon className="w-2.5 h-2.5 shrink-0" />
      <span className="truncate">{THEME_LABELS[theme]}</span>
    </span>
  );
};

/**
 * A compact "move this to tomorrow / next week" menu for an overdue item -
 * softening the status logic doesn't help much if clearing an overdue
 * item still requires navigating away to the full event view.
 */
const RescheduleMenu: React.FC<{ onReschedule: (target: 'tomorrow' | 'next_week') => void }> = ({ onReschedule }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
        title="Reschedule"
      >
        <CalendarClock className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          {/* Click-outside catcher, behind the menu itself. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-lg shadow-md py-1 w-36">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReschedule('tomorrow');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Move to tomorrow
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReschedule('next_week');
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Move to next week
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const MilestoneListRow: React.FC<{ item: UpcomingMilestoneItem; onSelectEvent: (eventId: string) => void; overdue?: boolean }> = ({
  item,
  onSelectEvent,
  overdue,
}) => (
  <button
    type="button"
    onClick={() => onSelectEvent(item.eventId)}
    className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80 transition-all cursor-pointer"
  >
    <div className="min-w-0 flex-1">
      <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{item.title}</p>
      <p className="text-[11px] text-slate-400 truncate">{item.eventTitle}</p>
      <ThemeTag theme={item.theme} />
    </div>
    <span
      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
        overdue ? 'text-rose-800 bg-rose-100' : 'text-slate-500 bg-slate-100'
      }`}
    >
      {item.dueLabel}
    </span>
  </button>
);

/**
 * Compacts tminusRules.ts's overdue phrasing ("Overdue by 4 days") down to
 * "4d" for the flat milestone rows, where the full title and event name
 * already take priority over this badge for the row's limited width -
 * already-compact forms ("2mo 3d", "Overdue just now") pass through
 * unchanged since none of the patterns below match them.
 */
function formatCompactOverdueLabel(label: string): string {
  if (label === 'Overdue just now') return 'Just now';
  return label
    .replace(/^Overdue by /, '')
    .replace(/\s*months?\b/, 'mo')
    .replace(/\s*days?\b/, 'd')
    .replace(/\s*hours?\b/, 'h')
    .replace(/\s*mins?\b/, 'm');
}

/**
 * A single milestone row with a complete-checkbox, used where every task
 * must stay individually visible and in full detail rather than folded
 * into a topic - Overdue and This week, the "what should I focus on right
 * now" zone.
 */
const FlatMilestoneRow: React.FC<{
  item: UpcomingMilestoneItem;
  onSelectEvent: (eventId: string) => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  overdue?: boolean;
  onReschedule?: (target: 'tomorrow' | 'next_week') => void;
}> = ({ item, onSelectEvent, onToggleMilestoneStatus, overdue, onReschedule }) => {
  // Checking a task off used to just vanish it from the list the instant
  // you clicked - the state update and the list re-filtering both happen
  // in the same tick, so there was no visible confirmation the click had
  // registered before the row was simply gone. This holds the row on
  // screen just long enough to show a filled checkmark first, then fires
  // the real (list-removing) toggle.
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = () => {
    if (isChecking) return;
    setIsChecking(true);
    window.setTimeout(() => {
      onToggleMilestoneStatus(item.eventId, item.milestoneId);
    }, 500);
  };

  return (
  <div
    className={`flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50/60 transition-opacity duration-300 ${isChecking ? 'opacity-50' : ''} ${
      overdue ? 'shadow-[inset_3px_0_0_#fb7185]' : ''
    }`}
  >
    <button
      type="button"
      onClick={handleCheck}
      disabled={isChecking}
      className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-all duration-200 ${
        isChecking
          ? 'bg-emerald-500 border-emerald-500 text-white scale-125 cursor-default'
          : 'border-slate-300 hover:border-[#182A42] text-transparent hover:text-slate-400 cursor-pointer'
      }`}
      title="Mark as complete"
    >
      <Check className="w-2.5 h-2.5 stroke-[3]" />
    </button>
    {/* The full milestone title and event name are the whole point of this
        row - they take priority over everything else here. The due-by
        badge moved to its own line below rather than crowd the title (see
        the earlier fix), the topic tag is gone entirely now (one more
        thing competing for the same line as the event name), and the
        overdue copy is compacted to "4d" instead of "Overdue by 4 days" -
        in that order, freeing space for the title/event first before
        trimming anything else. Both lines wrap instead of truncating, so
        a genuinely long title still shows in full, just taller. */}
    <button type="button" onClick={() => onSelectEvent(item.eventId)} className="min-w-0 flex-1 text-left cursor-pointer">
      <p className="text-xs sm:text-sm font-semibold text-slate-800">{item.title}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <p className="text-[11px] text-slate-400 min-w-0 flex-1">{item.eventTitle}</p>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
            overdue ? 'text-rose-800 bg-rose-100' : item.diffDays === 0 ? 'text-white bg-[#182A42]' : 'text-slate-500 bg-slate-100'
          }`}
        >
          {overdue ? formatCompactOverdueLabel(item.dueLabel) : item.dueLabel}
        </span>
      </div>
    </button>
    {overdue && onReschedule && <RescheduleMenu onReschedule={onReschedule} />}
  </div>
  );
};

/**
 * Renders one MilestoneCluster: a lone item is normally just a plain row,
 * while a real cluster (2+ items sharing a theme, e.g. four separate "send
 * invitations" tasks) becomes an expandable "Calls and confirmations (4)"
 * card - the "batch similar tasks together" view, now built into every
 * section that lists milestones instead of being a separate, easy-to-miss
 * one. forceTopicView overrides the lone-item case (see WeekBucketCard):
 * far-out weeks always fold every task into a named topic, even a topic of
 * one, so a week that's still 6 months away doesn't read as a denser wall
 * of individual tasks than the near-term weeks right above it.
 */
const MilestoneClusterCard: React.FC<{
  cluster: MilestoneCluster;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectEvent: (eventId: string) => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  overdue?: boolean;
  forceTopicView?: boolean;
}> = ({ cluster, isOpen, onToggleOpen, onSelectEvent, onToggleMilestoneStatus, overdue, forceTopicView }) => {
  if (cluster.items.length === 1 && !forceTopicView) {
    return <MilestoneListRow item={cluster.items[0]} onSelectEvent={onSelectEvent} overdue={overdue} />;
  }

  const Icon = THEME_ICONS[cluster.theme];
  // cluster.label is the theme label for a real (2+ item) cluster already,
  // but a solo entry's label is that one item's own title (see
  // clusterMilestoneItemsByTheme) - reading THEME_LABELS directly here
  // instead makes both cases show an actual topic name in the header, not
  // the task's own title standing in for one.
  const topicLabel = THEME_LABELS[cluster.theme];

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full text-left p-3 hover:bg-slate-50/80 transition-all flex items-center gap-3 cursor-pointer"
      >
        <Icon className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-slate-900">{topicLabel}</p>
          <p className="text-[11px] text-slate-500 truncate">{cluster.items.length} item{cluster.items.length === 1 ? '' : 's'}</p>
        </div>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${
            overdue ? 'text-rose-800 bg-rose-100 border-rose-200' : 'text-slate-700 bg-slate-100 border-slate-200'
          }`}
        >
          {cluster.items.length}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {cluster.items.map((item) => (
            <ClusterMilestoneRow
              key={item.milestoneId}
              item={item}
              onSelectEvent={onSelectEvent}
              onToggleMilestoneStatus={onToggleMilestoneStatus}
              overdue={overdue}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * One task inside an expanded topic cluster - split out from
 * MilestoneClusterCard so it can hold its own "just checked" animation
 * state per item (a fill-then-remove beat, same as FlatMilestoneRow's),
 * instead of the checkbox instantly vanishing the row the moment it's
 * clicked with no visible confirmation.
 */
const ClusterMilestoneRow: React.FC<{
  item: UpcomingMilestoneItem;
  onSelectEvent: (eventId: string) => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  overdue?: boolean;
}> = ({ item, onSelectEvent, onToggleMilestoneStatus, overdue }) => {
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = () => {
    if (isChecking) return;
    setIsChecking(true);
    window.setTimeout(() => {
      onToggleMilestoneStatus(item.eventId, item.milestoneId);
    }, 500);
  };

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50/60 transition-opacity duration-300 ${isChecking ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={handleCheck}
        disabled={isChecking}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all duration-200 ${
          isChecking
            ? 'bg-emerald-500 border-emerald-500 text-white scale-125 cursor-default'
            : 'border-slate-300 hover:border-[#182A42] text-transparent hover:text-slate-400 cursor-pointer'
        }`}
        title="Mark as complete"
      >
        <Check className="w-2.5 h-2.5 stroke-[3]" />
      </button>
      <button type="button" onClick={() => onSelectEvent(item.eventId)} className="min-w-0 flex-1 text-left cursor-pointer">
        <p className="text-xs font-semibold text-slate-800 truncate">{item.title}</p>
        <p className="text-[10px] text-slate-400 truncate">{item.eventTitle}</p>
      </button>
      <span
        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
          overdue ? 'text-rose-800 bg-rose-100' : 'text-slate-500 bg-slate-100'
        }`}
      >
        {overdue ? formatCompactOverdueLabel(item.dueLabel) : item.dueLabel}
      </span>
    </div>
  );
};

/**
 * One week of the "Looking ahead" preview, collapsed by default to just its
 * label and item count - opening it reveals the theme-clustered cards
 * (which each open further to individual tasks). Three levels of fold in
 * total: week -> topic -> task, so the calmer, further-out weeks stay out
 * of the way until the user actually wants to look.
 */
const WeekBucketCard: React.FC<{
  bucket: WeeklyMilestoneBucket;
  isOpen: boolean;
  onToggleOpen: () => void;
  expandedClusterKey: string | null;
  onToggleCluster: (key: string) => void;
  onSelectEvent: (eventId: string) => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
}> = ({ bucket, isOpen, onToggleOpen, expandedClusterKey, onToggleCluster, onSelectEvent, onToggleMilestoneStatus }) => {
  // bucket.key is "week-N" (see computeWeeklyMilestonePreview) - week 0 is
  // "This week" and never reaches here (MyWeekAhead filters it into its own
  // section), so N>=3 here means the bucket is showing "In 4 weeks" or
  // later: more than 3 weeks out. Beyond that horizon, force every task
  // into a named topic (even a topic of one) rather than a flat row, so a
  // week 6 months away doesn't read as MORE granular/denser than the
  // weeks right above it - the opposite of how "further out" should feel.
  const weekIndex = Number(bucket.key.slice('week-'.length));
  const isFarFuture = Number.isFinite(weekIndex) && weekIndex >= 3;

  return (
  <div className="rounded-xl bg-white/[0.04] border border-white/10 overflow-hidden">
    <button type="button" onClick={onToggleOpen} aria-expanded={isOpen} className="w-full text-left px-3.5 py-2.5 hover:bg-white/[0.05] transition-all flex items-center gap-3 cursor-pointer">
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-semibold text-slate-200">{bucket.label}</p>
        <p className="text-[11px] text-slate-400 truncate">
          {bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}
        </p>
      </div>
      <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">{bucket.items.length}</span>
      <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>

    {isOpen && (
      <div className="border-t border-white/10 p-2 space-y-2">
        {bucket.clusters.map((cluster) => (
          <MilestoneClusterCard
            // A real (2+ item) cluster's identity is its theme, full stop -
            // keying on cluster.items[0].milestoneId as well (the previous
            // key) meant completing whichever task happened to be first in
            // the array changed the key on every render, which made React
            // unmount and remount the entire cluster card instead of just
            // re-rendering it with one fewer item - from the user's side,
            // checking off one task inside an open topic made the WHOLE
            // topic flicker away and rebuild itself collapsed. A solo
            // (1-item) entry has no such "membership" to destabilize the
            // key, but multiple 'other'-theme solo entries can coexist, so
            // it still needs the item's own id to stay unique among them.
            key={cluster.items.length > 1 ? `theme-${cluster.theme}` : `solo-${cluster.items[0].milestoneId}`}
            cluster={cluster}
            isOpen={expandedClusterKey === `${bucket.key}-${cluster.theme}`}
            onToggleOpen={() => onToggleCluster(`${bucket.key}-${cluster.theme}`)}
            onSelectEvent={onSelectEvent}
            onToggleMilestoneStatus={onToggleMilestoneStatus}
            forceTopicView={isFarFuture}
          />
        ))}
      </div>
    )}
  </div>
  );
};

export const MyWeekAhead: React.FC<MyWeekAheadProps> = ({
  events,
  currentReferenceDate,
  onSelectEvent,
  onToggleMilestoneStatus,
  onOpenNewEventModal,
  onOpenScanAgenda,
  onUpdateMilestone,
}) => {
  const [expandedClusterKey, setExpandedClusterKey] = useState<string | null>(null);
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  // What the page shows (past events and duplicate trip tasks left out);
  // updates always go to the real event data in `liveEvents`.
  const liveEvents = events.filter((e) => e.status !== 'completed');
  const activeEvents = prepareWeekViewEvents(liveEvents, currentReferenceDate);

  if (activeEvents.length === 0) {
    const line = pickStableLine(EMPTY_WEEK_LINES, currentReferenceDate);
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full milky-glass border border-white/80 rounded-3xl p-6 text-center shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-4 shadow-xs">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <h3 className="text-base sm:text-lg font-black text-slate-900 mb-6 max-w-xs leading-snug">{line}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNewEventModal}
            className="bg-[#182A42] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm shadow-slate-900/25 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Event</span>
          </button>
          <button
            onClick={onOpenScanAgenda}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
          >
            <Search className="w-4 h-4 text-slate-500" />
            <span>Scan your agenda</span>
          </button>
        </div>
      </div>
    );
  }

  const simpleStatus = computeSimpleAheadStatus(activeEvents, currentReferenceDate);
  const overdueItems = computeOverdueMilestones(activeEvents, currentReferenceDate);
  const catchUpGroups = computeCatchUpGroups(activeEvents, currentReferenceDate);

  // "Already done" / "Plan the rest" for a catch-up card (see CatchUpCard).
  const markCatchUpDone = (eventId: string, milestoneIds: string[]) => {
    if (!onUpdateMilestone) return;
    const event = liveEvents.find((e) => e.id === eventId);
    const completedAt = new Date().toISOString();
    for (const id of milestoneIds) {
      const milestone = event?.milestones?.find((m) => m.id === id);
      if (milestone) onUpdateMilestone(eventId, { ...milestone, status: 'completed', completedAt });
    }
  };
  const planCatchUpRest = (eventId: string, milestoneIds: string[]) => {
    if (!onUpdateMilestone) return;
    const event = liveEvents.find((e) => e.id === eventId);
    if (!event) return;
    const dates = spreadCatchUpDates(milestoneIds.length, event.eventDate, currentReferenceDate);
    milestoneIds.forEach((id, index) => {
      const milestone = event.milestones?.find((m) => m.id === id);
      if (milestone) onUpdateMilestone(eventId, { ...milestone, calculatedDate: dates[index] });
    });
  };
  // "Looking ahead" only looks 4 weeks out - far enough to plan against,
  // not so far it turns into an undifferentiated backlog.
  const weeklyPreview = computeWeeklyMilestonePreview(activeEvents, currentReferenceDate, { weeks: 4 });
  // Week 0 ("This week") is deliberately flat, not folded into topics -
  // same reasoning as overdueItems: this is the "focus on this now" zone,
  // where a collapsed cluster would hide the detail that matters most.
  const thisWeekBucket = weeklyPreview.find((bucket) => bucket.key === 'week-0');
  const futureBuckets = weeklyPreview.filter((bucket) => bucket.key !== 'week-0');

  const handleReschedule = (item: UpcomingMilestoneItem, target: 'tomorrow' | 'next_week') => {
    if (!onUpdateMilestone) return;
    const event = liveEvents.find((e) => e.id === item.eventId);
    const milestone = event?.milestones?.find((m) => m.id === item.milestoneId);
    if (!milestone) return;

    const newDate = new Date(currentReferenceDate);
    newDate.setDate(newDate.getDate() + (target === 'tomorrow' ? 1 : 7));
    // Midday: a date-only value is midnight UTC, which reads as "Due today" for tomorrow.
    onUpdateMilestone(item.eventId, { ...milestone, calculatedDate: `${newDate.toISOString().slice(0, 10)}T12:00:00.000Z` });
  };
  // Nothing overdue and nothing due this week - the "focus on now" zone is
  // genuinely empty, so say so instead of leaving a silent gap before
  // "Looking ahead".
  const isFocusZoneClear = overdueItems.length === 0 && !thisWeekBucket && catchUpGroups.length === 0;

  const perEvent = sortEventsUpcomingFirst(activeEvents, currentReferenceDate).map((event) => ({
    event,
    status: computeAheadStatus(event, currentReferenceDate),
  }));

  // computeAheadStatus deliberately gives a 0-milestone event the same
  // 'ready' level as a genuinely fully-completed one ("nothing left to
  // prepare" reads the same either way to that function) - but on THIS
  // page, "Already ahead" specifically means "you did the prep", and an
  // event that never got any milestones hasn't earned that, it just has
  // nothing to show here at all. Excluding totalCount === 0 here (rather
  // than changing computeAheadStatus's own shared classification, which
  // other callers/tests rely on) keeps this a display-only fix.
  // An event that's over isn't "ahead" of anything anymore.
  const alreadyAhead = perEvent.filter(
    (e) => !isEventOver(e.event, currentReferenceDate) && (e.status.level === 'ahead' || (e.status.level === 'ready' && e.status.totalCount > 0))
  );

  const weekProgress = computeWeekProgress(activeEvents, currentReferenceDate, overdueItems.length + (thisWeekBucket?.items.length ?? 0));
  const bandClass = 'flex items-center justify-between gap-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider';
  const quietTitle = 'flex items-center justify-between gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400';

  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto space-y-5 pb-4">
        {/* Focus: one white card on the navy page with everything that needs
            doing now - the week's status and progress, catch up, overdue and
            this week. White on navy is the strongest contrast in the app, so
            it is what the eye finds first; everything further out below is
            deliberately quiet. */}
        <section className="bg-white rounded-3xl shadow-lg shadow-black/25 overflow-hidden" aria-label="This week">
          <div className="flex items-center gap-3.5 px-4 py-4 border-b border-slate-100">
            <WeekProgressRing progress={weekProgress} />
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">{simpleStatus.label}</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                {simpleStatus.sub}
                {weekProgress.done > 0 && ` · ${weekProgress.done} done`}
              </p>
            </div>
          </div>

          {/* Catch up - tasks that were due before their event was even
              added (an agenda imported a few weeks ahead). Not overdue: a
              one-time "already done?" check per event, so a new user's first
              view isn't a wall of red. */}
          {catchUpGroups.length > 0 && onUpdateMilestone && (
            <>
              <div className={`${bandClass} bg-amber-50 text-amber-800`}>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Catch up
                </span>
                <span className="font-mono">{catchUpGroups.length}</span>
              </div>
              <div className="p-3 space-y-2">
                {catchUpGroups.map((group) => (
                  <CatchUpCard
                    key={group.eventId}
                    eventTitle={group.eventTitle}
                    eventDate={group.eventDate}
                    items={group.items}
                    onSelectEvent={() => onSelectEvent(group.eventId)}
                    onMarkDone={(ids) => markCatchUpDone(group.eventId, ids)}
                    onPlanRest={(ids) => planCatchUpRest(group.eventId, ids)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Overdue - every overdue task, in full (never folded into a topic). */}
          {overdueItems.length > 0 && (
            <>
              <div className={`${bandClass} bg-rose-50 text-rose-700`}>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Overdue
                </span>
                <span className="font-mono">{overdueItems.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {overdueItems.map((item) => (
                  <FlatMilestoneRow
                    key={item.milestoneId}
                    item={item}
                    overdue
                    onSelectEvent={onSelectEvent}
                    onToggleMilestoneStatus={onToggleMilestoneStatus}
                    onReschedule={onUpdateMilestone ? (target) => handleReschedule(item, target) : undefined}
                  />
                ))}
              </div>
            </>
          )}

          {/* This week - same flat, detailed rows right after Overdue. */}
          {thisWeekBucket && (
            <>
              <div className={`${bandClass} bg-slate-50 text-slate-500 border-t border-slate-100`}>
                <span>This week</span>
                <span className="font-mono">{thisWeekBucket.items.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {thisWeekBucket.items.map((item) => (
                  <FlatMilestoneRow key={item.milestoneId} item={item} onSelectEvent={onSelectEvent} onToggleMilestoneStatus={onToggleMilestoneStatus} />
                ))}
              </div>
            </>
          )}

          {isFocusZoneClear && (
            <p className="px-4 py-5 text-sm font-bold text-slate-700 text-center">{pickStableLine(EMPTY_WEEK_LINES, currentReferenceDate)}</p>
          )}
        </section>

        {/* Looking ahead - quiet rows straight on the navy, like Active
            Events: week (label + count) -> topic -> task, all folded until
            opened, so it reads as optional planning, not more to-dos. */}
        {futureBuckets.length > 0 && (
          <section className="space-y-2" aria-label="Looking ahead">
            <div className={quietTitle}>
              <h3>Looking ahead</h3>
              <span className="font-mono">{futureBuckets.reduce((sum, b) => sum + b.items.length, 0)}</span>
            </div>
            {futureBuckets.map((bucket) => (
              <WeekBucketCard
                key={bucket.key}
                bucket={bucket}
                isOpen={expandedWeekKey === bucket.key}
                onToggleOpen={() => setExpandedWeekKey(expandedWeekKey === bucket.key ? null : bucket.key)}
                expandedClusterKey={expandedClusterKey}
                onToggleCluster={(key) => setExpandedClusterKey(expandedClusterKey === key ? null : key)}
                onSelectEvent={onSelectEvent}
                onToggleMilestoneStatus={onToggleMilestoneStatus}
              />
            ))}
          </section>
        )}

        {/* Already ahead - also quiet */}
        {alreadyAhead.length > 0 && (
          <section className="space-y-2" aria-label="Already ahead">
            <div className={quietTitle}>
              <h3 className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-aot-sage" />
                Already ahead
              </h3>
              <span className="font-mono">{alreadyAhead.length}</span>
            </div>
            {alreadyAhead.map(({ event, status }) => (
              <EventRow key={event.id} event={event} status={status} currentReferenceDate={currentReferenceDate} onSelectEvent={onSelectEvent} />
            ))}
          </section>
        )}

        <button
          type="button"
          onClick={onOpenNewEventModal}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white py-2.5 rounded-xl border border-dashed border-white/20 hover:border-white/40 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
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
}> = ({ event, status, currentReferenceDate, onSelectEvent }) => {
  const countdown = getCountdownStatus(event.eventDate, currentReferenceDate);
  return (
    <button
      type="button"
      onClick={() => onSelectEvent(event.id)}
      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all flex items-center gap-3 cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-semibold text-slate-200 truncate">{event.title}</p>
        <p className="text-[11px] text-slate-400">
          {formatDisplayDate(event.eventDate)} · {countdown.label}
        </p>
      </div>
      <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
        {status.completedCount}/{status.totalCount}
      </span>
    </button>
  );
};

export default MyWeekAhead;
