import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Gift, 
  Sparkles, 
  Utensils, 
  Bed, 
  CheckCircle2, 
  CalendarCheck, 
  Copy, 
  Check, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { formatDisplayDate, generateICSContent, formatMessagingSummary, getCountdownStatus } from '../utils/tminusRules';
import { EventVariablePicker } from './EventVariablePicker';

interface EventSummaryCardProps {
  event: CalendarEvent;
  onToggleMilestoneStatus?: (eventId: string, milestoneId: string) => void;
  onSelectVariable?: (eventId: string, key: string, value: any, label: string) => void;
  onViewRadar?: (event: CalendarEvent) => void;
  onOpenGoogleCalendarSync?: () => void;
  isLoading?: boolean;
  currentReferenceDate?: string;
}

export const EventSummaryCard: React.FC<EventSummaryCardProps> = ({
  event,
  onToggleMilestoneStatus,
  onSelectVariable,
  onOpenGoogleCalendarSync,
  isLoading = false,
  currentReferenceDate = '2026-09-02T09:00:00.000Z',
}) => {
  const [copied, setCopied] = useState(false);
  const [showEditParams, setShowEditParams] = useState(false);
  const context = event.context || {};
  const eventCountdown = getCountdownStatus(event.eventDate, currentReferenceDate);

  // Build clean parameters
  const paramSummary: string[] = [];
  if (context.giftType === 'group') paramSummary.push('🎁 Group Gift Pot');
  else if (context.giftType === 'solo') paramSummary.push('🛍️ Solo Gift Order');
  else if (context.giftType === 'none') paramSummary.push('No Gift');

  if (context.isThemed) paramSummary.push('✨ Themed Outfit');
  if (context.diningPlan === 'reservations') paramSummary.push('🍽️ Restaurant Reservations');
  if (context.guestRoomPrep) paramSummary.push('🛏️ Guest Room Prep');

  if (context.transportType === 'taxi' || context.transportType === 'rideshare') paramSummary.push('🚕 Taxi Pre-booked');
  else if (context.transportType === 'carpool' || context.transportType === 'rental') paramSummary.push('🚗 Carpool / Rental');
  else if (context.transportType === 'transit') paramSummary.push('🚆 Public Transit');

  if (context.foodOrCake === 'cake' || context.cakeStrategy === 'custom_cake') paramSummary.push('🎂 Custom Bakery Cake');
  else if (context.foodOrCake === 'reservation') paramSummary.push('🍽️ Dinner Reservation');
  else if (context.foodOrCake === 'homemade') paramSummary.push('🍳 Homemade Food');

  if (context.customNote) paramSummary.push(`📝 ${context.customNote}`);

  const handleCopySummary = () => {
    const summaryText = formatMessagingSummary(event);
    navigator.clipboard.writeText(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(generateICSContent(event))}`;

  return (
    <div className="bg-white border border-sky-200/90 rounded-2xl overflow-hidden shadow-sm" id={`summary-card-${event.id}`}>
      
      {/* Event Header with clear distinction */}
      <div className={`p-4 border-b flex items-start justify-between gap-4 ${
        eventCountdown.isOverdue ? 'bg-rose-50/60 border-rose-200' : 'bg-sky-50/40 border-sky-100'
      }`}>
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-white uppercase tracking-wider bg-[#0f172a] px-2.5 py-0.5 rounded-full shadow-xs">
              Target Deadline
            </span>
            {event.needsRefinement && !event.refinedAt && (!event.context || Object.keys(event.context).length === 0) && (
              <span className="text-[10px] font-bold text-amber-950 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 shadow-2xs flex items-center gap-1 animate-pulse">
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>Unrefined Plan</span>
              </span>
            )}
            {eventCountdown.isOverdue ? (
              <span className="text-xs font-mono font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300 inline-flex items-center gap-1 shadow-2xs">
                <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                <span>{eventCountdown.label}</span>
              </span>
            ) : (
              <span className="text-xs font-mono font-bold text-sky-950 bg-sky-100/80 px-2 py-0.5 rounded-full border border-sky-200/80">
                {eventCountdown.label}
              </span>
            )}
            {paramSummary.length > 0 && (
              <span className="text-xs text-slate-500 font-medium">
                • {paramSummary.join(', ')}
              </span>
            )}
          </div>
          <h4 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {event.title}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-xs sm:text-sm text-slate-600 flex-wrap">
            <span className={`font-semibold ${eventCountdown.isOverdue ? 'text-rose-700 font-bold' : 'text-slate-900'}`}>
              {formatDisplayDate(event.eventDate)}
            </span>
            <span>at {event.eventTime || '19:00'}</span>
            {event.location && <span className="text-slate-500">• {event.location}</span>}
          </div>
        </div>

        {/* Sync to Google Calendar CTA */}
        {onOpenGoogleCalendarSync && (
          <button
            type="button"
            onClick={onOpenGoogleCalendarSync}
            className="text-xs sm:text-sm px-3.5 py-1.5 rounded-full bg-[#0f172a] hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 transition-all shrink-0 shadow-xs cursor-pointer"
            title="Push 1 Target Deadline + Preparation Tasks to Google Calendar"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Push to Calendar</span>
          </button>
        )}
      </div>

      {/* Collapsible Parameter Adjuster if available */}
      {onSelectVariable && (
        <div className="px-4 py-2 bg-sky-50/50 border-b border-sky-100 flex items-center justify-between text-xs">
          <span className="text-slate-600 font-medium">Preferences & Lead Times</span>
          <button
            type="button"
            onClick={() => setShowEditParams(!showEditParams)}
            className="text-xs text-sky-900 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>{showEditParams ? 'Close Settings' : 'Customize Strategy'}</span>
            {showEditParams ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {showEditParams && onSelectVariable && (
        <div className="p-4 bg-sky-50/20 border-b border-sky-100">
          <EventVariablePicker
            event={event}
            onSelectVariable={onSelectVariable}
            isLoading={isLoading}
            compact={true}
          />
        </div>
      )}

      {/* Preparation Tasks Checklist */}
      <div className="p-4 space-y-2.5 bg-white">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Reverse-Engineered Preparation Schedule</span>
          <div className="flex items-center gap-3">
            <a
              href={icsDataUri}
              download={`${event.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_timeline.ics`}
              className="text-xs text-slate-500 hover:text-sky-900 flex items-center gap-1 font-semibold transition-colors"
              title="Download .ICS file"
            >
              <CalendarCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>.ICS</span>
            </a>
            <button
              type="button"
              onClick={handleCopySummary}
              className="text-xs text-slate-500 hover:text-sky-900 flex items-center gap-1 font-semibold cursor-pointer transition-colors"
              title="Copy formatted message"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {event.milestones && event.milestones.length > 0 ? (
          <div className="space-y-2">
            {event.milestones.map((ms) => {
              const isCompleted = ms.status === 'completed';
              const msCountdown = getCountdownStatus(ms.calculatedDate, currentReferenceDate);
              const isOverdue = !isCompleted && msCountdown.isOverdue;

              return (
                <div
                  key={ms.id}
                  className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 transition-colors ${
                    isCompleted
                      ? 'bg-slate-50 border-slate-200 text-slate-400'
                      : isOverdue
                      ? 'bg-rose-50/50 border-rose-300 text-slate-900 shadow-2xs'
                      : 'bg-white border-sky-100 text-slate-800 shadow-2xs hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {onToggleMilestoneStatus ? (
                      <button
                        type="button"
                        onClick={() => onToggleMilestoneStatus(event.id, ms.id)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                          isCompleted
                            ? 'bg-emerald-600 text-white'
                            : isOverdue
                            ? 'border-2 border-rose-400 hover:border-rose-600 text-transparent'
                            : 'border-2 border-slate-300 hover:border-sky-600 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    ) : (
                      <div className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? 'bg-rose-600' : 'bg-[#0f172a]'}`} />
                    )}

                    <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      isOverdue
                        ? 'text-rose-800 bg-rose-100 border-rose-300'
                        : 'text-sky-950 bg-sky-50 border-sky-200/80'
                    }`}>
                      {ms.tMinusLabel}
                    </span>

                    <span className={`font-semibold truncate ${
                      isCompleted 
                        ? 'line-through text-slate-400' 
                        : isOverdue 
                        ? 'text-rose-950 font-bold' 
                        : 'text-slate-800'
                    }`}>
                      {ms.title}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-xs font-mono font-semibold ${isOverdue ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>
                      {formatDisplayDate(ms.calculatedDate)}
                    </div>
                    {isOverdue && (
                      <div className="text-[10px] text-rose-700 font-bold bg-rose-100 px-1.5 py-0.2 rounded border border-rose-200 mt-0.5 inline-flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                        <span>{msCountdown.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic py-1.5">
            No milestones calculated yet.
          </p>
        )}
      </div>

    </div>
  );
};
