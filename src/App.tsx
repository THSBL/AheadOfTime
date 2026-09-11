import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate, 
  useNavigate, 
  useLocation, 
  useParams,
  useSearchParams,
  Outlet
} from 'react-router-dom';
import { Header } from './components/Header';
import { MessengerSidebar } from './components/MessengerSidebar';
import { ChatConsole } from './components/ChatConsole';
import { EventTimelineRadar } from './components/EventTimelineRadar';
import { MyWeekAhead } from './components/MyWeekAhead';
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
import { FeaturesPage } from './components/FeaturesPage';
import { FeedbackPage } from './components/FeedbackPage';
import { AuthCallbackPage } from './components/AuthCallbackPage';
import { SettingsCredentialsPage } from './components/SettingsCredentialsPage';
import { SettingsProfilePage } from './components/SettingsProfilePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AnalyticsTracker } from './components/AnalyticsTracker';
import { ImportTemplateModal } from './components/ImportTemplateModal';
import { ApplyPresetModal } from './components/ApplyPresetModal';
import { CalendarEvent, AgentMessage, TMinusMilestone, FocusMode, OnboardingProfile, CookieConsentSettings, CustomPreset } from './types';
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
  Check,
  FileSpreadsheet
} from 'lucide-react';
import { getStoredAccessToken, isTokenExpired, requestGoogleCalendarToken, clearGoogleSession, getStoredClientId } from './services/googleAuth';
import { syncGoogleTasksWithLocalEvents, TaskSyncSummary } from './services/googleTasks';
import { updateMilestoneCompletionOnGoogle, fetchPrimaryCalendarProfile } from './services/googleCalendar';
import { detectEventCategory, generateHeuristicMilestones, getCleanEventTitle, sortEventsUpcomingFirst } from './utils/tminusRules';
import { loadCustomPresets, saveCustomPresets, projectPresetToMilestones } from './utils/templateEngine';
import {
  AuthUser,
  getCurrentUser,
  setCurrentUser as setGlobalCurrentUser,
  loadUserEvents,
  saveUserEvents,
  loadUserMessages,
  saveUserMessages,
  logoutAndClearAccountSession
} from './services/accountManager';
import { UserProfileProvider, useUserProfile } from './contexts/UserProfileContext';

const INITIAL_MESSAGES: AgentMessage[] = [
  {
    id: 'msg-welcome-1',
    sender: 'agent',
    text: `Hello! I'm Ahead Of Time, your assistant for busy calendars. Tell me about any upcoming event (a dinner, birthday, trip, or hosting friends), or scan your Google Calendar, and I will build your backward preparation milestones so you are ready when it starts.`,
    focusText: 'Ahead Of Time is ready for your events.',
    additionText: 'Tell me about an upcoming event or connect your calendar.',
    timestamp: new Date('2026-09-01T03:20:00.000Z').toISOString(),
    mode: 'CREATE_AND_INTAKE',
  },
];

// Helper function to safely merge synced Google/external events with local events without deleting newly created local items
function mergeEvents(existingEvents: CalendarEvent[], syncedEvents: CalendarEvent[]): CalendarEvent[] {
  if (!syncedEvents || syncedEvents.length === 0) return existingEvents;

  const syncedMap = new Map<string, CalendarEvent>();
  syncedEvents.forEach((evt) => syncedMap.set(evt.id, evt));

  // Update existing events if present in syncedEvents
  const updatedExisting = existingEvents.map((evt) => {
    const synced = syncedMap.get(evt.id);
    if (!synced) return evt; // Keep existing local event intact even if not in synced list

    const syncedMsMap = new Map((synced.milestones || []).map((m) => [m.id, m]));
    const mergedMilestones = (evt.milestones || []).map((m) => {
      const syncedMs = syncedMsMap.get(m.id) || (m.googleTaskId ? synced.milestones?.find((sm) => sm.googleTaskId === m.googleTaskId) : undefined);
      if (syncedMs) {
        return {
          ...m,
          status: syncedMs.status,
          googleTaskId: syncedMs.googleTaskId || m.googleTaskId,
          completedAt: syncedMs.completedAt || m.completedAt,
        };
      }
      return m;
    });

    return {
      ...evt,
      ...synced,
      milestones: mergedMilestones,
    };
  });

  // Add any brand-new events from synced
  const existingIds = new Set(existingEvents.map((e) => e.id));
  const newSyncedEvents = syncedEvents.filter((e) => !existingIds.has(e.id));

  return [...updatedExisting, ...newSyncedEvents];
}

function App() {
  // Helper to detect if user requested the /privacy route directly
  const checkPathForPrivacy = (): boolean => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      return path === '/privacy' || path === '/privacy/' || hash === '#privacy';
    }
    return false;
  };

  // 1. Account & Multi-Tenant State Isolation
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getCurrentUser());

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

  // User-isolated events state (strictly empty when logged out)
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const user = getCurrentUser();
    if (!user?.id) return [];
    return loadUserEvents(user.id);
  });

  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Persist events to user-scoped storage whenever events change
  useEffect(() => {
    if (!isInitializing && currentUser?.id) {
      saveUserEvents(events, currentUser.id);
    }
  }, [events, currentUser?.id, isInitializing]);

  // Strictly enforce empty events state and clean storage when user is logged out
  useEffect(() => {
    if (!currentUser?.id) {
      setEvents([]);
      setSelectedEventId(null);
      setSelectedBulkEventIds([]);
      try {
        localStorage.removeItem('tminus_events_v2');
        localStorage.removeItem('tminus_events_v2_guest');
        localStorage.removeItem('tminus_events_v2:guest');
        localStorage.removeItem('tminus_events');
      } catch {}
    }
  }, [currentUser?.id]);

  // User-isolated messages state
  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const user = getCurrentUser();
    return loadUserMessages(user?.id, user?.name);
  });

  // Persist messages to user-scoped storage whenever messages change
  useEffect(() => {
    if (!isInitializing) {
      saveUserMessages(messages, currentUser?.id);
    }
  }, [messages, currentUser?.id, isInitializing]);

  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id?: string }>();

  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => params.id || null);

  useEffect(() => {
    if (params.id) {
      setSelectedEventId(params.id);
      setActiveTab('tasks');
      setFocusMode('adjust-event');
    }
  }, [params.id]);

  const [currentReferenceDate, setCurrentReferenceDate] = useState<string>('2026-09-01T03:20:00.000Z');

  // Chronologically sort active events from shortly upcoming to further in the future
  const sortedEvents = useMemo(() => {
    return sortEventsUpcomingFirst(events, currentReferenceDate);
  }, [events, currentReferenceDate]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'chat' | 'tasks'>('feed');
  const [focusMode, setFocusMode] = useState<FocusMode>('welcome');
  const [isWizardInputFocused, setIsWizardInputFocused] = useState(false);

  // User-isolated onboarding profile
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

  // Single source of truth for the onboarding profile - derived from
  // UserProfileContext, which tracks the active account itself.
  const { profile: onboardingProfile, saveProfile } = useUserProfile();

  // Account switch event listener & verification on mount
  useEffect(() => {
    const handleAccountSwitched = (e: any) => {
      const nextUser: AuthUser | null = e.detail?.user || null;
      setCurrentUser(nextUser);
      
      const freshEvents = nextUser?.id ? loadUserEvents(nextUser.id) : [];
      const freshMessages = loadUserMessages(nextUser?.id, nextUser?.name);

      setEvents(freshEvents);
      setMessages(freshMessages);
      // onboardingProfile itself is refreshed by UserProfileContext's own
      // aot_account_switched listener - no need to duplicate that here.
      setSelectedEventId(null);
      setSelectedBulkEventIds([]);
    };

    window.addEventListener('aot_account_switched', handleAccountSwitched as EventListener);

    // Verify current Google Auth token against current stored profile
    const token = getStoredAccessToken();
    if (token && !isTokenExpired()) {
      fetchPrimaryCalendarProfile(token).then((profile) => {
        if (profile?.id) {
          const userEmail = profile.id.toLowerCase().trim();
          const active = getCurrentUser();
          if (!active || active.id !== userEmail) {
            const newUser: AuthUser = {
              id: userEmail,
              email: userEmail,
              name: profile.summary || profile.id,
              timeZone: profile.timeZone,
              provider: 'google',
              connectedAt: new Date().toISOString(),
            };
            setGlobalCurrentUser(newUser);
            setCurrentUser(newUser);
            setEvents(loadUserEvents(newUser.id));
            setMessages(loadUserMessages(newUser.id, newUser.name));
            // setGlobalCurrentUser dispatches aot_account_switched, which
            // UserProfileContext listens for to refresh onboardingProfile.
          }
        }
      }).catch((err) => {
        console.warn('Google Profile check on mount notice:', err);
      });
    }

    return () => {
      window.removeEventListener('aot_account_switched', handleAccountSwitched as EventListener);
    };
  }, []);

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

  // Periodically sync and merge events created via Telegram Assistant (Strictly User-Scoped)
  useEffect(() => {
    // If not authenticated, do not poll or sync telegram events
    if (!currentUser?.id) {
      return;
    }

    const syncTelegramEvents = async () => {
      try {
        const userParam = `?userId=${encodeURIComponent(currentUser.id)}`;
        const accessToken = getStoredAccessToken();
        const res = await fetch(`/api/telegram/events${userParam}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.events) && data.events.length > 0) {
          // Double check user didn't log out while request was in flight
          if (!currentUser?.id) return;

          setEvents((prev) => {
            const prevIds = new Set(prev.map((e) => e.id));
            const newIncoming = data.events.filter((e: CalendarEvent) => !prevIds.has(e.id));

            if (newIncoming.length > 0) {
              // Add notification message to agent chat console for newly detected Telegram events
              const newMessages: AgentMessage[] = newIncoming.map((newEvent: CalendarEvent) => ({
                id: `msg-tg-${newEvent.id}-${Date.now()}`,
                sender: 'agent',
                text: `📥 **New Event from Telegram**: "${newEvent.title}" (${newEvent.eventDate}). Generated ${newEvent.milestones?.length || 0} backward preparation milestones.`,
                associatedEventId: newEvent.id,
                focusText: `Parsed from Telegram chat: ${newEvent.title}`,
                additionText: `Activated ${newEvent.milestones?.length || 0} T-Minus milestones for ${newEvent.eventDate}.`,
                timestamp: new Date().toISOString(),
                mode: 'EVENT_FOCUS',
              }));

              setMessages((prevMsgs) => {
                const existingMsgIds = new Set(prevMsgs.map((m) => m.id));
                const filteredNew = newMessages.filter((m) => !existingMsgIds.has(m.id));
                const updated = [...prevMsgs, ...filteredNew];
                saveUserMessages(updated, currentUser?.id);
                return updated;
              });

              // Select the newest incoming event if none is currently selected
              if (!selectedEventId && newIncoming[0]) {
                setSelectedEventId(newIncoming[0].id);
              }
            }

            const merged = mergeEvents(prev, data.events);
            saveUserEvents(merged, currentUser?.id);
            return merged;
          });
        }
      } catch (e) {
        // Silently catch background polling errors
      }
    };

    syncTelegramEvents();
    const interval = window.setInterval(syncTelegramEvents, 4000);
    window.addEventListener('focus', syncTelegramEvents);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncTelegramEvents);
    };
  }, [selectedEventId, currentUser?.id]);

  // Account switching and clean logout actions
  const handleSignIn = async () => {
    try {
      const res = await requestGoogleCalendarToken(getStoredClientId());
      if (res?.accessToken) {
        const profile = await fetchPrimaryCalendarProfile(res.accessToken);
        if (profile?.id) {
          const userEmail = profile.id.toLowerCase().trim();
          sessionStorage.setItem('gcal_profile', JSON.stringify(profile));
          const user: AuthUser = {
            id: userEmail,
            email: userEmail,
            name: profile.summary || profile.id,
            timeZone: profile.timeZone,
            provider: 'google',
            connectedAt: new Date().toISOString(),
          };
          setGlobalCurrentUser(user);
          setCurrentUser(user);
          setEvents(loadUserEvents(user.id));
          setMessages(loadUserMessages(user.id, user.name));
          // setGlobalCurrentUser dispatches aot_account_switched, which
          // UserProfileContext listens for to refresh onboardingProfile.
          setCurrentView('dashboard');
        }
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      const res = await requestGoogleCalendarToken(getStoredClientId());
      if (res?.accessToken) {
        const profile = await fetchPrimaryCalendarProfile(res.accessToken);
        if (profile?.id) {
          const userEmail = profile.id.toLowerCase().trim();
          sessionStorage.setItem('gcal_profile', JSON.stringify(profile));
          const user: AuthUser = {
            id: userEmail,
            email: userEmail,
            name: profile.summary || profile.id,
            timeZone: profile.timeZone,
            provider: 'google',
            connectedAt: new Date().toISOString(),
          };
          setGlobalCurrentUser(user);
          setCurrentUser(user);
          setEvents(loadUserEvents(user.id));
          setMessages(loadUserMessages(user.id, user.name));
          // setGlobalCurrentUser dispatches aot_account_switched, which
          // UserProfileContext listens for to refresh onboardingProfile.
          setSelectedEventId(null);
        }
      }
    } catch (err: any) {
      console.error('Account switch error:', err);
    }
  };

  const handleSignOut = () => {
    logoutAndClearAccountSession();
    clearGoogleSession();
    setCurrentUser(null);
    setEvents([]);
    setSelectedBulkEventIds([]);
    setMessages(loadUserMessages('guest'));
    // logoutAndClearAccountSession dispatches aot_account_switched (user:
    // null), which UserProfileContext listens for to refresh onboardingProfile.
    setSelectedEventId(null);
    setCurrentView('landing');
  };

  // Check for auto-scan trigger from onboarding, login, or redirect
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldScan = 
      searchParams.get('scan') === 'true' || 
      searchParams.get('action') === 'scan' || 
      sessionStorage.getItem('aot_open_scan_modal') === 'true';

    if (shouldScan) {
      sessionStorage.removeItem('aot_open_scan_modal');
      setIsScanAgendaModalOpen(true);
      if (searchParams.has('scan') || searchParams.has('action')) {
        searchParams.delete('scan');
        searchParams.delete('action');
        const remaining = searchParams.toString();
        navigate({ pathname: location.pathname, search: remaining ? `?${remaining}` : '' }, { replace: true });
      }
    }
  }, [location.search, location.pathname, navigate]);

  // Navigation handlers using router
  const navigateToPrivacyPage = () => {
    navigate('/privacy');
  };

  const navigateToHome = () => {
    navigate('/');
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
    saveProfile(profile);
    setHasCompletedOnboarding(true);
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

  const isNewEventRoute = location.pathname === '/events/new' || new URLSearchParams(location.search).get('modal') === 'new';
  const isEditRoute = location.pathname.endsWith('/edit');

  const [isManualModalOpen, setIsManualModalOpen] = useState(isNewEventRoute || isEditRoute);
  const [refinementEvent, setRefinementEvent] = useState<CalendarEvent | null>(null);
  const [wizardStage, setWizardStage] = useState<'step1_title' | 'step2_refinement' | 'step3_milestones'>('step1_title');

  useEffect(() => {
    setIsManualModalOpen(isNewEventRoute || isEditRoute);
  }, [location.pathname, location.search]);

  // Deep-link handler for Telegram & external refinement: ?event_id=...&action=refine
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const eventIdParam = sp.get('event_id') || sp.get('eventId');
    const actionParam = sp.get('action') || sp.get('stage');

    if (eventIdParam) {
      // 1. Check local state
      const target = events.find((e) => e.id === eventIdParam);
      if (target) {
        setSelectedEventId(target.id);
        setMobileDashboardView('detail');
        setActiveTab('tasks');
        if (actionParam === 'refine' || actionParam === 'step2_refinement') {
          setRefinementEvent(target);
          setWizardStage('step2_refinement');
          setIsManualModalOpen(true);
        }
        // Clean URL parameters so manual refresh doesn't trap user
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (currentUser?.id) {
        // 2. Fetch from Telegram server events store
        const telegramAuthHeaders = (() => {
          const token = getStoredAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        })();
        fetch(`/api/telegram/event/${encodeURIComponent(eventIdParam)}?userId=${encodeURIComponent(currentUser.id)}`, {
          headers: telegramAuthHeaders,
        })
          .then((r) => r.json())
          .then((data) => {
            const found = data.event;
            if (found) {
              setEvents((prev) => {
                const updated = [found, ...prev.filter((e) => e.id !== found.id)];
                if (currentUser?.id) {
                  saveUserEvents(updated, currentUser.id);
                }
                return updated;
              });
              setSelectedEventId(found.id);
              setMobileDashboardView('detail');
              setActiveTab('tasks');
              if (actionParam === 'refine' || actionParam === 'step2_refinement') {
                setRefinementEvent(found);
                setWizardStage('step2_refinement');
                setIsManualModalOpen(true);
              }
              window.history.replaceState({}, document.title, window.location.pathname);
            } else {
              // Fallback to searching all events
              return fetch(`/api/telegram/events?userId=${encodeURIComponent(currentUser?.id || '')}`, {
                headers: telegramAuthHeaders,
              })
                .then((r) => r.json())
                .then((allData) => {
                  const f = (allData.events || []).find((e: CalendarEvent) => e.id === eventIdParam);
                  if (f) {
                    setEvents((prev) => {
                      const updated = [f, ...prev.filter((e) => e.id !== f.id)];
                      if (currentUser?.id) {
                        saveUserEvents(updated, currentUser.id);
                      }
                      return updated;
                    });
                    setSelectedEventId(f.id);
                    setMobileDashboardView('detail');
                    setActiveTab('tasks');
                    if (actionParam === 'refine' || actionParam === 'step2_refinement') {
                      setRefinementEvent(f);
                      setWizardStage('step2_refinement');
                      setIsManualModalOpen(true);
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                  }
                });
            }
          })
          .catch((err) => console.warn('Could not fetch telegram event for refinement:', err));
      }
    }
  }, [location.search, events]);

  const handleCloseManualModal = () => {
    setIsManualModalOpen(false);
    setRefinementEvent(null);
    setWizardStage('step1_title');
    const sp = new URLSearchParams(location.search);
    if (sp.has('eventId') || sp.has('stage')) {
      navigate('/dashboard', { replace: true });
      return;
    }
    if (location.pathname === '/events/new' || new URLSearchParams(location.search).get('modal') === 'new') {
      navigate('/events', { replace: true });
    } else if (location.pathname.endsWith('/edit')) {
      navigate(selectedEventId ? `/events/${selectedEventId}` : '/events', { replace: true });
    }
  };
  const [isCustomMilestoneModalOpen, setIsCustomMilestoneModalOpen] = useState(false);
  const [isGoogleCalendarModalOpen, setIsGoogleCalendarModalOpen] = useState(false);
  const [isScanAgendaModalOpen, setIsScanAgendaModalOpen] = useState(false);
  const [agendaHorizonMonths, setAgendaHorizonMonths] = useState<number>(6);
  const [targetEventForMilestone, setTargetEventForMilestone] = useState<CalendarEvent | null>(null);
  const [selectedBulkEventIds, setSelectedBulkEventIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  // Defaults to 'detail' so refreshing/landing on the dashboard shows the
  // workspace (My Week Ahead, since activeTab also defaults to 'feed')
  // rather than the raw Active Events list - that list is a picker you
  // drill into a specific event's timeline from, not the landing screen.
  const [mobileDashboardView, setMobileDashboardView] = useState<'list' | 'detail'>('detail');

  // Custom Presets & Spreadsheet Importer State
  const [isImportTemplateModalOpen, setIsImportTemplateModalOpen] = useState(false);
  const [isApplyPresetModalOpen, setIsApplyPresetModalOpen] = useState(false);
  const [applyPresetTargetEvent, setApplyPresetTargetEvent] = useState<CalendarEvent | null>(null);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(() => loadCustomPresets());

  const handleCustomPresetsUpdated = (updated: CustomPreset[]) => {
    setCustomPresets(updated);
    saveCustomPresets(updated);
  };

  const handleOpenApplyPreset = (event: CalendarEvent) => {
    setApplyPresetTargetEvent(event);
    setIsApplyPresetModalOpen(true);
  };

  const handleApplyPresetToEvent = (
    event: CalendarEvent,
    preset: CustomPreset,
    mode: 'replace' | 'augment',
    customMilestones?: any[]
  ) => {
    const presetName = preset.title || preset.name || 'Preset';
    const projectedMilestones = projectPresetToMilestones(
      preset,
      event.eventDate,
      event.eventTime || '10:00',
      event.id,
      customMilestones
    );

    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== event.id) return e;

        let finalMilestones: TMinusMilestone[] = [];
        if (mode === 'replace') {
          finalMilestones = projectedMilestones;
        } else {
          finalMilestones = [...(e.milestones || []), ...projectedMilestones];
        }

        return {
          ...e,
          milestones: finalMilestones,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    const confirmMessage: AgentMessage = {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      text: `Applied preset "${presetName}" (${projectedMilestones.length} milestones) to "${event.title}" in ${mode} mode using deterministic T-minus projection.`,
      associatedEventId: event.id,
      timestamp: new Date().toISOString(),
      mode: 'NORMAL',
    };
    setMessages((prev) => [...prev, confirmMessage]);
    setSelectedEventId(event.id);
    setActiveTab('tasks');
  };

  const handleApplyCustomPresetToNewEvent = (
    preset: CustomPreset,
    targetDate: string,
    targetTime: string,
    eventTitle: string
  ) => {
    const newEventId = `evt-${Date.now()}`;
    const presetName = preset.title || preset.name || 'Preset';
    const cleanTitle = eventTitle.trim() || presetName;
    const projectedMilestones = projectPresetToMilestones(
      preset,
      targetDate,
      targetTime || '09:00',
      newEventId
    );

    const newEvent: CalendarEvent = {
      id: newEventId,
      title: cleanTitle,
      eventDate: targetDate,
      eventTime: targetTime || '09:00',
      category: (preset.category as any) || 'custom',
      milestones: projectedMilestones,
      status: 'milestones_active',
      userRole: 'organiser',
      context: {
        notes: preset.description || `Configured with deterministic preset "${presetName}"`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setEvents((prev) => [newEvent, ...prev]);
    setSelectedEventId(newEventId);
    setActiveTab('tasks');
    setFocusMode('adjust-event');

    const confirmMessage: AgentMessage = {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      text: `Created new event "${cleanTitle}" with ${projectedMilestones.length} preparation milestones from template preset "${presetName}". Instant deterministic projection completed!`,
      associatedEventId: newEventId,
      timestamp: new Date().toISOString(),
      mode: 'NORMAL',
    };
    setMessages((prev) => [...prev, confirmMessage]);
  };

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

  // Minimum gap between automatic (non-forced) syncs. This used to be a 24h
  // "once a day" gate, which meant a change made in Google Tasks could sit
  // unreflected in the app for up to a day unless the user knew to hit
  // "Force Sync Now" - exactly the kind of silent drift that erodes trust in
  // the sync. Google Tasks quota headroom is generous for a call this cheap,
  // so this now only exists to stop back-to-back triggers (mount + focus
  // firing together, etc.) from double-firing, not to throttle freshness.
  const MIN_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  // How often to re-check while the app is open and in the foreground.
  const BACKGROUND_SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  // Core Bidirectional Task Completion Sync
  const runGoogleTaskSync = async (silent = true, force = false) => {
    const token = getStoredAccessToken();
    if (!token || isTokenExpired()) return;

    if (!force) {
      const lastSync = localStorage.getItem('aot_last_task_sync_time');
      const now = Date.now();
      if (lastSync && now - parseInt(lastSync, 10) < MIN_AUTO_SYNC_INTERVAL_MS) {
        return;
      }
    }

    setIsSyncingWithGoogle(true);
    try {
      const currentEvents = eventsRef.current;
      const summary: TaskSyncSummary = await syncGoogleTasksWithLocalEvents(token, currentEvents);
      if (summary.updatedEvents) {
        setEvents((prev) => mergeEvents(prev, summary.updatedEvents));
      }
      const nowTs = Date.now();
      localStorage.setItem('aot_last_task_sync_time', nowTs.toString());
      setLastGoogleSyncTime(new Date(nowTs));

      // ONLY show toast popup if forcefully requested by explicit user action
      if (force) {
        const parts: string[] = [];
        if (summary.completedCount > 0) {
          parts.push(`${summary.completedCount} completed`);
        }
        if (summary.uncompletedCount > 0) {
          parts.push(`${summary.uncompletedCount} reopened`);
        }
        if (summary.skippedCount > 0) {
          parts.push(`${summary.skippedCount} skipped (deleted in Google Tasks)`);
        }
        setSyncToast({
          id: Date.now(),
          message: parts.length > 0
            ? `Synced from Google Tasks: ${parts.join(', ')}.`
            : 'Tasks are fully up to date with Google Calendar.',
          count: summary.completedCount,
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

  // Keep Google Tasks sync fresh while the app is in use: once on mount,
  // again whenever the tab regains focus/visibility (the moment a user is
  // most likely to have just changed something in Google Tasks elsewhere),
  // and periodically in the background otherwise. Each call still respects
  // MIN_AUTO_SYNC_INTERVAL_MS above, so this is cheap even if multiple
  // triggers fire close together.
  useEffect(() => {
    const trySync = () => {
      const token = getStoredAccessToken();
      if (token && !isTokenExpired()) {
        runGoogleTaskSync(true, false);
      }
    };

    trySync();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        trySync();
      }
    };
    window.addEventListener('focus', trySync);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(trySync, BACKGROUND_SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('focus', trySync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  // Counts
  const pendingMilestonesCount = (events || []).reduce(
    (acc, evt) => acc + (evt.milestones || []).filter((m) => m.status === 'pending').length,
    0
  );
  const watchpointsCount = (events || []).filter((e) => e.status === 'research_watchpoint').length;

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
      const [response] = await Promise.all([
        fetch('/api/agent/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            currentReferenceDate,
            activeEvents: events,
            targetEventId: undefined,
            userProfile: { homeZipOrLocation: onboardingProfile?.homeZipOrLocation },
          }),
        }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);

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
      setCurrentView('dashboard');
      setMobileDashboardView('detail');
      setActiveTab('tasks');
      setFocusMode('adjust-event');
    } catch (err: any) {
      console.error('Failed to process message server-side, falling back to client-side heuristics:', err);
      const category = detectEventCategory(text);

      let targetDate = '2026-09-25';
      let targetTime = '19:00';
      const dateMatch = text.match(/\b(20\d\d-\d\d-\d\d)\b/);
      if (dateMatch) targetDate = dateMatch[1];
      const timeMatch = text.match(/\b(\d\d:\d\d)\b/);
      if (timeMatch) targetTime = timeMatch[1];

      let title = text.split('.')[0].replace(/\[.*?\]/g, '').trim();
      title = getCleanEventTitle(title, category);

      const eventId = `evt-${Date.now()}`;
      const milestones = generateHeuristicMilestones({ category, context: {} }, eventId, targetDate, targetTime);

      const fallbackEvent: CalendarEvent = {
        id: eventId,
        title,
        category,
        eventDate: targetDate,
        eventTime: targetTime,
        status: 'milestones_active',
        context: {},
        milestones,
        rawInputSnippet: text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setEvents((prev) => [fallbackEvent, ...prev]);
      setSelectedEventId(fallbackEvent.id);

      const agentMsg: AgentMessage = {
        id: `agt-${Date.now()}`,
        sender: 'agent',
        text: `FOCUS: I created the event "${title}" on ${targetDate}.\nADDITION: Preparation milestones have been calculated based on standard timing buffers.`,
        focusText: `I created the event "${title}" on ${targetDate}.`,
        additionText: `Preparation milestones have been calculated based on standard timing buffers.`,
        timestamp: new Date().toISOString(),
        mode: 'RESOLVE_MILESTONES',
        associatedEventId: fallbackEvent.id,
        generatedMilestones: milestones,
      };

      setMessages((prev) => [...prev, agentMsg]);
      setCurrentView('dashboard');
      setMobileDashboardView('detail');
      setActiveTab('tasks');
      setFocusMode('adjust-event');
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
      setCurrentView('dashboard');
      setMobileDashboardView('detail');
      setActiveTab('tasks');
      setFocusMode('adjust-event');
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
      setCurrentView('dashboard');
      setMobileDashboardView('detail');
      setActiveTab('tasks');
      setFocusMode('adjust-event');
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
          milestones: (evt.milestones || []).map((ms) => {
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
          milestones: (e.milestones || []).map((ms) => ({
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
          milestones: (evt.milestones || [])
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
          milestones: (evt.milestones || []).filter((ms) => ms.id !== milestoneId),
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
          milestones: [...(evt.milestones || []), milestone].sort(
            (a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime()
          ),
        };
      })
    );
  };

  // Save manual event (upsert to avoid duplicates from Telegram or calendar imports)
  const handleSaveManualEvent = (newEvent: CalendarEvent) => {
    setEvents((prev) => {
      const existsIdx = prev.findIndex((e) => e.id === newEvent.id);
      let updated: CalendarEvent[];
      if (existsIdx >= 0) {
        updated = [...prev];
        updated[existsIdx] = newEvent;
      } else {
        updated = [newEvent, ...prev];
      }
      if (currentUser?.id) {
        saveUserEvents(updated, currentUser.id);
      }
      return updated;
    });

    setSelectedEventId(newEvent.id);
    setActiveTab('tasks');
    setFocusMode('adjust-event');
    setMobileDashboardView('detail');
    setRefinementEvent(null);
    setWizardStage('step1_title');

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

  // Import Tracked Events from Ahead Of Time Evaluation Engine
  const handleImportTrackedEvents = (newEvents: CalendarEvent[]) => {
    if (!newEvents || newEvents.length === 0) return;
    setEvents((prev) => {
      const existingKeys = new Set(prev.map((e) => `${e.title.toLowerCase()}_${e.eventDate}`));
      const filtered = newEvents.filter((e) => !existingKeys.has(`${e.title.toLowerCase()}_${e.eventDate}`));
      const updated = [...prev, ...filtered];
      saveUserEvents(updated, currentUser?.id);
      return updated;
    });

    if (newEvents.length > 0) {
      setSelectedEventId(newEvents[0].id);
      setActiveTab('tasks');
      setFocusMode('adjust-event');
      setMobileDashboardView('detail');
      setCurrentView('dashboard');
      setSyncToast({
        id: Date.now(),
        message: `Imported ${newEvents.length} event${newEvents.length > 1 ? 's' : ''} from Ahead Of Time Evaluation!`,
        count: newEvents.length,
      });
    }
  };

  // Reset to bare minimum state
  const handleResetData = () => {
    if (window.confirm('Reset events and chat history to the clean bare minimum for this account?')) {
      const initEvents: CalendarEvent[] = [];
      const initMessages = INITIAL_MESSAGES;
      setEvents(initEvents);
      setMessages(initMessages);
      setSelectedEventId(null);
      saveUserEvents(initEvents, currentUser?.id);
      saveUserMessages(initMessages, currentUser?.id);
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
    <div className="min-h-screen bg-fixed bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#f5f4ee_55%,#5c6f80_100%)] text-slate-800 flex flex-col font-sans selection:bg-[#0e1d2c] selection:text-white relative overflow-x-hidden">
      
      {/* Soft Ambient Light Glow in background to make blue pop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[650px] h-[650px] bg-sky-300/35 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/4 -right-32 w-[600px] h-[600px] bg-blue-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-[700px] h-[700px] bg-cyan-200/40 rounded-full blur-3xl" />
        <div className="absolute top-2/3 right-1/4 w-[450px] h-[450px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      {/* Milky Glass Header */}
      <div className="relative z-20">
            <Header
              currentReferenceDate={currentReferenceDate}
              onReferenceDateChange={(newDate) => setCurrentReferenceDate(newDate)}
              onResetData={handleResetData}
              onOpenNewEventModal={() => {
                navigate('/events/new');
              }}
              onOpenScanAgenda={() => setIsScanAgendaModalOpen(true)}
              onOpenGoogleCalendarSync={() => navigate('/settings/credentials')}
              onOpenOnboarding={() => navigate('/settings/profile')}
              isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
              isSyncingWithGoogle={isSyncingWithGoogle}
              onTriggerGoogleSync={() => runGoogleTaskSync(false, true)}
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
              events={sortedEvents}
              agendaHorizonMonths={agendaHorizonMonths}
              onAgendaHorizonChange={setAgendaHorizonMonths}
              currentUser={currentUser}
              onSwitchAccount={handleSwitchAccount}
              onSignOut={handleSignOut}
              onSignIn={handleSignIn}
            />
          </div>

          {/* Main Dashboard Layout (Master-Detail on Mobile, 2-Column on Desktop) */}
          <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 overflow-hidden relative z-10 animate-in fade-in duration-700">
            

            
            {/* Left Console: Event Navigator (Screen State 1 on mobile) */}
            <div className={`${mobileDashboardView === 'detail' ? 'hidden lg:flex' : 'flex'} lg:col-span-5 xl:col-span-4 h-[calc(100vh-140px)] flex-col w-full`}>
              <MessengerSidebar
                events={sortedEvents}
                selectedEventId={selectedEventId}
                onSelectEvent={(id) => {
                  setSelectedEventId(id);
                  setActiveTab('tasks');
                  setFocusMode('adjust-event');
                  setMobileDashboardView('detail');
                  navigate(`/events/${id}`);
                }}
                onOpenNewEventModal={() => {
                  navigate('/events/new');
                }}
                onOpenScanAgenda={() => setIsScanAgendaModalOpen(true)}
                onOpenGoogleCalendarSync={() => setIsGoogleCalendarModalOpen(true)}
                onBackToTabs={() => setMobileDashboardView('detail')}
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
                      setActiveTab('feed');
                      setMobileDashboardView('detail');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      activeTab === 'feed'
                        ? 'bg-[#0f172a] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>My Week Ahead</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventId(null);
                      setActiveTab('chat');
                      setFocusMode('welcome');
                      setMobileDashboardView('detail');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      activeTab === 'chat'
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
                      if (sortedEvents.length > 0) {
                        setActiveTab('tasks');
                        setFocusMode('adjust-event');
                        // Active Events is the starting point for a detailed
                        // timeline, not a destination of its own - jump
                        // straight back into whatever event was already
                        // selected, otherwise show the picker to choose one.
                        setMobileDashboardView(selectedEventId ? 'detail' : 'list');
                      }
                    }}
                    disabled={sortedEvents.length === 0}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 active:scale-95 ${
                      activeTab === 'tasks' && selectedEventId && focusMode !== 'welcome'
                        ? 'bg-[#0f172a] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <ListChecks className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Timeline &amp; Tasks</span>
                    {sortedEvents.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-sky-100 text-sky-950 font-bold rounded-full font-mono">
                        {sortedEvents.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Quick actions for manual modal */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(true)}
                    className="text-xs text-slate-500 hover:text-slate-900 font-medium underline cursor-pointer hidden sm:inline-flex items-center gap-1"
                    title="Open traditional manual event form"
                  >
                    <span>Manual form modal</span>
                  </button>
                </div>
              </div>

              {/* Workspace Content */}
              {activeTab === 'feed' ? (
                <MyWeekAhead
                  events={sortedEvents}
                  currentReferenceDate={currentReferenceDate}
                  onSelectEvent={(id) => {
                    setSelectedEventId(id);
                    setActiveTab('tasks');
                    setFocusMode('adjust-event');
                    setMobileDashboardView('detail');
                    navigate(`/events/${id}`);
                  }}
                  onToggleMilestoneStatus={handleToggleMilestoneStatus}
                  onOpenNewEventModal={() => {
                    setSelectedEventId(null);
                    setActiveTab('chat');
                    setFocusMode('welcome');
                  }}
                  onOpenScanAgenda={() => setIsScanAgendaModalOpen(true)}
                />
              ) : activeTab === 'chat' || !selectedEventId || focusMode === 'welcome' ? (
                <div className="flex-1 min-h-0 h-full overflow-y-auto">
                  <ChatConsole
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onSaveEvent={handleSaveManualEvent}
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
                    onOpenImporter={() => setIsImportTemplateModalOpen(true)}
                    onApplyCustomPreset={handleApplyCustomPresetToNewEvent}
                    savedPresets={customPresets}
                    onPresetsUpdated={handleCustomPresetsUpdated}
                    isLoading={isLoading}
                    events={sortedEvents}
                    focusMode={focusMode}
                    onFocusChange={setIsWizardInputFocused}
                    onboardingProfile={onboardingProfile}
                    onOpenPreferences={() => setIsPreferencesModalOpen(true)}
                  />
                </div>
              ) : (
                <EventTimelineRadar
                  events={sortedEvents}
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
                  onOpenApplyPreset={handleOpenApplyPreset}
                  onSelectVariable={handleSelectVariable}
                  currentReferenceDate={currentReferenceDate}
                  isGoogleConnected={Boolean(getStoredAccessToken() && !isTokenExpired())}
                  isSyncingWithGoogle={isSyncingWithGoogle}
                  onTriggerGoogleSync={() => runGoogleTaskSync(false, true)}
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
              <a
                href="/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  navigateToPrivacyPage();
                }}
                className="hover:text-slate-700 transition-colors cursor-pointer"
              >
                Privacy Policy
              </a>
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
        onClose={handleCloseManualModal}
        onSaveEvent={handleSaveManualEvent}
        currentReferenceDate={currentReferenceDate}
        initialStage={wizardStage}
        initialEvent={refinementEvent}
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
              onUpdateAllEvents={(updated) => setEvents((prev) => mergeEvents(prev, updated))}
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
        existingEvents={events}
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
          try {
            localStorage.setItem('onboarding_profile', JSON.stringify(profile));
          } catch (e) {
            console.warn('Failed to save profile', e);
          }
          saveProfile(profile);
        }}
        onOpenPrivacyPolicy={() => {
          setIsPreferencesModalOpen(false);
          setIsPrivacyModalOpen(true);
        }}
        agendaHorizonMonths={agendaHorizonMonths}
        onAgendaHorizonChange={setAgendaHorizonMonths}
        onResetDemo={handleResetDemo}
      />

      {/* Dynamic Spreadsheet Importer (.csv / .xlsx) */}
      <ImportTemplateModal
        isOpen={isImportTemplateModalOpen}
        onClose={() => setIsImportTemplateModalOpen(false)}
        onSavePreset={(newPreset) => {
          const updated = [...customPresets, newPreset];
          handleCustomPresetsUpdated(updated);
        }}
        onApplyDirectly={(preset) => {
          const activeEvent = events.find((e) => e.id === selectedEventId);
          if (activeEvent) {
            handleOpenApplyPreset(activeEvent);
          } else {
            handleApplyCustomPresetToNewEvent(
              preset,
              new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
              '09:00',
              preset.name
            );
          }
        }}
      />

      {/* Deterministic Apply Preset Modal (Replace vs Augment) */}
      <ApplyPresetModal
        isOpen={isApplyPresetModalOpen}
        onClose={() => {
          setIsApplyPresetModalOpen(false);
          setApplyPresetTargetEvent(null);
        }}
        event={applyPresetTargetEvent}
        presets={customPresets}
        onApplyPreset={handleApplyPresetToEvent}
        onOpenImporter={() => setIsImportTemplateModalOpen(true)}
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

// Landing Route Component
function LandingRoute() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = searchParams.get('returnTo');
  const hasDeepLinkEvent = searchParams.has('event_id') || searchParams.has('eventId');

  useEffect(() => {
    if (hasDeepLinkEvent) {
      try {
        localStorage.setItem('aot_onboarding_completed', 'true');
        localStorage.setItem('has_completed_onboarding', 'true');
      } catch (e) {}
      navigate('/dashboard' + location.search, { replace: true });
    }
  }, [hasDeepLinkEvent, location.search, navigate]);

  if (hasDeepLinkEvent) {
    return null;
  }

  const hasCompleted = typeof window !== 'undefined' && (
    localStorage.getItem('aot_onboarding_completed') === 'true' ||
    localStorage.getItem('has_completed_onboarding') === 'true'
  );

  const isConnected = typeof window !== 'undefined' && (
    localStorage.getItem('aot_calendar_connected') === 'true' ||
    Boolean(getStoredAccessToken() && !isTokenExpired())
  );

  const handleEnterApp = () => {
    try {
      localStorage.setItem('aot_onboarding_completed', 'true');
      localStorage.setItem('has_completed_onboarding', 'true');
    } catch (e) {
      console.warn('Could not save onboarding state', e);
    }
    const target = returnTo ? decodeURIComponent(returnTo) : '/dashboard';
    navigate(target);
  };

  return (
    <LandingUSPPage
      onGetStarted={() => navigate('/onboarding')}
      onExploreDashboard={handleEnterApp}
      onGoToDashboard={hasCompleted || isConnected ? handleEnterApp : undefined}
      onOpenPrivacyPolicy={() => navigate('/privacy')}
    />
  );
}

// Onboarding Route Component
function OnboardingRoute() {
  const navigate = useNavigate();
  const { saveProfile } = useUserProfile();

  const handleComplete = (profile: OnboardingProfile, action: 'connect_calendar' | 'go_dashboard') => {
    try {
      localStorage.setItem('onboarding_profile', JSON.stringify(profile));
      localStorage.setItem('aot_onboarding_completed', 'true');
      localStorage.setItem('has_completed_onboarding', 'true');
      if (action === 'connect_calendar') {
        localStorage.setItem('aot_calendar_connected', 'true');
        sessionStorage.setItem('aot_open_scan_modal', 'true');
      }
    } catch (e) {
      console.warn('Error saving onboarding profile', e);
    }
    saveProfile(profile);
    navigate(action === 'connect_calendar' ? '/dashboard?scan=true' : '/dashboard');
  };

  return (
    <OnboardingPage
      onComplete={handleComplete}
      onOpenPrivacyPolicy={() => navigate('/privacy')}
    />
  );
}

// Main App Router Entry Point
export default function AppWithRouter() {
  return (
    <UserProfileProvider>
      <BrowserRouter>
        <AnalyticsTracker />
        <Routes>
          {/* Public / SEO Routes */}
          <Route path="/" element={<LandingRoute />} />
          <Route path="/onboarding" element={<OnboardingRoute />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<App />} />
            <Route path="/events" element={<App />} />
            <Route path="/events/new" element={<App />} />
            <Route path="/events/:id" element={<App />} />
            <Route path="/events/:id/edit" element={<App />} />
            <Route path="/settings/credentials" element={<SettingsCredentialsPage />} />
            <Route path="/settings/profile" element={<SettingsProfilePage />} />
          </Route>

          {/* Catch-all Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </UserProfileProvider>
  );
}
