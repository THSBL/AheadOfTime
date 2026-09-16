import React, { useState } from 'react';
import { Sparkles, ArrowRight, Plus, Check, CheckCircle2, Calendar as CalendarIcon, FileText, Gift, DollarSign, Truck, PhoneCall, Layers, ChevronDown, Search } from 'lucide-react';
import { CalendarEvent } from '../types';
import { formatDisplayDate, getCountdownStatus, sortEventsUpcomingFirst } from '../utils/tminusRules';
import {
  computeNextBestAction,
  computeAheadStatus,
  computeSimpleAheadStatus,
  computeUpcomingMilestones,
  computeOverdueMilestones,
  computeWeeklyMilestonePreview,
  isNextBestActionThisWeek,
  AheadLevel,
  ActionTheme,
  SimpleAheadLevel,
  UpcomingMilestoneItem,
  MilestoneCluster,
} from '../utils/readiness';

const THEME_ICONS: Record<ActionTheme, React.ElementType> = {
  documents: FileText,
  packing: Layers,
  gifts: Gift,
  money: DollarSign,
  logistics: Truck,
  calls_confirmations: PhoneCall,
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
}

const AHEAD_STYLES: Record<AheadLevel, { badge: string; dot: string; iconBg: string; border: string }> = {
  at_risk: { badge: 'text-rose-800 bg-rose-100 border-rose-300', dot: 'bg-rose-500', iconBg: 'bg-rose-100 text-rose-700', border: 'border-l-rose-500' },
  attention: { badge: 'text-amber-900 bg-amber-100 border-amber-300', dot: 'bg-amber-500', iconBg: 'bg-amber-100 text-amber-700', border: 'border-l-amber-500' },
  on_track: { badge: 'text-emerald-900 bg-emerald-100 border-emerald-300', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500' },
  ahead: { badge: 'text-emerald-900 bg-emerald-100 border-emerald-300', dot: 'bg-emerald-500', iconBg: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500' },
  not_yet_due: { badge: 'text-indigo-900 bg-indigo-100 border-indigo-300', dot: 'bg-indigo-400', iconBg: 'bg-indigo-100 text-indigo-700', border: 'border-l-indigo-400' },
  ready: { badge: 'text-slate-700 bg-slate-100 border-slate-300', dot: 'bg-slate-400', iconBg: 'bg-slate-100 text-slate-500', border: 'border-l-slate-300' },
};

// Same converging-runway-stripe motif as the app logo, repurposed as a
// "how far ahead are you" gauge: stripes fill from the bottom (now) upward,
// in the status color, so the shape that's already the brand's own visual
// language for "ahead of time" carries the meaning instead of a generic icon.
const RUNWAY_STRIPE_POINTS = [
  '38,24 102,24 94,6 46,6', // top, narrowest
  '24,46 116,46 106,28 34,28', // middle
  '10,68 130,68 118,50 22,50', // bottom, widest
];

const RUNWAY_FILLED_COUNT: Record<SimpleAheadLevel, number> = { ahead: 3, almost_ahead: 2, behind: 1 };

const SIMPLE_STATUS_STYLES: Record<SimpleAheadLevel, { fill: string; iconBg: string; cardBg: string; cardBorder: string }> = {
  ahead: { fill: '#059669', iconBg: 'bg-emerald-100', cardBg: 'bg-emerald-50/70', cardBorder: 'border-emerald-200' },
  almost_ahead: { fill: '#d97706', iconBg: 'bg-amber-100', cardBg: 'bg-amber-50/70', cardBorder: 'border-amber-200' },
  behind: { fill: '#e11d48', iconBg: 'bg-rose-100', cardBg: 'bg-rose-50/70', cardBorder: 'border-rose-200' },
};

const RunwayStripes: React.FC<{ level: SimpleAheadLevel; className?: string }> = ({ level, className }) => {
  const filledCount = RUNWAY_FILLED_COUNT[level];
  const filledColor = SIMPLE_STATUS_STYLES[level].fill;
  return (
    <svg viewBox="0 0 140 70" className={className} aria-hidden="true">
      {RUNWAY_STRIPE_POINTS.map((points, index) => {
        // index 0 is the top (narrowest) stripe; fill from the bottom up.
        const isFilled = index >= RUNWAY_STRIPE_POINTS.length - filledCount;
        return <polygon key={index} points={points} fill={isFilled ? filledColor : '#e2e8f0'} />;
      })}
    </svg>
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
 * Renders one MilestoneCluster: a lone item (or an 'other' item, too
 * generic to name as a group) is just a plain row, while a real cluster
 * (2+ items sharing a theme, e.g. four separate "send invitations" tasks)
 * becomes an expandable "Calls and confirmations (4)" card - the "batch
 * similar tasks together" view, now built into every section that lists
 * milestones instead of being a separate, easy-to-miss one.
 */
const MilestoneClusterCard: React.FC<{
  cluster: MilestoneCluster;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectEvent: (eventId: string) => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  overdue?: boolean;
}> = ({ cluster, isOpen, onToggleOpen, onSelectEvent, onToggleMilestoneStatus, overdue }) => {
  if (cluster.items.length === 1) {
    return <MilestoneListRow item={cluster.items[0]} onSelectEvent={onSelectEvent} overdue={overdue} />;
  }

  const Icon = THEME_ICONS[cluster.theme];

  return (
    <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        className="w-full text-left p-3 hover:bg-slate-50/80 transition-all flex items-center gap-3 cursor-pointer"
      >
        <Icon className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-slate-900">{cluster.label}</p>
          <p className="text-[11px] text-slate-500 truncate">{cluster.items.length} items</p>
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
            <div key={item.milestoneId} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50/60">
              <button
                type="button"
                onClick={() => onToggleMilestoneStatus(item.eventId, item.milestoneId)}
                className="w-4 h-4 rounded border border-slate-300 hover:border-[#182A42] flex items-center justify-center shrink-0 cursor-pointer text-transparent hover:text-slate-400 transition-colors"
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
                {item.dueLabel}
              </span>
            </div>
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
}) => {
  const [expandedClusterKey, setExpandedClusterKey] = useState<string | null>(null);
  const activeEvents = events.filter((e) => e.status !== 'completed');

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
  const nextBestAction = computeNextBestAction(activeEvents, currentReferenceDate);
  const overdueClusters = computeOverdueMilestones(activeEvents, currentReferenceDate);
  const weeklyPreview = computeWeeklyMilestonePreview(activeEvents, currentReferenceDate);
  // Aligned to the 4-week (28-day) horizon computeWeeklyMilestonePreview
  // covers above, so nothing falls into a gap between the two: further
  // means "beyond week 4", not "beyond a mismatched 30-day cutoff".
  const upcoming = computeUpcomingMilestones(activeEvents, currentReferenceDate, { nextMonthDays: 27 });
  const workAheadItems = upcoming.further.filter((item) => item.importance !== 'routine').slice(0, 4);

  const perEvent = sortEventsUpcomingFirst(activeEvents, currentReferenceDate).map((event) => ({
    event,
    status: computeAheadStatus(event, currentReferenceDate),
  }));

  const needsAttention = perEvent.filter((e) => e.status.level === 'at_risk' || e.status.level === 'attention');
  const alreadyAhead = perEvent.filter((e) => e.status.level === 'ahead' || e.status.level === 'ready');

  const simpleStyle = SIMPLE_STATUS_STYLES[simpleStatus.level];

  return (
    <div className="flex-1 flex flex-col h-full milky-glass rounded-3xl overflow-hidden shadow-xs w-full">
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
        {/* Confirmation - one clean, non-contradictory read of "am I ahead?",
            with the logo's own runway-stripe motif as the "how far ahead"
            gauge: more stripes filled (in the status color) means more
            clear. */}
        <div className={`p-4 sm:p-5 rounded-2xl border shadow-xs flex items-center gap-4 ${simpleStyle.cardBg} ${simpleStyle.cardBorder}`}>
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 p-3 ${simpleStyle.iconBg}`}>
            <RunwayStripes level={simpleStatus.level} className="w-full h-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="text-base sm:text-xl font-black text-slate-900 leading-tight">{simpleStatus.label}</h2>
            <p className="text-xs sm:text-sm text-slate-600">{simpleStatus.sub}</p>
          </div>
        </div>

        {/* Overdue - every overdue milestone, not just the single most
            urgent one. The top card's "N tasks are overdue" needs N
            visible, clickable items behind it, not one highlighted action
            that leaves the rest invisible. Grouped by theme like every
            other list here. */}
        {overdueClusters.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-rose-700 px-1">
              Overdue ({overdueClusters.reduce((sum, c) => sum + c.items.length, 0)})
            </h3>
            <div className="space-y-2">
              {overdueClusters.map((cluster) => (
                <MilestoneClusterCard
                  key={cluster.theme + cluster.items[0].milestoneId}
                  cluster={cluster}
                  overdue
                  isOpen={expandedClusterKey === `overdue-${cluster.theme}`}
                  onToggleOpen={() =>
                    setExpandedClusterKey(expandedClusterKey === `overdue-${cluster.theme}` ? null : `overdue-${cluster.theme}`)
                  }
                  onSelectEvent={onSelectEvent}
                  onToggleMilestoneStatus={onToggleMilestoneStatus}
                />
              ))}
            </div>
          </div>
        )}

        {/* Next Best Action - only shown when nothing is overdue (the
            Overdue list above covers that case) and something not-yet-late
            is still due this week. A future item with no real urgency used
            to render here anyway ("Looking further ahead") even when the
            top card already said everything was clear - that's moved to
            "Want to get further ahead?" below instead. */}
        {nextBestAction && !nextBestAction.isOverdue && isNextBestActionThisWeek(nextBestAction) && (
          <button
            type="button"
            onClick={() => onSelectEvent(nextBestAction.eventId)}
            className={`w-full text-left p-4 sm:p-5 rounded-2xl border shadow-xs transition-all hover:shadow-md active:scale-[0.99] cursor-pointer ${
              nextBestAction.importance === 'critical' ? 'bg-amber-50/80 border-amber-200' : 'bg-sky-50/70 border-sky-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Next best action</p>
                <p className="text-sm sm:text-base font-black text-slate-900 truncate">{nextBestAction.title}</p>
                <p className="text-xs text-slate-600">{nextBestAction.reason}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full text-slate-700 bg-white border border-slate-200">
                  {nextBestAction.dueLabel}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </button>
        )}

        {/* Weekly preview - a rolling, week-by-week look at what's still
            outstanding (This week / Next week / In 3 weeks / In 4 weeks),
            each week grouped by theme so similar tasks (e.g. four separate
            "send invitations" items) batch together instead of listing
            separately. Seeing it broken out by week - rather than one flat
            "coming up" pile - makes the plan feel concrete further out. */}
        {weeklyPreview.map((bucket) => (
          <div key={bucket.key} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">{bucket.label}</h3>
            <div className="space-y-2">
              {bucket.clusters.map((cluster) => (
                <MilestoneClusterCard
                  key={cluster.theme + cluster.items[0].milestoneId}
                  cluster={cluster}
                  isOpen={expandedClusterKey === `${bucket.key}-${cluster.theme}`}
                  onToggleOpen={() =>
                    setExpandedClusterKey(
                      expandedClusterKey === `${bucket.key}-${cluster.theme}` ? null : `${bucket.key}-${cluster.theme}`
                    )
                  }
                  onSelectEvent={onSelectEvent}
                  onToggleMilestoneStatus={onToggleMilestoneStatus}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Want to get further ahead? - important items beyond the 4-week
            preview above, framed as an opportunity to tackle now rather
            than a pending obligation. */}
        {workAheadItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Want to get further ahead?</h3>
            <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
              {workAheadItems.map((item) => (
                <MilestoneListRow key={item.milestoneId} item={item} onSelectEvent={onSelectEvent} />
              ))}
            </div>
          </div>
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
      className={`w-full text-left p-3 rounded-xl bg-white border border-slate-200/90 border-l-4 ${style.border} hover:border-slate-300 shadow-2xs transition-all flex items-center gap-3 cursor-pointer ${
        compact ? 'opacity-80' : ''
      }`}
    >
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
