import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Clock, Plus, Sparkles, Calendar, Check, Zap, Lightbulb, Loader2, RefreshCw } from 'lucide-react';
import { MilestoneCategory, TMinusMilestone } from '../types';
import { calculateOffsetDate, formatDisplayDate } from '../utils/tminusRules';
import { inferTaskTimingLocally, fetchAITaskTiming, TimeUnit, TimingSuggestion } from '../utils/timingAI';

interface CustomMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMilestone: (milestone: TMinusMilestone) => void;
  eventId: string;
  eventDate: string;
  eventTime?: string;
  eventTitle: string;
}

const CATEGORY_NAMES: Record<MilestoneCategory, string> = {
  prep: '🏡 Preparation / General',
  gift: '🎁 Gift & Present',
  shopping: '🛍️ Shopping & Supplies',
  booking: '🎟️ Booking & Reservations',
  costume: '👗 Outfit & Dress Code',
  logistics: '🚗 Logistics & Travel',
  tickets: '🎫 Ticket Sales',
  watchpoint: '🔍 Watchpoint / Research',
  review: '📝 Review & QA',
  marketing: '📢 Marketing & Outreach',
  work: '💼 Work & Milestones',
  admin: '📋 Admin & Paperwork',
};

export const CustomMilestoneModal: React.FC<CustomMilestoneModalProps> = ({
  isOpen,
  onClose,
  onAddMilestone,
  eventId,
  eventDate,
  eventTime = '19:00',
  eventTitle,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [unit, setUnit] = useState<TimeUnit>('days');
  const [customBadge, setCustomBadge] = useState('');
  const [category, setCategory] = useState<MilestoneCategory>('prep');

  // Track if user manually touched timing or category
  const [userEditedTiming, setUserEditedTiming] = useState(false);
  const [userEditedCategory, setUserEditedCategory] = useState(false);

  // Dynamic AI suggestion state based on the input task
  const [currentSuggestion, setCurrentSuggestion] = useState<TimingSuggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [hasConfirmedInput, setHasConfirmedInput] = useState<boolean>(false);

  // Auto-calculate smart timing on input change (immediate local inference + debounced API call)
  useEffect(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setCurrentSuggestion(null);
      setHasConfirmedInput(false);
      setAmount('');
      setCustomBadge('');
      return;
    }

    // Immediately run local inference for instant responsiveness (e.g. Karaoke -> 3 weeks)
    const localResult = inferTaskTimingLocally(trimmedTitle, description.trim(), eventTitle);
    setCurrentSuggestion(localResult);
    setHasConfirmedInput(true);

    if (!userEditedTiming) {
      setAmount(localResult.amount);
      setUnit(localResult.unit);
    }
    if (!userEditedCategory) {
      setCategory(localResult.category);
    }

    // Debounced call to server AI endpoint
    const timer = setTimeout(async () => {
      try {
        setIsAnalyzing(true);
        const aiResult = await fetchAITaskTiming(trimmedTitle, description.trim(), eventTitle, eventDate, eventTime);
        setCurrentSuggestion(aiResult);
        if (!userEditedTiming) {
          setAmount(aiResult.amount);
          setUnit(aiResult.unit);
        }
        if (!userEditedCategory) {
          setCategory(aiResult.category);
        }
      } catch (e) {
        // Graceful fallback
      } finally {
        setIsAnalyzing(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [title, description, eventTitle, eventDate, eventTime, userEditedTiming, userEditedCategory]);

  // Manual trigger button to re-run AI suggestion on demand
  const handleConfirmAndSuggest = async () => {
    if (!title.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    setHasConfirmedInput(false);

    try {
      let result: TimingSuggestion;
      try {
        result = await fetchAITaskTiming(title.trim(), description.trim(), eventTitle, eventDate, eventTime);
      } catch (e) {
        result = inferTaskTimingLocally(title.trim(), description.trim(), eventTitle);
      }

      setCurrentSuggestion(result);
      setAmount(result.amount);
      setUnit(result.unit);
      setCustomBadge('');
      setCategory(result.category);
      setUserEditedTiming(false);
      setUserEditedCategory(false);
      setHasConfirmedInput(true);
    } catch (e) {
      console.warn('Timing calculation error', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset suggestions if user completely clears the task title
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!newTitle.trim()) {
      setCurrentSuggestion(null);
      setHasConfirmedInput(false);
      setAmount('');
      setCustomBadge('');
      setUserEditedTiming(false);
    }
  };

  // Compute default badge from amount + unit only if amount is present
  const computedBadge = useMemo(() => {
    if (customBadge.trim()) return customBadge.trim();
    if (amount === '' || amount === null || typeof amount === 'undefined') return '';
    if (unit === 'weeks') return `T-${amount}w`;
    if (unit === 'hours') return `T-${amount}h`;
    return `T-${amount}d`;
  }, [amount, unit, customBadge]);

  // Compute offset minutes
  const offsetMinutes = useMemo(() => {
    if (amount === '' || amount === null || typeof amount === 'undefined') return null;
    const validAmount = Math.max(1, Math.round(Number(amount) || 1));
    if (unit === 'weeks') return -Math.round(validAmount * 7 * 24 * 60);
    if (unit === 'hours') return -Math.round(validAmount * 60);
    return -Math.round(validAmount * 24 * 60);
  }, [amount, unit]);

  // Compute preview target date
  const calculatedDate = useMemo(() => {
    if (offsetMinutes === null) return null;
    return calculateOffsetDate(eventDate, eventTime, offsetMinutes);
  }, [eventDate, eventTime, offsetMinutes]);

  const applyTimingSuggestion = (suggAmount: number, suggUnit: TimeUnit, suggBadge?: string, suggCategory?: MilestoneCategory) => {
    setAmount(suggAmount);
    setUnit(suggUnit);
    setCustomBadge('');
    if (suggCategory) {
      setCategory(suggCategory);
    }
    setUserEditedTiming(false);
    setUserEditedCategory(false);
  };

  const handleResetToAuto = () => {
    if (currentSuggestion) {
      setUserEditedTiming(false);
      setUserEditedCategory(false);
      setAmount(currentSuggestion.amount);
      setUnit(currentSuggestion.unit);
      setCustomBadge('');
      setCategory(currentSuggestion.category);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const finalAmount = amount === '' ? 1 : Math.max(1, Math.round(Number(amount)));
    const mins = unit === 'weeks'
      ? -Math.round(finalAmount * 7 * 24 * 60)
      : unit === 'hours'
      ? -Math.round(finalAmount * 60)
      : -Math.round(finalAmount * 24 * 60);
    
    const finalDate = calculateOffsetDate(eventDate, eventTime, mins);
    const finalBadge = computedBadge || (unit === 'weeks' ? `T-${finalAmount}w` : unit === 'hours' ? `T-${finalAmount}h` : `T-${finalAmount}d`);

    const newMilestone: TMinusMilestone = {
      id: `ms-custom-${Date.now()}`,
      eventId,
      tMinusLabel: finalBadge,
      tMinusOffsetMinutes: mins,
      calculatedDate: finalDate,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      status: 'pending',
    };

    onAddMilestone(newMilestone);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-50/90 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Clock className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Add Preparation Milestone
              </h3>
              <p className="text-xs text-slate-500">
                For target event: <strong className="text-slate-800 font-semibold">{eventTitle}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          {/* Step 1: Desired Task Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                1. What task do you need to do? *
              </label>
              {isAnalyzing ? (
                <span className="text-[11px] text-sky-600 font-medium flex items-center gap-1 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Calculating smart timing...
                </span>
              ) : hasConfirmedInput && currentSuggestion ? (
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                  Smart Timing Applied
                </span>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmAndSuggest();
                    }
                  }}
                  placeholder="e.g. Order personalized gift, Buy groceries, Book flight..."
                  className="w-full bg-slate-50 text-slate-900 text-sm px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400 font-medium transition-all shadow-2xs"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmAndSuggest}
                disabled={!title.trim() || isAnalyzing}
                className="bg-gradient-to-r from-amber-500/10 to-sky-500/10 hover:from-amber-500/20 hover:to-sky-500/20 text-slate-900 text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-2xl border border-amber-300/80 flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-amber-500/10 disabled:hover:to-sky-500/10 shrink-0"
                title={title.trim() ? "Analyze task and suggest optimal timing" : "Type a task first"}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                    <span className="truncate">Calculating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="truncate">Confirm &amp; Suggest</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Dynamic Smart Analysis & Auto-Fill Explainer (Shown only after calculations are complete) */}
          {!isAnalyzing && hasConfirmedInput && currentSuggestion && title.trim().length > 0 && (
            <div className="bg-gradient-to-br from-sky-50/90 via-indigo-50/50 to-slate-50 p-4 rounded-2xl border border-sky-200/80 shadow-xs space-y-2.5 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-sky-800 flex items-center gap-1.5">
                      <span>Smart Suggested Timing</span>
                      {!userEditedTiming && !userEditedCategory && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                          Applied
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{currentSuggestion.amount} {currentSuggestion.unit} before</span>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 font-bold border border-sky-200">
                        {currentSuggestion.badge}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        • {CATEGORY_NAMES[currentSuggestion.category] || currentSuggestion.category}
                      </span>
                    </div>
                  </div>
                </div>

                {(userEditedTiming || userEditedCategory) && (
                  <button
                    type="button"
                    onClick={handleResetToAuto}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-sky-700 bg-white hover:bg-sky-50 border border-sky-200 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Reset to recommended timing"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sync Auto</span>
                  </button>
                )}
              </div>

              {/* Rationale explanation */}
              <p className="text-xs text-slate-600 leading-relaxed pl-8">
                💡 <strong className="text-slate-800 font-semibold">Why this timing:</strong> {currentSuggestion.reason}
              </p>

              {/* Alternative Options */}
              {currentSuggestion.alternatives && currentSuggestion.alternatives.length > 0 && (
                <div className="pt-2 border-t border-sky-100 flex flex-wrap items-center gap-2 pl-8">
                  <span className="text-[11px] font-semibold text-slate-500">Alternative buffers:</span>
                  {currentSuggestion.alternatives.map((alt, idx) => {
                    const isSelected = amount === alt.amount && unit === alt.unit;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applyTimingSuggestion(alt.amount, alt.unit, alt.badge, currentSuggestion.category)}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs border ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'text-slate-700 bg-white hover:bg-sky-100/70 border-sky-200'
                        }`}
                        title={alt.reason}
                      >
                        <span>{alt.label}</span>
                        <span className={`text-[9px] font-mono font-bold ${isSelected ? 'text-sky-300' : 'text-sky-700'}`}>
                          ({alt.badge})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Exact Timing Controls (Amount + Unit Dropdown) */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                2. Timing (Lead Time Before Event) *
              </label>
              {userEditedTiming ? (
                <span className="text-[10px] font-medium text-slate-400">Customized</span>
              ) : hasConfirmedInput && amount !== '' ? (
                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">
                  ⚡ Auto-filled
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2.5">
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                placeholder="e.g. 3"
                onChange={(e) => {
                  const rawVal = e.target.value;
                  if (rawVal === '') {
                    setAmount('');
                  } else {
                    const val = parseInt(rawVal, 10);
                    setAmount(isNaN(val) ? '' : Math.max(1, val));
                  }
                  setCustomBadge('');
                  setUserEditedTiming(true);
                }}
                className="w-28 bg-slate-50 text-slate-900 text-sm font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white text-center font-mono placeholder:text-slate-400 placeholder:font-normal"
              />
              
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as TimeUnit);
                  setCustomBadge('');
                  setUserEditedTiming(true);
                }}
                className="flex-1 bg-slate-50 text-slate-900 text-sm font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
              >
                <option value="weeks">Weeks before</option>
                <option value="days">Days before</option>
                <option value="hours">Hours before</option>
              </select>
            </div>
          </div>

          {/* Scheduled Date Preview - Only displayed once calculated or entered */}
          {calculatedDate && computedBadge ? (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Calculated due date:</span>
                <strong className="font-mono text-slate-900 font-bold">
                  {formatDisplayDate(calculatedDate, unit === 'hours')}
                </strong>
              </div>
              <span className="font-mono font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-md text-[11px]">
                {computedBadge}
              </span>
            </div>
          ) : null}

          {/* Category Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Category
              </label>
              {userEditedCategory ? (
                <span className="text-[10px] font-medium text-slate-400">Customized</span>
              ) : (
                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100">
                  ⚡ Auto-classified
                </span>
              )}
            </div>
            <select
              value={category}
              onChange={(e: any) => {
                setCategory(e.target.value);
                setUserEditedCategory(true);
              }}
              className="w-full bg-slate-50 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer font-medium"
            >
              {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Detailed Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Detailed Notes (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add specific URLs, recipes, vendor phone numbers, or checklist details..."
              rows={2}
              className="w-full bg-slate-50 text-slate-900 text-sm p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400 resize-none font-medium"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#0f172a] hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm shadow-slate-900/25 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add to Schedule</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
