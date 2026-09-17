import React, { useState } from 'react';
import { Sparkles, Plus, Check, CheckCircle2, Calendar as CalendarIcon, FileText, Gift, Plane, ClipboardList, PhoneCall, Layers, ChevronDown, Search, CalendarClock, Clock } from 'lucide-react';
import { CalendarEvent, TMinusMilestone } from '../types';
import { formatDisplayDate, getCountdownStatus, sortEventsUpcomingFirst } from '../utils/tminusRules';
import {
  computeAheadStatus,
  computeSimpleAheadStatus,
  computeOverdueMilestones,
  computeWeeklyMilestonePreview,
  AheadLevel,
  ActionTheme,
  SimpleAheadLevel,
  UpcomingMilestoneItem,
  MilestoneCluster,
  WeeklyMilestoneBucket,
  THEME_LABELS,
} from '../utils/readiness';
import { useRoad3DClipPath, ROAD_3D_BEVEL_STYLE } from '../utils/useRoad3DClipPath';

// Gentler taper than the (much narrower, taller) stripe-nav buttons on
// RecurringUserLanding - this bar is wide and short, so the same
// proportions there would look like an exaggerated wedge instead of a
// subtle flow. Corner radius/bow scaled up to match the bar's own larger
// size instead of reusing the stripes' own tuned-for-a-different-shape values.
// topInsetRatio has to be big enough that buildRoadStripeClipPath's own
// corner-radius clamp (radius <= topInset * 0.85, so two adjacent rounded
// corners can never overlap) doesn't silently cap cornerRadius far below
// what's requested here - 0.022 was so small the effective radius came out
// under 14px regardless of cornerRadius, which read as barely-rounded and
// out of step with the front page's own stripes (topInsetRatio 0.06-0.1).
// Bumped both together for real, visible rounding that's actually in line
// with them.
const AHEAD_BAR_SHAPE = { topInsetRatio: 0.05, cornerRadius: 30, bow: 14 };

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
  // Solid, not translucent (no /70 alpha) - these used to sit on top of the
  // page's own "milky-glass" panel, where a translucent pastel blended
  // invisibly into that panel's near-white backdrop. Now that each section
  // floats directly on the navy page background instead, that same
  // translucency blended into a muddy grey-navy instead of a clean pastel.
  ahead: { fill: '#059669', iconBg: 'bg-emerald-100', cardBg: 'bg-emerald-50', cardBorder: 'border-emerald-200' },
  almost_ahead: { fill: '#d97706', iconBg: 'bg-amber-100', cardBg: 'bg-amber-50', cardBorder: 'border-amber-200' },
  behind: { fill: '#e11d48', iconBg: 'bg-rose-100', cardBg: 'bg-rose-50', cardBorder: 'border-rose-200' },
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
}> = ({ item, onSelectEvent, onToggleMilestoneStatus, overdue, onReschedule }) => (
  <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-slate-50/60">
    <button
      type="button"
      onClick={() => onToggleMilestoneStatus(item.eventId, item.milestoneId)}
      className="w-4 h-4 mt-0.5 rounded border border-slate-300 hover:border-[#182A42] flex items-center justify-center shrink-0 cursor-pointer text-transparent hover:text-slate-400 transition-colors"
      title="Mark as complete"
    >
      <Check className="w-2.5 h-2.5 stroke-[3]" />
    </button>
    {/* The due-by badge used to sit inline with the title, on the same row -
        at any real width it squeezed the title down to a couple of
        truncated words before you could even tell what the task was. It
        now sits on the title's own second line instead, where it competes
        with the (less critical) event name/theme tag for space rather than
        the title itself. */}
    <button type="button" onClick={() => onSelectEvent(item.eventId)} className="min-w-0 flex-1 text-left cursor-pointer">
      <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{item.title}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <p className="text-[11px] text-slate-400 truncate min-w-0">{item.eventTitle}</p>
        <ThemeTag theme={item.theme} />
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ml-auto ${
            overdue ? 'text-rose-800 bg-rose-100' : 'text-slate-500 bg-slate-100'
          }`}
        >
          {item.dueLabel}
        </span>
      </div>
    </button>
    {overdue && onReschedule && <RescheduleMenu onReschedule={onReschedule} />}
  </div>
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
}> = ({ bucket, isOpen, onToggleOpen, expandedClusterKey, onToggleCluster, onSelectEvent, onToggleMilestoneStatus }) => (
  <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
    <button type="button" onClick={onToggleOpen} className="w-full text-left p-3 hover:bg-slate-50/80 transition-all flex items-center gap-3 cursor-pointer">
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-bold text-slate-900">{bucket.label}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {bucket.items.length} item{bucket.items.length === 1 ? '' : 's'}
        </p>
      </div>
      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full text-slate-700 bg-slate-100 border border-slate-200 shrink-0">
        {bucket.items.length}
      </span>
      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>

    {isOpen && (
      <div className="border-t border-slate-100 p-2 space-y-2 bg-slate-50/50">
        {bucket.clusters.map((cluster) => (
          <MilestoneClusterCard
            key={cluster.theme + cluster.items[0].milestoneId}
            cluster={cluster}
            isOpen={expandedClusterKey === `${bucket.key}-${cluster.theme}`}
            onToggleOpen={() => onToggleCluster(`${bucket.key}-${cluster.theme}`)}
            onSelectEvent={onSelectEvent}
            onToggleMilestoneStatus={onToggleMilestoneStatus}
          />
        ))}
      </div>
    )}
  </div>
);

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
  const overdueItems = computeOverdueMilestones(activeEvents, currentReferenceDate);
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
    const event = activeEvents.find((e) => e.id === item.eventId);
    const milestone = event?.milestones?.find((m) => m.id === item.milestoneId);
    if (!milestone) return;

    const newDate = new Date(currentReferenceDate);
    newDate.setDate(newDate.getDate() + (target === 'tomorrow' ? 1 : 7));
    onUpdateMilestone(item.eventId, { ...milestone, calculatedDate: newDate.toISOString().slice(0, 10) });
  };
  // Nothing overdue and nothing due this week - the "focus on now" zone is
  // genuinely empty, so say so instead of leaving a silent gap before
  // "Looking ahead".
  const isFocusZoneClear = overdueItems.length === 0 && !thisWeekBucket;

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
  const alreadyAhead = perEvent.filter(
    (e) => e.status.level === 'ahead' || (e.status.level === 'ready' && e.status.totalCount > 0)
  );

  const simpleStyle = SIMPLE_STATUS_STYLES[simpleStatus.level];
  const { ref: aheadBarRef, clipPath: aheadBarClipPath } = useRoad3DClipPath<HTMLDivElement>(AHEAD_BAR_SHAPE);

  return (
    <div className="flex-1 flex flex-col h-full milky-glass rounded-3xl overflow-hidden shadow-xs w-full">
      {/* Tried dropping this shared "milky-glass" backdrop in favor of
          letting the navy page show through the gaps between sections -
          it backfired: several sections (Overdue in particular) style
          their own border/text for contrast against a light backdrop, so
          against navy directly they nearly disappeared instead of standing
          out more. Restored the light backdrop; each section still keeps
          its own card/border so they read as distinct pieces within it. */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
        {/* Confirmation - one clean, non-contradictory read of "am I ahead?",
            with the logo's own runway-stripe motif as the "how far ahead"
            gauge: more stripes filled (in the status color) means more
            clear. Shares the same fake-3D "road" treatment (clip-path +
            embossed border, see useRoad3DClipPath) as RecurringUserLanding's
            stripe-nav buttons - the shape is measured from this bar's own
            (much wider) rendered size, so the same trick just stretches to
            fit instead of needing its own bespoke geometry. */}
        <div
          style={{
            // drop-shadow (not box-shadow) so it follows the bar's actual
            // clipped silhouette instead of its rectangular border-box -
            // same reasoning as the stripe buttons' own wrapper.
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.18))',
          }}
        >
          <div
            ref={aheadBarRef}
            style={{ clipPath: aheadBarClipPath, ...ROAD_3D_BEVEL_STYLE }}
            className={`p-4 sm:p-5 border text-left flex items-center gap-4 ${simpleStyle.cardBg} ${simpleStyle.cardBorder}`}>
            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 p-3 ${simpleStyle.iconBg}`}>
              <RunwayStripes level={simpleStatus.level} className="w-full h-full" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-xl font-black text-slate-900 leading-tight">{simpleStatus.label}</h2>
                {/* Pairs the problem count with a progress count, so the card
                    never reads as only bad news - per feedback, this
                    shouldn't stress people out more than necessary. */}
                {simpleStatus.completedCount > 0 && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full text-emerald-800 bg-emerald-100 shrink-0">
                    {simpleStatus.completedCount} done
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-600">{simpleStatus.sub}</p>
            </div>
          </div>
        </div>

        {/* Overdue - every overdue milestone, not just the single most
            urgent one, always shown in full detail (never folded into a
            topic) since this is exactly what the user should focus on
            right now. */}
        {overdueItems.length > 0 && (
          <div className="space-y-2">
            {/* A solid pill, not plain colored text like the other section
                headers - overdue is the one status urgent enough to
                justify breaking that pattern for real contrast (white text
                needs a solid fill behind it to stay legible). */}
            <span className="inline-flex items-center gap-1.5 bg-rose-600 text-white text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              Overdue ({overdueItems.length})
            </span>
            <div className="rounded-xl bg-white border-2 border-rose-300 shadow-2xs divide-y divide-slate-100 transition-all hover:border-rose-400 hover:ring-4 hover:ring-rose-100">
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
          </div>
        )}

        {/* This week - directly follows Overdue, same flat/detailed
            treatment, so "what's late" and "what's due this week" read as
            one continuous focus zone rather than being split across
            differently-styled sections. */}
        {thisWeekBucket && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">This week</h3>
            <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
              {thisWeekBucket.items.map((item) => (
                <FlatMilestoneRow key={item.milestoneId} item={item} onSelectEvent={onSelectEvent} onToggleMilestoneStatus={onToggleMilestoneStatus} />
              ))}
            </div>
          </div>
        )}

        {/* Nothing overdue, nothing due this week - say so, the same way
            the fully-empty-dashboard state does, instead of leaving a
            silent gap before "Looking ahead". */}
        {isFocusZoneClear && (
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs text-center">
            <p className="text-sm sm:text-base font-black text-slate-900">{pickStableLine(EMPTY_WEEK_LINES, currentReferenceDate)}</p>
          </div>
        )}

        {/* Looking ahead - everything beyond this week, nested three levels
            deep: week (collapsed to a label + item count) -> topic cluster
            -> individual task. Framed as an opportunity to get ahead rather
            than a pending obligation, so it reads as optional planning, not
            more to-dos, and stays out of the way until opened. */}
        {futureBuckets.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Looking ahead</h3>
            <div className="space-y-2">
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
      className={`w-full text-left p-3 rounded-xl border border-slate-200/90 border-l-4 ${style.border} hover:border-slate-300 shadow-2xs transition-all flex items-center gap-3 cursor-pointer ${
        // Solid bg-slate-50, not bg-white + opacity-80: whole-element
        // opacity blends with whatever sits behind it, which used to be
        // this page's own near-white "milky-glass" panel (invisible
        // effect) and is now the navy page background directly (a muddy
        // grey-navy card instead of a subtly muted white one).
        compact ? 'bg-slate-50' : 'bg-white'
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
