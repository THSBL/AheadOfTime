import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Calendar, Clock, Sparkles, Check, Trash2, Zap, Lightbulb, Loader2, RefreshCw } from 'lucide-react';
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
                Edit Preparation Task
              </h3>
              <p className="text-xs text-slate-500">
                Adjust timing, due date, lead-time badge, or details
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          {/* Step 1: Action Title */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Task Title *
              </label>
              {isAnalyzing && (
                <span className="text-[11px] text-sky-600 font-medium flex items-center gap-1 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking timing...
                </span>
              )}
            </div>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order custom bakery cake"
              className="w-full bg-slate-50 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Dynamic Smart Suggestion Box (Calculated from Task Input) */}
          {title.trim().length > 0 && currentSuggestion && (
            <div className="bg-gradient-to-br from-sky-50/90 via-indigo-50/50 to-slate-50 p-4 rounded-2xl border border-sky-200/80 shadow-xs space-y-2.5 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-sky-800">
                      Smart Timing Recommendation
                    </div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{currentSuggestion.amount} {currentSuggestion.unit} before</span>
                      <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-900 font-bold border border-sky-200">
                        {currentSuggestion.badge}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => applyTiming(
                    currentSuggestion.amount,
                    currentSuggestion.unit,
                    currentSuggestion.badge,
                    currentSuggestion.category
                  )}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>Auto-fill</span>
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed pl-8">
                💡 <strong className="text-slate-800 font-semibold">Why this timing:</strong> {currentSuggestion.reason}
              </p>

              {/* Contextual Alternative Chips */}
              {currentSuggestion.alternatives && currentSuggestion.alternatives.length > 0 && (
                <div className="pt-2 border-t border-sky-100 flex flex-wrap items-center gap-2 pl-8">
                  <span className="text-[11px] font-semibold text-slate-500">Other options:</span>
                  {currentSuggestion.alternatives.map((alt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyTiming(alt.amount, alt.unit, alt.badge, currentSuggestion.category)}
                      className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-sky-100/70 border border-sky-200 px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                      title={alt.reason}
                    >
                      <span>{alt.label}</span>
                      <span className="text-[9px] font-mono text-sky-700 font-bold">({alt.badge})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Exact Timing Controls (Amount + Unit Dropdown) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                T-Minus (Lead Time)
              </label>
              <div className="flex items-center gap-2">
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
                  className="w-24 bg-slate-50 text-slate-900 text-sm font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white text-center font-mono"
                />
                
                <select
                  value={unit}
                  onChange={(e) => {
                    const newUnit = e.target.value as TimeUnit;
                    applyTiming(amount, newUnit);
                  }}
                  className="flex-1 bg-slate-50 text-slate-900 text-sm font-semibold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
                >
                  <option value="weeks">Weeks before</option>
                  <option value="days">Days before</option>
                  <option value="hours">Hours before</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Due Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-slate-50 text-slate-900 text-sm font-mono font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MilestoneCategory)}
                className="w-full bg-slate-50 text-slate-900 text-sm font-medium px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all cursor-pointer"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Lead-Time Badge
              </label>
              <input
                type="text"
                value={customBadge || computedBadge}
                onChange={(e) => setCustomBadge(e.target.value)}
                placeholder="e.g. T-14d, T-7d, T-2h"
                className="w-full bg-slate-50 text-slate-900 text-sm font-mono font-bold px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Notes &amp; Details
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any specific links, requirements, or instructions..."
              className="w-full bg-slate-50 text-slate-900 text-sm p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white transition-all resize-none placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            {onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(milestone.id);
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Task</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md shadow-slate-900/20 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
