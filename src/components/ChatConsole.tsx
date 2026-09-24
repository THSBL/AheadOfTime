import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  Square,
  Sparkles,
  Calendar,
  Check,
  SlidersHorizontal,
  Plus,
  ChevronRight,
  Target,
  ArrowLeft,
  Clock,
  MapPin,
  Gift,
  Shirt,
  Utensils,
  Car,
  Home,
  FileCheck,
  ShieldCheck,
  Megaphone,
  Briefcase,
  Wrench,
  X,
  Layers,
  FileSpreadsheet,
  Zap,
  GraduationCap,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { AgentMessage, CalendarEvent, UserEventRole, CustomPreset, OnboardingProfile, IntakeQuestion, IntakeOption } from '../types';
import {
  getVisiblePresets,
  getCategorizedPresets,
  normalizeProfile,
  PRESET_KIDS_SCHOOL,
  PRESET_KIDS_HOBBIES,
  PromptPreset
} from '../data/samplePresets';
import { ThinkingModule } from './ThinkingModule';
import { formatDisplayDate, getEventTopicLabel } from '../utils/tminusRules';
import { loadCustomPresets } from '../utils/templateEngine';
import { MySavedPresetsView } from './MySavedPresetsView';
import { LaunchPresetModal } from './LaunchPresetModal';
import { EventCreationWizard } from './EventCreationWizard';
import { CanonicalCategory } from '../utils/creationStateMachine';

function mapPresetIdToCanonicalCategory(presetId: string): CanonicalCategory {
  if (presetId === 'hobbies') return 'hobbies';
  if (presetId === 'kids_hobbies') return 'kids_hobbies';
  if (presetId === 'kids_school' || presetId === 'kids') return 'kids_school';
  if (presetId === 'trip') return 'trip';
  if (presetId === 'friends' || presetId === 'friends_family' || presetId === 'friends_visiting') return 'friends_visiting';
  if (presetId === 'birthday' || presetId === 'party') return 'party';
  if (presetId === 'subscription') return 'subscription';
  if (presetId === 'maintenance') return 'maintenance';
  if (presetId === 'project' || presetId === 'work_projects') return 'project_management';
  return 'party';
}

interface ChatConsoleProps {
  messages: AgentMessage[];
  onSendMessage: (text: string, isVoiceMemo?: boolean, audioBlob?: Blob) => void;
  onSaveEvent?: (event: CalendarEvent) => void;
  onIntakeOptionSelect: (eventId: string, questionId: string, paramKey: string, optionValue: string) => void;
  onBatchIntakeSubmit?: (eventId: string, answers: Record<string, { paramKey: string, value: string, label: string }>) => void;
  onSelectVariable?: (eventId: string, key: string, value: any, label: string) => void;
  onToggleMilestoneStatus?: (eventId: string, milestoneId: string) => void;
  onViewEventDetails?: (event: CalendarEvent) => void;
  onOpenGoogleCalendarSync?: () => void;
  onOpenImporter?: () => void;
  onApplyCustomPreset?: (preset: CustomPreset, targetDate: string, targetTime: string, eventTitle: string) => void;
  savedPresets?: CustomPreset[];
  onPresetsUpdated?: (updated: CustomPreset[]) => void;
  isLoading: boolean;
  events: CalendarEvent[];
  focusMode?: 'welcome' | 'new-event' | 'adjust-event';
  onFocusChange?: (isFocused: boolean) => void;
  isLandingMode?: boolean;
  onboardingProfile?: OnboardingProfile | null;
  onOpenPreferences?: () => void;
  currentReferenceDate: string;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  messages,
  onSendMessage,
  onSaveEvent,
  onIntakeOptionSelect,
  onBatchIntakeSubmit,
  onSelectVariable,
  onToggleMilestoneStatus,
  onViewEventDetails,
  onOpenGoogleCalendarSync,
  onOpenImporter,
  onApplyCustomPreset,
  savedPresets: propSavedPresets,
  onPresetsUpdated: propOnPresetsUpdated,
  isLoading,
  events,
  focusMode,
  onFocusChange,
  isLandingMode,
  onboardingProfile,
  onOpenPreferences,
  currentReferenceDate,
}) => {
  // Dynamic Profile Calibration
  const categorizedPresets = getCategorizedPresets(onboardingProfile);

  const [inputText, setInputText] = useState('');
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Custom Presets State
  const [localSavedPresets, setLocalSavedPresets] = useState<CustomPreset[]>(() => loadCustomPresets());
  // loadCustomPresets() always merges in a handful of app-provided
  // "verified built-in" runway templates (used elsewhere by
  // ApplyPresetModal for applying a template to an existing event) -
  // excluded here so the Imported Presets tab genuinely starts empty and
  // only ever shows what the user themselves imported or saved, matching
  // its own description.
  const currentSavedPresets = (propSavedPresets || localSavedPresets).filter((p) => !p.isBuiltIn);
  const [activePresetExplorerTab, setActivePresetExplorerTab] = useState<'core' | 'work' | 'saved'>('core');
  const [selectedLaunchPreset, setSelectedLaunchPreset] = useState<CustomPreset | null>(null);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);

  const handleUpdatePresets = (updated: CustomPreset[]) => {
    setLocalSavedPresets(updated);
    if (propOnPresetsUpdated) {
      propOnPresetsUpdated(updated);
    }
  };

  const handleStartLaunch = (preset: CustomPreset) => {
    setSelectedLaunchPreset(preset);
    setIsLaunchModalOpen(true);
  };

  const handleConfirmLaunch = (preset: CustomPreset, targetDate: string, targetTime: string, eventTitle: string) => {
    if (onApplyCustomPreset) {
      onApplyCustomPreset(preset, targetDate, targetTime, eventTitle);
    }
  };
  
  // Preset Guided Intake Workflow State
  const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
  const [presetStep, setPresetStep] = useState<'initial' | 'who_when' | 'refine'>('initial');
  // Tracks which preset card to show as selected in the grid, even after
  // "Change Preset" clears selectedPreset and returns the user to it.
  const [lastSelectedPresetId, setLastSelectedPresetId] = useState<string | null>(null);
  
  // Who & When Fields
  const [whoInput, setWhoInput] = useState('');
  const [presetUserRole, setPresetUserRole] = useState<UserEventRole>('organiser');
  const [dateInput, setDateInput] = useState('2026-10-24');
  const [timeInput, setTimeInput] = useState('19:00');
  const [locationInput, setLocationInput] = useState('');
  const [tripReturnDate, setTripReturnDate] = useState('2026-10-31');
  const [tripReturnTime, setTripReturnTime] = useState('17:00');
  const [needPassportRenewal, setNeedPassportRenewal] = useState(false);
  const [needVisa, setNeedVisa] = useState(false);
  const [lockActivities, setLockActivities] = useState(true);
  const [needFlights, setNeedFlights] = useState(true);
  const [needHotel, setNeedHotel] = useState(true);
  const [needRentalCar, setNeedRentalCar] = useState(false);
  const [recommendAccommodation, setRecommendAccommodation] = useState(true);
  const [gearSunscreen, setGearSunscreen] = useState(true);
  const [gearHikingBoots, setGearHikingBoots] = useState(true);
  const [gearSnorkelGear, setGearSnorkelGear] = useState(false);
  const [gearSkiGear, setGearSkiGear] = useState(false);
  const [gearAdapters, setGearAdapters] = useState(true);
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [newCustomItemInput, setNewCustomItemInput] = useState('');

  // Friends visiting options state
  const [diningRestaurant, setDiningRestaurant] = useState(true);
  const [diningBreakfastHouse, setDiningBreakfastHouse] = useState(true);
  const [diningHomeCooked, setDiningHomeCooked] = useState(true);
  const [activityTouristSpots, setActivityTouristSpots] = useState(true);
  const [activityHiking, setActivityHiking] = useState(false);
  const [activityBoardGames, setActivityBoardGames] = useState(true);
  const [stayGuestRoom, setStayGuestRoom] = useState(true);

  // Refinement Answers State
  const [refinements, setRefinements] = useState<Record<string, { paramKey: string; value: string; label: string }>>({});
  const [partyItems, setPartyItems] = useState<string[]>([]);
  const [newPartyItemInput, setNewPartyItemInput] = useState('');
  const [customNote, setCustomNote] = useState('');

  // Conversational creation flow (architecture reset Phase C): a running
  // thread, held entirely local to this component and never touching the
  // app's real `events` state until the user explicitly taps "Create
  // event." Deliberately a separate array from the parent's own
  // `messages` prop (which logs already-committed events' history) so an
  // abandoned draft never pollutes that log, and so this component can
  // freely reset it on "Start over" without needing a prop back to the
  // parent for that.
  const [draftConversation, setDraftConversation] = useState<AgentMessage[]>([]);
  const [draftEvent, setDraftEvent] = useState<CalendarEvent | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [draftReplyInput, setDraftReplyInput] = useState('');
  // Set only while waiting on the user's answer to a pre-creation
  // clarifying question (see askClarifyingQuestion/handleInitialDraftMessage
  // below) - holds the original message so the eventual full-generation
  // call gets ONE combined prompt (original + answer) instead of the
  // original being discarded once a question was asked about it.
  const [pendingClarification, setPendingClarification] = useState<{ originalMessage: string } | null>(null);
  const draftScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    draftScrollRef.current?.scrollTo({ top: draftScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [draftConversation, isDraftLoading]);

  const resetDraftConversation = () => {
    setDraftConversation([]);
    setDraftEvent(null);
    setDraftReplyInput('');
    setIsDraftLoading(false);
    setPendingClarification(null);
  };

  // Runs the actual plan-generation call - shared by "no clarification was
  // needed" (called with the original message) and "clarification just got
  // answered" (called with the original message + the answer combined into
  // one prompt, per the explicit design: ask Gemini what to ask first, then
  // feed it the full combined prompt in one generation call, rather than
  // creating a thin plan and patching it - live-tested that patching
  // produced visibly generic results ("Calendar Event" / "Event Framework
  // Established") compared to generating from full context in one pass).
  // Also reused for ordinary follow-ups once a draftEvent already exists
  // (targetEventId then correctly routes it as a refinement, not a
  // duplicate creation).
  const sendDraftTurn = async (
    userBubbleText: string | null,
    extraBody: Record<string, unknown>
  ) => {
    if (userBubbleText !== null) {
      const userMsg: AgentMessage = {
        id: `usr-draft-${Date.now()}`,
        sender: 'user',
        text: userBubbleText,
        timestamp: new Date().toISOString(),
      };
      setDraftConversation((prev) => [...prev, userMsg]);
    }
    setIsDraftLoading(true);
    try {
      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentReferenceDate,
          activeEvents: events,
          targetEventId: draftEvent?.id,
          userProfile: { homeZipOrLocation: onboardingProfile?.homeZipOrLocation },
          ...extraBody,
        }),
      });
      if (!response.ok) throw new Error(`Server returned status ${response.status}`);
      const data = await response.json();
      const updatedEvent: CalendarEvent = data.event;
      setDraftEvent(updatedEvent);
      const agentMsg: AgentMessage = {
        id: `agt-draft-${Date.now()}`,
        sender: 'agent',
        text: data.replyText,
        focusText: data.focusText,
        additionText: data.additionText,
        timestamp: new Date().toISOString(),
        mode: data.mode,
        associatedEventId: updatedEvent.id,
        intakeQuestions: updatedEvent.intakeQuestions,
        generatedMilestones: updatedEvent.milestones,
      };
      setDraftConversation((prev) => [...prev, agentMsg]);
    } catch (err) {
      console.warn('Draft conversation turn failed:', err);
      const failureMsg: AgentMessage = {
        id: `agt-draft-error-${Date.now()}`,
        sender: 'agent',
        text: "Couldn't process that just now - please try again.",
        timestamp: new Date().toISOString(),
      };
      setDraftConversation((prev) => [...prev, failureMsg]);
    } finally {
      setIsDraftLoading(false);
    }
  };

  // The very first message in a fresh conversation: check with Gemini
  // whether one clarifying question is worth asking BEFORE generating
  // anything, rather than always generating a full (possibly under-
  // specified) plan immediately. A failed/slow check just falls through to
  // generating straight away - this pre-check must never block creation.
  const handleInitialDraftMessage = async (text: string) => {
    const userMsg: AgentMessage = {
      id: `usr-draft-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setDraftConversation([userMsg]);
    setIsDraftLoading(true);

    let needsClarification = false;
    try {
      const res = await fetch('/api/agent/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, currentReferenceDate }),
      });
      const data = await res.json();
      if (data?.needsClarification && data.question && Array.isArray(data.options) && data.options.length >= 2) {
        needsClarification = true;
        setPendingClarification({ originalMessage: text });
        const agentMsg: AgentMessage = {
          id: `agt-clarify-${Date.now()}`,
          sender: 'agent',
          text: data.question,
          timestamp: new Date().toISOString(),
          clarifyOptions: data.options,
        };
        setDraftConversation((prev) => [...prev, agentMsg]);
        setIsDraftLoading(false);
      }
    } catch (err) {
      console.warn('Clarify check failed, proceeding straight to plan generation:', err);
    }

    if (!needsClarification) {
      // No bubble to add here - the user's message is already shown above,
      // and sendDraftTurn's own loading state picks up where this left off.
      await sendDraftTurn(null, { message: text });
    }
  };

  const handleDraftFreeformSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isDraftLoading) return;

    if (pendingClarification) {
      const combined = `${pendingClarification.originalMessage}. ${trimmed}`;
      setPendingClarification(null);
      sendDraftTurn(trimmed, { message: combined });
      return;
    }

    if (draftConversation.length === 0) {
      handleInitialDraftMessage(trimmed);
      return;
    }

    sendDraftTurn(trimmed, { message: trimmed });
  };

  const handleClarifyOptionSelect = (originalMessage: string, option: string) => {
    if (isDraftLoading) return;
    setPendingClarification(null);
    sendDraftTurn(option, { message: `${originalMessage}. ${option}` });
  };

  const handleDraftIntakeOptionSelect = (question: IntakeQuestion, option: IntakeOption) => {
    if (isDraftLoading) return;
    sendDraftTurn(option.label, {
      message: `Intake selection: ${question.parameterKey} = ${option.value}`,
      intakeAnswer: {
        questionId: question.id,
        parameterKey: question.parameterKey,
        answerValue: option.value,
      },
    });
  };

  const handleCreateDraftEvent = () => {
    if (!draftEvent || !onSaveEvent) return;
    onSaveEvent(draftEvent);
    resetDraftConversation();
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const whoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Focus who input when step becomes who_when
  useEffect(() => {
    if (presetStep === 'who_when' && whoInputRef.current) {
      setTimeout(() => whoInputRef.current?.focus(), 100);
    }
  }, [presetStep]);

  // Handle choosing a preset
  const handleSelectPreset = (preset: PromptPreset) => {
    setSelectedPreset(preset);
    setLastSelectedPresetId(preset.id);
    setPresetStep('who_when');
    setRefinements({});
    setPartyItems([]);
    setNewPartyItemInput('');
    setCustomItems([]);
    setNewCustomItemInput('');
    setWhoInput('');
    setPresetUserRole('organiser');
    
    // Set default reasonable dates based on category
    const targetDate = new Date('2026-09-02');
    if (preset.id === 'birthday') {
      targetDate.setDate(targetDate.getDate() + 21); // 3 weeks out
      setTimeInput('19:00');
    } else if (preset.id === 'friends') {
      targetDate.setDate(targetDate.getDate() + 14); // 2 weeks out
      setTimeInput('17:00');
    } else if (preset.id === 'trip') {
      targetDate.setDate(targetDate.getDate() + 35); // 5 weeks out
      setTimeInput('10:00');
      const returnObj = new Date(targetDate);
      returnObj.setDate(returnObj.getDate() + 7);
      setTripReturnDate(returnObj.toISOString().substring(0, 10));
    } else if (preset.id === 'project') {
      targetDate.setDate(targetDate.getDate() + 28); // 4 weeks out
      setTimeInput('17:00');
    } else if (preset.id === 'subscription') {
      targetDate.setDate(targetDate.getDate() + 14); // 2 weeks out
      setTimeInput('12:00');
    } else if (preset.id === 'maintenance') {
      targetDate.setDate(targetDate.getDate() + 10); // 10 days out
      setTimeInput('09:00');
    } else if (preset.id === 'kids' || preset.id === 'kids_school') {
      targetDate.setDate(targetDate.getDate() + 14); // 2 weeks out
      setTimeInput('08:30');
    } else if (preset.id === 'kids_hobbies') {
      targetDate.setDate(targetDate.getDate() + 10); // 10 days out
      setTimeInput('10:00');
    }
    setDateInput(targetDate.toISOString().substring(0, 10));
  };

  // Move from Who & When to Refinements
  const handleProceedToRefinements = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!whoInput.trim()) return;
    setPresetStep('refine');
  };

  // Toggle a refinement option
  const handleToggleRefinement = (key: string, paramKey: string, value: string, label: string) => {
    setRefinements(prev => {
      const next = { ...prev };
      if (next[key]?.value === value) {
        delete next[key];
      } else {
        next[key] = { paramKey, value, label };
      }
      return next;
    });
  };

  // Toggle party item in list
  const handleTogglePartyItem = (item: string) => {
    setPartyItems(prev => {
      if (prev.includes(item)) {
        return prev.filter(i => i !== item);
      } else {
        return [...prev, item];
      }
    });
  };

  // Add custom party item immediately
  const handleAddCustomPartyItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newPartyItemInput.trim();
    if (!trimmed) return;
    if (!partyItems.includes(trimmed)) {
      setPartyItems(prev => [...prev, trimmed]);
    }
    setNewPartyItemInput('');
  };

  // Submit complete preset event to agent
  const handleGeneratePresetSchedule = () => {
    if (!selectedPreset) return;

    let eventTitle = '';
    const who = whoInput.trim() || 'Special Event';

    if (selectedPreset.id === 'birthday') {
      eventTitle = `${who}'s Birthday Party`;
    } else if (selectedPreset.id === 'friends') {
      eventTitle = `${who} Visiting Weekend`;
    } else if (selectedPreset.id === 'trip') {
      eventTitle = `Trip to ${who}`;
    } else if (selectedPreset.id === 'project') {
      eventTitle = `${who}`;
    } else if (selectedPreset.id === 'subscription') {
      eventTitle = `${who} Subscription Cancellation`;
    } else if (selectedPreset.id === 'maintenance') {
      eventTitle = `${who}`;
    } else if (selectedPreset.id === 'kids_school') {
      eventTitle = `Kids School Event: ${who}`;
    } else if (selectedPreset.id === 'kids_hobbies') {
      eventTitle = `Kids Activity & Recital: ${who}`;
    } else if (selectedPreset.id === 'kids') {
      eventTitle = `Kids Activity: ${who}`;
    }

    // Build natural language descriptive prompt with chosen context
    const parts: string[] = [];
    parts.push(`${eventTitle} on ${dateInput} at ${timeInput}`);
    parts.push(`[userRole: ${presetUserRole}]`);
    if (selectedPreset.id === 'trip') {
      parts.push(`[returnDate: ${tripReturnDate}]`);
      parts.push(`[returnTime: ${tripReturnTime}]`);
      if (needPassportRenewal) parts.push(`[needPassportRenewal: true]`);
      if (needVisa) parts.push(`[needVisa: true]`);
      if (needFlights) parts.push(`[needFlights: true]`);
      if (needHotel) parts.push(`[needHotel: true]`);
      if (needRentalCar) parts.push(`[needRentalCar: true]`);
      if (lockActivities) parts.push(`[lockActivities: true]`);
      if (gearSunscreen) parts.push(`[gearSunscreen: true]`);
      if (gearHikingBoots) parts.push(`[gearHikingBoots: true]`);
      if (gearSnorkelGear) parts.push(`[gearSnorkelGear: true]`);
      if (gearSkiGear) parts.push(`[gearSkiGear: true]`);
      if (gearAdapters) parts.push(`[gearAdapters: true]`);
    }
    if (selectedPreset.id === 'friends') {
      if (diningRestaurant) parts.push(`[diningRestaurant: true]`);
      if (diningBreakfastHouse) parts.push(`[diningBreakfastHouse: true]`);
      if (diningHomeCooked) parts.push(`[diningHomeCooked: true]`);
      if (activityTouristSpots) parts.push(`[activityTouristSpots: true]`);
      if (recommendAccommodation) parts.push(`[recommendAccommodation: true]`);
      if (activityHiking) parts.push(`[activityHiking: true]`);
      if (activityBoardGames) parts.push(`[activityBoardGames: true]`);
      if (stayGuestRoom) parts.push(`[stayGuestRoom: true]`);
    }
    if (locationInput.trim()) {
      parts.push(`in ${locationInput.trim()}`);
    }

    // Add selected refinement context
    (Object.values(refinements) as Array<{ paramKey: string; value: string; label: string }>).forEach((r) => {
      parts.push(`[${r.paramKey}: ${r.value}]`);
    });

    // Add custom multi-entry items across all presets
    if (customItems.length > 0) {
      parts.push(`[customItems: ${customItems.join('; ')}]`);
    }

    // Add party items
    if (partyItems.length > 0) {
      parts.push(`[neededItems: ${partyItems.join(', ')}]`);
    }

    if (customNote.trim()) {
      parts.push(`[note: ${customNote.trim()}]`);
    }

    const fullMessage = parts.join('. ');
    setLastSubmittedPrompt(eventTitle || whoInput || 'New Event');

    // Reset preset step state
    setPresetStep('initial');
    setSelectedPreset(null);
    setWhoInput('');
    setRefinements({});
    setPartyItems([]);
    setNewPartyItemInput('');
    setCustomItems([]);
    setNewCustomItemInput('');
    setCustomNote('');

    onSendMessage(fullMessage, false);
  };

  // Freeform text opens the conversational creation thread (architecture
  // reset Phase C) instead of committing an event on the first message -
  // the AI's own clarifying-question mechanism (intakeQuestions) now runs
  // BEFORE anything is saved, with a running back-and-forth the user can
  // see, and nothing reaches the real event list until they tap "Create
  // event" on the resulting plan.
  const handleFreeformSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isDraftLoading) return;
    const textToSend = inputText.trim();
    setInputText('');
    setIsInputFocused(false);
    onFocusChange?.(false);
    handleDraftFreeformSubmit(textToSend);
  };

  // Voice recording handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const simulatedTranscription = "Alex and Sarah are visiting from October 16th to 19th. We want to do reservations at nice restaurants and host breakfast at home.";
        handleDraftFreeformSubmit(simulatedTranscription);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone permission fallback active');
      const demoVoiceText = "Maya's 30th birthday party is on October 24th at 8:00 PM in London. Need to get everything sorted!";
      handleDraftFreeformSubmit(demoVoiceText);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  // Reusable multi-item builder for any specific tasks or items
  const renderCustomItemsSection = (placeholder: string, title: string = "Anything Specific (Add Multiple Items)") => (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">ðŸ“</span>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={newCustomItemInput}
            onChange={(e) => setNewCustomItemInput(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-white text-slate-900 text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (newCustomItemInput.trim()) {
                  setCustomItems([...customItems, newCustomItemInput.trim()]);
                  setNewCustomItemInput('');
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (newCustomItemInput.trim()) {
                setCustomItems([...customItems, newCustomItemInput.trim()]);
                setNewCustomItemInput('');
              }
            }}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            + Add Item
          </button>
        </div>

        {customItems.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {customItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-800 shadow-xs">
                <span>âœ“ {item}</span>
                <button
                  type="button"
                  onClick={() => setCustomItems(customItems.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-600 ml-1 cursor-pointer font-bold"
                  title="Remove item"
                >
                  Ã—
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-y-auto min-h-0 transition-all duration-300 pr-1">

      {/* 0. CONVERSATIONAL CREATION THREAD (architecture reset Phase C) -
          takes over the whole panel the moment the user sends a first
          freeform message or voice memo, per the explicit design: "the
          preset screen stays as the starting screen... but when the user
          starts chatting, the chat opens up and dominates the screen."
          Nothing here touches the real event list until "Create event" is
          tapped (handleCreateDraftEvent, via the existing onSaveEvent). */}
      {draftConversation.length > 0 && (
        <div className="flex-1 flex flex-col h-full min-h-0 animate-in fade-in duration-300">
          <div className="flex items-center justify-between pb-3 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">New event</span>
            <button
              type="button"
              onClick={resetDraftConversation}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Start over</span>
            </button>
          </div>

          <div ref={draftScrollRef} className="flex-1 overflow-y-auto min-h-0 space-y-4 pb-2">
            {draftConversation.map((msg, idx) => {
              const isLast = idx === draftConversation.length - 1;
              const isUser = msg.sender === 'user';
              const unansweredQuestion = msg.intakeQuestions?.find((q) => !q.answered && q.options && q.options.length > 0);
              const showPlan = isLast && draftEvent && (msg.generatedMilestones?.length || 0) > 0;

              return (
                <div key={msg.id} className="space-y-2">
                  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-[#182A42] text-white flex items-center justify-center shrink-0 mr-2 shadow-xs">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? 'bg-[#182A42] text-white rounded-br-md'
                          : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-md shadow-2xs'
                      }`}
                    >
                      {msg.focusText || msg.text}
                    </div>
                  </div>

                  {/* Clickable options for the pre-creation clarifying
                      question (askClarifyingQuestion, asked before any plan
                      exists) - free text in the input bar below always
                      still works too, and gets combined with the original
                      message the same way a clicked option does. */}
                  {isLast && pendingClarification && msg.clarifyOptions && msg.clarifyOptions.length > 0 && (
                    <div className="pl-9 flex flex-wrap gap-1.5">
                      {msg.clarifyOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleClarifyOptionSelect(pendingClarification.originalMessage, opt)}
                          disabled={isDraftLoading}
                          className="text-xs font-bold px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Clickable options for the AI's own post-creation
                      clarifying question - free text always still works
                      too, via the input bar below. */}
                  {isLast && unansweredQuestion && (
                    <div className="pl-9 flex flex-wrap gap-1.5">
                      {unansweredQuestion.options!.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleDraftIntakeOptionSelect(unansweredQuestion, opt)}
                          disabled={isDraftLoading}
                          className="text-xs font-bold px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Accept/reject preview card - the plan is real and
                      computed, but stays out of the real event list until
                      "Create event" is tapped. Shown once the model has
                      produced milestones; a still-open intake question
                      (above) can render alongside it rather than blocking
                      it, since this app's planning engine doesn't
                      currently withhold a first-pass plan until every
                      detail is confirmed - refining after seeing the plan
                      is how that gets resolved instead. */}
                  {showPlan && draftEvent && (
                    <div className="ml-9 bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                      <span className="inline-block text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {getEventTopicLabel(draftEvent.category, draftEvent.context)}
                      </span>
                      <h4 className="text-sm font-black text-slate-900 leading-snug">{draftEvent.title}</h4>
                      <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {formatDisplayDate(draftEvent.eventDate)}
                        {draftEvent.endDate && draftEvent.endDate !== draftEvent.eventDate ? ` – ${formatDisplayDate(draftEvent.endDate)}` : ''}
                      </p>
                      <div className="space-y-1 pt-1 border-t border-emerald-200/70">
                        {(draftEvent.milestones || []).slice(0, 6).map((m) => (
                          <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-700 truncate">{m.title}</span>
                            <span className="text-slate-400 font-mono shrink-0">{formatDisplayDate(m.calculatedDate)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1.5">
                        <span className="text-[11px] text-slate-500">Ask for changes in the chat</span>
                        <button
                          type="button"
                          onClick={handleCreateDraftEvent}
                          className="shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Create event</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isDraftLoading && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-[#182A42] text-white flex items-center justify-center shrink-0 mr-2 shadow-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-slate-200/90 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-2xs flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                  <span className="text-xs text-slate-400 font-semibold">Thinking…</span>
                </div>
              </div>
            )}
          </div>

          {/* Persistent reply bar - the same one input keeps the whole
              conversation going, whether the user is answering a
              clarifying question in their own words or asking for a
              change to the plan already shown. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draftReplyInput.trim() || isDraftLoading) return;
              const text = draftReplyInput.trim();
              setDraftReplyInput('');
              handleDraftFreeformSubmit(text);
            }}
            className="shrink-0 pt-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={draftReplyInput}
              onChange={(e) => setDraftReplyInput(e.target.value)}
              placeholder="Type your answer..."
              disabled={isDraftLoading}
              className="flex-1 bg-white text-slate-900 text-sm px-4 py-2.5 rounded-full border border-slate-200/90 shadow-2xs focus:outline-none focus:border-slate-400 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!draftReplyInput.trim() || isDraftLoading}
              className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                draftReplyInput.trim() && !isDraftLoading
                  ? 'bg-[#182A42] text-white shadow-md shadow-slate-900/20 active:scale-95 hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
              }`}
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* 1. INITIAL PRESET SELECTION & FREEFORM OPPORTUNITY */}
      {draftConversation.length === 0 && presetStep === 'initial' && !isLoading && (
        <div className="space-y-6 animate-in fade-in duration-400">
          <InitialPresetsAndFreeform
            corePresets={categorizedPresets.core}
            workPresets={categorizedPresets.work}
            canImportSpreadsheet={categorizedPresets.canImportSpreadsheet}
            onboardingProfile={onboardingProfile}
            onOpenPreferences={onOpenPreferences}
            handleSelectPreset={handleSelectPreset}
            inputText={inputText}
            setInputText={setInputText}
            isInputFocused={isInputFocused}
            setIsInputFocused={setIsInputFocused}
            onFocusChange={onFocusChange}
            handleFreeformSubmit={handleFreeformSubmit}
            isRecording={isRecording}
            startVoiceRecording={startVoiceRecording}
            stopVoiceRecording={stopVoiceRecording}
            isLoading={isLoading}
            textareaRef={textareaRef}
            savedPresets={currentSavedPresets}
            selectedPresetId={lastSelectedPresetId}
            activePresetExplorerTab={activePresetExplorerTab}
            setActivePresetExplorerTab={setActivePresetExplorerTab}
            onOpenImporter={onOpenImporter}
            onStartLaunch={handleStartLaunch}
            onPresetsUpdated={handleUpdatePresets}
          />
        </div>
      )}

      {/* 2. UNIFIED 3-STAGE STATE MACHINE FOR PRESET WORKFLOW */}
      {draftConversation.length === 0 && selectedPreset && !isLoading && (
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-[32px] p-5 sm:p-7 shadow-lg shadow-slate-200/40 space-y-6 animate-in fade-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{selectedPreset.emoji}</span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Preset Workflow
                </span>
                <h2 className="text-lg font-black text-slate-900">
                  {selectedPreset.title} Prep
                </h2>
              </div>
            </div>
            <button
              onClick={() => {
                setPresetStep("initial");
                setSelectedPreset(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Preset</span>
            </button>
          </div>

          <EventCreationWizard
            initialPresetCategory={mapPresetIdToCanonicalCategory(selectedPreset.id)}
            onComplete={(createdEvent) => {
              if (onSaveEvent) {
                onSaveEvent(createdEvent);
              } else {
                onSendMessage(`Created event "${createdEvent.title}" with AheadOfTime milestones`, false);
              }
              setSelectedPreset(null);
              setLastSelectedPresetId(null);
              setPresetStep("initial");
            }}
            onCancel={() => {
              setSelectedPreset(null);
              setPresetStep("initial");
            }}
            isModalMode={false}
          />
        </div>
      )}

      {/* Interactive AI Thinking Module during Event Generation */}
      {draftConversation.length === 0 && isLoading && (
        <div className="py-6 px-1 animate-in fade-in zoom-in-95 duration-300">
          <ThinkingModule promptText={lastSubmittedPrompt} />
        </div>
      )}

      {/* Fast Preset Launcher Modal */}
      <LaunchPresetModal
        isOpen={isLaunchModalOpen}
        onClose={() => {
          setIsLaunchModalOpen(false);
          setSelectedLaunchPreset(null);
        }}
        preset={selectedLaunchPreset}
        onConfirmLaunch={handleConfirmLaunch}
      />

    </div>
  );
};


interface InitialPresetsAndFreeformProps {
  corePresets?: PromptPreset[];
  workPresets?: PromptPreset[];
  canImportSpreadsheet?: boolean;
  onboardingProfile?: OnboardingProfile | null;
  onOpenPreferences?: () => void;
  handleSelectPreset: (preset: PromptPreset) => void;
  inputText: string;
  setInputText: (text: string) => void;
  isInputFocused: boolean;
  setIsInputFocused: (focused: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  handleFreeformSubmit: (e: React.FormEvent) => void;
  isRecording: boolean;
  startVoiceRecording: () => void;
  stopVoiceRecording: () => void;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  savedPresets?: CustomPreset[];
  activePresetExplorerTab?: 'core' | 'work' | 'saved';
  setActivePresetExplorerTab?: (tab: 'core' | 'work' | 'saved') => void;
  onOpenImporter?: () => void;
  onStartLaunch?: (preset: CustomPreset) => void;
  onPresetsUpdated?: (presets: CustomPreset[]) => void;
  selectedPresetId?: string | null;
}

const InitialPresetsAndFreeform: React.FC<InitialPresetsAndFreeformProps> = ({
  corePresets = [],
  workPresets = [],
  canImportSpreadsheet = true,
  onboardingProfile,
  onOpenPreferences,
  handleSelectPreset,
  selectedPresetId,
  inputText,
  setInputText,
  isInputFocused,
  setIsInputFocused,
  onFocusChange,
  handleFreeformSubmit,
  isRecording,
  startVoiceRecording,
  stopVoiceRecording,
  isLoading,
  textareaRef,
  savedPresets = [],
  activePresetExplorerTab = 'core',
  setActivePresetExplorerTab,
  onOpenImporter,
  onStartLaunch,
  onPresetsUpdated,
}) => {
  return (
    <div className="space-y-6">
      {/* Freeform input - moved above the preset catalogue: it's the
          fastest path for anyone who already knows what they want to
          type, so it shouldn't be buried below a full grid of presets. A
          small, muted label sits above it now - without any heading at
          all, a plain textarea reads as an unlabeled, generic input
          rather than the start of "describe your event". */}
      <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Describe your calendar event
      </p>
      <div className="relative z-30 space-y-2">
        <form
          onSubmit={handleFreeformSubmit}
          className={`relative isolate z-30 flex items-end gap-2 p-3 sm:p-4 rounded-2xl sm:rounded-3xl transition-all duration-300 ${
            isInputFocused
              ? 'bg-white border-2 border-slate-400 ring-4 ring-slate-100 shadow-md'
              : 'bg-white border border-slate-200/90 shadow-sm'
          }`}
        >
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => {
                setIsInputFocused(true);
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setIsInputFocused(false);
                onFocusChange?.(false);
              }}
              placeholder="e.g. Dinner party with 8 friends next Saturday at 7 PM in Brooklyn..."
              className="w-full bg-transparent border-none outline-none focus:outline-none text-sm sm:text-base py-1 px-1 min-h-[50px] max-h-36 resize-none placeholder:text-slate-400 font-sans"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleFreeformSubmit(e);
                }
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 pb-0.5">
            {!inputText && (
              <button
                type="button"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                  isRecording ? 'bg-[#182A42] text-white animate-pulse' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-900 bg-slate-50'
                }`}
                title="Voice Memo Recording"
              >
                {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            <button
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                inputText.trim()
                  ? 'bg-[#182A42] text-white shadow-md shadow-slate-900/20 active:scale-95 hover:bg-slate-800'
                  : 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
              }`}
              title="Send Event"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Divider - sits between the freeform input above and the preset
          catalogue below. */}
      <div className="relative flex items-center justify-center py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200/80" />
        </div>
        <div className="relative bg-white border border-slate-200/90 px-4 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider rounded-full shadow-2xs flex items-center gap-1.5">
          <span>Or use a template</span>
        </div>
      </div>

      {/* Dual Track Navigation Bar: Core Presets vs. My Saved Presets + Import Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-1">
        <div className="flex items-center gap-1.5 p-1 bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xs">
          <button
            type="button"
            onClick={() => setActivePresetExplorerTab?.('core')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
              activePresetExplorerTab === 'core'
                ? 'bg-[#182A42] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Core Presets</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePresetExplorerTab?.('work')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
              activePresetExplorerTab === 'work'
                ? 'bg-[#182A42] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5 text-amber-500" />
            <span>Work Presets</span>
          </button>

          {/* Gated the same way as the Import button below (Rule C:
              Mixed/Business profiles only) - a personal-only profile can
              never populate this tab via Import, so showing it would just
              be a permanently-empty dead end. */}
          {canImportSpreadsheet && (
            <button
              type="button"
              onClick={() => setActivePresetExplorerTab?.('saved')}
              className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                activePresetExplorerTab === 'saved'
                  ? 'bg-[#182A42] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Imported Presets</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full font-mono ${
                activePresetExplorerTab === 'saved' ? 'bg-indigo-500/40 text-indigo-100' : 'bg-indigo-100 text-indigo-700'
              }`}>
                {savedPresets?.length || 0}
              </span>
            </button>
          )}
        </div>
      </div>

      {activePresetExplorerTab === 'saved' && canImportSpreadsheet ? (
        <MySavedPresetsView
          presets={savedPresets || []}
          onOpenImporter={onOpenImporter || (() => {})}
          onApplyPresetToNewEvent={onStartLaunch || (() => {})}
          onPresetsUpdated={onPresetsUpdated || (() => {})}
        />
      ) : activePresetExplorerTab === 'work' ? (
        /* Work Presets tab - business/admin presets split out of Core.
           Kept in the same compact, description-free card style
           Subscriptions/Maintenance already used as a secondary row below
           Core, rather than promoting them to the larger card now that
           they're a first-class tab - that was a deliberate size
           reduction, not just a byproduct of being "secondary" before. */
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          {workPresets.map((preset: PromptPreset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`group relative text-left p-2 rounded-xl bg-white/95 border shadow-2xs hover:border-slate-800 hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2 ${
                isSelected ? 'border-[#182A42] ring-2 ring-[#182A42]/20' : 'border-slate-200/80'
              }`}
            >
              <div className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 rounded-lg bg-slate-100 text-sm sm:text-base flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-200 transition-all">
                {preset.emoji}
              </div>
              <h4 className="text-[11px] sm:text-xs font-black text-slate-900 group-hover:text-slate-900 transition-colors truncate flex-1 min-w-0">
                {preset.title}
              </h4>
              <div className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                isSelected ? 'bg-[#182A42] text-white' : 'bg-slate-50 group-hover:bg-[#182A42] group-hover:text-white text-slate-400'
              }`}>
                {isSelected ? <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
              </div>
            </button>
            );
          })}
        </div>
      ) : (
        /* Core Presets tab - personal/life event types, full-size cards
            with a description line. */
        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
          {corePresets.map((preset: PromptPreset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`group relative text-left p-2.5 sm:p-3 rounded-2xl bg-white border shadow-2xs hover:border-slate-800 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2 sm:gap-3 ${
                isSelected ? 'border-[#182A42] ring-2 ring-[#182A42]/20' : 'border-slate-200/90'
              }`}
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-xl bg-slate-100 text-base sm:text-lg flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-200 transition-all">
                {preset.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-slate-900 transition-colors truncate">
                  {preset.title}
                </h3>
                <p className="hidden sm:block text-[11px] text-slate-500 font-normal leading-snug mt-0.5 line-clamp-2">
                  {preset.description}
                </p>
              </div>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                isSelected ? 'bg-[#182A42] text-white' : 'bg-slate-100 group-hover:bg-[#182A42] group-hover:text-white text-slate-400'
              }`}>
                {isSelected ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              </div>
            </button>
            );
          })}
        </div>
      )}

      {/* Import Template - moved below the preset grid (was inline with the
          Core/Work/Imported tab buttons above, where a filled purple button
          competed for attention with the actual navigation) and restyled
          quiet/secondary to match "Plan something new"'s own dashed-ghost
          treatment elsewhere - importing a template is a fallback path, not
          the primary action on this screen. Not shown on the Imported
          Presets tab itself, which already has its own identical CTA in
          its empty state. */}
      {activePresetExplorerTab !== 'saved' && canImportSpreadsheet && onOpenImporter && (
        <button
          type="button"
          onClick={onOpenImporter}
          className="w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-dashed border-[#182A42]/30 hover:border-[#182A42]/50 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
          title="Import an existing workflow from a spreadsheet, Word doc, or PDF"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Import Template</span>
        </button>
      )}
    </div>
  );
};
