import React, { useState } from 'react';
import {
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Home,
  Cake,
  Plane,
  Sparkles,
  Music,
  CalendarDays,
  AlertTriangle,
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
  onOpenNewEventModal: () => void;
  onOpenScanAgenda?: () => void;
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
  onOpenNewEventModal,
  onOpenScanAgenda,
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
      <div className="flex flex-col items-center h-full milky-glass border border-sky-200/80 rounded-3xl overflow-hidden shadow-xs py-3.5 gap-3 w-14">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-xl bg-white/90 hover:bg-sky-50 text-slate-700 hover:text-slate-950 border border-sky-200/80 shadow-xs flex items-center justify-center cursor-pointer transition-all"
          title="Expand event list"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-xl bg-sky-100/80 border border-sky-200 flex items-center justify-center">
          <CalendarDays className="w-4 h-4 text-sky-900" />
        </div>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-950 font-mono font-bold border border-sky-200">
          {events.length}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full milky-glass border border-sky-200/80 rounded-3xl overflow-hidden shadow-xs">
      
      {/* Sidebar Header */}
      <div className="p-3.5 sm:p-4 bg-white/60 border-b border-sky-100/90 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-100/80 border border-sky-200 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-sky-900" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Active Events
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-950 font-mono font-bold border border-sky-200">
              {events.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenScanAgenda && (
              <button
                onClick={onOpenScanAgenda}
                className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 transition-all cursor-pointer border border-slate-200 shadow-xs flex items-center gap-1.5 text-xs font-bold active:scale-95"
                title="Scan for existing events in your agenda"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="hidden sm:inline">Scan agenda</span>
                <span className="sm:hidden">Scan</span>
              </button>
            )}
            <button
              onClick={onOpenNewEventModal}
              className="p-2 rounded-full bg-white/90 hover:bg-sky-50 text-slate-700 hover:text-slate-950 transition-all cursor-pointer border border-sky-200/80 shadow-xs active:scale-95 flex items-center justify-center"
              title="Add new event using presets or assistant"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden lg:flex p-2 rounded-full bg-white/90 hover:bg-sky-50 text-slate-700 hover:text-slate-950 border border-sky-200/80 shadow-xs items-center justify-center cursor-pointer transition-all"
                title="Collapse event list"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search bar pill */}
        <div className="relative">
          <Search className="w-4 h-4 text-sky-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="w-full bg-white/95 text-slate-800 text-xs sm:text-sm pl-9 pr-4 py-2 rounded-full border border-sky-200/90 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400 shadow-xs"
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
                className="text-sky-700 hover:text-sky-950 font-bold flex items-center gap-1 cursor-pointer bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200/80"
              >
                {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5 text-sky-700" /> : <Square className="w-3.5 h-3.5 text-sky-500" />}
                <span>{allFilteredSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
              {newlyAddedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowOnlyNew((v) => !v)}
                  className={`font-bold flex items-center gap-1 cursor-pointer px-2.5 py-1 rounded-lg border transition-all ${
                    showOnlyNew
                      ? 'bg-amber-400 border-amber-500 text-amber-950'
                      : 'bg-amber-100/80 border-amber-200 text-amber-800 hover:bg-amber-100'
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

      {/* Events List (Plain Milky White Items with Light Blue and Red Accent Borders) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-sky-50/20">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center text-slate-400">
              <Calendar className="w-5 h-5" />
            </div>
            <p className="font-bold text-slate-700">No active events</p>
            <p className="text-xs text-slate-400 max-w-[200px]">Create an event or sync your Google Calendar to see your preparation runways.</p>
          </div>
        ) : (
          (() => {
            let lastMonthKey = '';
            return filteredEvents.map((evt) => {
            const isSelected = selectedEventId === evt.id;
            const isCheckedForBulk = selectedEventIds.includes(evt.id);
            const countdown = getCountdownStatus(evt.eventDate, currentReferenceDate);
            const pendingTasks = evt.milestones?.filter((m) => m.status !== 'completed') || [];
            const nextTask = pendingTasks[0];

            const displayTitle = getCleanEventTitle(evt.title, evt.category, evt.context);
            const topicLabel = getEventTopicLabel(evt.category, evt.context);

            const isUnrefined = evt.needsRefinement === true && !evt.refinedAt && (!evt.context || Object.keys(evt.context).length === 0);
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
                <p className="px-1 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 first:pt-0">
                  {monthLabel}
                </p>
              )}
              <div
                onClick={() => onSelectEvent(evt.id)}
                className={`p-3 rounded-2xl transition-all cursor-pointer flex items-start gap-2.5 relative group ${
                  isSelected
                    ? 'bg-white border-2 border-slate-900 shadow-sm'
                    : isNewlyAdded
                    ? 'bg-amber-50 border border-amber-200 hover:border-amber-300 hover:shadow-xs shadow-2xs'
                    : 'bg-white/95 border border-slate-200/80 hover:border-slate-300 hover:shadow-xs shadow-2xs'
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
                    className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-900 cursor-pointer"
                    title="Select event for bulk deletion"
                  />
                </div>

                {/* Category Icon */}
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs mt-0.5 bg-slate-100 border border-slate-200 text-slate-700">
                  {getCategoryIcon(evt.category)}
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Top Row: Title + Countdown / Unrefined Badge */}
                  <div className="flex items-start justify-between gap-1.5">
                    <h4 className={`text-xs sm:text-sm font-bold truncate leading-tight ${isSelected ? 'text-slate-950 font-black' : 'text-slate-900'}`}>
                      {displayTitle}
                    </h4>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                        {countdown.label}
                      </span>
                    </div>
                  </div>

                  {(isUnrefined || evt.recurrence?.isRecurring || evt.context?.isRecurring) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px]">
                      {isUnrefined && (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                          <span>Needs review</span>
                        </span>
                      )}
                      {(evt.recurrence?.isRecurring || evt.context?.isRecurring) && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-900 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded-md">
                          <Repeat className="w-2.5 h-2.5 text-sky-700" />
                          <span>{evt.recurrence?.recurrencePatternText || evt.context?.recurrencePatternText || 'Recurring'}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bottom Row: Next Preparation Task */}
                  {nextTask && (
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate flex items-center gap-1 pt-0.5 border-t border-slate-100">
                      <span className="text-slate-400 font-bold">•</span>
                      <span className="truncate">Next: <span className="text-slate-700 font-semibold">{nextTask.title}</span></span>
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
