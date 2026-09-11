import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  Check, 
  CalendarCheck, 
  Copy, 
  Trash2, 
  Plus, 
  Edit3, 
  Sparkles, 
  MapPin, 
  ArrowRight, 
  ArrowLeft,
  ChevronRight, 
  CalendarX, 
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Layers,
  Repeat,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CalendarEvent, TMinusMilestone } from '../types';
import { formatDisplayDate, getCountdownStatus, generateICSContent, formatMessagingSummary, generateHeuristicMilestones } from '../utils/tminusRules';
import { deepRefineEventLocally } from '../utils/deepRefine';
import { EditMilestoneModal } from './EditMilestoneModal';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { DeleteEventModal } from './DeleteEventModal';
import { RefineDeliverableModal } from './RefineDeliverableModal';
import { getStoredAccessToken } from '../services/googleAuth';
import { deleteSingleMilestoneFromGoogleCalendar } from '../services/googleCalendar';

interface EventTimelineRadarProps {
  events: CalendarEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  onBackToList?: () => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onDeleteEventFromCalendarOnly?: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
  onDeleteEventAndCalendar?: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
  onAddCustomMilestone: (eventId: string) => void;
  onUpdateMilestone?: (eventId: string, updatedMilestone: TMinusMilestone) => void;
  onDeleteMilestone?: (eventId: string, milestoneId: string) => void;
  onUpdateEvent?: (updated: CalendarEvent) => void;
  onOpenNewEventModal: () => void;
  onOpenGoogleCalendarSync?: () => void;
  onOpenApplyPreset?: (event: CalendarEvent) => void;
  onOpenRefine: (event: CalendarEvent) => void;
  onSelectVariable?: (eventId: string, key: string, value: any, label: string) => void;
  currentReferenceDate: string;
  isGoogleConnected?: boolean;
  isSyncingWithGoogle?: boolean;
  onTriggerGoogleSync?: () => void;
}

export const EventTimelineRadar: React.FC<EventTimelineRadarProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  onBackToList,
  onToggleMilestoneStatus,
  onDeleteEvent,
  onDeleteEventFromCalendarOnly,
  onDeleteEventAndCalendar,
  onAddCustomMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onUpdateEvent,
  onOpenNewEventModal,
  onOpenGoogleCalendarSync,
  onOpenApplyPreset,
  onOpenRefine,
  currentReferenceDate,
  isGoogleConnected,
  isSyncingWithGoogle,
  onTriggerGoogleSync,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<TMinusMilestone | null>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [clarifyTitle, setClarifyTitle] = useState('');
  const [clarifyCategory, setClarifyCategory] = useState<any>('custom');
  const [clarifyDate, setClarifyDate] = useState('');
  const [clarifyTime, setClarifyTime] = useState('');
  const [clarifyLocation, setClarifyLocation] = useState('');
  const [isDeepRefining, setIsDeepRefining] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'macro' | 'micro'>('all');
  const [expandedMilestoneIds, setExpandedMilestoneIds] = useState<Set<string>>(new Set());

  const toggleMilestoneExpanded = (milestoneId: string) => {
    setExpandedMilestoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };
  const [refiningDeliverable, setRefiningDeliverable] = useState<TMinusMilestone | null>(null);

  const activeEvent = selectedEventId 
    ? (events.find((e) => e.id === selectedEventId) || events[0] || null) 
    : (events[0] || null);

  const handleDeepRefineWithAI = async () => {
    if (!activeEvent || isDeepRefining || !onUpdateEvent) return;
    setIsDeepRefining(true);
    try {
      const resp = await fetch('/api/event/deep-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: activeEvent }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.event) {
          onUpdateEvent(data.event);
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#f59e0b', '#0284c7', '#10b981', '#6366f1'],
          });
          return;
        }
      }
      // Fallback local refiner
      const localMilestones = deepRefineEventLocally(activeEvent);
      onUpdateEvent({
        ...activeEvent,
        needsRefinement: false,
        refinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: localMilestones,
      });
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#0284c7', '#10b981'],
      });
    } catch (e) {
      console.warn('Deep refine fallback notice:', e);
      const localMilestones = deepRefineEventLocally(activeEvent);
      onUpdateEvent({
        ...activeEvent,
        needsRefinement: false,
        refinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: localMilestones,
      });
    } finally {
      setIsDeepRefining(false);
    }
  };

  React.useEffect(() => {
    if (activeEvent) {
      setClarifyTitle(activeEvent.title);
      setClarifyCategory(activeEvent.category || 'custom');
      setClarifyDate(activeEvent.eventDate || new Date().toISOString().substring(0, 10));
      setClarifyTime(activeEvent.eventTime || '19:00');
      setClarifyLocation(activeEvent.location || '');
      setIsEditingEvent(false);
    }
  }, [activeEvent?.id, activeEvent?.status]);

  const handleSaveClarification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !onUpdateEvent) return;

    const newMilestones = generateHeuristicMilestones(
      { category: clarifyCategory, title: clarifyTitle },
      activeEvent.id,
      clarifyDate,
      clarifyTime || '19:00'
    );

    const updated: CalendarEvent = {
      ...activeEvent,
      title: clarifyTitle || activeEvent.title,
      category: clarifyCategory,
      eventDate: clarifyDate,
      eventTime: clarifyTime,
      location: clarifyLocation,
      status: 'milestones_active',
      milestones: (activeEvent.milestones || []).length > 0 && !isEditingEvent ? activeEvent.milestones : newMilestones,
      updatedAt: new Date().toISOString(),
    };

    onUpdateEvent(updated);
    setIsEditingEvent(false);
  };

  const handleMilestoneClick = (eventId: string, milestone: TMinusMilestone) => {
    if (milestone.status !== 'completed') {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#e11d48', '#f43f5e', '#10b981', '#3b82f6'],
      });
    }
    onToggleMilestoneStatus(eventId, milestone.id);
  };

  const handleToggleDeliverable = (milestone: TMinusMilestone, deliverableId: string) => {
    if (!activeEvent || !onUpdateMilestone) return;
    const currentDeliverables = milestone.deliverables || [];
    const updatedDeliverables = currentDeliverables.map((d) =>
      d.deliverable_id === deliverableId ? { ...d, is_completed: !d.is_completed } : d
    );

    const allCompleted =
      updatedDeliverables.length > 0 && updatedDeliverables.every((d) => d.is_completed);

    const updatedMilestone: TMinusMilestone = {
      ...milestone,
      deliverables: updatedDeliverables,
      status: allCompleted
        ? 'completed'
        : milestone.status === 'completed' && !allCompleted
        ? 'pending'
        : milestone.status,
    };

    if (allCompleted && milestone.status !== 'completed') {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#182A42', '#529479', '#3b82f6'],
      });
    }

    onUpdateMilestone(activeEvent.id, updatedMilestone);
  };

  const handleCopySchedule = (event: CalendarEvent) => {
    const text = formatMessagingSummary(event);
    navigator.clipboard.writeText(text);
    setCopiedId(event.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadICS = (event: CalendarEvent) => {
    const icsString = generateICSContent(event);
    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_Schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveEditedMilestone = (updated: TMinusMilestone) => {
    if (activeEvent && onUpdateMilestone) {
      onUpdateMilestone(activeEvent.id, updated);
    }
    setEditingMilestone(null);
  };

  const handleDeleteTask = (milestoneId: string) => {
    if (activeEvent) {
      const ms = (activeEvent.milestones || []).find((m) => m.id === milestoneId);
      const token = getStoredAccessToken();
      if (token && ms) {
        // Also cleanup this individual milestone from Google Calendar in background
        deleteSingleMilestoneFromGoogleCalendar(token, ms, activeEvent.title).catch((e) => {
          console.warn('Background cleanup of deleted milestone notice:', e);
        });
      }
      if (onDeleteMilestone) {
        onDeleteMilestone(activeEvent.id, milestoneId);
      }
    }
  };

  if (!activeEvent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full milky-glass border border-white/80 rounded-3xl p-6 text-center text-slate-500 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-3 shadow-xs">
          <Calendar className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">No Active Event Selected</h3>
        <p className="text-xs sm:text-sm text-slate-500 mb-4 max-w-xs leading-relaxed">
          Create or select an event from the list to review, adjust, and push its prep schedule.
        </p>
        <button
          onClick={onOpenNewEventModal}
          className="bg-[#182A42] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm shadow-slate-900/25 transition-all"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Event</span>
        </button>
      </div>
    );
  }

  const rawMilestones = activeEvent.milestones || [];
  const countdown = getCountdownStatus(activeEvent.eventDate, currentReferenceDate);
  const completedCount = rawMilestones.filter((m) => m.status === 'completed').length;
  // Skipped (e.g. the linked Google Task was deleted) is excluded from the
  // denominator too - it's no longer an outstanding action, so counting it
  // against progress would make "X of Y done" misleadingly low.
  const totalCount = rawMilestones.filter((m) => m.status !== 'skipped').length;
  const hasMicroTasks = rawMilestones.some((m) => m.scope === 'micro');
  const microCount = rawMilestones.filter((m) => m.scope === 'micro').length;
  const macroCount = totalCount - microCount;

  const displayedMilestones = rawMilestones.filter((ms) => {
    if (scopeFilter === 'all') return true;
    if (scopeFilter === 'macro') return ms.scope !== 'micro';
    if (scopeFilter === 'micro') return ms.scope === 'micro';
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full milky-glass border border-sky-200/80 rounded-3xl overflow-hidden shadow-xs w-full">
      
      {/* Mobile Sticky Navigation Header (State 2: Detail View) */}
      {onBackToList && (
        <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-white/95 border-b border-sky-200/90 backdrop-blur-md sticky top-0 z-30">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-sky-300" />
            <span>Back</span>
          </button>
          
          <span className="text-xs font-black text-slate-900 truncate px-2 flex-1 text-center">
            {activeEvent.title}
          </span>

          <span className="text-[11px] font-mono font-bold text-slate-700 bg-sky-50 border border-sky-200/90 px-2 py-0.5 rounded-lg shrink-0">
            {completedCount}/{totalCount}
          </span>
        </div>
      )}

      {/* Header with Event Details & Actions */}
      <div className="p-3 sm:p-4 bg-white/80 border-b border-sky-100/90 backdrop-blur-md space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Title & Metadata */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight leading-snug break-words">
                {activeEvent.title}
              </h3>
              {activeEvent.needsRefinement && !activeEvent.refinedAt && (!activeEvent.context || Object.keys(activeEvent.context).length === 0) && (
                <span className="text-[10px] font-mono font-bold text-amber-950 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 shadow-2xs flex items-center gap-1 shrink-0 animate-pulse">
                  <Sparkles className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span>Unrefined</span>
                </span>
              )}
              {countdown.isOverdue ? (
                <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-300 shadow-2xs flex items-center gap-1 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                  <span>{countdown.label}</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 shadow-2xs shrink-0">
                  {countdown.label}
                </span>
              )}
              {(activeEvent.recurrence?.isRecurring || activeEvent.context?.isRecurring) && (
                <span className="text-[10px] font-bold text-sky-950 bg-sky-100/90 px-2 py-0.5 rounded-full border border-sky-300 shadow-2xs flex items-center gap-1 shrink-0">
                  <Repeat className="w-2.5 h-2.5 text-sky-700 shrink-0" />
                  <span>{activeEvent.recurrence?.recurrencePatternText || activeEvent.context?.recurrencePatternText || 'Recurring'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
              <div className="flex items-center gap-1 font-semibold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>
                  {activeEvent.endDate || activeEvent.macroEvent?.end_date
                    ? `${formatDisplayDate(activeEvent.eventDate)} – ${formatDisplayDate(activeEvent.endDate || activeEvent.macroEvent?.end_date || '')}`
                    : formatDisplayDate(activeEvent.eventDate)
                  }
                </span>
              </div>
              {activeEvent.eventTime && (
                <div className="flex items-center gap-1 font-mono text-slate-500 text-[11px]">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{activeEvent.eventTime}</span>
                </div>
              )}
              {activeEvent.location && (
                <div className="flex items-center gap-1 text-slate-500 text-[11px] truncate max-w-[150px] sm:max-w-none">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{activeEvent.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: Compact row with More menu */}
          <div className="flex items-center gap-1.5 shrink-0 relative">
            <button
              onClick={() => setIsPushModalOpen(true)}
              className="bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Push 1 event + prep tasks to Google Calendar"
            >
              <Calendar className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              <span>Push to Cal</span>
            </button>

            <button
              onClick={() => onOpenRefine(activeEvent)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Answer follow-up questions to customize schedule"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Refine</span>
            </button>

            {onOpenApplyPreset && (
              <button
                onClick={() => onOpenApplyPreset(activeEvent)}
                className="bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
                title="Import spreadsheet template or saved runway preset"
              >
                <Layers className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                <span className="hidden md:inline">Import Template</span>
                <span className="md:hidden">Import</span>
              </button>
            )}

            {/* More Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs flex items-center justify-center transition-all cursor-pointer"
                title="More event actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isMoreMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMoreMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {onOpenApplyPreset && (
                      <button
                        onClick={() => {
                          onOpenApplyPreset(activeEvent);
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-purple-950 flex items-center gap-2 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5 text-purple-600" />
                        <span>Import Template Preset...</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        handleDownloadICS(activeEvent);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer"
                    >
                      <CalendarCheck className="w-3.5 h-3.5 text-sky-600" />
                      <span>Download .ICS File</span>
                    </button>

                    <button
                      onClick={() => {
                        const summary = formatMessagingSummary(activeEvent);
                        navigator.clipboard.writeText(summary);
                        setCopiedId(activeEvent.id);
                        setTimeout(() => setCopiedId(null), 2000);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>{copiedId === activeEvent.id ? 'Copied Summary!' : 'Copy Summary'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setClarifyTitle(activeEvent.title);
                        setClarifyCategory(activeEvent.category || 'custom');
                        setClarifyDate(activeEvent.eventDate);
                        setClarifyTime(activeEvent.eventTime || '');
                        setClarifyLocation(activeEvent.location || '');
                        setIsEditingEvent(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit Event Details</span>
                    </button>

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      onClick={() => {
                        setIsDeleteModalOpen(true);
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Delete Event...</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mini Progress Completion Bar */}
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Preparation Completion</span>
            <span className="font-mono text-slate-700 font-bold">{completedCount} of {totalCount} completed</span>
          </div>
          <div className="w-full h-1.5 bg-sky-100 rounded-full overflow-hidden border border-sky-200/40">
            <div 
              className="h-full bg-slate-900 rounded-full transition-all duration-300 shadow-2xs"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Prep Tasks List (Review, Edit, Delete, Adjust Date) */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-2.5 bg-sky-50/20 w-full">
        {/* Hierarchical Sub-events Strip */}
        {activeEvent.subEvents && activeEvent.subEvents.length > 0 && (
          <div className="bg-indigo-50/50 border border-indigo-100/90 rounded-2xl p-2.5 sm:p-3 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <span>🎯</span>
                <span>In-Trip Objectives ({activeEvent.subEvents.length})</span>
              </span>
              {activeEvent.macroEvent?.destination && (
                <span className="text-[10px] text-indigo-700 font-semibold lowercase">
                  📍 {activeEvent.macroEvent.destination}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeEvent.subEvents.map((sub, idx) => (
                <div key={idx} className="bg-white text-indigo-950 border border-indigo-200/80 px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
                  <span className="font-bold">{sub.title}</span>
                  {sub.relative_day && (
                    <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md font-bold">
                      {sub.relative_day}
                    </span>
                  )}
                  {sub.target_date && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatDisplayDate(sub.target_date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-700">Prep Tasks ({totalCount})</span>
            <span className="text-[10px] font-normal text-slate-400 lowercase hidden sm:inline">• click task to edit</span>
          </div>
          <button
            onClick={() => onAddCustomMilestone(activeEvent.id)}
            className="text-sky-950 hover:text-slate-900 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
            <span>Add Task</span>
          </button>
        </div>

        {/* Scope Filter Buttons if Hierarchical Tasks exist */}
        {hasMicroTasks && (
          <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl text-xs font-bold w-fit">
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                scopeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('macro')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                scopeFilter === 'macro'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Preparation ({macroCount})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('micro')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                scopeFilter === 'micro'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day-Of Tasks ({microCount})
            </button>
          </div>
        )}

        {isEditingEvent ? (
          <div className="bg-white border border-sky-300 rounded-3xl p-5 shadow-lg space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-200 flex items-center justify-center text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Needs Clarification &amp; Details</h4>
                  <p className="text-[11px] text-slate-500">Specify details for this event to auto-generate the complete prep checklist.</p>
                </div>
              </div>
              {rawMilestones.length > 0 && (
                <button
                  onClick={() => setIsEditingEvent(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 font-bold px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSaveClarification} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Event Title / Description</label>
                <input
                  type="text"
                  required
                  value={clarifyTitle}
                  onChange={(e) => setClarifyTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Category</label>
                  <select
                    value={clarifyCategory}
                    onChange={(e) => setClarifyCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800 cursor-pointer"
                  >
                    <option value="birthday_party">🎉 Wedding / Party / Celebration</option>
                    <option value="travel_trip">✈️ Trip / Travel</option>
                    <option value="hosting_visitors">🏡 Hosting / Visitors</option>
                    <option value="dinner_social">🍽️ Dinner / Dining</option>
                    <option value="project_deadline">🚀 Project / Deadline</option>
                    <option value="festival_concert">🎵 Festival / Concert</option>
                    <option value="maintenance">🔧 Maintenance / Service</option>
                    <option value="subscription">💳 Subscription / Renewal</option>
                    <option value="custom">📅 General Event</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Event Date</label>
                  <input
                    type="date"
                    required
                    value={clarifyDate}
                    onChange={(e) => setClarifyDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Time</label>
                  <input
                    type="time"
                    value={clarifyTime}
                    onChange={(e) => setClarifyTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Location / Venue</label>
                  <input
                    type="text"
                    value={clarifyLocation}
                    onChange={(e) => setClarifyLocation(e.target.value)}
                    placeholder="e.g. Italian Restaurant, Home..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                  <span>Build Ahead Of Time Milestones</span>
                </button>
              </div>
            </form>
          </div>
        ) : rawMilestones.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-sky-200/80 space-y-3 shadow-xs">
            <p>No preparation tasks created for this event yet.</p>
            <button
              onClick={() => onAddCustomMilestone(activeEvent.id)}
              className="px-4 py-2 bg-[#182A42] text-white rounded-xl text-xs font-bold shadow-xs hover:bg-slate-800 cursor-pointer"
            >
              Add First Task
            </button>
          </div>
        ) : displayedMilestones.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-sky-100 space-y-2 shadow-xs">
            <p>No tasks found for "{scopeFilter === 'micro' ? 'Day-Of Tasks' : 'Preparation'}".</p>
            <button
              onClick={() => setScopeFilter('all')}
              className="px-3 py-1 bg-sky-50 text-sky-900 rounded-lg text-xs font-bold hover:bg-sky-100 cursor-pointer border border-sky-200"
            >
              Show All Tasks
            </button>
          </div>
        ) : (
          displayedMilestones.map((ms) => {
            const isCompleted = ms.status === 'completed';
            const isSkipped = ms.status === 'skipped';
            const msCountdown = getCountdownStatus(ms.calculatedDate, currentReferenceDate);
            const isOverdue = !isCompleted && !isSkipped && msCountdown.isOverdue;
            const isUrgentSoon = !isOverdue && !isCompleted && !isSkipped && msCountdown.diffDays <= 3;
            const isDeliverable = ms.kind === 'deliverable';
            const hasDeliverables = Boolean(ms.deliverables && ms.deliverables.length > 0);
            const isExpanded = expandedMilestoneIds.has(ms.id);
            const completedDelivCount = hasDeliverables ? ms.deliverables!.filter((d) => d.is_completed).length : 0;

            return (
              <div
                key={ms.id}
                className={`group p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 w-full ${
                  isSkipped
                    ? 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-70'
                    : isCompleted
                    ? 'bg-slate-50/90 border-slate-200 text-slate-400'
                    : isOverdue
                    ? 'bg-rose-50/60 border-rose-300 hover:border-rose-400 text-slate-800 shadow-2xs ring-1 ring-rose-200/60'
                    : isUrgentSoon
                    ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400 text-slate-800 shadow-2xs ring-1 ring-amber-200/50'
                    : isDeliverable
                    ? 'bg-white border-slate-200/90 hover:border-[#182A42]/50 text-slate-800 shadow-xs border-l-4 border-l-[#182A42]'
                    : hasDeliverables
                    ? 'bg-white border-slate-200/90 hover:border-[#182A42]/40 text-slate-800 shadow-xs border-l-4 border-l-[#182A42]/70'
                    : 'bg-white/80 border-slate-200/80 hover:border-slate-300 text-slate-700 shadow-2xs'
                }`}
              >
                {/* Checkbox & Task Information */}
                <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0 w-full">
                  <button
                    onClick={() => !isSkipped && handleMilestoneClick(activeEvent.id, ms)}
                    disabled={isSkipped}
                    className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center transition-all shrink-0 ${
                      isSkipped
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : isCompleted
                        ? 'bg-emerald-600 text-white shadow-2xs cursor-pointer'
                        : isOverdue
                        ? 'border-2 border-rose-400 hover:border-rose-600 text-transparent cursor-pointer'
                        : isDeliverable || hasDeliverables
                        ? 'border-2 border-[#182A42]/40 hover:border-[#182A42] text-transparent cursor-pointer'
                        : 'border-2 border-slate-300 hover:border-sky-600 text-transparent cursor-pointer'
                    }`}
                    title={isSkipped ? 'Skipped - removed in Google Tasks' : isCompleted ? 'Mark as pending' : 'Mark as completed'}
                  >
                    {isSkipped ? <X className="w-3 h-3 stroke-[3]" /> : <Check className="w-3 h-3 stroke-[3]" />}
                  </button>

                  <div className="space-y-1 min-w-0 flex-1 w-full">
                    {/* Tag / Badge row - a single urgency-colored due signal instead of
                        the date being repeated three different ways */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {!isCompleted && !isSkipped && (
                        <span
                          className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-md border shrink-0 inline-flex items-center gap-1 ${
                            isOverdue
                              ? 'text-rose-800 bg-rose-100 border-rose-300'
                              : isUrgentSoon
                              ? 'text-amber-900 bg-amber-100 border-amber-300'
                              : 'text-slate-600 bg-slate-100 border-slate-200'
                          }`}
                          title={ms.tMinusLabel}
                        >
                          {isOverdue && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}
                          <span>{msCountdown.label}</span>
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {formatDisplayDate(ms.calculatedDate)}
                      </span>

                      {ms.tag && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">
                          {ms.tag}
                        </span>
                      )}

                      {isSkipped && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-md shrink-0 inline-flex items-center gap-1">
                          <X className="w-2.5 h-2.5" />
                          <span>Skipped - removed in Google Tasks</span>
                        </span>
                      )}

                      {isDeliverable && (
                        <span className="text-[10px] font-bold text-[#182A42] bg-slate-100 border border-[#182A42] px-2 py-0.5 rounded-md shrink-0 shadow-2xs inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#182A42]" />
                          <span>Deliverable</span>
                        </span>
                      )}

                      {/* Refine Button for Deliverables needing more details */}
                      {(ms.needsRefinement || (ms.refinementOptions && ms.refinementOptions.length > 0)) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRefiningDeliverable(ms);
                          }}
                          className="text-[10px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0 active:scale-95"
                          title="Refine specifics for this deliverable"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                          <span>Refine</span>
                        </button>
                      )}

                      {ms.scope === 'micro' && ms.relativeDay && (
                        <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                          {ms.relativeDay}
                        </span>
                      )}

                      {ms.tMinusLabel === 'T-Day' && (
                        <span className="text-[10px] font-bold text-white bg-[#182A42] px-2 py-0.5 rounded-md shrink-0 shadow-2xs inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-300" />
                          <span>Main Event</span>
                        </span>
                      )}
                    </div>

                    {/* Task Title */}
                    <h4 className={`text-xs sm:text-sm font-bold leading-snug break-words ${
                      isCompleted
                        ? 'line-through text-slate-400'
                        : isOverdue
                        ? 'text-rose-950 font-black'
                        : isDeliverable
                        ? 'text-[#182A42]'
                        : 'text-slate-900'
                    }`}>
                      {ms.title}
                    </h4>

                    {/* Task Description */}
                    {ms.description && (
                      <p className={`text-[11px] sm:text-xs font-medium leading-relaxed break-words ${isOverdue ? 'text-rose-700/80' : 'text-slate-500'}`}>
                        {ms.description}
                      </p>
                    )}

                    {/* Sub-tasks - collapsed by default. Google Calendar/Tasks only
                        ever shows the milestone, never these, so they're kept
                        deliberately lightweight and secondary rather than a second
                        tier of full task cards. */}
                    {hasDeliverables && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMilestoneExpanded(ms.id);
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <span>{completedDelivCount}/{ms.deliverables!.length} sub-tasks</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-1.5 pl-4 space-y-1">
                            {ms.deliverables!.map((deliv) => {
                              const isDelivDone = deliv.is_completed;
                              return (
                                <div
                                  key={deliv.deliverable_id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleDeliverable(ms, deliv.deliverable_id);
                                  }}
                                  className="flex items-center gap-2 py-0.5 cursor-pointer group/deliv"
                                >
                                  <button
                                    type="button"
                                    className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                                      isDelivDone
                                        ? 'bg-[#182A42] text-white'
                                        : 'border border-slate-300 group-hover/deliv:border-[#182A42] text-transparent'
                                    }`}
                                    title={isDelivDone ? 'Mark sub-task as pending' : 'Mark sub-task as complete'}
                                  >
                                    <Check className="w-2 h-2 stroke-[3]" />
                                  </button>
                                  <span className={`text-[11px] sm:text-xs truncate ${isDelivDone ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                                    {deliv.title}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions (Edit & Delete) - quiet by default, not competing with content */}
                <div className="flex items-center gap-1 self-end sm:self-start opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditingMilestone(ms)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-sky-50 transition-all cursor-pointer"
                    title="Edit task date, topic, or description"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(ms.id)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                    title="Delete this task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Target Deadline Summary Box */}
        <div className={`mt-4 p-4 rounded-2xl border flex items-center justify-between text-xs sm:text-sm shadow-xs ${
          countdown.isOverdue
            ? 'bg-rose-50/70 border-rose-300 text-rose-950'
            : 'bg-white border-sky-200/80 text-slate-700'
        }`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={`w-3 h-3 rounded-full shadow-2xs ${countdown.isOverdue ? 'bg-rose-600 ring-2 ring-rose-200' : 'bg-[#182A42]'}`} />
            <div>
              <span className="font-bold text-slate-900">Target Event: {activeEvent.title}</span>
              {activeEvent.eventTime && <span className="text-slate-500 text-xs ml-2">({activeEvent.eventTime})</span>}
              {countdown.isOverdue && (
                <span className="ml-2 font-mono font-bold text-rose-700 text-xs bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>{countdown.label}</span>
                </span>
              )}
            </div>
          </div>
          <span className={`font-mono font-bold ${countdown.isOverdue ? 'text-rose-700' : 'text-slate-900'}`}>
            {formatDisplayDate(activeEvent.eventDate)}
          </span>
        </div>
      </div>

      {/* Edit Milestone Modal */}
      {editingMilestone && (
        <EditMilestoneModal
          isOpen={Boolean(editingMilestone)}
          onClose={() => setEditingMilestone(null)}
          milestone={editingMilestone}
          eventDate={activeEvent.eventDate}
          eventTime={activeEvent.eventTime}
          eventTitle={activeEvent.title}
          onSave={handleSaveEditedMilestone}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Push to Google Calendar Modal */}
      {isPushModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <GoogleCalendarSync
              events={events}
              selectedEventId={activeEvent.id}
              onUpdateEvent={onUpdateEvent}
              onClose={() => setIsPushModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Delete Event & Google Calendar Cleanup Modal */}
      {isDeleteModalOpen && activeEvent && (
        <DeleteEventModal
          event={activeEvent}
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirmDeleteAppOnly={(id) => {
            onDeleteEvent(id);
            setIsDeleteModalOpen(false);
          }}
          onConfirmDeleteCalendarOnly={(id, summary) => {
            if (onDeleteEventFromCalendarOnly) {
              onDeleteEventFromCalendarOnly(id, summary);
            }
            setIsDeleteModalOpen(false);
          }}
          onConfirmDeleteAppAndCalendar={(id, summary) => {
            if (onDeleteEventAndCalendar) {
              onDeleteEventAndCalendar(id, summary);
            } else {
              onDeleteEvent(id);
            }
            setIsDeleteModalOpen(false);
          }}
        />
      )}


      {/* Refine Deliverable Modal */}
      {refiningDeliverable && activeEvent && (
        <RefineDeliverableModal
          isOpen={Boolean(refiningDeliverable)}
          onClose={() => setRefiningDeliverable(null)}
          milestone={refiningDeliverable}
          event={activeEvent}
          onSaveMilestone={(updated) => {
            if (activeEvent && onUpdateMilestone) {
              onUpdateMilestone(activeEvent.id, updated);
            }
            setRefiningDeliverable(null);
          }}
        />
      )}

    </div>
  );
};
