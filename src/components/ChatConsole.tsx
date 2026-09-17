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
  GraduationCap
} from 'lucide-react';
import { AgentMessage, CalendarEvent, UserEventRole, CustomPreset, OnboardingProfile } from '../types';
import { 
  getVisiblePresets, 
  getCategorizedPresets, 
  normalizeProfile, 
  PRESET_KIDS_SCHOOL, 
  PRESET_KIDS_HOBBIES, 
  PromptPreset 
} from '../data/samplePresets';
import { ThinkingModule } from './ThinkingModule';
import { formatDisplayDate } from '../utils/tminusRules';
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

  // Freeform text now goes straight to the conversational engine instead of
  // through a local "here's what I caught" confirmation form first - the
  // form asserted a fully-specified plan ("Please build the ... plan!"),
  // which meant the AI's own follow-up-question mechanism never got a
  // chance to run. Sending the user's own words directly lets it ask a real
  // clarifying question when something's missing, then keep proposing one
  // specific follow-up per turn as the plan is built - see the "SOMETHING
  // OFF?" box on the event's Timeline page, which is where that
  // conversation continues once this first message creates the event.
  const handleFreeformSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const textToSend = inputText.trim();
    setLastSubmittedPrompt(textToSend);
    setInputText('');
    setIsInputFocused(false);
    onFocusChange?.(false);
    onSendMessage(textToSend, false);
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
        onSendMessage(simulatedTranscription, true, audioBlob);
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
      onSendMessage(demoVoiceText, true);
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
      
      {/* 1. INITIAL PRESET SELECTION & FREEFORM OPPORTUNITY */}
      {presetStep === 'initial' && !isLoading && (
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
      {selectedPreset && !isLoading && (
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
      {isLoading && (
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
          className={`relative isolate z-30 flex items-end gap-2 p-3 sm:p-4 transition-all duration-300 ${
            isInputFocused
              ? 'bg-white rounded-[28px] border-2 border-slate-900 ring-4 ring-sky-100 shadow-md'
              : 'bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-sm'
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

        {/* Import Template Button - Retained for Mixed & Business intent per Rule C */}
        {canImportSpreadsheet && onOpenImporter && (
          <button
            type="button"
            onClick={onOpenImporter}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0"
            title="Import an existing workflow from a spreadsheet, Word doc, or PDF"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-700" />
            <span>Import Template</span>
          </button>
        )}
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
    </div>
  );
};
