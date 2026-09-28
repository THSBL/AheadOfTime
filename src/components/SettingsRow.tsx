import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Settings: one line per item (icon, name, one short detail, a status or
 * action on the right). Tapping the line opens the details below it, so
 * the page stays short and the long texts are there only when wanted.
 */
export const SettingsGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200/90 rounded-2xl shadow-xs divide-y divide-slate-100 overflow-hidden ${className}`}>
    {children}
  </div>
);

export const SettingsPill: React.FC<{ on: boolean; children: React.ReactNode }> = ({ on, children }) => (
  <span
    className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${
      on ? 'bg-aot-sage text-[#20463a]' : 'bg-slate-100 text-slate-500'
    }`}
  >
    {children}
  </span>
);

interface SettingsRowProps {
  id?: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Status pill or a small action (stays tappable without opening the row). */
  right?: React.ReactNode;
  /** Open on first render, and again whenever this turns true (e.g. a notice to show). */
  open?: boolean;
  tone?: 'default' | 'danger';
  children?: React.ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({ id, icon, title, subtitle, right, open, tone = 'default', children }) => {
  const [isOpen, setIsOpen] = useState(Boolean(open));
  useEffect(() => {
    if (open) setIsOpen(true);
  }, [open]);
  const expandable = Boolean(children);
  const toggle = () => expandable && setIsOpen((v) => !v);

  return (
    <div id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expandable ? isOpen : undefined}
          className={`flex flex-1 min-w-0 items-center gap-3 text-left ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              tone === 'danger' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {icon}
          </span>
          <span className="min-w-0">
            <span className={`block text-sm font-bold leading-tight ${tone === 'danger' ? 'text-rose-700' : 'text-slate-900'}`}>{title}</span>
            {subtitle && <span className="block text-xs text-slate-500 truncate mt-0.5">{subtitle}</span>}
          </span>
        </button>
        {right}
        {expandable && (
          <button
            type="button"
            onClick={toggle}
            aria-label={isOpen ? 'Hide details' : 'Show details'}
            className="p-1 -mr-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>
      {expandable && isOpen && (
        <div className="px-3.5 pb-3.5 sm:pl-[60px] text-xs text-slate-600 leading-relaxed space-y-2.5 animate-in fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
};

/** Small secondary button used inside opened rows. */
export const rowButtonClass =
  'px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-lg border border-slate-200 text-xs transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50';
/** Primary action on a white background: navy with white text. */
export const rowPrimaryClass =
  'px-3 py-1.5 bg-[#182A42] hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60';
