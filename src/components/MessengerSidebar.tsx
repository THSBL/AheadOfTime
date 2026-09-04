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
  Square
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { formatDisplayDate, getCountdownStatus } from '../utils/tminusRules';

interface MessengerSidebarProps {
  events: CalendarEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onOpenNewEventModal: () => void;
  onOpenScanAgenda?: () => void;
  onOpenGoogleCalendarSync?: () => void;
  currentReferenceDate: string;
  selectedEventIds: string[];
  onToggleSelectEvent: (eventId: string) => void;
  onSelectAllEvents: () => void;
  onDeselectAllEvents: () => void;
  onOpenBulkDeleteModal: () => void;
}

export const MessengerSidebar: React.FC<MessengerSidebarProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  onOpenNewEventModal,
  onOpenScanAgenda,
  onOpenGoogleCalendarSync,
  currentReferenceDate,
  selectedEventIds,
  onToggleSelectEvent,
  onSelectAllEvents,
  onDeselectAllEvents,
  onOpenBulkDeleteModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = events.filter((e) => {
    if (!searchQuery.trim()) return true;
    return e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
  });

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
                className="px-2.5 py-1.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-900 transition-colors cursor-pointer border border-sky-200/90 shadow-2xs flex items-center gap-1.5 text-xs font-bold"
                title="Scan for existing events in your agenda"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
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

        {/* Bulk Selection & Deletion Actions Bar */}
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
              {selectedEventIds.length > 0 && (
                <span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                  {selectedEventIds.length} selected
                </span>
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
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm">
            No events found. Start by typing in the chat!
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const isSelected = selectedEventId === evt.id;
            const isCheckedForBulk = selectedEventIds.includes(evt.id);
            const countdown = getCountdownStatus(evt.eventDate, currentReferenceDate);
            const pendingTasks = evt.milestones?.filter((m) => m.status !== 'completed') || [];
            const nextTask = pendingTasks[0];

            const isUnrefined = evt.needsRefinement === true && !evt.refinedAt;

            return (
              <div
                key={evt.id}
                onClick={() => onSelectEvent(evt.id)}
                className={`p-3 rounded-2xl transition-all cursor-pointer flex items-center gap-3 relative group ${
                  isSelected
                    ? isUnrefined
                      ? 'bg-white border-2 border-slate-900 border-l-4 border-l-amber-500 shadow-sm'
                      : 'bg-white border-2 border-slate-900 shadow-sm'
                    : isUnrefined
                      ? 'bg-amber-50/40 border border-amber-200/90 border-l-4 border-l-amber-500 hover:border-amber-300 hover:shadow-xs shadow-2xs'
                      : 'bg-white/95 border border-slate-200/80 hover:border-slate-300 hover:shadow-xs shadow-2xs'
                }`}
              >
                {/* Checkbox for Bulk Deletion */}
                <div 
                  className="shrink-0"
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
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                  isUnrefined ? 'bg-amber-100/80 border border-amber-300 text-amber-900' : 'bg-slate-100 border border-slate-200 text-slate-700'
                }`}>
                  {getCategoryIcon(evt.category)}
                </div>

                {/* Event Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <h4 className={`text-xs sm:text-sm font-bold truncate ${isSelected ? 'text-slate-950 font-black' : 'text-slate-900'}`}>
                      {evt.title}
                    </h4>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnrefined ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-950 bg-amber-200/90 border border-amber-300 px-1.5 py-0.5 rounded-full shadow-2xs animate-pulse">
                          <Sparkles className="w-2.5 h-2.5 text-amber-700" />
                          <span>Unrefined</span>
                        </span>
                      ) : null}
                      <span className="text-[11px] font-mono font-medium text-slate-500">
                        {countdown.label}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 font-medium truncate">
                    {nextTask ? `Next: ${nextTask.title}` : `${formatDisplayDate(evt.eventDate)}`}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
