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
  X
} from 'lucide-react';
import { AgentMessage, CalendarEvent } from '../types';
import { EVENT_PRESETS, SMALL_PRESETS, PromptPreset } from '../data/samplePresets';
import { ThinkingModule } from './ThinkingModule';

interface ChatConsoleProps {
  messages: AgentMessage[];
  onSendMessage: (text: string, isVoiceMemo?: boolean, audioBlob?: Blob) => void;
  onIntakeOptionSelect: (eventId: string, questionId: string, paramKey: string, optionValue: string) => void;
  onBatchIntakeSubmit?: (eventId: string, answers: Record<string, { paramKey: string, value: string, label: string }>) => void;
  onSelectVariable?: (eventId: string, key: string, value: any, label: string) => void;
  onToggleMilestoneStatus?: (eventId: string, milestoneId: string) => void;
  onViewEventDetails?: (event: CalendarEvent) => void;
  onOpenGoogleCalendarSync?: () => void;
  isLoading: boolean;
  events: CalendarEvent[];
  focusMode?: 'welcome' | 'new-event' | 'adjust-event';
  onFocusChange?: (isFocused: boolean) => void;
  isLandingMode?: boolean;
}

export const ChatConsole: React.FC<ChatConsoleProps> = ({
  messages,
  onSendMessage,
  onIntakeOptionSelect,
  onBatchIntakeSubmit,
  onSelectVariable,
  onToggleMilestoneStatus,
  onViewEventDetails,
  onOpenGoogleCalendarSync,
  isLoading,
  events,
  focusMode,
  onFocusChange,
  isLandingMode,
}) => {
  const [inputText, setInputText] = useState('');
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // Preset Guided Intake Workflow State
  const [selectedPreset, setSelectedPreset] = useState<PromptPreset | null>(null);
  const [presetStep, setPresetStep] = useState<'initial' | 'who_when' | 'refine'>('initial');
  
  // Who & When Fields
  const [whoInput, setWhoInput] = useState('');
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

  // Quick interactive intake for custom descriptions
  const [customClarificationStep, setCustomClarificationStep] = useState<'none' | 'details' | 'refine'>('none');
  const [customParsedCategory, setCustomParsedCategory] = useState<'birthday' | 'friends' | 'trip' | 'project' | 'dinner' | 'custom'>('custom');
  const [customEventTitle, setCustomEventTitle] = useState('');
  const [customWho, setCustomWho] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('19:00');
  const [customLocation, setCustomLocation] = useState('');
  const [clarificationReason, setClarificationReason] = useState<'unclear' | 'recognized_birthday' | 'recognized_trip' | 'recognized_friends' | 'recognized_project' | 'recognized_dinner' | 'custom'>('unclear');

  // Intelligent text detector for the custom event box
  const analyzeCustomText = (text: string) => {
    const lower = text.toLowerCase();

    // 1. Detect category
    let category: 'birthday' | 'friends' | 'trip' | 'project' | 'dinner' | 'custom' = 'custom';
    let detectedReason: typeof clarificationReason = 'unclear';

    if (lower.includes('birthday') || lower.includes('bday') || lower.includes('born') || lower.includes('turning')) {
      category = 'birthday';
      detectedReason = 'recognized_birthday';
    } else if (lower.includes('visiting') || lower.includes('staying') || lower.includes('in town') || lower.includes('guest') || lower.includes('hosting')) {
      category = 'friends';
      detectedReason = 'recognized_friends';
    } else if (lower.includes('trip') || lower.includes('flight') || lower.includes('travel') || lower.includes('vacation') || lower.includes('holiday') || lower.includes('flying to') || lower.includes('hotel')) {
      category = 'trip';
      detectedReason = 'recognized_trip';
    } else if (lower.includes('project') || lower.includes('launch') || lower.includes('deadline') || lower.includes('sprint') || lower.includes('deck') || lower.includes('deliverable')) {
      category = 'project';
      detectedReason = 'recognized_project';
    } else if (lower.includes('dinner') || lower.includes('supper') || lower.includes('restaurant') || lower.includes('brunch') || lower.includes('lunch') || lower.includes('bbq')) {
      category = 'dinner';
      detectedReason = 'recognized_dinner';
    } else {
      detectedReason = 'unclear';
    }

    // 2. Detect Person / Subject (who)
    let extractedWho = '';
    const nameMatch = text.match(/([A-Z][a-z]+(?:'s|\s+[A-Z][a-z]+)?)\s+(?:birthday|party|visit|trip|launch|dinner)/i) 
      || text.match(/(?:for|with)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i)
      || text.match(/([A-Za-z]+)'s\s+birthday/i);
    if (nameMatch && nameMatch[1]) {
      extractedWho = nameMatch[1].replace(/'s$/i, '').trim();
    }

    // 3. Detect Date / Time
    let extractedDate = '';
    const now = new Date('2026-09-02');
    
    // Check for explicit dates like "2026-10-24" or "Oct 24" or "October 24th" or "next Saturday"
    const isoDateMatch = text.match(/\b(202[5-9]-[0-1][0-9]-[0-3][0-9])\b/);
    if (isoDateMatch) {
      extractedDate = isoDateMatch[1];
    } else {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const monthMatch = text.match(/(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
      if (monthMatch) {
        const monthStr = monthMatch[1].toLowerCase().substring(0, 3);
        const monthIndex = monthNames.indexOf(monthStr);
        const day = parseInt(monthMatch[2], 10);
        const year = monthIndex < 8 ? 2027 : 2026; // Ref date is Sept 2026
        const d = new Date(year, monthIndex, day);
        extractedDate = d.toISOString().substring(0, 10);
      } else if (lower.includes('next week') || lower.includes('in 1 week')) {
        const d = new Date(now);
        d.setDate(d.getDate() + 7);
        extractedDate = d.toISOString().substring(0, 10);
      } else if (lower.includes('in 2 weeks') || lower.includes('two weeks')) {
        const d = new Date(now);
        d.setDate(d.getDate() + 14);
        extractedDate = d.toISOString().substring(0, 10);
      } else if (lower.includes('in 3 weeks') || lower.includes('three weeks') || category === 'birthday') {
        const d = new Date(now);
        d.setDate(d.getDate() + 21);
        extractedDate = d.toISOString().substring(0, 10);
      } else if (lower.includes('tomorrow')) {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        extractedDate = d.toISOString().substring(0, 10);
      } else {
        const d = new Date(now);
        d.setDate(d.getDate() + 14);
        extractedDate = d.toISOString().substring(0, 10);
      }
    }

    // 4. Detect Time (e.g. 7pm, 19:00, 8:30 PM)
    let extractedTime = '19:00';
    const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const mins = timeMatch[2] ? timeMatch[2] : '00';
      const isPm = timeMatch[3].toLowerCase() === 'pm';
      if (isPm && hours < 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      extractedTime = `${String(hours).padStart(2, '0')}:${mins}`;
    }

    // 5. Detect Location (e.g. "in London", "at Hackney Loft")
    let extractedLocation = '';
    const locMatch = text.match(/\b(?:in|at)\s+([A-Za-z0-9\s,'-]+?)(?:\s+(?:on|at|with|next|for|\.|$)|$)/i);
    if (locMatch && locMatch[1] && locMatch[1].length < 40 && !locMatch[1].toLowerCase().includes('pm') && !locMatch[1].toLowerCase().includes('am')) {
      extractedLocation = locMatch[1].trim();
    }

    // Check completeness / clarity
    const isUnclear = text.trim().split(/\s+/).length < 4 || !text.includes(' ') || detectedReason === 'unclear';

    return {
      category,
      detectedReason: isUnclear && detectedReason === 'unclear' ? 'unclear' : detectedReason,
      extractedWho,
      extractedDate,
      extractedTime,
      extractedLocation,
      isUnclear,
    };
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
    setPresetStep('who_when');
    setRefinements({});
    setPartyItems([]);
    setNewPartyItemInput('');
    setCustomItems([]);
    setNewCustomItemInput('');
    setWhoInput('');
    
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
    }

    // Build natural language descriptive prompt with chosen context
    const parts: string[] = [];
    parts.push(`${eventTitle} on ${dateInput} at ${timeInput}`);
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

  // Handle Freeform Form Submit - directly sends event description to agent and triggers Thinking Module
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

  const handleConfirmCustomClarification = (e: React.FormEvent) => {
    e.preventDefault();
    const detailsMsg = `Event: "${customEventTitle}". Category: ${customParsedCategory}. Who/Subject: ${customWho}. Date: ${customDate} at ${customTime}${customLocation ? ` in ${customLocation}` : ''}. Please build the AheadOfTime preparation plan!`;
    setLastSubmittedPrompt(customEventTitle || detailsMsg);
    setCustomClarificationStep('none');
    onSendMessage(detailsMsg, false);
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
        <span className="text-lg">📝</span>
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
                <span>✓ {item}</span>
                <button
                  type="button"
                  onClick={() => setCustomItems(customItems.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-red-600 ml-1 cursor-pointer font-bold"
                  title="Remove item"
                >
                  ×
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
      
      {/* 1. INITIAL PRESET SELECTION & FREEFORM OPPORTUNITY OR CUSTOM CLARIFICATION CARD */}
      {presetStep === 'initial' && !isLoading && (
        <div className="space-y-6 animate-in fade-in duration-400">
          {customClarificationStep === 'details' ? (
            <CustomClarificationCard
              clarificationReason={clarificationReason}
              customParsedCategory={customParsedCategory}
              setCustomParsedCategory={setCustomParsedCategory}
              customEventTitle={customEventTitle}
              setCustomEventTitle={setCustomEventTitle}
              customWho={customWho}
              setCustomWho={setCustomWho}
              customDate={customDate}
              setCustomDate={setCustomDate}
              customTime={customTime}
              setCustomTime={setCustomTime}
              customLocation={customLocation}
              setCustomLocation={setCustomLocation}
              setCustomClarificationStep={setCustomClarificationStep}
              handleConfirmCustomClarification={handleConfirmCustomClarification}
            />
          ) : (
            <InitialPresetsAndFreeform
              EVENT_PRESETS={EVENT_PRESETS}
              SMALL_PRESETS={SMALL_PRESETS}
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
            />
          )}
        </div>
      )}

      {/* 2. BALLOON 1: WHO & WHEN QUESTIONS POPUP */}
      {presetStep === 'who_when' && selectedPreset && !isLoading && (
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-[32px] p-5 sm:p-7 shadow-lg shadow-slate-200/40 space-y-6 animate-in fade-in slide-in-from-bottom duration-400">
          
          {/* Preset Title Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{selectedPreset.emoji}</span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-900">
                  Step 1 of 2 • Basic Details
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  {selectedPreset.title} Prep
                </h2>
              </div>
            </div>
            
            <button
              onClick={() => {
                setPresetStep('initial');
                setSelectedPreset(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Preset</span>
            </button>
          </div>

          <form onSubmit={handleProceedToRefinements} className="space-y-5">
            
            {/* 1. Who Question */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>{selectedPreset.whoLabel}</span>
              </label>
              <input
                ref={whoInputRef}
                type="text"
                required
                value={whoInput}
                onChange={(e) => setWhoInput(e.target.value)}
                placeholder={selectedPreset.whoPlaceholder}
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm sm:text-base font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-4 focus:ring-slate-100 transition-all"
              />
            </div>

            {/* 2. When Question */}
            <div className="space-y-2.5">
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-900" />
                <span>{selectedPreset.whenLabel}</span>
              </label>

              {/* Date & Time Picker Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Target Date</span>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Time (Optional)</span>
                  <input
                    type="time"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Return Date & Time for Trip Preset */}
            {selectedPreset?.id === 'trip' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Return Date *</span>
                  <input
                    type="date"
                    required
                    value={tripReturnDate}
                    onChange={(e) => setTripReturnDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Return Time</span>
                  <input
                    type="time"
                    value={tripReturnTime}
                    onChange={(e) => setTripReturnTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>
            )}

            {/* 3. Optional Location / Venue */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Location / City (Optional)</span>
              </label>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                placeholder="e.g. London, Home, Central Office"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
              />
            </div>

            {/* CTA: Next to Refinements */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={!whoInput.trim()}
                className="w-full py-4 rounded-2xl bg-[#0f172a] hover:bg-slate-800 text-white font-black text-sm sm:text-base shadow-lg shadow-slate-900/15 transition-all active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer group"
              >
                <span>Continue to Refinement Questions</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </form>

        </div>
      )}

      {/* 3. BALLOON 2: REFINEMENT QUESTIONS & SPECIFIC VARIETIES */}
      {presetStep === 'refine' && selectedPreset && !isLoading && (
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-[32px] p-5 sm:p-7 shadow-lg shadow-slate-200/40 space-y-6 animate-in fade-in slide-in-from-bottom duration-400">
          
          {/* Refinement Stage Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedPreset.emoji}</span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 border border-slate-200">
                  Step 2 of 2 • Refinement Questions
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                {whoInput.trim() ? `${whoInput}'s ${selectedPreset.title}` : selectedPreset.title}
              </h2>
              <p className="text-xs text-slate-500">
                Target date: <span className="font-semibold text-slate-800">{dateInput} at {timeInput}</span>
              </p>
            </div>

            <button
              onClick={() => setPresetStep('who_when')}
              className="text-xs text-slate-400 hover:text-slate-700 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Edit Details
            </button>
          </div>

          <div className="space-y-5">
            
            {/* BIRTHDAY REFINEMENTS */}
            {selectedPreset.id === 'birthday' && (
              <>
                {/* 1. Gift Question */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Do you need a gift?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { label: 'Group Gift', value: 'group', desc: 'T-30d pot rally + T-10d purchase' },
                      { label: 'Solo Gift', value: 'solo', desc: 'T-14d order + T-2d wrap check' },
                      { label: '🚫 No Gift', value: 'none', desc: 'No gift tasks scheduled' },
                    ].map((opt) => {
                      const isSelected = refinements['gift']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('gift', 'giftType', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md shadow-slate-900/20 font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Costume / Theme Question */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Shirt className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Do you need a costume or theme outfit?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Themed / Costume Required', value: 'true', desc: 'T-14d costume sourcing & outfit prep' },
                      { label: 'Standard Attire / Casual', value: 'false', desc: 'No costume lead times scheduled' },
                    ].map((opt) => {
                      const isSelected = refinements['costume']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('costume', 'isThemed', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md shadow-slate-900/20 font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Transport Question */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Do you need transport?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Taxi / Rideshare', value: 'taxi', desc: 'T-2h pre-booking & travel buffer' },
                      { label: 'Carpooling / Vehicle Rental', value: 'carpool', desc: 'T-7d ride coordination & parking check' },
                      { label: 'Public Transit / Train', value: 'transit', desc: 'T-1d schedule verification & tickets' },
                      { label: '🚫 No Transport Needed', value: 'none', desc: 'Self-arranged or walking distance' },
                    ].map((opt) => {
                      const isSelected = refinements['transport']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('transport', 'transportType', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md shadow-slate-900/20 font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Food & Drinks Question */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Food & Drinks</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { label: 'Custom Bakery Cake', value: 'custom_cake', desc: 'T-7d bakery design & T-4h pickup' },
                      { label: 'Standard Cake', value: 'standard_cake', desc: 'T-1d store or bakery pickup' },
                      { label: 'Restaurant Table Reservation', value: 'restaurant', desc: 'T-14d table booking for group' },
                      { label: 'Bar / Lounge Booking', value: 'bar', desc: 'T-14d drinks area reservation' },
                      { label: 'Catering / Home Cooking', value: 'catering', desc: 'T-2d grocery run & food prep' },
                      { label: '🚫 No Food Booking Needed', value: 'none', desc: 'Handled by venue / guests' },
                    ].map((opt) => {
                      const isSelected = refinements['food']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('food', 'foodPlan', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md shadow-slate-900/20 font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Other Reservations or Party Vendors */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-slate-900" />
                      <span>Popular Party Vendors & Bookings</span>
                    </label>
                    <p className="text-xs text-slate-500">
                      Quickly include standard vendor booking lead times in your schedule.
                    </p>
                  </div>

                  {/* Vendor toggle buttons */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Photographer',
                      'DJ',
                      'Balloons',
                      'Projector',
                      'Table reservation',
                    ].map((item) => {
                      const isSelected = partyItems.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleTogglePartyItem(item)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-sm shadow-slate-900/20'
                              : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          <span>{item}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 6. Anything Specific (Multi Entry Custom Items) */}
                {renderCustomItemsSection("Add custom task, vendor or item (e.g. Helium balloons, cake order, DJ hire, magician...)")}
              </>
            )}

            {/* FRIENDS VISITING REFINEMENTS */}
            {selectedPreset.id === 'friends' && (
              <>
                {/* 1. Multi-Select Dining Options */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Select Dining & Meal Plans (Multiple OK)</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-dining-rest"
                        checked={diningRestaurant}
                        onChange={(e) => setDiningRestaurant(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-dining-rest" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🍽️ Restaurant / Pub Dinner Reservations (T-30d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-dining-break"
                        checked={diningBreakfastHouse}
                        onChange={(e) => setDiningBreakfastHouse(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-dining-break" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🍳 Breakfast & Coffee In-House Groceries (T-3d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-dining-home"
                        checked={diningHomeCooked}
                        onChange={(e) => setDiningHomeCooked(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-dining-home" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🍷 Home-Cooked / Catered Dinners (T-7d)
                      </label>
                    </div>
                  </div>
                </div>

                {/* 2. Activities & Itinerary */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Select Activities & Entertainment</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-act-tourist"
                        checked={activityTouristSpots}
                        onChange={(e) => setActivityTouristSpots(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-act-tourist" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🗺️ Tourist Spots, City Walks & Museum Tickets (T-14d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-act-hiking"
                        checked={activityHiking}
                        onChange={(e) => setActivityHiking(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-act-hiking" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🥾 Hiking Trails & Outdoor Excursions (T-14d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-act-games"
                        checked={activityBoardGames}
                        onChange={(e) => setActivityBoardGames(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-act-games" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🎲 Board Games, Movie Night & Pub Trivia (T-7d)
                      </label>
                    </div>
                  </div>
                </div>

                {/* 3. Accommodations */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <Home className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Accommodation & Room Prep</h3>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="preset-chk-stay-guest"
                      checked={stayGuestRoom}
                      onChange={(e) => setStayGuestRoom(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                    />
                    <label htmlFor="preset-chk-stay-guest" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                      🛏️ Guest Room Turnover (Clean Sheets, Towels & Wi-Fi) (T-1d)
                    </label>
                  </div>
                </div>

                {/* 4. Anything Specific (Multi Entry Custom Items) */}
                {renderCustomItemsSection("Add custom task or item (e.g. spare keys, airport pickup, dietary allergies, city tour tickets...)")}
              </>
            )}

            {/* TRIP / HOLIDAY REFINEMENTS */}
            {selectedPreset.id === 'trip' && (
              <>
                {/* 1. Passports & Visas (Multi Entry List) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🛂</span>
                    <h3 className="text-sm font-bold text-slate-900">Select Passport, Visa & Activity Actions</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-passport"
                        checked={needPassportRenewal}
                        onChange={(e) => setNeedPassportRenewal(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-passport" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🛂 Passport Validity Check & Renewal (T-60d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-visa"
                        checked={needVisa}
                        onChange={(e) => setNeedVisa(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-visa" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        📋 Entry Visa / e-Visa Application (T-45d)
                      </label>
                    </div>
                  </div>
                </div>

                {/* 2. Booking Status (Multi Entry List) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✈️</span>
                    <h3 className="text-sm font-bold text-slate-900">Booking Status (Multi Entry List)</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-flights"
                        checked={needFlights}
                        onChange={(e) => setNeedFlights(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-flights" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🛫 Flights & Airline Price Lock (T-45d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-hotel"
                        checked={needHotel}
                        onChange={(e) => setNeedHotel(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-hotel" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🏨 Hotel / Accommodation & Cancellation (T-30d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-rental"
                        checked={needRentalCar}
                        onChange={(e) => setNeedRentalCar(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-rental" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🚗 Rental Car & Insurance Verification (T-30d)
                      </label>
                    </div>
                  </div>
                </div>

                {/* 3. Activities */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    <h3 className="text-sm font-bold text-slate-900">Activities</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-lock-activities"
                        checked={lockActivities}
                        onChange={(e) => setLockActivities(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-lock-activities" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🎯 Lock in Activities & Excursions (T-21d)
                      </label>
                    </div>
                  </div>
                </div>

                {/* 4. Packing Extra's (Multi Entry List) */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎒</span>
                    <h3 className="text-sm font-bold text-slate-900">Packing Extra's (Multi Entry List)</h3>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-sunscreen"
                        checked={gearSunscreen}
                        onChange={(e) => setGearSunscreen(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-sunscreen" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🧴 Sunscreen & Beach Essentials (e.g. SPF 50, hats) (T-14d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-hiking-boots"
                        checked={gearHikingBoots}
                        onChange={(e) => setGearHikingBoots(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-hiking-boots" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🥾 Hiking Boots & Outdoor Gear (e.g. wool socks) (T-14d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-snorkel"
                        checked={gearSnorkelGear}
                        onChange={(e) => setGearSnorkelGear(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-snorkel" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🤿 Snorkel Gear & Water Accessories (T-14d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-ski"
                        checked={gearSkiGear}
                        onChange={(e) => setGearSkiGear(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-ski" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🎿 Ski Gear & Thermal Layers (e.g. goggles, base layers, helmets) (T-14d)
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        id="preset-chk-adapters"
                        checked={gearAdapters}
                        onChange={(e) => setGearAdapters(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white cursor-pointer"
                      />
                      <label htmlFor="preset-chk-adapters" className="text-xs sm:text-sm text-slate-700 font-medium cursor-pointer">
                        🔌 Universal Power Adapters & Chargers (T-14d)
                      </label>
                    </div>


                  </div>
                </div>

                {/* 5. Anything Specific (Multi Entry Custom Items) */}
                {renderCustomItemsSection("Add custom task or item (e.g. dog sitter, eSIM, ski pass, gear rental...)")}
              </>
            )}

            {/* PROJECT MANAGEMENT REFINEMENTS */}
            {selectedPreset.id === 'project' && (
              <>
                {/* 1. Stakeholder Review */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">What stakeholder review is required?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { label: 'Formal Client Sign-Off', value: 'client', desc: 'T-14d draft milestone lock' },
                      { label: 'Internal Team Demo', value: 'internal', desc: 'T-7d cross-team review sprint' },
                      { label: '🚫 Solo / No Review', value: 'none', desc: 'Direct execution & launch' },
                    ].map((opt) => {
                      const isSelected = refinements['review']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('review', 'stakeholderReview', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Marketing / Collateral */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Marketing & launch collateral?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Public Launch Assets & Press', value: 'press', desc: 'T-3d release collateral & social copy' },
                      { label: 'Release Notes & Docs Only', value: 'docs', desc: 'T-2d changelog & internal guides' },
                      { label: '🚫 No Marketing Needed', value: 'none', desc: 'Skip marketing milestones' },
                    ].map((opt) => {
                      const isSelected = refinements['marketing']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('marketing', 'marketingCollateral', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Anything Specific (Multi Entry Custom Items) */}
                {renderCustomItemsSection("Add custom milestone or task (e.g. Figma wireframes, staging DB migration, security audit...)")}
              </>
            )}

            {/* SUBSCRIPTION CANCELLATION REFINEMENTS */}
            {selectedPreset.id === 'subscription' && (
              <>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Cancellation Notice Period?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { label: '30-Day Notice Policy', value: '30d', desc: 'T-30d early notification reminder' },
                      { label: '14-Day Notice Policy', value: '14d', desc: 'Standard 2-week cancellation notice' },
                      { label: 'Immediate / Online', value: 'immediate', desc: 'Click-to-cancel anytime' },
                    ].map((opt) => {
                      const isSelected = refinements['notice']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('notice', 'noticePeriod', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Anything Specific (Multi Entry Custom Items) */}
                {renderCustomItemsSection("Add custom task or requirement (e.g. export contacts, download invoices, remove payment card...)")}
              </>
            )}

            {/* MAINTENANCE REFINEMENTS */}
            {selectedPreset.id === 'maintenance' && (
              <>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-slate-900" />
                    <h3 className="text-sm font-bold text-slate-900">Service Provider or DIY?</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Professional Service / Garage', value: 'pro', desc: 'T-10d booking & quote confirmation' },
                      { label: 'DIY / Self-Service', value: 'diy', desc: 'Order replacement filters & parts in advance' },
                    ].map((opt) => {
                      const isSelected = refinements['serviceType']?.value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleToggleRefinement('serviceType', 'serviceType', opt.value, opt.label)}
                          className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 ${
                            isSelected
                              ? 'bg-[#0f172a] border-[#0f172a] text-white shadow-md font-bold'
                              : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Anything Specific (Multi Entry Custom Items) */}
                {renderCustomItemsSection("Add custom task or inspection (e.g. check tire pressure, replace air filter, oil check, warranty lookup...)")}
              </>
            )}

          </div>

          {/* Primary CTA: Generate AheadOfTime Schedule */}
          <div className="pt-4">
            <button
              onClick={handleGeneratePresetSchedule}
              className="w-full py-4 sm:py-5 rounded-3xl bg-[#0f172a] hover:bg-slate-800 text-white font-black text-base sm:text-lg shadow-xl shadow-slate-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer group"
            >
              <span>Build AheadOfTime Milestones</span>
              <Target className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            </button>
          </div>

        </div>
      )}

      {/* Interactive AI Thinking Module during Event Generation */}
      {isLoading && (
        <div className="py-6 px-1 animate-in fade-in zoom-in-95 duration-300">
          <ThinkingModule promptText={lastSubmittedPrompt} />
        </div>
      )}

    </div>
  );
};

const CustomClarificationCard = ({
  clarificationReason,
  customParsedCategory,
  setCustomParsedCategory,
  customEventTitle,
  setCustomEventTitle,
  customWho,
  setCustomWho,
  customDate,
  setCustomDate,
  customTime,
  setCustomTime,
  customLocation,
  setCustomLocation,
  setCustomClarificationStep,
  handleConfirmCustomClarification,
}: any) => {
  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-[32px] p-5 sm:p-7 shadow-lg shadow-slate-200/40 space-y-6 animate-in fade-in slide-in-from-bottom duration-400">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-200 flex items-center justify-center text-xl">
            {clarificationReason === 'recognized_birthday' ? '🎉' :
             clarificationReason === 'recognized_trip' ? '✈️' :
             clarificationReason === 'recognized_friends' ? '🏡' :
             clarificationReason === 'recognized_dinner' ? '🍽️' :
             clarificationReason === 'recognized_project' ? '🚀' : '❓'}
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
              {clarificationReason === 'unclear' ? 'Additional Details Requested (1.1)' : 'Event Recognized & Parsed (1.2)'}
            </span>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              {clarificationReason === 'recognized_birthday' ? 'Birthday Celebration Recognized' :
               clarificationReason === 'recognized_trip' ? 'Trip / Getaway Recognized' :
               clarificationReason === 'recognized_friends' ? 'Visiting Friends / Hosting Recognized' :
               clarificationReason === 'recognized_dinner' ? 'Dinner / Dining Event Recognized' :
               clarificationReason === 'recognized_project' ? 'Project / Milestone Recognized' :
               'Clarify Event Details'}
            </h3>
          </div>
        </div>

        <button
          onClick={() => setCustomClarificationStep('none')}
          className="text-xs text-slate-400 hover:text-slate-700 font-semibold px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
        clarificationReason === 'unclear' 
          ? 'bg-amber-50 border-amber-200 text-amber-900' 
          : 'bg-blue-50 border-blue-200 text-blue-950'
      }`}>
        {clarificationReason === 'unclear' ? (
          <span><strong>Need more details:</strong> Your description was brief or unclear. Please fill in the target person, date, and venue below so AheadOfTime can map out your preparation milestones.</span>
        ) : (
          <span><strong>Event details recognized:</strong> We detected a <strong>{customParsedCategory}</strong> event. Please review and fine-tune the details below before building your AheadOfTime milestones.</span>
        )}
      </div>

      <form onSubmit={handleConfirmCustomClarification} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">Event Description / Title</label>
          <input
            type="text"
            required
            value={customEventTitle}
            onChange={(e) => setCustomEventTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Who / Main Subject (e.g. Maya, Alex)</label>
            <input
              type="text"
              required
              value={customWho}
              onChange={(e) => setCustomWho(e.target.value)}
              placeholder="e.g. Maya"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Category Type</label>
            <select
              value={customParsedCategory}
              onChange={(e) => setCustomParsedCategory(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800 cursor-pointer"
            >
              <option value="birthday">🎉 Birthday / Celebration</option>
              <option value="trip">✈️ Trip / Travel</option>
              <option value="friends">🏡 Hosting / Visitors</option>
              <option value="dinner">🍽️ Dinner / Dining</option>
              <option value="project">🚀 Project / Deadline</option>
              <option value="custom">📅 General Event</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Target Date</label>
            <input
              type="date"
              required
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Time</label>
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">Location / Venue (Optional)</label>
          <input
            type="text"
            value={customLocation}
            onChange={(e) => setCustomLocation(e.target.value)}
            placeholder="e.g. London, Home, Restaurant..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setCustomClarificationStep('none')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Back to Presets
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-sky-300" />
            <span>Build AheadOfTime Milestones</span>
          </button>
        </div>
      </form>
    </div>
  );
};

const InitialPresetsAndFreeform = ({
  EVENT_PRESETS,
  SMALL_PRESETS = [],
  handleSelectPreset,
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
}: any) => {
  return (
    <div className="space-y-6">
      <div className="relative flex items-center justify-center py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200/80" />
        </div>
        <div className="relative bg-white border border-slate-200/90 px-4 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider rounded-full shadow-2xs flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          <span>Choose an event preset</span>
        </div>
      </div>

      <div className="space-y-3">
        {/* 4 Big Presets: Party / Friends visiting / Trip / Project management */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {EVENT_PRESETS.map((preset: any) => (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className="group relative text-left p-3 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-800 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-100 text-xl sm:text-2xl flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-200 transition-all">
                  {preset.emoji}
                </div>
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 group-hover:bg-[#0f172a] group-hover:text-white text-slate-400 flex items-center justify-center transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>

              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-slate-900 transition-colors">
                  {preset.title}
                </h3>
                <p className="text-xs text-slate-500 font-normal leading-relaxed mt-0.5">
                  {preset.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* 2 Small Presets: Subscription cancellation / Maintenance (require less preparation) */}
        {SMALL_PRESETS && SMALL_PRESETS.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {SMALL_PRESETS.map((preset: any) => (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className="group relative text-left p-3.5 rounded-2xl bg-white/95 border border-slate-200/80 shadow-2xs hover:border-slate-800 hover:shadow-xs transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 text-xl flex items-center justify-center group-hover:scale-105 group-hover:bg-slate-200 transition-all">
                    {preset.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-black text-slate-900 group-hover:text-slate-900 transition-colors">
                      {preset.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-normal truncate mt-0.5">
                      {preset.description}
                    </p>
                  </div>
                </div>
                <div className="w-6 h-6 shrink-0 rounded-full bg-slate-50 group-hover:bg-[#0f172a] group-hover:text-white text-slate-400 flex items-center justify-center transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative flex items-center justify-center py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200/80" />
        </div>
        <div className="relative bg-white border border-slate-200/90 px-4 py-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider rounded-full shadow-2xs flex items-center gap-1.5">
          <span>Or describe your event below</span>
        </div>
      </div>

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
                  isRecording ? 'bg-[#0f172a] text-white animate-pulse' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-900 bg-slate-50'
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
                  ? 'bg-[#0f172a] text-white shadow-md shadow-slate-900/20 active:scale-95 hover:bg-slate-800' 
                  : 'bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
              }`}
              title="Send Event"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
