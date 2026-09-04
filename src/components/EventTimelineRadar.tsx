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
  MoreHorizontal
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CalendarEvent, TMinusMilestone } from '../types';
import { formatDisplayDate, getCountdownStatus, generateICSContent, formatMessagingSummary, generateHeuristicMilestones } from '../utils/tminusRules';
import { deepRefineEventLocally } from '../utils/deepRefine';
import { EditMilestoneModal } from './EditMilestoneModal';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { DeleteEventModal } from './DeleteEventModal';
import { EventRefineModal } from './EventRefineModal';
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
  currentReferenceDate,
  isGoogleConnected,
  isSyncingWithGoogle,
  onTriggerGoogleSync,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [isRefineModalOpen, setIsRefineModalOpen] = useState(false);
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

  const activeEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) : (events[0] || null);

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
      if (activeEvent.status === 'intake_pending' || !activeEvent.milestones || activeEvent.milestones.length === 0) {
        setIsEditingEvent(true);
      } else {
        setIsEditingEvent(false);
      }
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
      milestones: activeEvent.milestones.length > 0 && !isEditingEvent ? activeEvent.milestones : newMilestones,
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
      const ms = activeEvent.milestones.find((m) => m.id === milestoneId);
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
          className="bg-[#0f172a] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm shadow-slate-900/25 transition-all"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Event</span>
        </button>
      </div>
    );
  }

  const countdown = getCountdownStatus(activeEvent.eventDate, currentReferenceDate);
  const completedCount = activeEvent.milestones.filter((m) => m.status === 'completed').length;
  const totalCount = activeEvent.milestones.length;

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
              {activeEvent.needsRefinement && (
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
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
              <div className="flex items-center gap-1 font-semibold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>{formatDisplayDate(activeEvent.eventDate)}</span>
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
              className="bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Push 1 event + prep tasks to Google Calendar"
            >
              <Calendar className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              <span>Push to Cal</span>
            </button>

            <button
              onClick={() => setIsRefineModalOpen(true)}
              className="bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
              title="Answer follow-up questions to customize schedule"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Refine</span>
            </button>

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
        {/* Compact Unrefined Alert Strip */}
        {activeEvent.needsRefinement && (
          <div className="p-2.5 sm:p-3 rounded-2xl bg-amber-50/90 border border-amber-300/80 shadow-2xs flex items-center justify-between gap-2.5 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-amber-950 block truncate">
                  Unrefined timing: Deep logistics not calculated yet
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleDeepRefineWithAI}
                disabled={isDeepRefining}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition-all shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-60"
                title="Automatically calculate tailored T-minus schedule"
              >
                {isDeepRefining ? (
                  <RefreshCw className="w-3 h-3 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-3 h-3 text-amber-200" />
                )}
                <span>{isDeepRefining ? 'Refining...' : 'AI Refine'}</span>
              </button>
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
              {activeEvent.milestones.length > 0 && (
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
                    <option value="birthday_party">🎉 Birthday / Celebration</option>
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
                  className="px-5 py-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                  <span>Build Ahead Of Time Milestones</span>
                </button>
              </div>
            </form>
          </div>
        ) : activeEvent.milestones.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-sky-200/80 space-y-3 shadow-xs">
            <p>No preparation tasks created for this event yet.</p>
            <button
              onClick={() => onAddCustomMilestone(activeEvent.id)}
              className="px-4 py-2 bg-[#0f172a] text-white rounded-xl text-xs font-bold shadow-xs hover:bg-slate-800 cursor-pointer"
            >
              Add First Task
            </button>
          </div>
        ) : (
          activeEvent.milestones.map((ms) => {
            const isCompleted = ms.status === 'completed';
            const msCountdown = getCountdownStatus(ms.calculatedDate, currentReferenceDate);
            const isOverdue = !isCompleted && msCountdown.isOverdue;

            return (
              <div
                key={ms.id}
                className={`group p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 w-full ${
                  isCompleted
                    ? 'bg-slate-50/90 border-slate-200 text-slate-400'
                    : isOverdue
                    ? 'bg-rose-50/60 border-rose-300 hover:border-rose-400 text-slate-800 shadow-2xs ring-1 ring-rose-200/60'
                    : 'bg-white border-sky-100/90 hover:border-sky-300 text-slate-800 shadow-2xs hover:shadow-xs'
                }`}
              >
                {/* Checkbox & Task Information */}
                <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0 w-full">
                  <button
                    onClick={() => handleMilestoneClick(activeEvent.id, ms)}
                    className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : isOverdue
                        ? 'border-2 border-rose-400 hover:border-rose-600 text-transparent'
                        : 'border-2 border-slate-300 hover:border-sky-600 text-transparent'
                    }`}
                    title={isCompleted ? 'Mark as pending' : 'Mark as completed'}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </button>

                  <div className="space-y-1 min-w-0 flex-1 w-full">
                    {/* Tag / Badge row */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`font-mono text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-md border shrink-0 ${
                        isOverdue
                          ? 'text-rose-800 bg-rose-100 border-rose-300'
                          : 'text-sky-950 bg-sky-50 border-sky-200/80'
                      }`}>
                        {ms.tMinusLabel}
                      </span>
                      
                      {isOverdue && (
                        <span className="text-[10px] text-rose-700 font-bold bg-rose-100/90 px-1.5 py-0.5 rounded-md border border-rose-300 inline-flex items-center gap-1 shrink-0 shadow-2xs">
                          <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                          <span>{msCountdown.label}</span>
                        </span>
                      )}

                      {!isOverdue && !isCompleted && (
                        <span className="sm:hidden text-[10px] text-sky-800 font-semibold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">
                          {msCountdown.label}
                        </span>
                      )}
                    </div>

                    {/* Task Title */}
                    <h4 className={`text-xs sm:text-sm font-bold leading-snug break-words ${
                      isCompleted 
                        ? 'line-through text-slate-400' 
                        : isOverdue
                        ? 'text-rose-950 font-black'
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

                    {/* Mobile-only Bottom Meta & Actions Row */}
                    <div className="sm:hidden flex items-center justify-between pt-1.5 mt-0.5 border-t border-slate-100 gap-2 w-full">
                      <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-700">
                        <Calendar className="w-3 h-3 text-sky-600" />
                        <span>Date: {formatDisplayDate(ms.calculatedDate)}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingMilestone(ms)}
                          className="p-1 px-2 rounded-lg text-slate-600 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                          title="Edit task"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteTask(ms.id)}
                          className="p-1 px-1.5 rounded-lg text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-[11px] transition-all cursor-pointer"
                          title="Delete this task"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop-only Right Side: Due Date & Actions */}
                <div className="hidden sm:flex sm:flex-col sm:items-end gap-1.5 shrink-0 pl-2">
                  <div className="text-right">
                    <div className={`text-xs font-mono font-bold ${isOverdue ? 'text-rose-700' : 'text-slate-800'}`}>
                      {formatDisplayDate(ms.calculatedDate)}
                    </div>
                    {isOverdue ? (
                      <div className="text-[10px] text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300 mt-0.5 inline-flex items-center gap-1 shadow-2xs">
                        <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                        <span>{msCountdown.label}</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-sky-700 font-semibold bg-sky-50/70 px-1.5 py-0.5 rounded border border-sky-100 mt-0.5">
                        {msCountdown.label}
                      </div>
                    )}
                  </div>

                  {/* Desktop Task Actions (Edit & Delete) */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity pt-1">
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
            <div className={`w-3 h-3 rounded-full shadow-2xs ${countdown.isOverdue ? 'bg-rose-600 ring-2 ring-rose-200' : 'bg-[#0f172a]'}`} />
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

      {/* Interactive Refine Follow-up Questions Modal */}
      {isRefineModalOpen && activeEvent && (
        <EventRefineModal
          isOpen={isRefineModalOpen}
          event={activeEvent}
          onClose={() => setIsRefineModalOpen(false)}
          onApplyRefinement={(updated) => {
            if (onUpdateEvent) {
              onUpdateEvent(updated);
            }
          }}
          currentReferenceDate={currentReferenceDate}
        />
      )}

    </div>
  );
};
