import React from 'react';
import { X, Calendar } from 'lucide-react';
import { CalendarEvent } from '../types';
import { EventCreationWizard } from './EventCreationWizard';
import { CanonicalCategory } from '../utils/creationStateMachine';

interface ManualEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveEvent: (event: CalendarEvent) => void;
  currentReferenceDate: string;
  initialPresetCategory?: CanonicalCategory | null;
  initialTitle?: string;
  initialStage?: 'step1_title' | 'step2_refinement' | 'step3_milestones';
  initialEvent?: CalendarEvent | null;
}

export const ManualEventModal: React.FC<ManualEventModalProps> = ({
  isOpen,
  onClose,
  onSaveEvent,
  currentReferenceDate,
  initialPresetCategory,
  initialTitle = '',
  initialStage = 'step1_title',
  initialEvent = null,
}) => {
  if (!isOpen) return null;

  const defaultDate = initialEvent?.eventDate || (() => {
    const d = new Date(currentReferenceDate);
    d.setDate(d.getDate() + 21);
    return d.toISOString().substring(0, 10);
  })();
  const defaultDateStr = defaultDate;

  const handleEventSaved = (newEvent: CalendarEvent) => {
    onSaveEvent(newEvent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                {initialEvent ? `Refine Event: ${initialEvent.title}` : 'Add New Event'}
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                3-stage reverse-engineered milestone planner
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body with Wizard */}
        <div className="p-4 sm:p-6 max-h-[80vh] overflow-y-auto">
          <EventCreationWizard
            initialTitle={initialEvent?.title || initialTitle}
            initialDate={defaultDateStr}
            initialPresetCategory={initialPresetCategory}
            initialStage={initialStage}
            initialEvent={initialEvent}
            onComplete={handleEventSaved}
            onCancel={onClose}
            isModalMode={true}
          />
        </div>
      </div>
    </div>
  );
};
