import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  CalendarCheck,
  ChevronDown,
  Info,
  ListTodo,
  ExternalLink,
  Plus,
  X,
  Check,
  Repeat,
} from 'lucide-react';
import { CalendarEvent, EventRecurrenceConfig, RecurrenceFrequency, TMinusMilestone } from '../types';
import {
  CanonicalCategory,
  CANONICAL_CATEGORIES,
  CATEGORY_REFINEMENT_QUESTIONS,
  classifySubmittedTitle,
  generateConcreteEventMilestones,
} from '../utils/creationStateMachine';

export interface EventCreationWizardProps {
  initialTitle?: string;
  initialDate?: string;
  initialPresetCategory?: CanonicalCategory | null;
  initialStage?: 'step1_title' | 'step2_refinement' | 'step3_milestones';
  initialEvent?: CalendarEvent | null;
  onComplete: (createdEvent: CalendarEvent) => void;
  onCancel?: () => void;
  isModalMode?: boolean;
}

export const EventCreationWizard: React.FC<EventCreationWizardProps> = ({
  initialTitle = '',
  initialDate,
  initialPresetCategory = null,
  initialStage = 'step1_title',
  initialEvent = null,
  onComplete,
  onCancel,
  isModalMode = false,
}) => {
  // 3-Stage State Machine
  const [stage, setStage] = useState<'step1_title' | 'step2_refinement' | 'step3_milestones'>(initialStage);

  // STEP 1 State
  const [title, setTitle] = useState(initialEvent?.title || initialTitle);
  const [targetDate, setTargetDate] = useState(() => {
    if (initialEvent?.eventDate) return initialEvent.eventDate;
    if (initialDate) return initialDate;
    const d = new Date();
    d.setDate(d.getDate() + 21);
    return d.toISOString().substring(0, 10);
  });
  const [targetTime, setTargetTime] = useState(initialEvent?.eventTime || '10:00');
  const [location, setLocation] = useState(initialEvent?.location || '');
  const [showAdvancedTime, setShowAdvancedTime] = useState(false);

  // Recurrence State
  const [isRecurring, setIsRecurring] = useState<boolean>(Boolean(initialEvent?.recurrence?.isRecurring));
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>(
    initialEvent?.recurrence?.frequency || 'weekly'
  );
  const [recurrencePatternText, setRecurrencePatternText] = useState<string>(
    initialEvent?.recurrence?.recurrencePatternText || 'Every Saturday'
  );
  const [customDates, setCustomDates] = useState<string[]>(
    initialEvent?.recurrence?.customDates || []
  );
  const [newCustomDateInput, setNewCustomDateInput] = useState<string>('');

  // STEP 2 State
  const [selectedCategory, setSelectedCategory] = useState<CanonicalCategory>(() => {
    if (initialEvent?.context?.canonicalCategory) return initialEvent.context.canonicalCategory as CanonicalCategory;
    if (initialPresetCategory) return initialPresetCategory;
    return 'party';
  });
  const [hasPresetInitialized, setHasPresetInitialized] = useState(Boolean(initialPresetCategory || initialEvent));
  // Refinement answers: ALWAYS empty by default! Stored as string arrays to support multi-selection.
  const [refinementAnswers, setRefinementAnswers] = useState<Record<string, string[]>>(() => {
    return initialEvent?.context?.refinementAnswers || {};
  });
  // Draft input text for adding specific tasks per question
  const [customTaskInputs, setCustomTaskInputs] = useState<Record<string, string>>({});

  // STEP 3 State
  const [generatedMilestones, setGeneratedMilestones] = useState<TMinusMilestone[]>(() => {
    return initialEvent?.milestones || [];
  });
  const [isSaving, setIsSaving] = useState(false);

  // -------------------------------------------------------------
  // STEP 1 Action: [ Confirm Event Title ]
  // Explicit trigger: Do NOT run background AI detection on keystroke or blur.
  // -------------------------------------------------------------
  const handleConfirmTitle = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (title.trim().length < 3) return;

    let confirmedCat = selectedCategory;
    // If not launched from an explicit preset, classify strictly from the submitted title
    if (!hasPresetInitialized) {
      confirmedCat = classifySubmittedTitle(title);
      setSelectedCategory(confirmedCat);
    }

    // Move strictly to Stage 2
    setStage('step2_refinement');
  };

  // Category Override Handler
  const handleCategoryOverride = (newCat: CanonicalCategory) => {
    setSelectedCategory(newCat);
    // When changing category, reset answers so questions are clean and relevant
    setRefinementAnswers({});
    setCustomTaskInputs({});
  };

  // Chip selection helper: toggles option for multi-select, or selects one for single-select
  const handleChipClick = (questionId: string, chipText: string, allowMultiple: boolean) => {
    setRefinementAnswers((prev) => {
      const current = prev[questionId] || [];
      if (allowMultiple) {
        if (current.includes(chipText)) {
          return { ...prev, [questionId]: current.filter((c) => c !== chipText) };
        }
        return { ...prev, [questionId]: [...current, chipText] };
      } else {
        // Single choice: toggle off if already selected, or replace with selected chip
        if (current.includes(chipText)) {
          return { ...prev, [questionId]: [] };
        }
        return { ...prev, [questionId]: [chipText] };
      }
    });
  };

  // Explicit input confirmation button to add a specific custom task
  const handleAddCustomTask = (questionId: string, allowMultiple: boolean) => {
    const raw = (customTaskInputs[questionId] || '').trim();
    if (!raw) return;

    setRefinementAnswers((prev) => {
      const current = prev[questionId] || [];
      if (allowMultiple) {
        if (current.includes(raw)) return prev;
        return { ...prev, [questionId]: [...current, raw] };
      } else {
        return { ...prev, [questionId]: [raw] };
      }
    });

    // Clear input field after adding
    setCustomTaskInputs((prev) => ({ ...prev, [questionId]: '' }));
  };

  // Remove task helper
  const handleRemoveTask = (questionId: string, taskToRemove: string) => {
    setRefinementAnswers((prev) => {
      const current = prev[questionId] || [];
      return { ...prev, [questionId]: current.filter((t) => t !== taskToRemove) };
    });
  };

  // -------------------------------------------------------------
  // STEP 2 Action: [ Generate Milestones ]
  // -------------------------------------------------------------
  const handleGenerateMilestones = () => {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const milestones = generateConcreteEventMilestones(
      title,
      targetDate,
      targetTime,
      selectedCategory,
      refinementAnswers,
      eventId
    );
    setGeneratedMilestones(milestones);
    setStage('step3_milestones');
  };

  // -------------------------------------------------------------
  // STEP 3 Action: [ Save Event & Plan Milestones ]
  // -------------------------------------------------------------
  const handleFinalSave = () => {
    setIsSaving(true);
    const eventId = initialEvent?.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const catDef = CANONICAL_CATEGORIES.find((c) => c.id === selectedCategory);

    // Re-bind milestones with this final eventId if needed
    const finalizedMilestones: TMinusMilestone[] = generatedMilestones.map((m, idx) => ({
      ...m,
      id: `ms-${eventId}-${idx + 1}-${m.tMinusLabel.toLowerCase()}`,
      eventId,
      deliverables: (m.deliverables || []).map((d, dIdx) => ({
        ...d,
        deliverable_id: `del_${eventId}_${idx + 1}_${dIdx + 1}`,
      })),
    }));

    const recurrenceConfig: EventRecurrenceConfig | undefined = isRecurring
      ? {
          isRecurring: true,
          frequency: recurrenceFreq,
          recurrencePatternText: recurrencePatternText.trim() || (recurrenceFreq === 'custom_dates' ? `${customDates.length} scheduled dates` : 'Every Saturday'),
          customDates: recurrenceFreq === 'custom_dates' ? customDates : undefined,
          occurrencesCount: recurrenceFreq === 'custom_dates' ? customDates.length : 4,
        }
      : undefined;

    const newEvent: CalendarEvent = {
      id: eventId,
      title: title.trim(),
      eventDate: targetDate,
      eventTime: targetTime,
      category: catDef ? catDef.internalCategory : 'birthday_party',
      location: location.trim() || undefined,
      status: 'milestones_active',
      userRole: 'organiser',
      milestones: finalizedMilestones,
      recurrence: recurrenceConfig,
      context: {
        canonicalCategory: selectedCategory,
        refinementAnswers,
        isRecurring,
        recurrencePatternText: recurrenceConfig?.recurrencePatternText,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onComplete(newEvent);
  };

  // Current category definition and questions
  const currentCategoryDef = CANONICAL_CATEGORIES.find((c) => c.id === selectedCategory) || CANONICAL_CATEGORIES[0];
  const questions = CATEGORY_REFINEMENT_QUESTIONS[selectedCategory] || [];

  return (
    <div className={`w-full ${isModalMode ? '' : 'p-4 sm:p-6 bg-white rounded-3xl border border-slate-200/90 shadow-sm'}`}>
      {/* 3-Stage Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 max-w-xl mx-auto">
          {/* Step 1 Pill */}
          <button
            type="button"
            onClick={() => stage !== 'step1_title' && setStage('step1_title')}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
              stage === 'step1_title'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">1</span>
            <span>Title & Date</span>
          </button>

          <div className={`h-0.5 flex-1 transition-colors ${stage !== 'step1_title' ? 'bg-slate-900' : 'bg-slate-200'}`} />

          {/* Step 2 Pill */}
          <button
            type="button"
            disabled={stage === 'step1_title'}
            onClick={() => stage === 'step3_milestones' && setStage('step2_refinement')}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
              stage === 'step2_refinement'
                ? 'bg-slate-900 text-white shadow-xs'
                : stage === 'step3_milestones'
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer'
                : 'bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">2</span>
            <span>Refinement</span>
          </button>

          <div className={`h-0.5 flex-1 transition-colors ${stage === 'step3_milestones' ? 'bg-slate-900' : 'bg-slate-200'}`} />

          {/* Step 3 Pill */}
          <div
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
              stage === 'step3_milestones'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-400'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">3</span>
            <span>Milestones</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STAGE 1: TITLE ENTRY & EXPLICIT TRIGGER */}
      {/* ========================================================================= */}
      {stage === 'step1_title' && (
        <form onSubmit={handleConfirmTitle} className="space-y-5 animate-in fade-in duration-200">
          {/* Preset Context Header (if preset was picked) */}
          {hasPresetInitialized && (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-lg">{currentCategoryDef.emoji}</span>
                <div>
                  <span className="text-xs font-black text-slate-900">{currentCategoryDef.badgeLabel} Preset</span>
                  <p className="text-[11px] text-slate-500">{currentCategoryDef.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHasPresetInitialized(false)}
                className="text-[11px] text-slate-500 hover:text-slate-900 underline font-medium cursor-pointer"
              >
                Clear preset
              </button>
            </div>
          )}

          {/* Event Title Input */}
          <div>
            <label htmlFor="input-event-title" className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                id="input-event-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder={
                  selectedCategory === 'kids_hobbies'
                    ? "e.g., Liam's Soccer Tournament, Piano Recital, Swim Meet"
                    : selectedCategory === 'kids_school'
                    ? "e.g., Science Fair Project, Book Week Costume Day"
                    : selectedCategory === 'trip'
                    ? "e.g., Summer Family Vacation to Kyoto, Weekend in Paris"
                    : selectedCategory === 'party'
                    ? "e.g., Maya's 30th Birthday Dinner, Housewarming Celebration"
                    : selectedCategory === 'friends_visiting'
                    ? "e.g., Sarah & Tom Staying for the Weekend"
                    : selectedCategory === 'subscription'
                    ? "e.g., Cancel Gym Membership Trial, Adobe Creative Cloud Renewal"
                    : selectedCategory === 'maintenance'
                    ? "e.g., Car Service & Oil Change, Annual HVAC Checkup"
                    : selectedCategory === 'project_management'
                    ? "e.g., Q3 Mobile App Release, Client Presentation Demo"
                    : "e.g., Liam's Soccer Tournament, Summer Trip to Kyoto"
                }
                className="w-full text-base sm:text-lg font-medium px-4 py-3 rounded-2xl bg-white border border-slate-300 shadow-2xs focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none text-slate-900 placeholder:text-slate-400 transition-all"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Enter your specific event or activity name. Category and checklist are calibrated in the next step.
            </p>
          </div>

          {/* Target Date Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="input-target-date" className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
                Target Event Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="input-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full text-sm font-semibold px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 shadow-2xs focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none text-slate-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor="input-location" className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
                Location <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <input
                  id="input-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Civic Sports Complex, Home, Kyoto"
                  className="w-full text-sm font-medium px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 shadow-2xs focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none text-slate-900 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Collapsible Time Input */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedTime(!showAdvancedTime)}
              className="text-xs text-slate-500 hover:text-slate-900 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>{showAdvancedTime ? 'Hide event time' : '+ Specify event time'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedTime ? 'rotate-180' : ''}`} />
            </button>
            {showAdvancedTime && (
              <div className="mt-2 max-w-xs">
                <input
                  type="time"
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  className="w-full text-sm font-medium px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 outline-none"
                />
              </div>
            )}
          </div>

          {/* Recurring Event Section (for Hobbies, Trips, Projects, Maintenance, etc.) */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-sky-50/50 border border-sky-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="checkbox-recurring-event" className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  id="checkbox-recurring-event"
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                />
                <div className="flex items-center gap-1.5">
                  <Repeat className="w-4 h-4 text-sky-700" />
                  <span className="text-xs font-bold text-slate-900">Recurring Event / Series</span>
                </div>
              </label>
              <span className="text-[11px] font-semibold text-sky-900 bg-sky-100/70 border border-sky-200 px-2 py-0.5 rounded-full">
                {isRecurring ? 'Recurrence Enabled' : 'Single Event'}
              </span>
            </div>

            {isRecurring && (
              <div className="space-y-3 pt-2 border-t border-sky-200/60 animate-in fade-in duration-200">
                <p className="text-[11px] text-slate-600">
                  Ideal for ongoing hobbies (e.g. Saturday match/training), recurring trips, maintenance cycles, and recurring project sprints.
                </p>

                {/* Frequency selection pills */}
                <div>
                  <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Recurrence Schedule
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'weekly', label: 'Every Week', defaultText: 'Every Saturday' },
                      { id: 'biweekly', label: 'Every 2 Weeks', defaultText: 'Every 2 weeks (Saturday)' },
                      { id: 'monthly', label: 'Monthly', defaultText: 'Every month (1st Saturday)' },
                      { id: 'custom_dates', label: 'Exact Dates List', defaultText: 'Specific dates schedule' },
                    ].map((mode) => {
                      const isSelected = recurrenceFreq === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setRecurrenceFreq(mode.id as RecurrenceFrequency);
                            if (mode.id !== 'custom_dates' && (!recurrencePatternText || recurrencePatternText === 'Specific dates schedule')) {
                              setRecurrencePatternText(mode.defaultText);
                            }
                          }}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          {mode.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pattern text input (e.g., 'every Saturday', 'every second Tuesday', 'first of month') */}
                {recurrenceFreq !== 'custom_dates' && (
                  <div className="space-y-1">
                    <label htmlFor="input-recurrence-pattern" className="block text-[11px] font-bold text-slate-700">
                      How recurring is it?
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="input-recurrence-pattern"
                        type="text"
                        value={recurrencePatternText}
                        onChange={(e) => setRecurrencePatternText(e.target.value)}
                        placeholder="e.g., every Saturday, every 2nd Tuesday at 9am, bi-weekly"
                        className="w-full text-xs sm:text-sm px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:border-slate-900 focus:ring-2 focus:ring-slate-900 outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {['Every Saturday', 'Every Sunday', 'Every Tuesday & Thursday', 'Every 2 weeks', 'Monthly maintenance'].map((quick) => (
                        <button
                          key={quick}
                          type="button"
                          onClick={() => setRecurrencePatternText(quick)}
                          className="text-[10px] font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                        >
                          + {quick}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exact Dates List configuration */}
                {recurrenceFreq === 'custom_dates' && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Add Exact Event Dates
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={newCustomDateInput}
                        onChange={(e) => setNewCustomDateInput(e.target.value)}
                        className="text-xs sm:text-sm px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCustomDateInput && !customDates.includes(newCustomDateInput)) {
                            const updated = [...customDates, newCustomDateInput].sort();
                            setCustomDates(updated);
                            setNewCustomDateInput('');
                          }
                        }}
                        disabled={!newCustomDateInput}
                        className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold transition-all cursor-pointer shrink-0"
                      >
                        Add Date
                      </button>
                    </div>

                    {customDates.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {customDates.map((dateStr) => (
                          <span
                            key={dateStr}
                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white border border-sky-200 text-slate-900 text-xs font-mono font-semibold shadow-2xs"
                          >
                            <span>📅 {dateStr}</span>
                            <button
                              type="button"
                              onClick={() => setCustomDates(customDates.filter((d) => d !== dateStr))}
                              className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                              title={`Remove ${dateStr}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl">
                        Pick individual dates above (e.g. next 3 tournament matches or maintenance days) to link them to this recurring plan.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Explicit Confirmation Primary Action Button */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            ) : (
              <div />
            )}

            <button
              type="submit"
              disabled={title.trim().length < 3}
              id="btn-confirm-event-title"
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
                title.trim().length >= 3
                  ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-md active:scale-98'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>Confirm Event Title</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* STAGE 2: CATEGORY DETECTION & CONTEXT-AWARE REFINEMENT */}
      {/* ========================================================================= */}
      {stage === 'step2_refinement' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Confirmed Event Strip & Detected Category with Quick Override */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Event to Plan</span>
              <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">{title}</h3>
              <p className="text-xs text-slate-500">
                Target: <span className="font-semibold text-slate-800">{targetDate}</span>
                {location && <span> • {location}</span>}
              </p>
            </div>

            {/* Detected Category Badge with Quick-Override Dropdown */}
            <div className="shrink-0 flex items-center gap-2">
              <div className="flex flex-col sm:items-end">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Detected Category</span>
                <div className="relative inline-flex items-center mt-0.5">
                  <select
                    id="select-category-override"
                    value={selectedCategory}
                    onChange={(e) => handleCategoryOverride(e.target.value as CanonicalCategory)}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-slate-900 shadow-2xs hover:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
                  >
                    {CANONICAL_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.emoji} {cat.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Context-Aware Refinement Questions (Strictly isolated sub-topic) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Tailor Milestones for {currentCategoryDef.label}
              </h4>
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const selectedAnswers = refinementAnswers[q.id] || [];
                const customTasks = selectedAnswers.filter((ans) => !q.chips.includes(ans));
                const draftInput = customTaskInputs[q.id] || '';

                return (
                  <div key={q.id} className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor={`input-task-${q.id}`} className="text-xs font-black text-slate-900">
                        {idx + 1}. {q.label}
                      </label>
                      {q.allowMultiple ? (
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200/80 px-2 py-0.5 rounded-md">
                          Multiple choices allowed
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          Single choice
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 font-medium">{q.question}</p>

                    {/* Selectable preset chips (unselected by default) */}
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1.5">
                        {q.allowMultiple ? 'Select applicable options:' : 'Select preferred option:'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {q.chips.map((chip) => {
                          const isSelected = selectedAnswers.includes(chip);
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleChipClick(q.id, chip, Boolean(q.allowMultiple))}
                              className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200/90 text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              <span>{chip}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Input field with explicit input confirmation button to add specific tasks */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                      <label htmlFor={`input-task-${q.id}`} className="block text-[11px] font-bold text-slate-700">
                        Add a specific task or item:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id={`input-task-${q.id}`}
                          type="text"
                          value={draftInput}
                          onChange={(e) => setCustomTaskInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomTask(q.id, Boolean(q.allowMultiple));
                            }
                          }}
                          placeholder={q.placeholder}
                          className="flex-1 text-xs sm:text-sm px-3.5 py-2 rounded-xl bg-slate-50/70 border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                        />
                        <button
                          id={`btn-add-task-${q.id}`}
                          type="button"
                          onClick={() => handleAddCustomTask(q.id, Boolean(q.allowMultiple))}
                          disabled={!draftInput.trim()}
                          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            draftInput.trim()
                              ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs active:scale-98'
                              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Add task</span>
                        </button>
                      </div>

                      {/* Explicitly added custom tasks */}
                      {customTasks.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Added tasks:</span>
                          {customTasks.map((task) => (
                            <span
                              key={task}
                              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold"
                            >
                              <span>{task}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTask(q.id, task)}
                                className="p-0.5 hover:bg-emerald-200 rounded text-emerald-700 hover:text-emerald-900 cursor-pointer"
                                title={`Remove "${task}"`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStage('step1_title')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Title</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateMilestones}
              id="btn-generate-milestones"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-slate-900 hover:bg-slate-800 text-white shadow-md active:scale-98 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Generate Milestones</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAGE 3: MILESTONE & DELIVERABLE GENERATION */}
      {/* ========================================================================= */}
      {stage === 'step3_milestones' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Header Summary */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{currentCategoryDef.emoji}</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{currentCategoryDef.badgeLabel}</span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 font-medium">
                {targetDate} {targetTime && `at ${targetTime}`} • {generatedMilestones.length} actionable checkpoints
              </p>
            </div>

            <button
              type="button"
              onClick={() => setStage('step2_refinement')}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 underline cursor-pointer self-start sm:self-auto"
            >
              Modify Refinements
            </button>
          </div>

          {/* Milestones & Crisp Checklist Deliverables List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-slate-700" />
                <span>Reverse-Engineered Milestone Runway</span>
              </h4>
              <span className="text-[11px] text-slate-500 font-medium">Concrete Actions & Deliverables</span>
            </div>

            <div className="space-y-2.5">
              {generatedMilestones.map((ms) => (
                <div
                  key={ms.id}
                  className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black px-2 py-0.5 rounded-lg bg-slate-900 text-white shadow-2xs">
                        {ms.tMinusLabel}
                      </span>
                      <h5 className="text-sm font-black text-slate-900">{ms.title}</h5>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                      {new Date(ms.calculatedDate).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {ms.description && (
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{ms.description}</p>
                  )}

                  {/* Checklist deliverables */}
                  {ms.deliverables && ms.deliverables.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Actionable Deliverables ({ms.deliverables.length})
                      </span>
                      <div className="space-y-1">
                        {ms.deliverables.map((del) => (
                          <div key={del.deliverable_id} className="flex items-start gap-2 text-xs text-slate-700">
                            <span className="text-slate-400 font-mono select-none">[ ]</span>
                            <span className="font-medium">{del.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Calendar Payload Preview Strip */}
          <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200/80 text-sky-950">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-900 mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-sky-700" />
              <span>Google Calendar Sync Ready</span>
            </div>
            <p className="text-[11px] text-sky-800 leading-normal">
              When synced, each milestone creates a Google Calendar event formatted with concrete milestone titles and embeds all deliverables as an actionable checklist directly in event details.
            </p>
          </div>

          {/* Final Action Bar */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStage('step2_refinement')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={handleFinalSave}
              disabled={isSaving}
              id="btn-save-event-plan"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-slate-900 hover:bg-slate-800 text-white shadow-md active:scale-98 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{isSaving ? 'Saving Event...' : 'Save Event & Plan Milestones'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
