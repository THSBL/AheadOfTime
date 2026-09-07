import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Calendar, Clock, Sparkles, Check, Trash2, Zap, Lightbulb, Loader2, RefreshCw, ChevronDown, Plus } from 'lucide-react';
import { MilestoneCategory, TMinusMilestone } from '../types';
import { calculateOffsetDate, formatDisplayDate } from '../utils/tminusRules';
import { inferTaskTimingLocally, fetchAITaskTiming, TimeUnit, TimingSuggestion } from '../utils/timingAI';

interface EditMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone: TMinusMilestone | null;
  eventDate: string;
  eventTime?: string;
  eventTitle: string;
  onSave: (updated: TMinusMilestone) => void;
  onDelete?: (milestoneId: string) => void;
}

const CATEGORIES: { value: MilestoneCategory; label: string }[] = [
  { value: 'prep', label: '🏡 Preparation / General' },
  { value: 'gift', label: '🎁 Gift & Present' },
  { value: 'booking', label: '🎟️ Booking & Reservation' },
  { value: 'shopping', label: '🛍️ Shopping & Groceries' },
  { value: 'logistics', label: '🚗 Logistics & Travel' },
  { value: 'costume', label: '👗 Costume & Theme' },
  { value: 'tickets', label: '🎫 Tickets & Passes' },
  { value: 'watchpoint', label: '🔍 Watchpoint' },
];

export const EditMilestoneModal: React.FC<EditMilestoneModalProps> = ({
  isOpen,
  onClose,
  milestone,
  eventDate,
  eventTime = '19:00',
  eventTitle,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !milestone) return null;

  const [title, setTitle] = useState(milestone.title);
  const [date, setDate] = useState(milestone.calculatedDate.substring(0, 10));
  const [amount, setAmount] = useState<number>(3);
  const [unit, setUnit] = useState<TimeUnit>('days');
  const [customBadge, setCustomBadge] = useState(milestone.tMinusLabel || '');
  const [category, setCategory] = useState<MilestoneCategory>(milestone.category || 'prep');
  const [description, setDescription] = useState(milestone.description || '');
  const [showDetails, setShowDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Dynamic AI suggestion state based on the input task
  const [currentSuggestion, setCurrentSuggestion] = useState<TimingSuggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize from milestone on open
  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDate(milestone.calculatedDate.substring(0, 10));
      setCustomBadge(milestone.tMinusLabel || '');
      setCategory(milestone.category || 'prep');
      setDescription(milestone.description || '');

      // Infer amount and unit from offset minutes
      const mins = Math.abs(milestone.tMinusOffsetMinutes || 0);
      if (mins >= 7 * 24 * 60 && mins % (7 * 24 * 60) === 0) {
        setAmount(mins / (7 * 24 * 60));
        setUnit('weeks');
      } else if (mins >= 24 * 60 && mins % (24 * 60) === 0) {
        setAmount(mins / (24 * 60));
        setUnit('days');
      } else if (mins > 0 && mins < 24 * 60) {
        setAmount(Math.max(1, Math.round(mins / 60)));
        setUnit('hours');
      } else {
        const targetTime = new Date(`${eventDate}T${eventTime}:00`).getTime();
        const taskTime = new Date(`${milestone.calculatedDate.substring(0, 10)}T09:00:00`).getTime();
        const diffDays = Math.max(1, Math.round((targetTime - taskTime) / (1000 * 60 * 60 * 24)));
        setAmount(diffDays);
        setUnit('days');
      }
    }
  }, [milestone, eventDate, eventTime]);

  // Dynamically analyze task as user modifies the title or description
  useEffect(() => {
    if (!title.trim()) {
      setCurrentSuggestion(null);
      return;
    }

    const instant = inferTaskTimingLocally(title, description, eventTitle);
    setCurrentSuggestion(instant);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      setIsAnalyzing(true);
      try {
        const aiResult = await fetchAITaskTiming(title, description, eventTitle, eventDate, eventTime);
        setCurrentSuggestion(aiResult);
      } catch (e) {
        // Local fallback in place
      } finally {
        setIsAnalyzing(false);
      }
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [title, description, eventTitle, eventDate, eventTime]);

  const computedBadge = useMemo(() => {
    if (customBadge.trim()) return customBadge.trim();
    if (unit === 'weeks') return `T-${amount}w`;
    if (unit === 'hours') return `T-${amount}h`;
    return `T-${amount}d`;
  }, [amount, unit, customBadge]);

  const applyTiming = (newAmount: number, newUnit: TimeUnit, newBadge?: string, newCategory?: MilestoneCategory) => {
    setAmount(newAmount);
    setUnit(newUnit);
    if (newBadge) {
      setCustomBadge(newBadge);
    } else {
      setCustomBadge('');
    }
    if (newCategory) {
      setCategory(newCategory);
    }

    const mins = newUnit === 'weeks' 
      ? -Math.round(newAmount * 7 * 24 * 60)
      : newUnit === 'hours'
      ? -Math.round(newAmount * 60)
      : -Math.round(newAmount * 24 * 60);

    const newCalculatedDate = calculateOffsetDate(eventDate, eventTime, mins);
    setDate(newCalculatedDate.substring(0, 10));
  };

  const handleDateChange = (newDateStr: string) => {
    setDate(newDateStr);
    const targetTime = new Date(`${eventDate}T${eventTime}:00`).getTime();
    const taskTime = new Date(`${newDateStr}T09:00:00`).getTime();
    const diffDays = Math.max(0, Math.round((targetTime - taskTime) / (1000 * 60 * 60 * 24)));
    if (diffDays > 0) {
      setAmount(diffDays);
      setUnit('days');
      setCustomBadge(`T-${diffDays}d`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    const offsetMinutes = unit === 'weeks'
      ? -Math.round(amount * 7 * 24 * 60)
      : unit === 'hours'
      ? -Math.round(amount * 60)
      : -Math.round(amount * 24 * 60);

    const updated: TMinusMilestone = {
      ...milestone,
      title: title.trim(),
      calculatedDate: date,
      tMinusLabel: computedBadge || 'T-Task',
      tMinusOffsetMinutes: offsetMinutes,
      category,
      description: description.trim() || undefined,
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-md w-[calc(100vw-1.25rem)] sm:w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85dvh] sm:max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Compact Header */}
        <div className="bg-slate-50 px-3.5 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                Edit Preparation Task
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                For: <span className="font-semibold text-slate-700">{eventTitle}</span>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-3.5 sm:p-5 space-y-3 overflow-y-auto flex-1 overscroll-contain">
          
          {/* Task Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Task Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order custom bakery cake"
              className="w-full bg-slate-50 text-slate-900 text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Lead Time & Due Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Lead Time (T-Minus)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const safeVal = isNaN(val) || val < 1 ? 1 : val;
                    applyTiming(safeVal, unit);
                  }}
                  className="w-16 bg-slate-50 text-slate-900 text-xs sm:text-sm font-bold px-2 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white text-center font-mono"
                />
                
                <select
                  value={unit}
                  onChange={(e) => {
                    const newUnit = e.target.value as TimeUnit;
                    applyTiming(amount, newUnit);
                  }}
                  className="flex-1 bg-slate-50 text-slate-900 text-xs font-semibold px-2 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
                >
                  <option value="weeks">Weeks before</option>
                  <option value="days">Days before</option>
                  <option value="hours">Hours before</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Due Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-slate-50 text-slate-900 text-xs font-mono font-bold px-2.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Progressive Disclosure Toggle */}
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between transition-colors cursor-pointer mt-1"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>{showDetails ? 'Fewer options' : 'More options (Category, Badge, Notes, Timing AI)'}</span>
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>

          {/* Collapsible Details */}
          {showDetails && (
            <div className="space-y-3 pt-1 border-t border-slate-100 animate-in fade-in duration-150">
              {/* Category & Badge */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MilestoneCategory)}
                    className="w-full bg-slate-50 text-slate-800 text-xs font-medium px-2.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Badge Label
                  </label>
                  <input
                    type="text"
                    value={customBadge || computedBadge}
                    onChange={(e) => setCustomBadge(e.target.value)}
                    placeholder="e.g. T-14d"
                    className="w-full bg-slate-50 text-slate-900 text-xs font-mono font-bold px-2.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Dynamic AI Suggestions if available */}
              {currentSuggestion && (
                <div className="p-2.5 bg-sky-50/60 rounded-xl border border-sky-100 space-y-1.5 text-xs">
                  {currentSuggestion.reason && (
                    <p className="text-[11px] text-slate-600 leading-snug">
                      <strong className="text-slate-800 font-semibold">Suggested: </strong>
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
                          onClick={() => applyTiming(alt.amount, alt.unit, alt.badge, currentSuggestion.category)}
                          className="text-[10px] font-semibold text-slate-700 bg-white hover:bg-sky-100 border border-slate-200 px-2 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span>{alt.label}</span>
                          <span className="text-[9px] font-mono text-sky-700 font-bold">({alt.badge})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Specific instructions or URLs..."
                  className="w-full bg-slate-50 text-slate-900 text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all resize-none placeholder:text-slate-400 font-medium"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 shrink-0">
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(milestone.id);
                  onClose();
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Save</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
