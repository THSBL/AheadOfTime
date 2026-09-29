import React, { useState } from 'react';
import {
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  Home,
  Cake,
  Plane,
  Music,
  CalendarDays,
  Trash2,
  CheckSquare,
  Square,
  Repeat,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { getCountdownStatus, getCleanEventTitle, getEventTopicLabel, sortEventsUpcomingFirst } from '../utils/tminusRules';
import { isPlanPushed, pendingPushItems } from '../utils/pushStatus';

interface MessengerSidebarProps {
  events: CalendarEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  currentReferenceDate: string;
  selectedEventIds: string[];
  onToggleSelectEvent: (eventId: string) => void;
  onSelectAllEvents: () => void;
  onDeselectAllEvents: () => void;
  onOpenBulkDeleteModal: () => void;
  /** Opens the push window pre-filled with these events. */
  onPushEvents?: (eventIds: string[]) => void;
  isCollapsed?: boolean;
  /**
   * Which events get the full card. 'fold': the rest sit under a closed
   * "Later (N)" section, as one-line rows (List view: the next 30 days).
   * 'compact': the rest stay in the list as one-line rows with just the
   * title (Calendar view: full cards for what's in the month/week shown).
   */
  partition?: { ids: Set<string>; mode: 'fold' | 'compact'; hiddenNote: string } | null;
  onToggleCollapse?: () => void;
}

export const MessengerSidebar: React.FC<MessengerSidebarProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  currentReferenceDate,
  selectedEventIds,
  onToggleSelectEvent,
  onSelectAllEvents,
  onDeselectAllEvents,
  onOpenBulkDeleteModal,
  onPushEvents,
  isCollapsed,
  partition,
  onToggleCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  // The legend doubles as the filter: tap "Synced" or "Pending
  // calendar yet" to show only those plans, tap again for all.
  const [pushFilter, setPushFilter] = useState<'all' | 'pushed' | 'toPush'>('all');
  const showOnlyToPush = pushFilter === 'toPush';

  const toPushCount = React.useMemo(() => events.filter((e) => !isPlanPushed(e)).length, [events]);
  const pushedCount = events.length - toPushCount;

  const filteredEvents = React.useMemo(() => {
    const matched = events.filter((e) => {
      if (pushFilter === 'toPush' && isPlanPushed(e)) return false;
      if (pushFilter === 'pushed' && !isPlanPushed(e)) return false;
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();
      const displayTitle = getCleanEventTitle(e.title, e.category, e.context).toLowerCase();
      const topicLabel = getEventTopicLabel(e.category, e.context).toLowerCase();
      const rawSnippet = (e.rawInputSnippet || '').toLowerCase();
      const dateStr = (e.eventDate || '').toLowerCase();

      return displayTitle.includes(query) ||
             topicLabel.includes(query) ||
             e.category.toLowerCase().includes(query) ||
             rawSnippet.includes(query) ||
             dateStr.includes(query);
    });

    return sortEventsUpcomingFirst(matched, currentReferenceDate);
    // Every flag read in the filter must be listed here, or toggling the
    // chip changes the chip but never re-runs the filter.
  }, [events, searchQuery, currentReferenceDate, pushFilter]);

  // What the push button pushes: the selected events, else every event,
  // keeping only plans that still have something to add.
  const pushCandidates = React.useMemo(() => {
    const pool = selectedEventIds.length > 0 ? events.filter((e) => selectedEventIds.includes(e.id)) : events;
    return pool.filter((e) => !isPlanPushed(e));
  }, [events, selectedEventIds]);
  const pushItemCount = pushCandidates.reduce((n, e) => n + pendingPushItems(e), 0);

  // Single-colour icons: the tile's colour carries the push status
  // (sage = plan in calendar, grey = still to push, white = selected).
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'birthday_party':
        return <Cake className="w-[18px] h-[18px]" />;
      case 'hosting_visitors':
        return <Home className="w-[18px] h-[18px]" />;
      case 'travel_trip':
        return <Plane className="w-[18px] h-[18px]" />;
      case 'festival_concert':
        return <Music className="w-[18px] h-[18px]" />;
      default:
        return <Calendar className="w-[18px] h-[18px]" />;
    }
  };

  // Searching or filtering shows every match.
  const partitionActive = Boolean(partition) && !searchQuery.trim() && pushFilter === 'all';
  const mainEvents = partitionActive
    ? filteredEvents.filter((e) => partition!.ids.has(e.id) || e.id === selectedEventId)
    : filteredEvents;
  const restEvents = partitionActive ? filteredEvents.filter((e) => !mainEvents.includes(e)) : [];
  const [showLater, setShowLater] = useState(false);

  const allFilteredSelected = filteredEvents.length > 0 && filteredEvents.every((e) => selectedEventIds.includes(e.id));

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center h-full bg-[#223349] border border-white/10 rounded-3xl overflow-hidden shadow-xs py-3.5 gap-3 w-14">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white shadow-xs flex items-center justify-center cursor-pointer transition-all"
          title="Expand event list"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-[#7dd3fc]" />
        </div>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/10 text-[#bae6fd] font-mono font-bold">
          {events.length}
        </span>
      </div>
    );
  }

  return (
    // A genuinely blue panel for the whole sidebar. IMPORTANT: this is a
    // raw hex, not bg-sky-*/bg-blue-*/bg-slate-* - this app's index.css
    // deliberately collapses all three of those Tailwind color families
    // onto one grey-navy neutral ramp (anchored on the same #182A42 as the
    // page background itself), so any of those class names here would
    // render as grey, not blue - confirmed live after two failed attempts
    // (sky-900 and sky-700 both rendered indistinguishable from the page
    // background). #223349 and the accent hexes below are chosen to
    // actually read as blue against this app's real theme. Every other
    // sky-*/text-sky-* accent in this file was swapped to a matching raw
    // hex for the same reason - it wasn't just the container that was
    // secretly grey.
    <div className="flex flex-col h-full bg-[#223349] border border-white/10 rounded-3xl overflow-clip shadow-xs">

      {/* Sidebar Header */}
      {/* On phones the page scrolls, so this header (with the Sync button) stays pinned to the top. */}
      <div className="sticky top-0 z-20 lg:static bg-[#223349] p-3.5 sm:p-4 border-b border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-[#7dd3fc]" />
            </div>
            <h3 className="text-sm font-bold text-white">
              Active Events
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden lg:flex p-2 rounded-full bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white shadow-xs items-center justify-center cursor-pointer transition-all"
                title="Collapse event list"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search bar pill */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="w-full bg-white/10 text-white text-xs sm:text-sm pl-9 pr-4 py-2 rounded-full border border-white/10 focus:outline-none focus:border-white/30 focus:bg-white/15 placeholder:text-slate-400"
          />
        </div>

        {/* Select All (+ Delete for a selection) and the one Sync button. */}
        {events.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={allFilteredSelected ? onDeselectAllEvents : onSelectAllEvents}
                className="text-[#bae6fd] hover:text-white font-bold flex items-center gap-1 cursor-pointer bg-white/10 hover:bg-white/15 px-2.5 py-1.5 rounded-lg"
              >
                {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                <span>{allFilteredSelected ? 'Deselect all' : 'Select all'}</span>
              </button>
              {selectedEventIds.length > 0 && (
                <button
                  onClick={onOpenBulkDeleteModal}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2.5 py-1.5 rounded-lg shadow-xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="Delete selected events"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{selectedEventIds.length}</span>
                </button>
              )}
            </div>

            {onPushEvents &&
              (pushCandidates.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onPushEvents(pushCandidates.map((e) => e.id))}
                  title={`${pushItemCount} ${pushItemCount === 1 ? 'item' : 'items'} to add to Google Calendar`}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-[#182A42] font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    Sync {pushCandidates.length}
                    {selectedEventIds.length > 0 ? ' selected' : ''} to Calendar
                  </span>
                </button>
              ) : (
                <span className="shrink-0 text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-aot-sage" />
                  {selectedEventIds.length > 0 ? 'Selection synced' : 'All synced'}
                </span>
              ))}
          </div>
        )}

        {/* The colour key is also the filter. */}
        {events.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]" role="group" aria-label="Show plans">
            {([
              { key: 'pushed', label: 'Synced', count: pushedCount, swatch: 'bg-aot-sage' },
              { key: 'toPush', label: 'Pending sync', count: toPushCount, swatch: 'bg-white/25' },
            ] as const).map((chip) => {
              const on = pushFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPushFilter(on ? 'all' : chip.key)}
                  title={on ? 'Show all plans' : `Show only plans ${chip.label.toLowerCase()}`}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-semibold cursor-pointer transition-all ${
                    on ? 'bg-white text-[#182A42]' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className={`w-3 h-3 rounded ${chip.swatch} ${on && chip.key === 'toPush' ? 'bg-slate-300' : ''}`} />
                  <span>{chip.label}</span>
                  <span className={on ? 'text-[#182A42]' : 'text-slate-400'}>· {chip.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Each event sits on a light card of its own (a faint tint of the
          panel, not the old white cards) so events stand apart; the open
          event gets a brighter outline. */}
      <div className="flex-1 overflow-y-auto py-1 space-y-1.5">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-slate-300">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="font-bold text-slate-300">No active events</p>
            <p className="text-xs text-slate-400 max-w-[200px]">Create an event or sync your Google Calendar to see your preparation runways.</p>
          </div>
        ) : (
          (() => {
            let lastMonthKey = '';
            const renderRow = (evt: CalendarEvent, compact = false) => {
            const isSelected = selectedEventId === evt.id;
            const isCheckedForBulk = selectedEventIds.includes(evt.id);
            const countdown = getCountdownStatus(evt.eventDate, currentReferenceDate);

            const displayTitle = getCleanEventTitle(evt.title, evt.category, evt.context);
            const topicLabel = getEventTopicLabel(evt.category, evt.context);

            const planPushed = isPlanPushed(evt);

            // Month section header - only when the month actually changes
            // from the previous (already date-sorted) event, so scanning a
            // list spanning several months is quicker.
            const monthKey = evt.eventDate ? evt.eventDate.slice(0, 7) : '';
            const showMonthHeader = Boolean(monthKey) && monthKey !== lastMonthKey;
            if (showMonthHeader) lastMonthKey = monthKey;
            const monthLabel = evt.eventDate
              ? new Date(`${evt.eventDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : '';

            return (
              <React.Fragment key={evt.id}>
              {showMonthHeader && (
                // Hairline before and after the month, same device as the
                // section headers in Timeline & Tasks, so months stand out.
                <div className="flex items-center gap-2 px-4 pt-3 pb-1 first:pt-2">
                  <div className="w-3 h-px bg-slate-500/50 shrink-0" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">{monthLabel}</p>
                  <div className="flex-1 h-px bg-slate-500/50" />
                </div>
              )}
              <div
                onClick={() => onSelectEvent(evt.id)}
                className={`mx-2 px-3 ${compact ? 'py-1.5' : 'py-2.5'} rounded-2xl transition-all cursor-pointer flex items-center gap-3 relative group ${
                  // Small rows (not prepping in this period) have fill only, no border,
                  // so the full cards stand out.
                  compact
                    ? isSelected
                      ? 'bg-white/10'
                      : 'bg-white/[0.04] hover:bg-white/[0.07]'
                    : isSelected
                      ? 'border bg-white/10 border-white/25'
                      : 'border bg-white/[0.04] border-white/10 hover:bg-white/[0.07]'
                }`}
              >
                {/* The icon is the tick box: tap to select (it shows a
                    check), tap the rest of the row to open the event. Its
                    colour is the push status: sage = the whole plan is in
                    Google Calendar, grey = something still to sync. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelectEvent(evt.id);
                  }}
                  aria-pressed={isCheckedForBulk}
                  aria-label={`Select ${displayTitle} (${planPushed ? 'synced' : 'pending sync'})`}
                  title={isCheckedForBulk ? 'Selected' : planPushed ? 'Synced to your calendar - tap to select' : 'Pending sync - tap to select'}
                  className={`${compact ? 'w-7 h-7 rounded-lg [&_svg]:w-3.5 [&_svg]:h-3.5' : 'w-10 h-10 rounded-xl'} flex items-center justify-center shrink-0 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                    isCheckedForBulk
                      ? 'bg-white text-[#182A42] ring-2 ring-aot-sage'
                      : planPushed
                        ? 'bg-aot-sage text-[#447463] hover:brightness-105'
                        : 'bg-white/10 text-slate-400 hover:bg-white/15'
                  }`}
                >
                  {isCheckedForBulk ? <Check className="w-5 h-5" strokeWidth={3} /> : getCategoryIcon(evt.category)}
                </button>

                {/* Event Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Top Row: Title + Countdown */}
                  <div className="flex items-start justify-between gap-1.5">
                    <h4 className={`${compact ? 'text-xs font-semibold text-slate-300' : 'text-xs sm:text-sm font-bold text-white'} truncate leading-tight flex items-center gap-1.5`}>
                      <span className="truncate">{displayTitle}</span>
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-[#bae6fd] bg-white/10 px-1.5 py-0.5 rounded-md">
                        {countdown.label}
                      </span>
                    </div>
                  </div>

                  {!compact && (evt.recurrence?.isRecurring || evt.context?.isRecurring) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
                      {(evt.recurrence?.isRecurring || evt.context?.isRecurring) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#bae6fd] bg-white/10 px-1.5 py-0.2 rounded-md">
                          <Repeat className="w-2.5 h-2.5 text-[#7dd3fc]" />
                          <span>{evt.recurrence?.recurrencePatternText || evt.context?.recurrencePatternText || 'Recurring'}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bottom Row: the event's date, written out */}
                  {!compact && (
                    <p className="text-[10px] sm:text-[11px] text-slate-300 font-medium truncate pt-0.5">
                      {new Date(`${evt.eventDate.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  )}
                </div>
              </div>
              </React.Fragment>
            );
            };
            // Calendar: every event in date order, full cards for the period
            // on screen and one-line rows for the rest.
            if (partitionActive && partition!.mode === 'compact') {
              return filteredEvents.map((evt) => renderRow(evt, !mainEvents.includes(evt)));
            }
            const main = mainEvents.map((evt) => renderRow(evt));
            lastMonthKey = '';
            return (
              <>
                {main}
                {partitionActive && mainEvents.length === 0 && (
                  <p className="px-4 py-3 text-xs text-slate-400">Nothing coming up in the next 30 days.</p>
                )}
                {restEvents.length > 0 &&
                  (partition!.mode === 'fold' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowLater((v) => !v)}
                        aria-expanded={showLater}
                        className="mx-2 w-[calc(100%-1rem)] flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border border-dashed border-white/15 text-xs font-bold text-slate-300 hover:text-white hover:border-white/30 cursor-pointer transition-colors"
                      >
                        <span>
                          Later <span className="font-mono text-slate-400">({restEvents.length})</span>
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">{showLater ? 'Hide' : partition!.hiddenNote}</span>
                      </button>
                      {showLater && restEvents.map((evt) => renderRow(evt, true))}
                    </>
                  ) : null)}
              </>
            );
          })()
        )}
      </div>

    </div>
  );
};
