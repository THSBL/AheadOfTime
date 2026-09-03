import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MessengerSidebar } from './components/MessengerSidebar';
import { ChatConsole } from './components/ChatConsole';
import { EventTimelineRadar } from './components/EventTimelineRadar';
import { ManualEventModal } from './components/ManualEventModal';
import { CustomMilestoneModal } from './components/CustomMilestoneModal';
import { GoogleCalendarSync } from './components/GoogleCalendarSync';
import { ScanAgendaModal } from './components/ScanAgendaModal';
import { BulkDeleteModal } from './components/BulkDeleteModal';
import { CalendarEvent, AgentMessage, TMinusMilestone, FocusMode } from './types';
import { INITIAL_EVENTS } from './data/samplePresets';
import { 
  MessageSquare, 
  CalendarDays, 
  CheckCircle2, 
  ListChecks, 
  PlusCircle, 
  Settings2, 
  Sparkles, 
  ChevronRight, 
  LayoutDashboard, 
  Target,
  RefreshCw,
  Check
} from 'lucide-react';
import { getStoredAccessToken, isTokenExpired } from './services/googleAuth';
import { syncGoogleTasksWithLocalEvents, TaskSyncSummary } from './services/googleTasks';
import { updateMilestoneCompletionOnGoogle } from './services/googleCalendar';

const INITIAL_MESSAGES: AgentMessage[] = [
  {
    id: 'msg-welcome-1',
    sender: 'agent',
    text: `Hello! I'm your T-Minus preparation assistant. Tell me about any upcoming event (a dinner, birthday, trip, or hosting friends), and I will calculate all your reverse-engineered preparation lead times.`,
    focusText: 'Hello! I am ready for your events.',
    additionText: 'Tell me about an upcoming event or select a scenario below.',
    timestamp: new Date('2026-09-01T03:20:00.000Z').toISOString(),
    mode: 'CREATE_AND_INTAKE',
  },
  {
    id: 'msg-welcome-2',
    sender: 'user',
    text: "Alex and Sarah are visiting and staying over the weekend from October 16th to 19th. We want to do reservations at nice restaurants and host breakfast at home.",
    timestamp: new Date('2026-09-01T03:20:30.000Z').toISOString(),
  },
  {
    id: 'msg-welcome-3',
    sender: 'agent',
    text: `I've reverse-engineered the preparation timeline for Alex & Sarah's visit! You have 1 target deadline and 4 lead-time tasks ready to sync to Google Calendar.`,
    focusText: 'I scheduled the preparation timeline for "Alex & Sarah Visiting Weekend" on 2026-10-16 at 17:00.',
    additionText: '1 Target Deadline + 4 Tasks calculated.',
    timestamp: new Date('2026-09-01T03:21:00.000Z').toISOString(),
    mode: 'RESOLVE_MILESTONES',
    associatedEventId: 'evt-alex-sarah',
  },
];

export default function App() {
  // Local storage or default initial state
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('tminus_events_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved events', e);
      }
    }
    return INITIAL_EVENTS;
  });

  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const saved = localStorage.getItem('tminus_messages_v2');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved messages', e);
      }
    }
    return INITIAL_MESSAGES;
  });

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [currentReferenceDate, setCurrentReferenceDate] = useState<string>('2026-09-01T03:20:00.000Z');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'chat' | 'tasks'>('chat');
  const [focusMode, setFocusMode] = useState<FocusMode>('welcome');
  const [isWizardInputFocused, setIsWizardInputFocused] = useState(false);
  const [viewMode, setViewMode] = useState<'landing' | 'dashboard'>('landing');

  // Modals
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isCustomMilestoneModalOpen, setIsCustomMilestoneModalOpen] = useState(false);
  const [isGoogleCalendarModalOpen, setIsGoogleCalendarModalOpen] = useState(false);
  const [isScanAgendaModalOpen, setIsScanAgendaModalOpen] = useState(false);
  const [targetEventForMilestone, setTargetEventForMilestone] = useState<CalendarEvent | null>(null);
  const [selectedBulkEventIds, setSelectedBulkEventIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const handleToggleSelectEvent = (id: string) => {
    setSelectedBulkEventIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllEvents = () => {
    setSelectedBulkEventIds(events.map((e) => e.id));
  };

  const handleDeselectAllEvents = () => {
    setSelectedBulkEventIds([]);
  };

  const handleBulkDeleteAppOnly = (ids: string[]) => {
    setEvents((prev) => prev.filter((e) => !ids.includes(e.id)));
    if (selectedEventId && ids.includes(selectedEventId)) {
      const remaining = events.filter((e) => !ids.includes(e.id));
      setSelectedEventId(remaining.length > 0 ? remaining[0].id : null);
    }
    setSelectedBulkEventIds([]);
  };

  const handleBulkDeleteAppAndCalendar = (ids: string[], cleanup: { calCount: number; taskCount: number }) => {
    setEvents((prev) => prev.filter((e) => !ids.includes(e.id)));
    if (selectedEventId && ids.includes(selectedEventId)) {
      const remaining = events.filter((e) => !ids.includes(e.id));
      setSelectedEventId(remaining.length > 0 ? remaining[0].id : null);
    }
    setSelectedBulkEventIds([]);
    setSyncToast({
      id: Date.now(),
      message: `Deleted ${ids.length} events from app. Wiped ${cleanup.calCount} Google Calendar events & ${cleanup.taskCount} tasks.`,
    });
  };

  // Google Bidirectional Sync state
  const [isSyncingWithGoogle, setIsSyncingWithGoogle] = useState(false);
  const [lastGoogleSyncTime, setLastGoogleSyncTime] = useState<Date | null>(null);
  const [syncToast, setSyncToast] = useState<{ id: number; message: string; count?: number } | null>(null);

  // Core Bidirectional Task Completion Sync
  const runGoogleTaskSync = async (silent = false) => {
    const token = getStoredAccessToken();
    if (!token || isTokenExpired()) return;

    setIsSyncingWithGoogle(true);
    try {
      const summary: TaskSyncSummary = await syncGoogleTasksWithLocalEvents(token, events);
      if (summary.updatedEvents && summary.updatedEvents !== events) {
        setEvents(summary.updatedEvents);
      }
      setLastGoogleSyncTime(new Date());

      if (summary.completedCount > 0) {
        setSyncToast({
          id: Date.now(),
          message: `${summary.completedCount} task${
            summary.completedCount > 1 ? 's' : ''
          } marked complete in Google Calendar!`,
          count: summary.completedCount,
        });
      } else if (!silent) {
        setSyncToast({
          id: Date.now(),
          message: 'Tasks are fully up to date with Google Calendar.',
        });
      }
    } catch (e) {
      console.warn('Google bidirectional task sync failed:', e);
    } finally {
      setIsSyncingWithGoogle(false);
    }
  };

  // Auto-dismiss sync toast after 4.5 seconds
  useEffect(() => {
    if (!syncToast) return;
    const timer = setTimeout(() => {
      setSyncToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [syncToast]);

  // Periodic and Event-Driven Sync (Mount, Window Focus, Visibility Change, 30s interval)
  useEffect(() => {
    const token = getStoredAccessToken();
    if (token && !isTokenExpired()) {
      runGoogleTaskSync(true);
    }

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        const t = getStoredAccessToken();
        if (t && !isTokenExpired()) {
          runGoogleTaskSync(true);
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        const t = getStoredAccessToken();
        if (t && !isTokenExpired()) {
          runGoogleTaskSync(true);
        }
      }
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      clearInterval(interval);
    };
  }, []);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('tminus_events_v2', JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem('tminus_messages_v2', JSON.stringify(messages));
  }, [messages]);

  // Counts
  const pendingMilestonesCount = events.reduce(
    (acc, evt) => acc + evt.milestones.filter((m) => m.status === 'pending').length,
    0
  );
  const watchpointsCount = events.filter((e) => e.status === 'research_watchpoint').length;

  // Send message to agent
  const handleSendMessage = async (text: string, isVoiceMemo?: boolean, audioBlob?: Blob) => {
    setIsLoading(true);
    setFocusMode('new-event');

    const userMsg: AgentMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
      isVoiceMemo: Boolean(isVoiceMemo),
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentReferenceDate,
          activeEvents: events,
          targetEventId: selectedEventId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      const newEvent: CalendarEvent = data.event;

      // Update or add event in state
      setEvents((prev) => {
        const index = prev.findIndex((e) => e.id === newEvent.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = newEvent;
          return updated;
        }
        return [newEvent, ...prev];
      });

      // Update target event in view
      setSelectedEventId(newEvent.id);

      // Add Agent Message
      const agentMsg: AgentMessage = {
        id: `agt-${Date.now()}`,
        sender: 'agent',
        text: data.replyText,
        focusText: data.focusText,
        additionText: data.additionText,
        timestamp: new Date().toISOString(),
        mode: data.mode,
        associatedEventId: newEvent.id,
        intakeQuestions: newEvent.intakeQuestions,
        generatedMilestones: newEvent.milestones,
      };

      setMessages((prev) => [...prev, agentMsg]);
      setSelectedEventId(newEvent.id);

      // AUTO-SWITCH TO DASHBOARD: If we have milestones, go to Plan tab
      if (data.mode === 'RESOLVE_MILESTONES') {
        setViewMode('dashboard');
        setActiveTab('tasks');
      }
    } catch (err: any) {
      console.error('Failed to process message:', err);
      const errorMsg: AgentMessage = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        text: `I had a temporary issue connecting to the AI service, but I have saved your event heuristics. You can also customize your milestones anytime!`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle user clicking an intake option
  const handleIntakeOptionSelect = async (
    eventId: string,
    questionId: string,
    paramKey: string,
    optionValue: string
  ) => {
    setIsLoading(true);
    setFocusMode('new-event');

    const targetEvt = events.find((e) => e.id === eventId);
    const question = targetEvt?.intakeQuestions?.find((q) => q.id === questionId);
    const chosenOption = question?.options?.find((o) => o.value === optionValue);
    const optionLabel = chosenOption?.label || optionValue;

    const userMsg: AgentMessage = {
      id: `usr-intake-${Date.now()}`,
      sender: 'user',
      text: `${optionLabel}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Intake selection: ${paramKey} = ${optionValue}`,
          currentReferenceDate,
          activeEvents: events,
          targetEventId: eventId,
          intakeAnswer: {
            questionId,
            parameterKey: paramKey,
            answerValue: optionValue,
          },
        }),
      });

      const data = await response.json();
      const updatedEvent: CalendarEvent = data.event;

      setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));

      const agentMsg: AgentMessage = {
        id: `agt-intake-${Date.now()}`,
        sender: 'agent',
        text: data.replyText,
        focusText: data.focusText,
        additionText: data.additionText,
        timestamp: new Date().toISOString(),
        mode: data.mode,
        associatedEventId: updatedEvent.id,
        generatedMilestones: updatedEvent.milestones,
      };

      setMessages((prev) => [...prev, agentMsg]);
      setSelectedEventId(updatedEvent.id);

      // AUTO-SWITCH TO DASHBOARD
      if (data.mode === 'RESOLVE_MILESTONES') {
        setViewMode('dashboard');
        setActiveTab('tasks');
      }
    } catch (err) {
      console.error('Error submitting intake option:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle tuning event variable
  const handleSelectVariable = async (
    eventId: string,
    key: string,
    value: any,
    label: string
  ) => {
    setIsLoading(true);
    setFocusMode('adjust-event');

    const userMsg: AgentMessage = {
      id: `usr-var-${Date.now()}`,
      sender: 'user',
      text: `Updated preference: ${label}`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Variable tune: ${key} = ${value}`,
          currentReferenceDate,
          activeEvents: events,
          targetEventId: eventId,
          intakeAnswer: {
            questionId: `var-${key}`,
            parameterKey: key,
            answerValue: String(value),
          },
        }),
      });

      const data = await response.json();
      const updatedEvent: CalendarEvent = data.event;

      setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));

      const agentMsg: AgentMessage = {
        id: `agt-var-${Date.now()}`,
        sender: 'agent',
        text: data.replyText,
        focusText: data.focusText,
        additionText: data.additionText,
        timestamp: new Date().toISOString(),
        mode: data.mode,
        associatedEventId: updatedEvent.id,
        generatedMilestones: updatedEvent.milestones,
      };

      setMessages((prev) => [...prev, agentMsg]);
      setSelectedEventId(updatedEvent.id);
    } catch (err) {
      console.error('Error tuning variable:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle batch intake submission
  const handleBatchIntakeSubmit = async (eventId: string, answers: Record<string, { paramKey: string, value: string }>) => {
    setIsLoading(true);
    setFocusMode('new-event');

    const userMsg: AgentMessage = {
      id: `usr-batch-${Date.now()}`,
      sender: 'user',
      text: `Submitted ${Object.keys(answers).length} preferences for event setup.`,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // We'll send these as individual turns for now or batch them if the server supported it.
      // For now, let's just send the last one but include context of all.
      // Better: send a special batch message that the server handles.
      
      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Batch intake submission for event ${eventId}`,
          currentReferenceDate,
          activeEvents: events,
          targetEventId: eventId,
          // Custom extension to our payload to handle multiple answers
          batchAnswers: Object.values(answers).map(a => ({
            parameterKey: a.paramKey,
            answerValue: a.value
          }))
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      const updatedEvent: CalendarEvent = data.event;

      setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));

      const agentMsg: AgentMessage = {
        id: `agt-batch-${Date.now()}`,
        sender: 'agent',
        text: data.replyText,
        focusText: data.focusText,
        additionText: data.additionText,
        timestamp: new Date().toISOString(),
        mode: data.mode,
        associatedEventId: updatedEvent.id,
        generatedMilestones: updatedEvent.milestones,
      };

      setMessages((prev) => [...prev, agentMsg]);
      setSelectedEventId(updatedEvent.id);

      // AUTO-SWITCH TO DASHBOARD
      if (data.mode === 'RESOLVE_MILESTONES') {
        setViewMode('dashboard');
        setActiveTab('tasks');
      }
    } catch (err: any) {
      console.error('Error submitting batch intake:', err);
      const errorMsg: AgentMessage = {
        id: `err-batch-${Date.now()}`,
        sender: 'agent',
        text: `I had an issue saving those preferences. Error: ${err.message || 'Unknown network error'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle milestone status (Bidirectional: updates local state + pushes to Google Tasks / Calendar if connected)
  const handleToggleMilestoneStatus = (eventId: string, milestoneId: string) => {
    let targetEventTitle = '';
    let targetMilestone: TMinusMilestone | null = null;
    let newStatus: 'completed' | 'pending' = 'completed';

    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId) return evt;
        targetEventTitle = evt.title;
        return {
          ...evt,
          milestones: evt.milestones.map((ms) => {
            if (ms.id !== milestoneId) return ms;
            newStatus = ms.status === 'completed' ? 'pending' : 'completed';
            targetMilestone = {
              ...ms,
              status: newStatus,
              completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
            };
            return targetMilestone;
          }),
        };
      })
    );

    // Asynchronously push completion state to Google Tasks / Calendar
    const token = getStoredAccessToken();
    if (token && !isTokenExpired() && targetMilestone) {
      updateMilestoneCompletionOnGoogle(token, targetEventTitle, targetMilestone, newStatus)
        .then((res) => {
          if (res.googleTaskUpdated) {
            console.log(`Pushed task completion (${newStatus}) to Google Tasks for:`, (targetMilestone as any)?.title);
          }
        })
        .catch((err) => {
          console.warn('Could not sync completion to Google Tasks:', err);
        });
    }
  };

  // Delete event
  const handleDeleteEvent = (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (selectedEventId === eventId) {
      const remaining = events.filter((e) => e.id !== eventId);
      setSelectedEventId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Delete event from Google Calendar ONLY (keeps in T-Minus app)
  const handleDeleteEventFromCalendarOnly = (eventId: string) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        return {
          ...e,
          googleEventId: undefined,
          googleEventLink: undefined,
          syncedToGoogleAt: undefined,
          googleMilestoneCount: 0,
          milestones: e.milestones.map((ms) => ({
            ...ms,
            googleCalendarEventId: undefined,
            googleTaskId: undefined,
          })),
        };
      })
    );
  };

  // Update whole event (e.g. after Google Calendar push attaches IDs)
  const handleUpdateEvent = (updatedEvent: CalendarEvent) => {
    setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));
  };

  // Custom milestone modal open
  const handleOpenAddCustomMilestone = (eventId: string) => {
    const target = events.find((e) => e.id === eventId);
    if (target) {
      setTargetEventForMilestone(target);
      setIsCustomMilestoneModalOpen(true);
    }
  };

  // Update existing milestone
  const handleUpdateMilestone = (eventId: string, updatedMilestone: TMinusMilestone) => {
    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId) return evt;
        return {
          ...evt,
          milestones: evt.milestones
            .map((ms) => (ms.id === updatedMilestone.id ? updatedMilestone : ms))
            .sort(
              (a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime()
            ),
        };
      })
    );
  };

  // Delete individual milestone
  const handleDeleteMilestone = (eventId: string, milestoneId: string) => {
    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== eventId) return evt;
        return {
          ...evt,
          milestones: evt.milestones.filter((ms) => ms.id !== milestoneId),
        };
      })
    );
  };

  // Save custom milestone
  const handleSaveCustomMilestone = (milestone: TMinusMilestone) => {
    setEvents((prev) =>
      prev.map((evt) => {
        if (evt.id !== milestone.eventId) return evt;
        return {
          ...evt,
          milestones: [...evt.milestones, milestone].sort(
            (a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime()
          ),
        };
      })
    );
  };

  // Save manual event
  const handleSaveManualEvent = (newEvent: CalendarEvent) => {
    setEvents((prev) => [newEvent, ...prev]);
    setSelectedEventId(newEvent.id);

    const agentMsg: AgentMessage = {
      id: `agt-manual-${Date.now()}`,
      sender: 'agent',
      text: `Scheduled: ${newEvent.title} on ${newEvent.eventDate}. I've prepared ${newEvent.milestones.length} reverse-engineered tasks for your calendar.`,
      timestamp: new Date().toISOString(),
      mode: 'RESOLVE_MILESTONES',
      associatedEventId: newEvent.id,
      generatedMilestones: newEvent.milestones,
    };
    setMessages((prev) => [...prev, agentMsg]);
  };

  // Import Tracked Events from AheadOfTime Evaluation Engine
  const handleImportTrackedEvents = (newEvents: CalendarEvent[]) => {
    if (!newEvents || newEvents.length === 0) return;
    setEvents((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.title.toLowerCase()}_${e.eventDate}`));
      const filtered = newEvents.filter((e) => !existingKeys.has(`${e.title.toLowerCase()}_${e.eventDate}`));
      const updated = [...prev, ...filtered];
      localStorage.setItem('tminus_events_v2', JSON.stringify(updated));
      return updated;
    });

    if (newEvents.length > 0) {
      setSelectedEventId(newEvents[0].id);
      setViewMode('dashboard');
      setSyncToast({
        id: Date.now(),
        message: `Imported ${newEvents.length} event${newEvents.length > 1 ? 's' : ''} from AheadOfTime Evaluation!`,
        count: newEvents.length,
      });
    }
  };

  // Reset to bare minimum state
  const handleResetData = () => {
    if (window.confirm('Reset events and chat history to the clean bare minimum?')) {
      setEvents(INITIAL_EVENTS);
      setMessages(INITIAL_MESSAGES);
      setSelectedEventId('evt-alex-sarah');
      localStorage.removeItem('tminus_events_v2');
      localStorage.removeItem('tminus_messages_v2');
      localStorage.removeItem('tminus_events');
      localStorage.removeItem('tminus_messages');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fd] via-[#f1f7fe] to-[#dbeefd] text-slate-800 flex flex-col font-sans selection:bg-[#0f172a] selection:text-white relative overflow-x-hidden">
      
      {/* Soft Ambient Light Glow in background to make blue pop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] bg-sky-300/35 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[600px] bg-blue-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-[700px] h-[700px] bg-cyan-200/40 rounded-full blur-3xl" />
        <div className="absolute top-2/3 right-1/4 w-[450px] h-[450px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      {viewMode === 'landing' ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-start p-4 bg-gradient-to-br from-[#eaf4fd] via-[#f1f7fe] to-[#dbeefd] overflow-y-auto">
          <div className="max-w-3xl w-full pt-8 sm:pt-14 pb-12 space-y-8">
            
            {/* Always Keep 'What are we prepping for?' on top */}
            <div className="text-center space-y-3 transition-all duration-300">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 text-white shadow-xs text-[11px] font-black uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                <span>T-Minus AI Agent</span>
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
                What are we <span className="text-[#0f172a] underline decoration-blue-500/40 underline-offset-8">prepping</span> for?
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm max-w-md mx-auto font-medium">
                Select an event preset or describe what you're planning to reverse-engineer all target lead times.
              </p>

              {/* Top Quick Actions: Scan existing agenda + View scheduled events */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 animate-in fade-in slide-in-from-top duration-500">
                <button
                  onClick={() => setIsScanAgendaModalOpen(true)}
                  className="w-full sm:w-auto group flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-xs sm:text-sm border border-slate-700 shadow-sm hover:shadow-md transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-sky-300" />
                  <span>Scan for existing events in your agenda</span>
                  <ChevronRight className="w-4 h-4 text-sky-300 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => {
                    setViewMode('dashboard');
                    if (!selectedEventId && events.length > 0) {
                      setSelectedEventId(events[0].id);
                    }
                  }}
                  className="w-full sm:w-auto group flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-2xl bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 font-bold text-xs sm:text-sm border border-slate-200/90 shadow-xs hover:shadow-md transition-all cursor-pointer"
                >
                  <CalendarDays className="w-4 h-4 text-slate-900" />
                  <span>View Scheduled Events</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            <div className="w-full max-w-2xl mx-auto space-y-6">
              <div className="relative flex flex-col">
                <ChatConsole
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onIntakeOptionSelect={handleIntakeOptionSelect}
                  onBatchIntakeSubmit={handleBatchIntakeSubmit}
                  onSelectVariable={handleSelectVariable}
                  onToggleMilestoneStatus={handleToggleMilestoneStatus}
                  onViewEventDetails={(evt) => {
                    setSelectedEventId(evt.id);
                    setViewMode('dashboard');
                    setActiveTab('tasks');
                  }}
                  onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
                  isLoading={isLoading}
                  events={events}
                  focusMode="new-event"
                  onFocusChange={setIsWizardInputFocused}
                  isLandingMode={true}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Milky Glass Header */}
          <div className="relative z-20">
            <Header
              currentReferenceDate={currentReferenceDate}
              onReferenceDateChange={(newDate) => setCurrentReferenceDate(newDate)}
              onResetData={handleResetData}
              onOpenNewEventModal={() => {
                setViewMode('landing');
              }}
              onOpenScanAgenda={() => setIsScanAgendaModalOpen(true)}
              onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
              isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
              isSyncingWithGoogle={isSyncingWithGoogle}
              onTriggerGoogleSync={() => runGoogleTaskSync(false)}
              lastSyncTime={lastGoogleSyncTime}
              activeEventsCount={events.length}
              pendingMilestonesCount={pendingMilestonesCount}
              watchpointsCount={watchpointsCount}
              focusMode={focusMode}
              onSetFocusMode={setFocusMode}
              events={events}
            />
          </div>

          {/* Main Dashboard Layout */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 overflow-hidden relative z-10 animate-in fade-in duration-700">
            
            {/* Left Console: Event Navigator */}
            <div className="lg:col-span-5 xl:col-span-4 h-[calc(100vh-120px)] flex flex-col">
              <MessengerSidebar
                events={events}
                selectedEventId={selectedEventId}
                onSelectEvent={(id) => {
                  setSelectedEventId(id);
                }}
                onOpenNewEventModal={() => {
                  setViewMode('landing');
                }}
                onOpenScanAgenda={() => setIsScanAgendaModalOpen(true)}
                onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
                currentReferenceDate={currentReferenceDate}
                selectedEventIds={selectedBulkEventIds}
                onToggleSelectEvent={handleToggleSelectEvent}
                onSelectAllEvents={handleSelectAllEvents}
                onDeselectAllEvents={handleDeselectAllEvents}
                onOpenBulkDeleteModal={() => setIsBulkDeleteModalOpen(true)}
              />
            </div>

            {/* Right Console: Main Preparation Workspace */}
            <div className="lg:col-span-7 xl:col-span-8 h-[calc(100vh-120px)] flex flex-col">
              <EventTimelineRadar
                events={events}
                selectedEventId={selectedEventId}
                onSelectEvent={(id) => {
                  setSelectedEventId(id);
                }}
                onToggleMilestoneStatus={handleToggleMilestoneStatus}
                onDeleteEvent={handleDeleteEvent}
                onDeleteEventFromCalendarOnly={handleDeleteEventFromCalendarOnly}
                onDeleteEventAndCalendar={handleDeleteEvent}
                onAddCustomMilestone={handleOpenAddCustomMilestone}
                onUpdateMilestone={handleUpdateMilestone}
                onDeleteMilestone={handleDeleteMilestone}
                onUpdateEvent={handleUpdateEvent}
                onOpenNewEventModal={() => {
                  setViewMode('landing');
                }}
                onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
                onSelectVariable={handleSelectVariable}
                currentReferenceDate={currentReferenceDate}
                isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
                isSyncingWithGoogle={isSyncingWithGoogle}
                onTriggerGoogleSync={() => runGoogleTaskSync(false)}
              />
            </div>
          </main>
        </>
      )}

      {/* Real-time Bidirectional Sync Notification Toast */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none">
          <div className="bg-[#0f172a] text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 pointer-events-auto">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">Google Calendar Sync</p>
              <p className="text-xs text-slate-400 font-medium">{syncToast.message}</p>
            </div>
            <button
              onClick={() => setSyncToast(null)}
              className="text-slate-500 hover:text-white text-xs ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Manual Event Modal */}
      <ManualEventModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSaveEvent={handleSaveManualEvent}
        currentReferenceDate={currentReferenceDate}
      />

      {/* Custom Milestone Modal */}
      {targetEventForMilestone && (
        <CustomMilestoneModal
          isOpen={isCustomMilestoneModalOpen}
          onClose={() => {
            setIsCustomMilestoneModalOpen(false);
            setTargetEventForMilestone(null);
          }}
          onAddMilestone={handleSaveCustomMilestone}
          eventId={targetEventForMilestone.id}
          eventDate={targetEventForMilestone.eventDate}
          eventTime={targetEventForMilestone.eventTime}
          eventTitle={targetEventForMilestone.title}
        />
      )}

      {/* Google Calendar Sync Modal */}
      {isGoogleCalendarModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <GoogleCalendarSync
              events={events}
              selectedEventId={selectedEventId || undefined}
              onUpdateEvent={handleUpdateEvent}
              onUpdateAllEvents={(updated) => setEvents(updated)}
              onClose={() => setIsGoogleCalendarModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Scan Current event in your agenda Modal */}
      <ScanAgendaModal
        isOpen={isScanAgendaModalOpen}
        onClose={() => setIsScanAgendaModalOpen(false)}
        currentReferenceDate={currentReferenceDate}
        onImportTrackedEvents={handleImportTrackedEvents}
        isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
        onOpenGoogleCalendarSync={() => {
          setIsScanAgendaModalOpen(false);
          setIsGoogleCalendarModalOpen(true);
        }}
      />

      {/* Bulk Delete Confirmation Modal */}
      <BulkDeleteModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        selectedEventIds={selectedBulkEventIds}
        events={events}
        onConfirmDeleteAppOnly={handleBulkDeleteAppOnly}
        onConfirmDeleteAppAndCalendar={handleBulkDeleteAppAndCalendar}
      />

    </div>
  );
}
