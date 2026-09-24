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
import { AgentMessage, CalendarEvent, UserEventRole, CustomPreset, OnboardingProfile, PlanningUserProfile, RefinementQuestion } from '../types';
import { composeConversationBrief, ConversationBriefInput } from '../utils/refinementQuestions';
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

  // Conversational creation flow. Held entirely local to this component
  // and never touching the app's real `events` until the user taps "Create
  // event". The order is fixed:
  //   1. first message -> /api/agent/clarify returns refinement questions
  //      (where/when/what, plus profile-based ones such as pet care)
  //   2. the answers + the first message go to the planner as ONE prompt
  //   3. the plan is shown as a summary card
  //   4. anything the user adds is planned against the WHOLE brief (first
  //      message + answers + earlier additions + profile), refining this
  //      same draft - an answer or addition is never planned on its own
  //   5. "Create event" saves it, landing on Timeline & Tasks where it
  //      can be pushed to Google Calendar.
  const [draftConversation, setDraftConversation] = useState<AgentMessage[]>([]);
  const [draftEvent, setDraftEvent] = useState<CalendarEvent | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [draftReplyInput, setDraftReplyInput] = useState('');
  const [draftBrief, setDraftBrief] = useState<ConversationBriefInput | null>(null);
  // Non-null only while the refinement questions are waiting for answers.
  const [refinementQuestions, setRefinementQuestions] = useState<RefinementQuestion[] | null>(null);
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string>>({});
  // Marker after the newest message. Scrolled into view (the page scrolls,
  // not an inner box); its scroll-margin keeps it clear of the sticky reply
  // bar.
  const draftEndRef = useRef<HTMLDivElement>(null);
  const scrollDraftToLatest = () => {
    requestAnimationFrame(() => draftEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };
  // Guards against a second submit (double tap) while a request is in
  // flight - state alone updates too late to stop it.
  const draftRequestInFlight = useRef(false);
  // Bumped by "Start over", so a reply that arrives afterwards is ignored
  // instead of reviving the abandoned draft.
  const draftGeneration = useRef(0);

  const planningProfile: PlanningUserProfile = {
    homeZipOrLocation: onboardingProfile?.homeZipOrLocation,
    hasPet: onboardingProfile?.hasPet,
    familyStructure: onboardingProfile?.family_structure,
  };

  useEffect(() => {
    if (draftConversation.length > 0) scrollDraftToLatest();
  }, [draftConversation, isDraftLoading, refinementQuestions]);

  const resetDraftConversation = () => {
    setDraftConversation([]);
    setDraftEvent(null);
    setDraftReplyInput('');
    setIsDraftLoading(false);
    setDraftBrief(null);
    setRefinementQuestions(null);
    setRefinementAnswers({});
    draftRequestInFlight.current = false;
    draftGeneration.current += 1;
  };

  const appendDraftMessage = (sender: 'user' | 'agent', text: string, extra: Partial<AgentMessage> = {}) => {
    setDraftConversation((prev) => [
      ...prev,
      { id: `${sender}-draft-${Date.now()}-${prev.length}`, sender, text, timestamp: new Date().toISOString(), ...extra },
    ]);
  };

  // Steps 2 and 4. `addition` is set only when refining an existing draft;
  // the brief passed in is always everything said BEFORE that addition.
  const requestDraftPlan = async (brief: ConversationBriefInput, addition?: { text: string; event: CalendarEvent }) => {
    if (draftRequestInFlight.current) return;
    draftRequestInFlight.current = true;
    const generation = draftGeneration.current;
    setIsDraftLoading(true);
    try {
      const body = addition
        ? {
            message: addition.text,
            conversationBrief: composeConversationBrief(brief),
            activeEvents: [addition.event],
            targetEventId: addition.event.id,
            lockToTargetEvent: true,
          }
        : {
            message: composeConversationBrief(brief),
            // A brand-new event: never let the planner route this into
            // one of the user's existing events.
            activeEvents: [],
          };
      const response = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentReferenceDate, userProfile: planningProfile, ...body }),
      });
      if (!response.ok) throw new Error(`Server returned status ${response.status}`);
      const data = await response.json();
      if (generation !== draftGeneration.current) return;
      if (!data?.event) throw new Error('No plan returned');
      const updatedEvent: CalendarEvent = addition ? { ...data.event, id: addition.event.id } : data.event;
      setDraftEvent(updatedEvent);
      setDraftBrief(addition ? { ...brief, additions: [...(brief.additions || []), addition.text] } : brief);
      appendDraftMessage('agent', data.focusText || data.replyText || 'Here is your plan.', {
        additionText: data.additionText,
        associatedEventId: updatedEvent.id,
        generatedMilestones: updatedEvent.milestones,
      });
    } catch (err) {
      if (generation !== draftGeneration.current) return;
      console.warn('Draft plan request failed:', err);
      appendDraftMessage('agent', "Couldn't process that just now - please try again.");
    } finally {
      if (generation === draftGeneration.current) {
        draftRequestInFlight.current = false;
        setIsDraftLoading(false);
      }
    }
  };

  // Step 1. A failed check just goes straight to planning - it must never
  // block creation.
  const handleInitialDraftMessage = async (text: string) => {
    if (draftRequestInFlight.current) return;
    draftRequestInFlight.current = true;
    const generation = draftGeneration.current;
    setDraftConversation([]);
    appendDraftMessage('user', text);
    setIsDraftLoading(true);
    const brief: ConversationBriefInput = { originalMessage: text, answers: [], additions: [] };
    setDraftBrief(brief);

    let questions: RefinementQuestion[] = [];
    try {
      const res = await fetch('/api/agent/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, currentReferenceDate, userProfile: planningProfile }),
      });
      const data = await res.json();
      if (Array.isArray(data?.questions)) {
        questions = data.questions.filter((q: RefinementQuestion) => q && typeof q.question === 'string' && q.question.trim());
      }
    } catch (err) {
      console.warn('Refinement questions failed, planning straight away:', err);
    }
    if (generation !== draftGeneration.current) return;
    draftRequestInFlight.current = false;

    if (questions.length > 0) {
      setRefinementAnswers({});
      setRefinementQuestions(questions);
      appendDraftMessage('agent', questions.length === 1 ? 'One quick question so the plan fits:' : 'A few quick questions so the plan fits:');
      setIsDraftLoading(false);
      return;
    }
    await requestDraftPlan(brief);
  };

  const handleSelectRefinementOption = (questionId: string, option: string) => {
    setRefinementAnswers((prev) => ({ ...prev, [questionId]: prev[questionId] === option ? '' : option }));
  };

  // Step 2: every answer (skipped ones simply left out) goes into one
  // prompt together with the first message. `extraNote` is anything typed
  // in the reply bar while the questions were open.
  const handleSubmitRefinementAnswers = (extraNote?: string) => {
    if (!draftBrief || !refinementQuestions || draftRequestInFlight.current) return;
    const answers = refinementQuestions
      .map((q) => ({ question: q.question, answer: (refinementAnswers[q.id] || '').trim() }))
      .filter((a) => a.answer);
    if (extraNote?.trim()) answers.push({ question: 'Also:', answer: extraNote.trim() });
    const brief: ConversationBriefInput = { ...draftBrief, answers };
    setRefinementQuestions(null);
    appendDraftMessage('user', answers.length > 0 ? answers.map((a) => a.answer).join(' · ') : 'Skip the questions');
    requestDraftPlan(brief);
  };

  const handleDraftFreeformSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isDraftLoading || draftRequestInFlight.current) return;

    if (draftConversation.length === 0 || !draftBrief) {
      handleInitialDraftMessage(trimmed);
      return;
    }
    if (refinementQuestions) {
      handleSubmitRefinementAnswers(trimmed);
      return;
    }
    appendDraftMessage('user', trimmed);
    if (draftEvent) {
      // Step 4: refine this same draft against everything said so far.
      requestDraftPlan(draftBrief, { text: trimmed, event: draftEvent });
    } else {
      // The first plan failed - try again with the new detail folded in.
      requestDraftPlan({ ...draftBrief, additions: [...(draftBrief.additions || []), trimmed] });
    }
  };

  const handleCreateDraftEvent = () => {
    if (!draftEvent || !onSaveEvent || isDraftLoading) return;
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
    // No inner scroll box: it clipped the focused input's outer ring on the
    // left, and the page itself scrolls now (see App.tsx).
    <div className="flex-1 flex flex-col bg-transparent transition-all duration-300">

      {/* 0. CONVERSATIONAL CREATION THREAD (architecture reset Phase C) -
          takes over the whole panel the moment the user sends a first
          freeform message or voice memo, per the explicit design: "the
          preset screen stays as the starting screen... but when the user
          starts chatting, the chat opens up and dominates the screen."
          Nothing here touches the real event list until "Create event" is
          tapped (handleCreateDraftEvent, via the existing onSaveEvent). */}
      {draftConversation.length > 0 && (
        <div className="w-full max-w-3xl mx-auto flex flex-col animate-in fade-in duration-300">
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

          <div className="space-y-4 pb-2">
            {draftConversation.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              // The summary card follows the latest plan reply only.
              const isLatestPlanReply = Boolean(
                draftEvent && !isUser && msg.associatedEventId &&
                !draftConversation.slice(idx + 1).some((m) => m.associatedEventId)
              );

              return (
                <div key={msg.id} className="space-y-2">
                  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full bg-[#182A42] text-white flex items-center justify-center shrink-0 mr-2 shadow-xs">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed space-y-1 ${
                        isUser
                          // Lighter than the page background (#182A42), which
                          // made the user's own bubble invisible.
                          ? 'bg-[#34507A] text-white rounded-br-md'
                          : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-md shadow-2xs'
                      }`}
                    >
                      <p>{msg.focusText || msg.text}</p>
                      {!isUser && msg.additionText && (
                        <p className="text-slate-500">{msg.additionText}</p>
                      )}
                    </div>
                  </div>

                  {/* Summary of the plan so far - nothing is saved until
                      "Create event" is tapped. */}
                  {isLatestPlanReply && draftEvent && (
                    <div className="ml-9 bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
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
                        {(draftEvent.milestones || []).map((m) => (
                          <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-700 truncate">{m.title}</span>
                            <span className="text-slate-400 font-mono shrink-0">{formatDisplayDate(m.calculatedDate)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1.5">
                        <span className="text-[11px] text-slate-500">Anything to add? Type it below.</span>
                        <button
                          type="button"
                          onClick={handleCreateDraftEvent}
                          disabled={isDraftLoading}
                          className="shrink-0 text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Looks good, create event</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Refinement questions: all asked at once, answered by tapping
                an option or typing, and sent together with the first
                message in one planning call. Every question is optional. */}
            {refinementQuestions && !isDraftLoading && (
              <div className="ml-9 bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                {refinementQuestions.map((q) => {
                  const answer = refinementAnswers[q.id] || '';
                  const typedAnswer = q.options.includes(answer) ? '' : answer;
                  return (
                    <div key={q.id} className="space-y-1.5">
                      <p className="text-xs font-bold text-slate-800">{q.question}</p>
                      {q.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSelectRefinementOption(q.id, opt)}
                              aria-pressed={answer === opt}
                              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer active:scale-95 ${
                                answer === opt
                                  ? 'bg-[#182A42] text-white border-[#182A42]'
                                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        value={typedAnswer}
                        onChange={(e) => setRefinementAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={q.options.length > 0 ? 'Or type your own answer' : 'Type your answer'}
                        className="w-full bg-slate-50 text-slate-900 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-400"
                      />
                    </div>
                  );
                })}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSubmitRefinementAnswers()}
                    className="text-xs font-bold px-3.5 py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{(Object.values(refinementAnswers) as string[]).some((a) => a.trim()) ? 'Build my plan' : 'Skip and build my plan'}</span>
                  </button>
                </div>
              </div>
            )}

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
            <div ref={draftEndRef} className="scroll-mb-24" aria-hidden="true" />
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
            // Sits right under the conversation; sticks to the bottom of the
            // screen (and above the mobile keyboard) once the thread is
            // taller than the screen.
            className="sticky bottom-0 z-10 bg-[#182A42] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2"
          >
            <input
              type="text"
              value={draftReplyInput}
              onChange={(e) => setDraftReplyInput(e.target.value)}
              // Once the mobile keyboard has opened (and the page resized),
              // bring the latest message back into view above the input.
              onFocus={() => setTimeout(scrollDraftToLatest, 300)}
              placeholder={refinementQuestions ? 'Anything else to add?' : draftEvent ? 'Add or change something...' : 'Type your answer...'}
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
