import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, Tag, FileText, Check, Trash2 } from 'lucide-react';
import { MilestoneCategory, TMinusMilestone } from '../types';

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
  { value: 'prep', label: 'Preparation / General' },
  { value: 'gift', label: 'Gift & Present' },
  { value: 'booking', label: 'Booking & Reservation' },
  { value: 'shopping', label: 'Shopping & Groceries' },
  { value: 'logistics', label: 'Logistics & Travel' },
  { value: 'costume', label: 'Costume & Theme' },
  { value: 'tickets', label: 'Tickets & Passes' },
  { value: 'watchpoint', label: 'Watchpoint' },
];

export const EditMilestoneModal: React.FC<EditMilestoneModalProps> = ({
  isOpen,
  onClose,
  milestone,
  eventDate,
  eventTime = '19:00',
  onSave,
  onDelete,
}) => {
  if (!isOpen || !milestone) return null;

  const [title, setTitle] = useState(milestone.title);
  const [date, setDate] = useState(milestone.calculatedDate.substring(0, 10));
  const [tMinusLabel, setTMinusLabel] = useState(milestone.tMinusLabel || 'T-7d');
  const [category, setCategory] = useState<MilestoneCategory>(milestone.category || 'prep');
  const [description, setDescription] = useState(milestone.description || '');

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDate(milestone.calculatedDate.substring(0, 10));
      setTMinusLabel(milestone.tMinusLabel || 'T-7d');
      setCategory(milestone.category || 'prep');
      setDescription(milestone.description || '');
    }
  }, [milestone]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    // Recalculate offset minutes from target event date
    const targetTime = new Date(`${eventDate}T${eventTime}:00`).getTime();
    const taskTime = new Date(`${date}T09:00:00`).getTime();
    const offsetMinutes = Math.round((taskTime - targetTime) / (1000 * 60));

    const updated: TMinusMilestone = {
      ...milestone,
      title: title.trim(),
      calculatedDate: date,
      tMinusLabel: tMinusLabel.trim() || 'T-Task',
      tMinusOffsetMinutes: offsetMinutes,
      category,
      description: description.trim() || undefined,
    };

    onSave(updated);
    onClose();
  };

  const handleDelete = () => {
    if (onDelete && milestone) {
      onDelete(milestone.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Edit Prep Task
              </h3>
              <p className="text-[11px] text-slate-500">
                Adjust topic, due date, lead-time badge, or description
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Task Topic / Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order custom bakery cake"
              className="w-full bg-slate-50 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-red-500 focus:bg-white transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Due Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-red-500 focus:bg-white transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                T-Minus Badge Label
              </label>
              <input
                type="text"
                value={tMinusLabel}
                onChange={(e) => setTMinusLabel(e.target.value)}
                placeholder="e.g. T-14d, T-7d, T-2h"
                className="w-full bg-slate-50 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-red-500 focus:bg-white transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MilestoneCategory)}
              className="w-full bg-slate-50 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-red-500 focus:bg-white transition-all cursor-pointer"
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
              Notes &amp; Details
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any specific links, requirements, or instructions..."
              className="w-full bg-slate-50 text-slate-900 text-sm p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-red-500 focus:bg-white transition-all resize-none placeholder:text-slate-400"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            {onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
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
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-md shadow-red-600/20 flex items-center gap-1.5 cursor-pointer"
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
