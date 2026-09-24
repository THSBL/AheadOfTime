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
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { getCountdownStatus, getCleanEventTitle, getEventTopicLabel, sortEventsUpcomingFirst } from '../utils/tminusRules';

// How long an event counts as "newly added" for the sidebar's own filter
// chip and highlight - measured against real wall-clock time (not
// currentReferenceDate, which is this app's mockable planning reference
// date and can be set arbitrarily far from "now"), since this is about
// when the event record was actually created, not where it falls on the
// calendar.
const NEWLY_ADDED_WINDOW_MS = 48 * 60 * 60 * 1000;

function isNewlyAddedEvent(event: CalendarEvent): boolean {
  if (!event.createdAt) return false;
  const createdAtMs = new Date(event.createdAt).getTime();
  if (isNaN(createdAtMs)) return false;
  return Date.now() - createdAtMs < NEWLY_ADDED_WINDOW_MS;
}

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
  isCollapsed?: boolean;
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
  isCollapsed,
  onToggleCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyNew, setShowOnlyNew] = useState(false);

  const newlyAddedCount = React.useMemo(() => events.filter(isNewlyAddedEvent).length, [events]);

  const filteredEvents = React.useMemo(() => {
    const matched = events.filter((e) => {
      if (showOnlyNew && !isNewlyAddedEvent(e)) return false;
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
    // showOnlyNew is read inside the filter above but was missing here -
    // useMemo only recomputes when a LISTED dependency changes, so toggling
    // the "Newly added" checkbox updated the checkbox's own visual state
    // but never actually re-ran this filter. The list only looked "fixed"
    // whenever events/searchQuery/currentReferenceDate happened to change
    // for some unrelated reason afterward.
  }, [events, searchQuery, currentReferenceDate, showOnlyNew]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'birthday_party':
        return <Cake className="w-4 h-4 text-pink-500" />;
      case 'hosting_visitors':
        return <Home className="w-4 h-4 text-indigo-500" />;
      case 'travel_trip':
        return <Plane className="w-4 h-4 text-sky-600" />;
      case 'festival_concert':
        return <Music className="w-4 h-4 text-amber-500" />;
      default:
        return <Calendar className="w-4 h-4 text-slate-500" />;
    }
  };

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
    <div className="flex flex-col h-full bg-[#223349] border border-white/10 rounded-3xl overflow-hidden shadow-xs">

      {/* Sidebar Header */}
      <div className="p-3.5 sm:p-4 border-b border-white/10 space-y-3">
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

        {/* Bulk Selection & Deletion Actions Bar - "Newly added" lives on
            this same row now, styled as the same kind of checkbox toggle as
            Select All (no icon of its own) rather than a separate chip on
            its own line above. */}
        {events.length > 0 && (
          <div className="flex items-center justify-between pt-1 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={allFilteredSelected ? onDeselectAllEvents : onSelectAllEvents}
                className="text-[#bae6fd] hover:text-white font-bold flex items-center gap-1 cursor-pointer bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded-lg"
              >
                {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                <span>{allFilteredSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              {newlyAddedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOnlyNew((v) => !v)}
                  className={`font-bold flex items-center gap-1 cursor-pointer px-2.5 py-1 rounded-lg transition-all ${
                    showOnlyNew
                      ? 'bg-[#38bdf8] text-[#182A42]'
                      : 'bg-white/10 text-[#bae6fd] hover:bg-white/15'
                  }`}
                  title={showOnlyNew ? 'Showing only newly added events' : 'Show only newly added events'}
                >
                  {showOnlyNew ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  <span>Newly added ({newlyAddedCount})</span>
                </button>
              )}
            </div>

            {selectedEventIds.length > 0 && (
              <button
                onClick={onOpenBulkDeleteModal}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Delete selected events"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedEventIds.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Flat list on the same dark navy surface, divided by hairlines,
          instead of each event being its own separate white bordered/
          shadowed card with gaps between them - live feedback called the
          separate-card treatment "disturbance." Only the selected row gets
          a visible outline now; everything else is plain rows. */}
      <div className="flex-1 overflow-y-auto py-1">
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
            return filteredEvents.map((evt) => {
            const isSelected = selectedEventId === evt.id;
            const isCheckedForBulk = selectedEventIds.includes(evt.id);
            const countdown = getCountdownStatus(evt.eventDate, currentReferenceDate);
            const pendingTasks = evt.milestones?.filter((m) => m.status !== 'completed' && m.isActive !== false) || [];
            const nextTask = pendingTasks[0];

            const displayTitle = getCleanEventTitle(evt.title, evt.category, evt.context);
            const topicLabel = getEventTopicLabel(evt.category, evt.context);

            const isNewlyAdded = isNewlyAddedEvent(evt);

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
                <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 first:pt-2">
                  {monthLabel}
                </p>
              )}
              <div
                onClick={() => onSelectEvent(evt.id)}
                className={`mx-2 px-3 py-3 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 relative group border ${
                  isSelected
                    // The one row that gets a visible outline - everything
                    // else is a flat row, so the current selection reads as
                    // the exception, not one card among many identical ones.
                    ? 'bg-white/10 border-white/25'
                    : 'border-transparent hover:bg-white/5'
                }`}
              >
                {/* Checkbox for Bulk Deletion */}
                <div
                  className="shrink-0 mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isCheckedForBulk}
                    onChange={() => onToggleSelectEvent(evt.id)}
                    className="w-4 h-4 rounded border-white/30 bg-white/10 text-[#38bdf8] focus:ring-[#38bdf8] cursor-pointer"
                    title="Select event for bulk deletion"
                  />
                </div>

                {/* Category Icon */}
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-white/10">
                  {getCategoryIcon(evt.category)}
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Top Row: Title + Countdown / Unrefined Badge. The
                      newly-added highlight is a small dot next to the
                      title now, not a background fill - a flat row has
                      nowhere for a colored background to sit without
                      looking like a stray card again. */}
                  <div className="flex items-start justify-between gap-1.5">
                    <h4 className="text-xs sm:text-sm font-bold truncate leading-tight text-white flex items-center gap-1.5">
                      {isNewlyAdded && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0" title="Newly added" />
                      )}
                      <span className="truncate">{displayTitle}</span>
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-[#bae6fd] bg-white/10 px-1.5 py-0.5 rounded-md">
                        {countdown.label}
                      </span>
                    </div>
                  </div>

                  {(evt.recurrence?.isRecurring || evt.context?.isRecurring) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
                      {(evt.recurrence?.isRecurring || evt.context?.isRecurring) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#bae6fd] bg-white/10 px-1.5 py-0.2 rounded-md">
                          <Repeat className="w-2.5 h-2.5 text-[#7dd3fc]" />
                          <span>{evt.recurrence?.recurrencePatternText || evt.context?.recurrencePatternText || 'Recurring'}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bottom Row: Next Preparation Task */}
                  {nextTask && (
                    <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate flex items-center gap-1 pt-0.5">
                      <span className="text-slate-500 font-bold">•</span>
                      <span className="truncate">Next: <span className="text-slate-300 font-semibold">{nextTask.title}</span></span>
                    </p>
                  )}
                </div>
              </div>
              </React.Fragment>
            );
            });
          })()
        )}
      </div>

    </div>
  );
};
