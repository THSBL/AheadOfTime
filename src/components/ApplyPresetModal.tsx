import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Sparkles, 
  Calendar, 
  CheckCircle2, 
  ArrowRight, 
  Clock, 
  Tag, 
  Zap, 
  Plus, 
  RefreshCw 
} from 'lucide-react';
import { CustomPreset, CalendarEvent, TMinusMilestone } from '../types';
import { loadCustomPresets, projectPresetToMilestones } from '../utils/templateEngine';

interface ApplyPresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: CalendarEvent;
  onApplyPreset: (
    updatedMilestones: TMinusMilestone[], 
    presetName: string, 
    mode: 'replace' | 'augment'
  ) => void;
  onOpenImporter?: () => void;
}

export const ApplyPresetModal: React.FC<ApplyPresetModalProps> = ({
  isOpen,
  onClose,
  event,
  onApplyPreset,
  onOpenImporter,
}) => {
  const [presets, setPresets] = useState<CustomPreset[]>(() => loadCustomPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    presets[0]?.id || ''
  );
  const [applyMode, setApplyMode] = useState<'replace' | 'augment'>('replace');

  if (!isOpen) return null;

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) || presets[0];

  const handleApply = () => {
    if (!selectedPreset) return;

    // Deterministic date arithmetic
    const projected = projectPresetToMilestones(
      selectedPreset,
      event.eventDate,
      event.eventTime || '10:00',
      event.id
    );

    let finalMilestones: TMinusMilestone[];
    if (applyMode === 'augment') {
      // Merge with existing milestones
      finalMilestones = [...(event.milestones || []), ...projected];
      // Sort chronologically
      finalMilestones.sort(
        (a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime()
      );
    } else {
      finalMilestones = projected.sort(
        (a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime()
      );
    }

    onApplyPreset(finalMilestones, selectedPreset.title, applyMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Apply Template Preset</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  Zero Latency
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Apply pre-configured deterministic milestones directly onto <strong className="text-slate-800">"{event.title}"</strong> ({event.eventDate}).
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Preset Selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Select Runway Template ({presets.length} available)
              </label>
              {onOpenImporter && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenImporter();
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Import New Spreadsheet</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
              {presets.map((preset) => {
                const isSelected = preset.id === selectedPresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black text-slate-900 truncate">
                        {preset.title}
                      </h4>
                      {preset.isBuiltIn && (
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          Built-in
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                        {preset.milestones.length} milestones
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Application Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setApplyMode('replace')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  applyMode === 'replace'
                    ? 'border-indigo-600 bg-white ring-2 ring-indigo-600/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-black text-slate-900">
                    Replace Existing Tasks
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Overwrite AI-generated tasks with the {selectedPreset?.milestones.length || 0} deterministic template milestones.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setApplyMode('augment')}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  applyMode === 'augment'
                    ? 'border-indigo-600 bg-white ring-2 ring-indigo-600/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-black text-slate-900">
                    Augment / Merge Tasks
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Keep existing {event.milestones?.length || 0} tasks and append the {selectedPreset?.milestones.length || 0} template milestones.
                </p>
              </button>
            </div>
          </div>

          {/* Preview of Milestones that will be projected */}
          {selectedPreset && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Deterministic Projection Preview
                </span>
                <span className="text-[11px] font-bold text-slate-500">
                  Target Event Date: {event.eventDate}
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 max-h-44 overflow-y-auto">
                <div className="divide-y divide-slate-200/80">
                  {selectedPreset.milestones.map((m, idx) => {
                    // Quick projection preview date
                    const [y, mo, d] = event.eventDate.split('-').map(Number);
                    const calc = new Date(y, mo - 1, d);
                    calc.setDate(calc.getDate() - m.t_minus_days);
                    const calcStr = `${calc.getFullYear()}-${String(calc.getMonth() + 1).padStart(2, '0')}-${String(calc.getDate()).padStart(2, '0')}`;

                    return (
                      <div key={idx} className="p-2.5 px-3 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-slate-200/90 text-slate-800 font-mono font-bold text-[10px] shrink-0">
                            {m.t_minus_days >= 0 ? `T-${m.t_minus_days}d` : `D+${Math.abs(m.t_minus_days)}`}
                          </span>
                          <span className="font-bold text-slate-900 truncate">
                            {m.task}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                            {m.tag}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {calcStr}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-6 py-2.5 bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              {applyMode === 'replace' ? 'Replace Milestones' : 'Merge Milestones'}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
