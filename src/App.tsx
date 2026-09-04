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
import { OnboardingPage } from './components/OnboardingPage';
import { LandingUSPPage } from './components/LandingUSPPage';
import { PreferencesModal } from './components/PreferencesModal';
import { CookieBanner } from './components/CookieBanner';
import { CookiePreferencesModal } from './components/CookiePreferencesModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { PrivacyPage } from './components/PrivacyPage';
import { CalendarEvent, AgentMessage, TMinusMilestone, FocusMode, OnboardingProfile, CookieConsentSettings } from './types';
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
  RotateCcw,
  Loader2,
  Check
} from 'lucide-react';
import { getStoredAccessToken, isTokenExpired } from './services/googleAuth';
import { syncGoogleTasksWithLocalEvents, TaskSyncSummary } from './services/googleTasks';
import { updateMilestoneCompletionOnGoogle } from './services/googleCalendar';

const INITIAL_MESSAGES: AgentMessage[] = [
  {
    id: 'msg-welcome-1',
    sender: 'agent',
    text: `Hello! I'm Ahead Of Time, your assistant for busy calendars. Tell me about any upcoming event (a dinner, birthday, trip, or hosting friends), or scan your Google Calendar, and I will build your backward preparation milestones so you're ready when it starts.`,
    focusText: 'Ahead Of Time is ready for your events.',
    additionText: 'Tell me about an upcoming event or connect your calendar.',
    timestamp: new Date('2026-09-01T03:20:00.000Z').toISOString(),
    mode: 'CREATE_AND_INTAKE',
  },
];

export default function App() {
  // Helper to detect if user requested the /privacy route directly
  const checkPathForPrivacy = (): boolean => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      return path === '/privacy' || path === '/privacy/' || hash === '#privacy';
    }
    return false;
  };

  // 1. State & Storage Initialization: Check storage before mounting view
  const hasCompleted = typeof window !== 'undefined' && (
    localStorage.getItem('aot_onboarding_completed') === 'true' ||
    localStorage.getItem('has_completed_onboarding') === 'true'
  );
  const isConnected = typeof window !== 'undefined' && (
    localStorage.getItem('aot_calendar_connected') === 'true' ||
    Boolean(getStoredAccessToken() && !isTokenExpired())
  );

  const [currentView, setCurrentView] = useState<'dashboard' | 'landing' | 'onboarding' | 'privacy'>(() => {
    if (checkPathForPrivacy()) {
      return 'privacy';
    }
    return (hasCompleted || isConnected) ? 'dashboard' : 'landing';
  });

  // 2. Prevent Layout Flash: loading state during verification
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Local storage or default initial state
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('tminus_events_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out old demo/sample events if user hasn't added custom ones
          const filtered = parsed.filter(
            (e: any) => e.id !== 'evt-maya-birthday' && e.id !== 'evt-alex-sarah'
          );
          return filtered;
        }
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
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(
            (m: any) => m.associatedEventId !== 'evt-alex-sarah' && m.associatedEventId !== 'evt-maya-birthday' && !m.text?.includes('Alex & Sarah')
          );
          if (filtered.length > 0) return filtered;
        }
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

  // Onboarding profile
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('aot_onboarding_completed') === 'true' ||
        localStorage.getItem('has_completed_onboarding') === 'true'
      );
    } catch {
      return false;
    }
  });

  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(() => {
    try {
      const saved = localStorage.getItem('onboarding_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Verify auth / storage on initial mount & handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      if (checkPathForPrivacy()) {
        setCurrentView('privacy');
        return;
      }
      const completed = localStorage.getItem('aot_onboarding_completed') === 'true' || localStorage.getItem('has_completed_onboarding') === 'true';
      const connected = localStorage.getItem('aot_calendar_connected') === 'true' || Boolean(getStoredAccessToken() && !isTokenExpired());
      setCurrentView((completed || connected) ? 'dashboard' : 'landing');
    };

    window.addEventListener('popstate', handlePopState);

    try {
      if (checkPathForPrivacy()) {
        setCurrentView('privacy');
      } else {
        const completed = localStorage.getItem('aot_onboarding_completed') === 'true' || localStorage.getItem('has_completed_onboarding') === 'true';
        const connected = localStorage.getItem('aot_calendar_connected') === 'true' || Boolean(getStoredAccessToken() && !isTokenExpired());
        
        if (completed || connected) {
          setCurrentView('dashboard');
        }
      }
    } catch (e) {
      console.error('Initial storage verification error:', e);
    } finally {
      setIsInitializing(false);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Navigation handlers between views and privacy URL
  const navigateToPrivacyPage = () => {
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState(null, '', '/privacy');
    }
    setCurrentView('privacy');
  };

  const navigateToHome = () => {
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState(null, '', '/');
    }
    const completed = localStorage.getItem('aot_onboarding_completed') === 'true' || localStorage.getItem('has_completed_onboarding') === 'true';
    const connected = localStorage.getItem('aot_calendar_connected') === 'true' || Boolean(getStoredAccessToken() && !isTokenExpired());
    setCurrentView((completed || connected) ? 'dashboard' : 'landing');
  };

  // 3. Onboarding & Connection Completion Handlers
  const handleCompleteOnboarding = (profile: OnboardingProfile, action: 'connect_calendar' | 'go_dashboard') => {
    try {
      localStorage.setItem('aot_onboarding_completed', 'true');
      localStorage.setItem('aot_calendar_connected', 'true');
      localStorage.setItem('has_completed_onboarding', 'true');
      localStorage.setItem('onboarding_profile', JSON.stringify(profile));
    } catch (e) {
      console.warn('Could not save onboarding profile', e);
    }
    setHasCompletedOnboarding(true);
    setOnboardingProfile(profile);
    setCurrentView('dashboard');

    if (action === 'connect_calendar') {
      setIsScanAgendaModalOpen(true);
    }
  };

  const handleLandingConnectCalendar = () => {
    try {
      localStorage.setItem('aot_onboarding_completed', 'true');
      localStorage.setItem('aot_calendar_connected', 'true');
      localStorage.setItem('has_completed_onboarding', 'true');
    } catch (e) {
      console.warn('Could not save calendar connection state', e);
    }
    setCurrentView('dashboard');
    setIsScanAgendaModalOpen(true);
  };

  // 4. Testing & Demo Reset Handler
  const handleResetDemo = () => {
    if (window.confirm('Reset all demo data and storage to test the first-time visitor landing page and onboarding flow?')) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.warn('Error clearing storage', e);
      }
      window.location.href = '/';
      window.location.reload();
    }
  };

  // Modals & Compliance
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isCookiePreferencesModalOpen, setIsCookiePreferencesModalOpen] = useState(false);
  const [cookieSettings, setCookieSettings] = useState<CookieConsentSettings>(() => {
    try {
      const saved = localStorage.getItem('has_cookie_consent_v1');
      return saved ? JSON.parse(saved) : { hasConsented: false, functional: true, analytics: false };
    } catch {
      return { hasConsented: false, functional: true, analytics: false };
    }
  });

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isCustomMilestoneModalOpen, setIsCustomMilestoneModalOpen] = useState(false);
  const [isGoogleCalendarModalOpen, setIsGoogleCalendarModalOpen] = useState(false);
  const [isScanAgendaModalOpen, setIsScanAgendaModalOpen] = useState(false);
  const [agendaHorizonMonths, setAgendaHorizonMonths] = useState<number>(6);
  const [targetEventForMilestone, setTargetEventForMilestone] = useState<CalendarEvent | null>(null);
  const [selectedBulkEventIds, setSelectedBulkEventIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [mobileDashboardView, setMobileDashboardView] = useState<'list' | 'detail'>('list');

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
        setCurrentView('dashboard');
        setMobileDashboardView('detail');
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
        setCurrentView('dashboard');
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
        setCurrentView('dashboard');
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
      text: `Scheduled: ${newEvent.title} on ${newEvent.eventDate}. I've prepared ${newEvent.milestones.length} preparation milestones for your calendar.`,
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
      setCurrentView('dashboard');
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

  // 2. Prevent Layout Flash: Show neutral centered loading spinner while checking storage / session
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#f1f7fe] flex flex-col items-center justify-center p-4 text-slate-600 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-center mb-3">
          <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-slate-500 tracking-wide">
          Loading Ahead Of Time...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fd] via-[#f1f7fe] to-[#dbeefd] text-slate-800 flex flex-col font-sans selection:bg-[#0f172a] selection:text-white relative overflow-x-hidden">
      
      {/* Soft Ambient Light Glow in background to make blue pop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] bg-sky-300/35 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[600px] bg-blue-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-[700px] h-[700px] bg-cyan-200/40 rounded-full blur-3xl" />
        <div className="absolute top-2/3 right-1/4 w-[450px] h-[450px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      {currentView === 'privacy' ? (
        <div className="relative z-10 w-full min-h-screen">
          <PrivacyPage onNavigateHome={navigateToHome} />
        </div>
      ) : currentView === 'landing' ? (
        <div className="relative z-10 w-full h-screen overflow-y-auto">
          <LandingUSPPage
            onGetStarted={() => setCurrentView('onboarding')}
            onExploreDashboard={handleLandingConnectCalendar}
            onGoToDashboard={() => setCurrentView('dashboard')}
            onOpenPrivacyPolicy={navigateToPrivacyPage}
          />
        </div>
      ) : currentView === 'onboarding' ? (
        <div className="relative z-10 w-full h-screen overflow-y-auto">
          <OnboardingPage
            initialProfile={onboardingProfile || undefined}
            onComplete={handleCompleteOnboarding}
            onOpenPrivacyPolicy={navigateToPrivacyPage}
          />
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
                setSelectedEventId(null);
                setActiveTab('chat');
                setFocusMode('welcome');
                setMobileDashboardView('detail');
              }}
              onOpenScanAgenda={() => setIsScanAgendaModalOpen(true)}
              onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
              onOpenOnboarding={() => setIsPreferencesModalOpen(true)}
              isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
              isSyncingWithGoogle={isSyncingWithGoogle}
              onTriggerGoogleSync={() => runGoogleTaskSync(false)}
              lastSyncTime={lastGoogleSyncTime}
              activeEventsCount={events.length}
              pendingMilestonesCount={pendingMilestonesCount}
              watchpointsCount={watchpointsCount}
              focusMode={focusMode}
              onSetFocusMode={(mode) => {
                setFocusMode(mode);
                if (mode === 'welcome') {
                  setSelectedEventId(null);
                  setActiveTab('chat');
                  setMobileDashboardView('detail');
                }
              }}
              events={events}
              agendaHorizonMonths={agendaHorizonMonths}
              onAgendaHorizonChange={setAgendaHorizonMonths}
            />
          </div>

          {/* Main Dashboard Layout (Master-Detail on Mobile, 2-Column on Desktop) */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 overflow-hidden relative z-10 animate-in fade-in duration-700">
            
            {/* Left Console: Event Navigator (Screen State 1 on mobile) */}
            <div className={`${mobileDashboardView === 'detail' ? 'hidden lg:flex' : 'flex'} lg:col-span-5 xl:col-span-4 h-[calc(100vh-140px)] flex-col w-full`}>
              <MessengerSidebar
                events={events}
                selectedEventId={selectedEventId}
                onSelectEvent={(id) => {
                  setSelectedEventId(id);
                  setActiveTab('tasks');
                  setFocusMode('adjust-event');
                  setMobileDashboardView('detail');
                }}
                onOpenNewEventModal={() => {
                  setSelectedEventId(null);
                  setActiveTab('chat');
                  setFocusMode('welcome');
                  setMobileDashboardView('detail');
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

            {/* Right Console: Main Preparation Workspace / Presets Planner (Screen State 2 on mobile) */}
            <div className={`${mobileDashboardView === 'list' ? 'hidden lg:flex' : 'flex'} lg:col-span-7 xl:col-span-8 h-[calc(100vh-140px)] flex-col w-full`}>
              
              {/* Workspace Navigation Bar */}
              <div className="flex items-center justify-between pb-2 shrink-0">
                <div className="flex items-center gap-1.5 p-1 bg-white/80 backdrop-blur-md rounded-2xl border border-sky-200/90 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventId(null);
                      setActiveTab('chat');
                      setFocusMode('welcome');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      activeTab === 'chat' || !selectedEventId || focusMode === 'welcome'
                        ? 'bg-[#0f172a] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    <span>Presets &amp; New Event</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (events.length > 0) {
                        if (!selectedEventId) setSelectedEventId(events[0].id);
                        setActiveTab('tasks');
                        setFocusMode('adjust-event');
                      }
                    }}
                    disabled={events.length === 0}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95 ${
                      activeTab === 'tasks' && selectedEventId && focusMode !== 'welcome'
                        ? 'bg-[#0f172a] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Timeline &amp; Tasks</span>
                    {events.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-sky-100 text-sky-950 font-bold rounded-full font-mono">
                        {events.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Quick action for manual modal if ever desired */}
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-900 font-medium underline cursor-pointer hidden sm:inline-flex items-center gap-1"
                  title="Open traditional manual event form"
                >
                  <span>Manual form modal</span>
                </button>
              </div>

              {/* Workspace Content */}
              {activeTab === 'chat' || !selectedEventId || focusMode === 'welcome' ? (
                <div className="flex-1 min-h-0 h-full overflow-y-auto">
                  <ChatConsole
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onIntakeOptionSelect={handleIntakeOptionSelect}
                    onBatchIntakeSubmit={handleBatchIntakeSubmit}
                    onSelectVariable={handleSelectVariable}
                    onToggleMilestoneStatus={handleToggleMilestoneStatus}
                    onViewEventDetails={(event) => {
                      setSelectedEventId(event.id);
                      setActiveTab('tasks');
                      setFocusMode('adjust-event');
                    }}
                    onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
                    isLoading={isLoading}
                    events={events}
                    focusMode={focusMode}
                    onFocusChange={setIsWizardInputFocused}
                  />
                </div>
              ) : (
                <EventTimelineRadar
                  events={events}
                  selectedEventId={selectedEventId}
                  onSelectEvent={(id) => {
                    setSelectedEventId(id);
                    if (id) {
                      setMobileDashboardView('detail');
                      setActiveTab('tasks');
                      setFocusMode('adjust-event');
                    }
                  }}
                  onBackToList={() => setMobileDashboardView('list')}
                  onToggleMilestoneStatus={handleToggleMilestoneStatus}
                  onDeleteEvent={(id) => {
                    handleDeleteEvent(id);
                    setMobileDashboardView('list');
                  }}
                  onDeleteEventFromCalendarOnly={handleDeleteEventFromCalendarOnly}
                  onDeleteEventAndCalendar={(id, cleanup) => {
                    handleDeleteEvent(id);
                    setMobileDashboardView('list');
                  }}
                  onAddCustomMilestone={handleOpenAddCustomMilestone}
                  onUpdateMilestone={handleUpdateMilestone}
                  onDeleteMilestone={handleDeleteMilestone}
                  onUpdateEvent={handleUpdateEvent}
                  onOpenNewEventModal={() => {
                    setSelectedEventId(null);
                    setActiveTab('chat');
                    setFocusMode('welcome');
                  }}
                  onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
                  onSelectVariable={handleSelectVariable}
                  currentReferenceDate={currentReferenceDate}
                  isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
                  isSyncingWithGoogle={isSyncingWithGoogle}
                  onTriggerGoogleSync={() => runGoogleTaskSync(false)}
                />
              )}
            </div>
          </main>

          {/* Clean Minimalist Footer */}
          <footer className="w-full max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between text-xs text-slate-400 border-t border-slate-200/50 mt-auto relative z-10 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPreferencesModalOpen(true)}
                className="hover:text-slate-700 transition-colors cursor-pointer"
              >
                Preferences &amp; Heuristics
              </button>
              <span className="text-slate-300">&bull;</span>
              <button
                type="button"
                onClick={() => setIsPrivacyModalOpen(true)}
                className="hover:text-slate-700 transition-colors cursor-pointer"
              >
                Privacy Notice
              </button>
            </div>

            <div className="flex items-center gap-2 mt-1.5 sm:mt-0">
              <button
                type="button"
                id="btn-footer-reset-demo"
                onClick={handleResetDemo}
                className="text-[11px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                title="Reset local demo data"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Reset Demo</span>
              </button>
            </div>
          </footer>
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
        onboardingProfile={onboardingProfile}
        initialScanMonths={agendaHorizonMonths}
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

      {/* Preferences & Heuristics Calibration Modal */}
      <PreferencesModal
        isOpen={isPreferencesModalOpen}
        onClose={() => setIsPreferencesModalOpen(false)}
        profile={onboardingProfile}
        onSaveProfile={(profile) => {
          setOnboardingProfile(profile);
          try {
            localStorage.setItem('onboarding_profile', JSON.stringify(profile));
          } catch (e) {
            console.warn('Failed to save profile', e);
          }
        }}
        onOpenPrivacyPolicy={() => {
          setIsPreferencesModalOpen(false);
          setIsPrivacyModalOpen(true);
        }}
        agendaHorizonMonths={agendaHorizonMonths}
        onAgendaHorizonChange={setAgendaHorizonMonths}
        onResetDemo={handleResetDemo}
      />

      {/* Cookie Consent Banner */}
      <CookieBanner
        onOpenPreferences={() => setIsCookiePreferencesModalOpen(true)}
        onConsentAccepted={(settings) => setCookieSettings(settings)}
      />

      {/* Cookie Preferences Modal */}
      <CookiePreferencesModal
        isOpen={isCookiePreferencesModalOpen}
        onClose={() => setIsCookiePreferencesModalOpen(false)}
        currentSettings={cookieSettings}
        onSavePreferences={(settings) => {
          setCookieSettings(settings);
          try {
            localStorage.setItem('has_cookie_consent_v1', JSON.stringify(settings));
          } catch (e) {
            console.warn('Failed to save cookie settings', e);
          }
        }}
      />

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
        onOpenFullPage={navigateToPrivacyPage}
      />

    </div>
  );
}
