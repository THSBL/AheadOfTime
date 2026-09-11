import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Clock, Plus, Sparkles, Calendar, Check, Zap, Lightbulb, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
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
  project_deadline: '🎯 Project Deadline',
  qa: '🧪 QA & Testing',
  operations: '⚙️ Operations & Deployment',
  general: '📌 General Deliverable',
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
  const [showDetails, setShowDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

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
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-md w-[calc(100vw-1.25rem)] sm:w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85dvh] sm:max-h-[82vh]">
        
        {/* Compact Header */}
        <div className="bg-slate-50 px-3.5 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                Add Preparation Task
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                For: <span className="text-slate-800 font-semibold">{eventTitle}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-3.5 sm:p-5 space-y-3 overflow-y-auto flex-1 overscroll-contain">
          
          {/* Task Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Task Name *
              </label>
              {isAnalyzing ? (
                <span className="text-[10px] text-sky-600 font-medium flex items-center gap-1 animate-pulse">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Suggesting timing...
                </span>
              ) : hasConfirmedInput && currentSuggestion ? (
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-500" />
                  Smart Timing
                </span>
              ) : null}
            </div>

            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Book group dinner, Order supplies..."
              className="w-full bg-slate-50 text-slate-900 text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400 font-medium transition-all"
            />
          </div>

          {/* Timing (Lead Time) Controls */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Lead Time *
              </label>
              {calculatedDate && computedBadge ? (
                <span className="text-[10px] font-mono font-bold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded">
                  Due {formatDisplayDate(calculatedDate, unit === 'hours')} ({computedBadge})
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={amount}
                placeholder="3"
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
                className="w-16 sm:w-20 bg-slate-50 text-slate-900 text-xs sm:text-sm font-bold px-2.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white text-center font-mono"
              />
              
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as TimeUnit);
                  setCustomBadge('');
                  setUserEditedTiming(true);
                }}
                className="flex-1 bg-slate-50 text-slate-900 text-xs sm:text-sm font-semibold px-2.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
              >
                <option value="weeks">Weeks before</option>
                <option value="days">Days before</option>
                <option value="hours">Hours before</option>
              </select>
            </div>
          </div>

          {/* Progressive Disclosure Button for More Information */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between transition-colors cursor-pointer mt-1"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>{showDetails ? 'Fewer options' : 'More options (Category, Notes, AI insights)'}</span>
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>

          {/* Collapsible Details */}
          {showDetails && (
            <div className="space-y-3 pt-1 border-t border-slate-100 animate-in fade-in duration-150">
              {/* Category Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e: any) => {
                    setCategory(e.target.value);
                    setUserEditedCategory(true);
                  }}
                  className="w-full bg-slate-50 text-slate-800 text-xs px-2.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer font-medium"
                >
                  {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* AI Timing Context & Alternatives */}
              {currentSuggestion && (
                <div className="p-2.5 bg-sky-50/60 rounded-xl border border-sky-100 space-y-1.5 text-xs">
                  {currentSuggestion.reason && (
                    <p className="text-[11px] text-slate-600 leading-snug">
                      <strong className="text-slate-800 font-semibold">Recommended: </strong>
                      {currentSuggestion.reason}
                    </p>
                  )}
                  {currentSuggestion.alternatives && currentSuggestion.alternatives.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <span className="text-[10px] font-bold text-slate-500">Quick options:</span>
                      {currentSuggestion.alternatives.map((alt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => applyTimingSuggestion(alt.amount, alt.unit, alt.badge, currentSuggestion.category)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md transition-all cursor-pointer border ${
                            amount === alt.amount && unit === alt.unit
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'text-slate-700 bg-white hover:bg-sky-100 border-slate-200'
                          }`}
                        >
                          {alt.label} ({alt.badge})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Notes / Checklist */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Links, booking refs, or notes..."
                  rows={2}
                  className="w-full bg-slate-50 text-slate-900 text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400 resize-none font-medium"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#182A42] hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Task</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
