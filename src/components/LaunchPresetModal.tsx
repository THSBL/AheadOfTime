import React, { useState } from 'react';
import { 
  X, 
  Zap, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Layers,
  Sparkles 
} from 'lucide-react';
import { CustomPreset } from '../types';

interface LaunchPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  preset: CustomPreset | null;
  onConfirmLaunch: (preset: CustomPreset, targetDate: string, targetTime: string, eventTitle: string) => void;
}

export const LaunchPresetModal: React.FC<LaunchPresetModalProps> = ({
  isOpen,
  onClose,
  preset,
  onConfirmLaunch,
}) => {
  if (!isOpen || !preset) return null;

  // Set default target date ~30-45 days ahead
  const defaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 35);
    return d.toISOString().split('T')[0];
  };

  const [eventTitle, setEventTitle] = useState(preset.title);
  const [targetDate, setTargetDate] = useState(defaultDate());
  const [targetTime, setTargetTime] = useState('10:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !targetDate) return;
    onConfirmLaunch(preset, targetDate, targetTime, eventTitle.trim());
    onClose();
  };

  // Preview projected dates for top 4 milestones
  const sampleMilestones = preset.milestones.slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Apply Preset Runway
              </h2>
              <p className="text-xs text-slate-500">
                Deterministic milestone projection with zero LLM delay.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          <div className="bg-indigo-50/60 rounded-2xl border border-indigo-100/90 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-indigo-950">{preset.title}</span>
              <span className="text-[10px] font-bold bg-indigo-200/60 text-indigo-800 px-2 py-0.5 rounded-full">
                {preset.milestones.length} Milestones
              </span>
            </div>
            <p className="text-[11px] text-indigo-800/80 mt-1 line-clamp-2">
              {preset.description}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-700">Project / Event Name</label>
            <input
              type="text"
              required
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="e.g. Mobile App v2.0 Launch"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-none focus:border-indigo-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Target Event / Launch Date</span>
              </label>
              <input
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Target Time</span>
              </label>
              <input
                type="time"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50/60 focus:bg-white focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          {/* Quick preview of deterministic dates */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Sample Projected Dates (Lead-time calculation)
            </span>
            <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden text-xs">
              {sampleMilestones.map((m, i) => {
                const [y, mo, d] = targetDate.split('-').map(Number);
                const calc = new Date(y, mo - 1, d);
                calc.setDate(calc.getDate() - m.t_minus_days);
                const dateStr = `${calc.getFullYear()}-${String(calc.getMonth() + 1).padStart(2, '0')}-${String(calc.getDate()).padStart(2, '0')}`;
                return (
                  <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 truncate">{m.task}</span>
                    <span className="font-mono text-[11px] text-indigo-600 font-bold shrink-0">
                      {dateStr} ({m.t_minus_days >= 0 ? `T-${m.t_minus_days}d` : `D+${Math.abs(m.t_minus_days)}`})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Project Milestones Instantly</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
