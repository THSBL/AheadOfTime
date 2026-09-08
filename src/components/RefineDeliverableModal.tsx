import React, { useState } from 'react';
import { X, Check, Sparkles, SlidersHorizontal, MapPin, Clock, FileText } from 'lucide-react';
import { TMinusMilestone, CalendarEvent } from '../types';

interface RefineDeliverableModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone: TMinusMilestone | null;
  event: CalendarEvent;
  onSaveMilestone: (updatedMilestone: TMinusMilestone) => void;
}

export const RefineDeliverableModal: React.FC<RefineDeliverableModalProps> = ({
  isOpen,
  onClose,
  milestone,
  event,
  onSaveMilestone,
}) => {
  if (!isOpen || !milestone) return null;

  const [title, setTitle] = useState(milestone.title);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [providerOrVenue, setProviderOrVenue] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [notes, setNotes] = useState<string>(milestone.description || '');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const options = milestone.refinementOptions || [
    'Go-Karting Grand Prix',
    'Paintball / Laser Combat',
    'Private Craft Brewery Tour & Tasting',
    'Private Boat / Yacht Cruise',
    'Axe Throwing & Arcade Bar',
    'Escape Room Tournament',
    'VIP Club Table Reservation',
  ];

  const handleSelectOption = (opt: string) => {
    setSelectedOption(opt);
    // Replace generic placeholder in title or prefix with choice
    if (milestone.title.includes('activity') || milestone.title.includes('excursion') || milestone.title.includes('tour')) {
      setTitle(`Book ${opt}`);
    } else if (milestone.title.includes('reservation') || milestone.title.includes('table')) {
      setTitle(`Reserve table: ${opt}`);
    } else {
      setTitle(`${opt}`);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    let finalDesc = notes;
    if (providerOrVenue || scheduledTime) {
      const parts = [notes];
      if (providerOrVenue) parts.push(`Venue: ${providerOrVenue}`);
      if (scheduledTime) parts.push(`Time: ${scheduledTime}`);
      finalDesc = parts.filter(Boolean).join(' · ');
    }

    const updated: TMinusMilestone = {
      ...milestone,
      title: title.trim() || milestone.title,
      description: finalDesc,
      needsRefinement: false, // Refinement resolved!
    };

    onSaveMilestone(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Compact Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 font-mono">
                  {milestone.tMinusLabel}
                </span>
                <span className="text-[10px] font-bold text-[#0e1d2c] bg-slate-100 border border-[#0e1d2c] px-2 py-0.5 rounded-md inline-flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0e1d2c]" />
                  <span>Deliverable</span>
                </span>
              </div>
              <h3 className="text-xs font-bold text-slate-800 truncate max-w-[240px]">
                Refine Deliverable Details
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSave} className="p-4 space-y-3.5 overflow-y-auto">
          {/* Quick Concept / Activity Selection */}
          {options.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-600" />
                <span>Select Specification</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelectOption(opt)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all text-left cursor-pointer ${
                      selectedOption === opt
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deliverable Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Deliverable Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/60 text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
              placeholder="e.g. Book Go-Karting Grand Prix session"
            />
          </div>

          {/* Progressive Disclosure Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <span>{showAdvanced ? 'Hide Extra Details' : '+ Add Venue / Booking Details'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-2.5 pt-1 border-t border-slate-100 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" /> Venue / Provider
                  </label>
                  <input
                    type="text"
                    value={providerOrVenue}
                    onChange={(e) => setProviderOrVenue(e.target.value)}
                    placeholder="e.g. Karting Track"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" /> Slot Time
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-slate-400" /> Booking Notes / Link
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Deposit paid, minimum 10 drivers required..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-600 resize-none"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Save Refinement</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
