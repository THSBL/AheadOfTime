import React, { useState } from 'react';
import { X, Clock, Plus, Sparkles } from 'lucide-react';
import { MilestoneCategory, TMinusMilestone } from '../types';
import { calculateOffsetDate } from '../utils/tminusRules';

interface CustomMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMilestone: (milestone: TMinusMilestone) => void;
  eventId: string;
  eventDate: string;
  eventTime?: string;
  eventTitle: string;
}

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
  const [tMinusLabel, setTMinusLabel] = useState('T-5d');
  const [offsetDays, setOffsetDays] = useState('5');
  const [category, setCategory] = useState<MilestoneCategory>('prep');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const daysNum = parseFloat(offsetDays) || 5;
    const offsetMinutes = -Math.round(daysNum * 24 * 60);
    const calculatedDate = calculateOffsetDate(eventDate, eventTime, offsetMinutes);

    const newMilestone: TMinusMilestone = {
      id: `ms-custom-${Date.now()}`,
      eventId,
      tMinusLabel: tMinusLabel.trim() || `T-${daysNum}d`,
      tMinusOffsetMinutes: offsetMinutes,
      calculatedDate,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      status: 'pending',
    };

    onAddMilestone(newMilestone);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-slate-900" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-wide">
              Add Custom T-Minus Action
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs sm:text-sm text-slate-500">
            Adding milestone for: <strong className="text-slate-900 font-semibold">{eventTitle}</strong>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Action Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g., Order personalized cake, Pick up party balloons..."
              className="w-full bg-slate-50/60 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
                T-Minus Badge Label
              </label>
              <input
                type="text"
                value={tMinusLabel}
                onChange={(e) => setTMinusLabel(e.target.value)}
                placeholder="E.g. T-5d, T-48h"
                className="w-full bg-slate-50/60 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
                Days Before Event
              </label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={offsetDays}
                onChange={(e) => {
                  setOffsetDays(e.target.value);
                  setTMinusLabel(`T-${e.target.value}d`);
                }}
                className="w-full bg-slate-50/60 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e: any) => setCategory(e.target.value)}
              className="w-full bg-slate-50/60 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
            >
              <option value="prep">🏡 General Preparation</option>
              <option value="gift">🎁 Gift / Collection</option>
              <option value="shopping">🛍️ Shopping / Groceries</option>
              <option value="booking">🎟️ Booking / Reservations</option>
              <option value="costume">✨ Costume / Outfit</option>
              <option value="logistics">🚗 Transport / Travel</option>
            </select>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Detailed Notes (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add specific instructions, vendor URLs, or contact numbers..."
              rows={2}
              className="w-full bg-slate-50/60 text-slate-900 text-sm px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#0f172a] hover:bg-slate-800 text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-sm shadow-slate-900/25 flex items-center gap-2 transition-all cursor-pointer"
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
