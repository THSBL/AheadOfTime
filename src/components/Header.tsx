import React, { useState, useRef, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Plus, 
  RotateCcw, 
  CheckCircle2, 
  CalendarDays,
  Sparkles,
  Home,
  RefreshCw,
  Sliders,
  ChevronDown,
  Check,
  X,
  MessageSquare,
  User as UserIcon,
  LogOut,
  Shield,
  ExternalLink
} from 'lucide-react';
import { formatDisplayDate } from '../utils/tminusRules';
import { CalendarEvent } from '../types';
import { Logo } from './Logo';
import { AuthUser } from '../services/accountManager';

interface HeaderProps {
  currentReferenceDate: string;
  onReferenceDateChange: (newDate: string) => void;
  onResetData: () => void;
  onOpenNewEventModal: () => void;
  onOpenScanAgenda?: () => void;
  onOpenGoogleCalendarSync?: () => void;
  onOpenOnboarding?: () => void;
  onOpenWhatsAppModal?: () => void;
  isGoogleConnected?: boolean;
  isSyncingWithGoogle?: boolean;
  onTriggerGoogleSync?: () => void;
  lastSyncTime?: Date | null;
  activeEventsCount: number;
  pendingMilestonesCount: number;
  watchpointsCount: number;
  focusMode: 'welcome' | 'new-event' | 'adjust-event';
  onSetFocusMode: (mode: 'welcome' | 'new-event' | 'adjust-event') => void;
  events?: CalendarEvent[];
  agendaHorizonMonths?: number;
  onAgendaHorizonChange?: (months: number) => void;
  currentUser?: AuthUser | null;
  onSwitchAccount?: () => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentReferenceDate,
  onReferenceDateChange,
  onResetData,
  onOpenNewEventModal,
  onOpenScanAgenda,
  onOpenGoogleCalendarSync,
  onOpenOnboarding,
  onOpenWhatsAppModal,
  isGoogleConnected,
  isSyncingWithGoogle,
  onTriggerGoogleSync,
  lastSyncTime,
  activeEventsCount,
  focusMode,
  onSetFocusMode,
  events = [],
  agendaHorizonMonths = 6,
  onAgendaHorizonChange,
  currentUser = null,
  onSwitchAccount,
  onSignOut,
  onSignIn,
}) => {
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateInputVal, setDateInputVal] = useState(currentReferenceDate.substring(0, 10));
  const [isHorizonOpen, setIsHorizonOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsHorizonOpen(false);
      }
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(event.target as Node)
      ) {
        setIsAccountDropdownOpen(false);
      }
    };
    if (isHorizonOpen || isAccountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isHorizonOpen, isAccountDropdownOpen]);

  const handleMouseEnter = () => {
    // Only run on true mouse / hover devices, not touch screens
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) {
      return;
    }
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHorizonOpen(true);
    }, 180);
  };

  const handleMouseLeave = () => {
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) {
      return;
    }
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHorizonOpen(false);
    }, 280);
  };

  const handleDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateInputVal) {
      onReferenceDateChange(`${dateInputVal}T09:00:00.000Z`);
      setIsEditingDate(false);
    }
  };

  const handleResetToToday = () => {
    const today = new Date().toISOString();
    setDateInputVal(today.substring(0, 10));
    onReferenceDateChange(today);
    setIsEditingDate(false);
  };

  // Determine furthest month covered by the agenda horizon (3, 6, 12 months)
  const getFurthestMonth = (months: number = agendaHorizonMonths): string => {
    const ref = new Date(currentReferenceDate);
    if (!isNaN(ref.getTime())) {
      const horizon = new Date(ref);
      horizon.setMonth(horizon.getMonth() + months);
      return horizon.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    return 'December 2026';
  };

  // Compact representation for small screens (e.g. "Nov '26")
  const getCompactFurthestMonth = (months: number = agendaHorizonMonths): string => {
    const ref = new Date(currentReferenceDate);
    if (!isNaN(ref.getTime())) {
      const horizon = new Date(ref);
      horizon.setMonth(horizon.getMonth() + months);
      const monthStr = horizon.toLocaleDateString('en-US', { month: 'short' });
      const yearStr = horizon.toLocaleDateString('en-US', { year: '2-digit' });
      return `${monthStr} '${yearStr}`;
    }
    return "Dec '26";
  };

  // Determine date of last update
  const getLastUpdateText = (): string => {
    if (lastSyncTime) {
      return lastSyncTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const ref = new Date(currentReferenceDate);
    if (!isNaN(ref.getTime())) {
      return ref.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return 'Today';
  };

  return (
    <header className="milky-glass border-b border-white/80 sticky top-0 z-30 shadow-xs text-slate-900" id="main-header">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo & Navigation */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div 
              className="cursor-pointer flex items-center" 
              onClick={() => onSetFocusMode('welcome')} 
              title="Ahead Of Time Home"
            >
              <Logo variant="small" />
            </div>
          </div>

          {/* Right Controls: Centered on mobile / right-aligned on desktop */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            
            {/* Combined Date & Agenda Status Capsule */}
            <div 
              ref={triggerRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className="relative"
            >
              <div className="bg-white/90 hover:bg-white backdrop-blur-md border border-white/95 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2 text-xs text-slate-700 shadow-xs transition-all">
                {isEditingDate ? (
                  <form onSubmit={handleDateSubmit} className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={dateInputVal}
                      onChange={(e) => setDateInputVal(e.target.value)}
                      className="bg-white text-slate-800 text-xs px-2 py-0.5 rounded-lg border border-slate-300 focus:outline-none focus:border-slate-900 font-mono"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="bg-[#182A42] hover:bg-slate-800 text-white px-2 py-0.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingDate(false)}
                      className="text-slate-400 hover:text-slate-700 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {/* Primary Agenda Trigger Pill */}
                    <button
                      type="button"
                      onClick={() => setIsHorizonOpen((prev) => !prev)}
                      className="flex items-center gap-1.5 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer text-left select-none"
                      title="Click or hover to view complete agenda sync and horizon details"
                    >
                      <div className="relative shrink-0">
                        <CalendarDays className="w-4 h-4 text-sky-600" />
                        {isGoogleConnected && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1.5 ring-white" title="Google Account Connected" />
                        )}
                      </div>

                      {/* Agenda label utilizing available space on mobile and desktop */}
                      <span className="font-semibold text-slate-900 text-xs sm:text-sm whitespace-nowrap leading-none flex items-baseline">
                        <span className="hidden lg:inline">Agenda up to date until </span>
                        <span className="lg:hidden">Agenda up to date · </span>
                        <span className="text-sky-950 font-bold">{getFurthestMonth(agendaHorizonMonths)}</span>
                      </span>

                      <ChevronDown className={`w-3.5 h-3.5 text-sky-700 transition-transform duration-150 shrink-0 ${isHorizonOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Change horizon quick badge on desktop */}
                    <button
                      type="button"
                      onClick={() => setIsHorizonOpen((prev) => !prev)}
                      title="Update agenda coverage horizon (3, 6, or 12 months)"
                      className="hidden md:flex text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-950 border border-sky-200/90 shadow-2xs items-center gap-0.5 transition-all cursor-pointer shrink-0"
                    >
                      <span>{agendaHorizonMonths}m</span>
                    </button>

                    {/* Force sync icon button on desktop */}
                    {onTriggerGoogleSync && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTriggerGoogleSync();
                        }}
                        disabled={isSyncingWithGoogle}
                        className="hidden sm:block p-1 hover:bg-sky-50 text-sky-700 rounded-full transition-colors cursor-pointer border-l border-slate-200/80 pl-1.5"
                        title={
                          isSyncingWithGoogle
                            ? 'Checking Google Calendar & Tasks...'
                            : 'Syncs daily automatically (click to force sync)'
                        }
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWithGoogle ? 'animate-spin text-sky-800' : ''}`} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Backdrop Overlay for guaranteed reliable closing on tap */}
              {isHorizonOpen && (
                <div 
                  className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 sm:hidden"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHorizonOpen(false);
                  }}
                />
              )}

              {/* Comprehensive Details Popover (Opens on Click OR Desktop Hover) */}
              {isHorizonOpen && (
                <div 
                  ref={dropdownRef}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[85vh] overflow-y-auto p-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-sky-50 text-sky-600">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-xs sm:text-sm text-slate-900 block leading-tight">Agenda Coverage &amp; Sync</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {isGoogleConnected ? 'Google Calendar Active' : 'Local Planner Mode'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                        {agendaHorizonMonths} Mo. Horizon
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsHorizonOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Close details"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* High level coverage details */}
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Covered until:</span>
                      <strong className="text-slate-900 font-bold">{getFurthestMonth(agendaHorizonMonths)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Last synchronized:</span>
                      <span className="text-slate-800 font-medium">{getLastUpdateText()}</span>
                    </div>
                  </div>

                  {/* Statement: Agenda will sync daily UNLESS you force the sync */}
                  <div className="p-2.5 bg-sky-50/90 border border-sky-200/90 rounded-xl text-xs text-sky-950 flex items-start gap-2">
                    <Clock className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                    <div className="leading-snug text-[11px]">
                      Your agenda <strong className="text-sky-950">syncs daily</strong> automatically, unless you force a sync now.
                    </div>
                  </div>

                  {/* Horizon options: 3 - 6 - 12 Months */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Coverage Horizon</span>
                      <span className="text-sky-700 font-medium text-[11px]">3, 6, or 12 Months</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { months: 3, label: '3 Months', sub: getFurthestMonth(3) },
                        { months: 6, label: '6 Months', sub: getFurthestMonth(6) },
                        { months: 12, label: '12 Months', sub: getFurthestMonth(12) },
                      ].map(({ months, label, sub }) => {
                        const isSelected = agendaHorizonMonths === months;
                        return (
                          <button
                            key={months}
                            type="button"
                            onClick={() => {
                              if (onAgendaHorizonChange) {
                                onAgendaHorizonChange(months);
                              }
                            }}
                            className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                              isSelected
                                ? 'bg-[#182A42] text-white border-slate-900 shadow-sm'
                                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                            }`}
                          >
                            <span className="text-xs font-black">{label}</span>
                            <span className={`text-[10px] truncate max-w-full font-medium ${
                              isSelected ? 'text-slate-300' : 'text-slate-400'
                            }`}>
                              {sub.split(' ')[0]}
                            </span>
                            {isSelected && (
                              <span className="text-[9px] mt-0.5 font-bold text-emerald-400 flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions & Force Sync */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (onTriggerGoogleSync) onTriggerGoogleSync();
                        setIsHorizonOpen(false);
                      }}
                      disabled={isSyncingWithGoogle}
                      className="w-full py-2 px-3 bg-[#182A42] hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWithGoogle ? 'animate-spin' : ''}`} />
                      <span>{isSyncingWithGoogle ? 'Syncing...' : 'Force Sync Now'}</span>
                    </button>

                    {onOpenGoogleCalendarSync && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsHorizonOpen(false);
                          onOpenGoogleCalendarSync();
                        }}
                        className="w-full py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                        <span>Google Sync &amp; Account Settings</span>
                      </button>
                    )}

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsHorizonOpen(false);
                          setIsEditingDate(true);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-700 underline cursor-pointer w-full text-center"
                      >
                        Simulate reference date
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* WhatsApp Reminder Tool */}
            {onOpenWhatsAppModal && (
              <button
                onClick={onOpenWhatsAppModal}
                id="btn-whatsapp-tool"
                className="flex bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1.5 rounded-full items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                title="WhatsApp Reminder & Completion Tool (Meta Cloud API & Webhook Simulator)"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">WhatsApp Tool</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            )}

            {/* Scan for existing events in your agenda (Desktop only) */}
            {onOpenScanAgenda && (
              <button
                onClick={onOpenScanAgenda}
                id="btn-scan-agenda"
                className="hidden md:flex bg-[#447463] hover:bg-[#376052] text-white border border-[#376052]/50 text-xs font-bold px-3 py-1 sm:py-1.5 rounded-full items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                title="Scan for existing events in your agenda"
              >
                <Sparkles className="w-3.5 h-3.5 text-white shrink-0" />
                <span>Scan agenda</span>
              </button>
            )}

            {/* New Event Button */}
            <button
              onClick={onOpenNewEventModal}
              id="btn-manual-event"
              className="bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full flex items-center gap-1 sm:gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0"
              title="Create new event using presets or assistant"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">New Event</span>
            </button>

            {/* Account & Privacy Isolation Capsule */}
            <div ref={accountDropdownRef} className="relative shrink-0">
              {currentUser ? (
                <button
                  type="button"
                  onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                  id="btn-header-account-menu"
                  className="flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/90 text-slate-800 border border-slate-300/80 rounded-full px-2.5 py-1 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  title={`Active Google Account: ${currentUser.email}`}
                >
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] uppercase shadow-xs">
                    {currentUser.name ? currentUser.name[0] : currentUser.email[0]}
                  </div>
                  <span className="hidden lg:inline max-w-[130px] truncate font-medium text-slate-700">
                    {currentUser.email}
                  </span>
                  <span className="lg:hidden font-medium text-slate-700">
                    {currentUser.name ? currentUser.name.split(' ')[0] : 'Account'}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isAccountDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignIn || onOpenGoogleCalendarSync}
                  id="btn-header-connect-google"
                  className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border border-slate-300 rounded-full px-2.5 py-1 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  title="Connect your Google Account"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              )}

              {/* Account Dropdown */}
              {isAccountDropdownOpen && currentUser && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 text-slate-800 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                      {currentUser.name ? currentUser.name[0] : currentUser.email[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {currentUser.name || 'Google User'}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {currentUser.email}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
                        <Shield className="w-3 h-3" />
                        <span>Data Isolated &amp; GDPR Scoped</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {onSwitchAccount && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountDropdownOpen(false);
                          onSwitchAccount();
                        }}
                        id="btn-switch-google-account"
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                        <span>Switch Google Account</span>
                      </button>
                    )}

                    {onOpenGoogleCalendarSync && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountDropdownOpen(false);
                          onOpenGoogleCalendarSync();
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <CalendarDays className="w-3.5 h-3.5 text-slate-600" />
                        <span>Sync &amp; Tasks Settings</span>
                      </button>
                    )}

                    {onSignOut && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountDropdownOpen(false);
                          onSignOut();
                        }}
                        id="btn-signout-account"
                        className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer border-t border-slate-100 mt-1"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Log Out &amp; Clear Active Session</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
