import React, { useState } from 'react';
import { 
  Plus, 
  FileSpreadsheet, 
  Calendar, 
  Sparkles, 
  Trash2, 
  Download, 
  ChevronRight, 
  Layers, 
  Tag, 
  Clock, 
  CheckCircle2, 
  Zap,
  Copy
} from 'lucide-react';
import { CustomPreset } from '../types';
import { deleteCustomPreset, saveCustomPreset, generateSampleCSV } from '../utils/templateEngine';

interface MySavedPresetsViewProps {
  presets: CustomPreset[];
  onOpenImporter: () => void;
  onApplyPresetToNewEvent: (preset: CustomPreset) => void;
  onPresetsUpdated: (updated: CustomPreset[]) => void;
}

export const MySavedPresetsView: React.FC<MySavedPresetsViewProps> = ({
  presets,
  onOpenImporter,
  onApplyPresetToNewEvent,
  onPresetsUpdated,
}) => {
  const [previewPreset, setPreviewPreset] = useState<CustomPreset | null>(null);

  const handleDelete = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this custom preset?')) {
      const updated = deleteCustomPreset(presetId);
      onPresetsUpdated(updated);
      if (previewPreset?.id === presetId) setPreviewPreset(null);
    }
  };

  const handleDuplicate = (e: React.MouseEvent, preset: CustomPreset) => {
    e.stopPropagation();
    const duplicate: CustomPreset = {
      ...preset,
      id: `preset-user-${Date.now().toString(36)}`,
      title: `${preset.title} (Copy)`,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = saveCustomPreset(duplicate);
    onPresetsUpdated(updated);
  };

  const handleExportCSV = (e: React.MouseEvent, preset: CustomPreset) => {
    e.stopPropagation();
    let csv = 'Task,Offset,Tag,Description\n';
    preset.milestones.forEach((m) => {
      const offset = m.t_minus_days === 0 ? 'T-Day' : m.t_minus_days > 0 ? `T-${m.t_minus_days}d` : `Day +${Math.abs(m.t_minus_days)}`;
      const cleanTask = `"${(m.task || '').replace(/"/g, '""')}"`;
      const cleanTag = `"${(m.tag || '').replace(/"/g, '""')}"`;
      const cleanDesc = `"${(m.description || '').replace(/"/g, '""')}"`;
      csv += `${cleanTask},${offset},${cleanTag},${cleanDesc}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${preset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Presets Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {presets.map((preset) => (
          <div
            key={preset.id}
            onClick={() => onApplyPresetToNewEvent(preset)}
            className="group p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3 relative"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-sm font-bold">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {preset.title}
                    </h4>
                    {preset.isBuiltIn && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Verified Built-in
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => handleExportCSV(e, preset)}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Export as CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDuplicate(e, preset)}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Duplicate Preset"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {!preset.isBuiltIn && (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, preset.id)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Preset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500 font-normal leading-relaxed mt-2 line-clamp-2">
                {preset.description}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px]">
                  {preset.milestones.length} Milestones
                </span>

                <span className="text-slate-500 font-bold flex items-center gap-1 group-hover:text-indigo-600 transition-colors">
                  <span>Apply Runway</span>
                  <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>

              {preset.tags && preset.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {preset.tags.map((t, idx) => (
                    <span key={idx} className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
