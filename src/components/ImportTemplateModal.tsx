import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ArrowRight, 
  Sliders, 
  Download, 
  Trash2, 
  Plus, 
  Layers,
  Calendar,
  Clock,
  Check
} from 'lucide-react';
import { 
  parseSpreadsheetFile, 
  autoDetectColumnMapping, 
  mapRowsToMilestones, 
  generateSampleCSV,
  saveCustomPreset,
  projectPresetToMilestones
} from '../utils/templateEngine';
import { 
  CustomPreset, 
  CustomPresetMilestone, 
  SpreadsheetColumnMapping, 
  CalendarEvent 
} from '../types';

interface ImportTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPresetSaved: (newPreset: CustomPreset) => void;
  onApplyDirectly?: (preset: CustomPreset, targetDate: string, eventTitle: string) => void;
  currentEvent?: CalendarEvent | null;
}

export const ImportTemplateModal: React.FC<ImportTemplateModalProps> = ({
  isOpen,
  onClose,
  onPresetSaved,
  onApplyDirectly,
  currentEvent,
}) => {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Parsed spreadsheet data
  const [fileName, setFileName] = useState<string>('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<SpreadsheetColumnMapping>({ taskCol: '' });

  // Preset configuration
  const [presetTitle, setPresetTitle] = useState<string>('Custom Workflow Runway');
  const [presetTags, setPresetTags] = useState<string>('Engineering, Operations');
  const [milestones, setMilestones] = useState<CustomPresetMilestone[]>([]);

  // AI Calibration state
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationSuccess, setCalibrationSuccess] = useState(false);

  // Apply to event state
  const [applyOption, setApplyOption] = useState<'save_only' | 'apply_new' | 'apply_current'>(
    currentEvent ? 'apply_current' : 'apply_new'
  );
  const [targetLaunchDate, setTargetLaunchDate] = useState<string>(
    currentEvent?.eventDate || '2026-11-20'
  );
  const [targetEventTitle, setTargetEventTitle] = useState<string>(
    currentEvent?.title || 'Mobile App v2.0 Launch'
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setFileName(file.name);

    try {
      const { headers, rows } = await parseSpreadsheetFile(file);
      setRawHeaders(headers);
      setRawRows(rows);

      // Auto-detect mapping
      const detected = autoDetectColumnMapping(headers);
      setMapping(detected);

      // Initial name proposal from file name
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      setPresetTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));

      // Process initial milestones
      const mapped = mapRowsToMilestones(rows, detected);
      setMilestones(mapped);

      // Move to mapping or preview
      if (!detected.taskCol || !detected.offsetCol) {
        setStep('mapping');
      } else {
        setStep('preview');
      }
    } catch (err: any) {
      setParseError(err?.message || 'Failed to read spreadsheet file');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        handleFile(file);
      } else {
        setParseError('Please upload a valid .csv, .xlsx, or .xls file.');
      }
    }
  };

  const handleDownloadSample = (type: 'app_launch' | 'onboarding' | 'generic') => {
    const csvContent = generateSampleCSV(type);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ahead-of-time-sample-${type}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplyMapping = () => {
    if (!mapping.taskCol) {
      setParseError('Please select a column for Task Name / Milestone Title.');
      return;
    }
    setParseError(null);
    const mapped = mapRowsToMilestones(rawRows, mapping);
    setMilestones(mapped);
    setStep('preview');
  };

  const handleAICalibrate = async () => {
    if (milestones.length === 0) return;
    setIsCalibrating(true);
    setParseError(null);

    try {
      const response = await fetch('/api/presets/calibrate-offsets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetTitle,
          targetDate: targetLaunchDate,
          tasks: milestones.map((m) => ({
            task: m.task,
            description: m.description,
            tag: m.tag,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Server returned an error during calibration');
      }

      const data = await response.json();
      if (data.calibratedTasks && Array.isArray(data.calibratedTasks)) {
        const updated: CustomPresetMilestone[] = data.calibratedTasks.map(
          (ct: any, idx: number) => ({
            id: `cpm-calib-${idx}-${Date.now().toString(36)}`,
            task: ct.task,
            t_minus_days: typeof ct.t_minus_days === 'number' ? ct.t_minus_days : 0,
            tag: ct.tag || 'Operations',
            description: ct.description || '',
            kind: ct.kind || 'milestone',
            scope: Math.abs(ct.t_minus_days || 0) >= 14 ? 'macro' : 'micro',
          })
        );
        setMilestones(updated);
        setCalibrationSuccess(true);
        setTimeout(() => setCalibrationSuccess(false), 4000);
      }
    } catch (err: any) {
      setParseError('AI offset calibration failed. You can adjust offsets manually.');
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleSaveAndApply = () => {
    if (!presetTitle.trim()) {
      setParseError('Please give this template preset a title.');
      return;
    }
    if (milestones.length === 0) {
      setParseError('The preset must contain at least 1 milestone task.');
      return;
    }

    const tagArray = presetTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const newPreset: CustomPreset = {
      id: `preset-user-${Date.now().toString(36)}`,
      title: presetTitle.trim(),
      description: `Custom runway with ${milestones.length} deterministic preparation milestones.`,
      category: 'project_deadline',
      tags: tagArray.length > 0 ? tagArray : ['Custom'],
      milestones: milestones,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isBuiltIn: false,
    };

    // Save to permanent storage
    saveCustomPreset(newPreset);
    onPresetSaved(newPreset);

    // Apply if requested
    if (applyOption !== 'save_only' && onApplyDirectly) {
      onApplyDirectly(newPreset, targetLaunchDate, targetEventTitle);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Spreadsheet Workflow Importer</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  Dual-Track Engine
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Upload CSV or Excel spreadsheets to project deterministic T-Minus milestones with zero LLM latency.
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Error Banner */}
          {parseError && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{parseError}</span>
            </div>
          )}

          {/* STEP 1: Upload Area */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-400 bg-slate-50/50 hover:bg-white'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
                  {isParsing ? (
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UploadCloud className="w-7 h-7" />
                  )}
                </div>

                <div>
                  <p className="text-sm font-black text-slate-800">
                    {isParsing ? 'Reading spreadsheet structure...' : 'Click to upload or drag & drop spreadsheet'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
                  </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 bg-white border border-slate-200/80 px-3 py-1 rounded-full shadow-2xs">
                  <span>Auto-detects: Tasks, T-Minus Offsets, Categories & Descriptions</span>
                </div>
              </div>

              {/* Sample Templates Download Card */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download Pre-formatted Sample CSVs</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Ready to test immediately</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleDownloadSample('app_launch')}
                    className="p-3 bg-white rounded-xl border border-slate-200 text-left hover:border-indigo-400 hover:shadow-xs transition-all group"
                  >
                    <div className="text-xs font-black text-slate-800 group-hover:text-indigo-600 flex items-center justify-between">
                      <span>App Launch Runway</span>
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">8 milestones with T-60d down to T-0d</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadSample('onboarding')}
                    className="p-3 bg-white rounded-xl border border-slate-200 text-left hover:border-indigo-400 hover:shadow-xs transition-all group"
                  >
                    <div className="text-xs font-black text-slate-800 group-hover:text-indigo-600 flex items-center justify-between">
                      <span>90-Day Onboarding</span>
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Hardware prep to Day +90 sign-off</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadSample('generic')}
                    className="p-3 bg-white rounded-xl border border-slate-200 text-left hover:border-indigo-400 hover:shadow-xs transition-all group"
                  >
                    <div className="text-xs font-black text-slate-800 group-hover:text-indigo-600 flex items-center justify-between">
                      <span>Project Milestone Cycle</span>
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">5-stage reverse planned project timeline</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Map Spreadsheet Columns</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    File: <span className="font-semibold text-slate-700">{fileName}</span> ({rawRows.length} rows detected)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Choose another file
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                    <span>Task Name / Milestone Title</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={mapping.taskCol}
                    onChange={(e) => setMapping({ ...mapping, taskCol: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="">Select column...</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h} {rawRows[0]?.[h] ? `(e.g. "${String(rawRows[0][h]).slice(0, 25)}")` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                    <span>Lead-Time Offset (T-minus / Days)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                  </label>
                  <select
                    value={mapping.offsetCol || ''}
                    onChange={(e) => setMapping({ ...mapping, offsetCol: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="">None (AI will calibrate or defaults to T-Day)</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h} {rawRows[0]?.[h] ? `(e.g. "${String(rawRows[0][h]).slice(0, 15)}")` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                    <span>Category / Tag / Dept</span>
                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                  </label>
                  <select
                    value={mapping.tagCol || ''}
                    onChange={(e) => setMapping({ ...mapping, tagCol: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="">None (Defaults to Operations)</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h} {rawRows[0]?.[h] ? `(e.g. "${String(rawRows[0][h]).slice(0, 15)}")` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                    <span>Task Description / Notes</span>
                    <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                  </label>
                  <select
                    value={mapping.descCol || ''}
                    onChange={(e) => setMapping({ ...mapping, descCol: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="">None</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h} {rawRows[0]?.[h] ? `(e.g. "${String(rawRows[0][h]).slice(0, 20)}")` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleApplyMapping}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <span>Preview Milestones ({rawRows.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview & Configuration */}
          {step === 'preview' && (
            <div className="space-y-6">
              
              {/* Preset Meta Config */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700">Custom Preset Title</label>
                  <input
                    type="text"
                    value={presetTitle}
                    onChange={(e) => setPresetTitle(e.target.value)}
                    placeholder="e.g. Mobile App Store Launch Runway"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-700">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={presetTags}
                    onChange={(e) => setPresetTags(e.target.value)}
                    placeholder="e.g. Engineering, Mobile, QA"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              {/* Milestones Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900">
                      Configured Milestones ({milestones.length})
                    </h3>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                      Chronological T-Minus Order
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Deterministic offset arithmetic guarantees exact dates with zero LLM cost.
                  </p>
                </div>

                {/* AI Calibration Trigger */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('mapping')}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Re-map Columns</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAICalibrate}
                    disabled={isCalibrating}
                    className={`text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs ${
                      calibrationSuccess
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white'
                    }`}
                  >
                    {isCalibrating ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Calibrating Offsets...</span>
                      </>
                    ) : calibrationSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Offsets Calibrated!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>AI Calibrate Offsets</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Milestones Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-black text-slate-600">Offset</th>
                      <th className="py-2.5 px-3 font-black text-slate-600">Task Title</th>
                      <th className="py-2.5 px-3 font-black text-slate-600">Tag</th>
                      <th className="py-2.5 px-3 font-black text-slate-600">Description</th>
                      <th className="py-2.5 px-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {milestones.map((m, idx) => (
                      <tr key={m.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 whitespace-nowrap">
                          <input
                            type="number"
                            value={m.t_minus_days}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              const updated = [...milestones];
                              updated[idx] = { ...updated[idx], t_minus_days: val };
                              setMilestones(updated);
                            }}
                            className="w-14 px-1.5 py-1 text-center font-mono font-bold bg-slate-100 rounded-lg text-slate-900 border border-slate-200 text-xs"
                          />
                          <span className="ml-1 text-[10px] font-bold text-slate-400">
                            {m.t_minus_days >= 0 ? `(T-${m.t_minus_days}d)` : `(D+${Math.abs(m.t_minus_days)})`}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={m.task}
                            onChange={(e) => {
                              const updated = [...milestones];
                              updated[idx] = { ...updated[idx], task: e.target.value };
                              setMilestones(updated);
                            }}
                            className="w-full px-2 py-1 font-bold text-slate-900 bg-transparent hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 focus:bg-white focus:border-indigo-600"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {m.tag || 'Operations'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-500 max-w-xs truncate">
                          {m.description || '—'}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setMilestones(milestones.filter((_, i) => i !== idx));
                            }}
                            className="text-slate-300 hover:text-red-500 p-1"
                            title="Remove milestone"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Execution / Application Option */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Projection & Saving Options
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setApplyOption('save_only')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      applyOption === 'save_only'
                        ? 'border-indigo-600 bg-white ring-2 ring-indigo-600/20 shadow-xs'
                        : 'border-slate-200 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-900">Save Preset Only</div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Store permanently in My Saved Presets</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setApplyOption('apply_new')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      applyOption === 'apply_new'
                        ? 'border-indigo-600 bg-white ring-2 ring-indigo-600/20 shadow-xs'
                        : 'border-slate-200 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <div className="text-xs font-black text-slate-900">Create New Project Event</div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Project onto target calendar date</p>
                  </button>

                  {currentEvent && (
                    <button
                      type="button"
                      onClick={() => setApplyOption('apply_current')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        applyOption === 'apply_current'
                          ? 'border-indigo-600 bg-white ring-2 ring-indigo-600/20 shadow-xs'
                          : 'border-slate-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div className="text-xs font-black text-slate-900">Apply to Current Event</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Replace/augment current event tasks</p>
                    </button>
                  )}
                </div>

                {applyOption === 'apply_new' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Event Title</label>
                      <input
                        type="text"
                        value={targetEventTitle}
                        onChange={(e) => setTargetEventTitle(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">Target Launch / Delivery Date</label>
                      <input
                        type="date"
                        value={targetLaunchDate}
                        onChange={(e) => setTargetLaunchDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
          >
            Cancel
          </button>

          {step === 'preview' && (
            <button
              type="button"
              onClick={handleSaveAndApply}
              className="px-6 py-2.5 bg-[#182A42] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                {applyOption === 'save_only'
                  ? 'Save to My Presets'
                  : applyOption === 'apply_current'
                  ? 'Save & Apply to Event'
                  : 'Save & Project Milestones'}
              </span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
