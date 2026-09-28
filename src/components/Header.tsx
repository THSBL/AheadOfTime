import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Plus,
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
import { AGENDA_SCANNED_EVENT, readAgendaScan, type AgendaScanRecord } from '../services/agendaScanRecord';

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
  events = [],
  agendaHorizonMonths = 6,
  onAgendaHorizonChange,
  currentUser = null,
  onSwitchAccount,
  onSignOut,
  onSignIn,
}) => {
  const navigate = useNavigate();
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

  // The last real agenda scan (see agendaScanRecord.ts), kept current when
  // a scan finishes while the header is on screen.
  const [agendaScan, setAgendaScan] = useState<AgendaScanRecord | null>(readAgendaScan);
  useEffect(() => {
    const onScanned = () => setAgendaScan(readAgendaScan());
    window.addEventListener(AGENDA_SCANNED_EVENT, onScanned);
    return () => window.removeEventListener(AGENDA_SCANNED_EVENT, onScanned);
  }, []);
  const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const formatShortDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <header className="milky-glass border-b border-white/80 sticky top-0 z-30 shadow-xs text-slate-900" id="main-header">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Logo & Navigation */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <div
              className="cursor-pointer flex items-center"
              onClick={() => navigate('/summary')}
              title="Your road ahead overview"
            >
              <Logo variant="small" nameOnMobile />
            </div>
          </div>

          {/* Right Controls: Centered on mobile / right-aligned on desktop */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            
            {/* Combined Date & Agenda Status Capsule */}
            <div 
              ref={triggerRef}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className="relative hidden sm:block"
            >
              <div className="bg-white/90 hover:bg-white backdrop-blur-md border border-white/95 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2 text-xs text-slate-700 shadow-xs transition-all">
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
                        {agendaScan ? (
                          <>
                            <span className="hidden lg:inline">Agenda synced until </span>
                            <span className="lg:hidden">Agenda synced · </span>
                            <span className="text-sky-950 font-bold">{monthYear(agendaScan.until)}</span>
                          </>
                        ) : (
                          <span>Scan your agenda</span>
                        )}
                      </span>

                      <ChevronDown className={`w-3.5 h-3.5 text-sky-700 transition-transform duration-150 shrink-0 ${isHorizonOpen ? 'rotate-180' : ''}`} />
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
                            : 'Syncs Google Tasks every ~15 min while the app is open (click to sync now)'
                        }
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWithGoogle ? 'animate-spin text-sky-800' : ''}`} />
                      </button>
                    )}
                </div>
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
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-slate-900 block leading-tight">Your agenda</span>
                      <span className="text-[11px] text-slate-500">
                        {isGoogleConnected ? 'Google Calendar connected' : 'Google Calendar not connected on this device'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsHorizonOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Close"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Only facts: when the agenda was really scanned and how far,
                      and when tasks last synced with Google Tasks. */}
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-3 text-slate-600">
                      <span>Last scan</span>
                      <strong className="text-slate-900 font-bold text-right">
                        {agendaScan ? `${formatShortDateTime(agendaScan.at)} · until ${monthYear(agendaScan.until)}` : 'Not scanned yet'}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-slate-600">
                      <span>Tasks synced with Google</span>
                      <span className="text-slate-800 font-medium text-right">
                        {lastSyncTime ? formatShortDateTime(lastSyncTime.toISOString()) : isGoogleConnected ? 'Not yet' : '-'}
                      </span>
                    </div>
                  </div>

                  {onOpenScanAgenda && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsHorizonOpen(false);
                        onOpenScanAgenda();
                      }}
                      className="w-full py-2.5 px-3 bg-[#182A42] hover:bg-slate-800 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Scan agenda</span>
                    </button>
                  )}

                  {/* How far ahead a scan looks: 3, 6 or 12 months */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-700">Scan how far ahead</p>
                    <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5" role="radiogroup" aria-label="Scan how far ahead">
                      {[3, 6, 12].map((months) => {
                        const isSelected = agendaHorizonMonths === months;
                        return (
                          <button
                            key={months}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => onAgendaHorizonChange?.(months)}
                            className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                              isSelected ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            <span className="block text-xs font-bold">{months} months</span>
                            <span className="block text-[10px] text-slate-400">until {getFurthestMonth(months).split(' ')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 leading-snug space-y-1 border-t border-slate-100 pt-2.5">
                    <p>
                      <b className="text-slate-800">New events</b> come in when you scan, or automatically with Background Sync: new
                      events in your calendar are found and sent with your update, on the schedule you pick in Settings → Updates.
                    </p>
                    {isGoogleConnected && (
                      <p>
                        <b className="text-slate-800">Ticked-off tasks</b> sync with Google Tasks about every 15 minutes while the app is open.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {isGoogleConnected && onTriggerGoogleSync ? (
                      <button
                        type="button"
                        onClick={() => {
                          onTriggerGoogleSync();
                          setIsHorizonOpen(false);
                        }}
                        disabled={isSyncingWithGoogle}
                        className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200/70 border border-[#182A42] text-[#182A42] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWithGoogle ? 'animate-spin' : ''}`} />
                        <span>{isSyncingWithGoogle ? 'Syncing…' : 'Sync tasks now'}</span>
                      </button>
                    ) : (
                      <span />
                    )}
                    {onOpenGoogleCalendarSync && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsHorizonOpen(false);
                          onOpenGoogleCalendarSync();
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-[#182A42] underline underline-offset-2 cursor-pointer"
                      >
                        Settings
                      </button>
                    )}
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
                className="hidden md:flex bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] border border-aot-sage-hover/50 text-xs font-bold px-3 py-1 sm:py-1.5 rounded-full items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                title="Scan for existing events in your agenda"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#182A42] shrink-0" />
                <span>Scan agenda</span>
              </button>
            )}

            {/* New Event Button */}
            <button
              onClick={onOpenNewEventModal}
              id="btn-manual-event"
              className="hidden sm:flex bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-full items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0"
              title="Create new event using presets or assistant"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">New Event</span>
            </button>

            {/* Feedback - always visible regardless of Google sign-in
                status, since the feedback form itself works signed out
                (only the CSAT rating flow needs a Google session, and it
                degrades to the general report form on its own). Living
                only inside the account dropdown below would make it
                unreachable for anyone who hasn't connected Google
                Calendar. */}
            <button
              type="button"
              onClick={() => navigate('/feedback')}
              id="btn-header-feedback"
              className="hidden sm:flex bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-300 text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
              title="Share feedback or report an issue"
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              <span>Feedback</span>
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

              {/* Mobile backdrop, same convention as the horizon popover
                  above - tapping outside the panel closes it reliably. */}
              {isAccountDropdownOpen && currentUser && (
                <div
                  className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 sm:hidden"
                  onClick={() => setIsAccountDropdownOpen(false)}
                />
              )}

              {/* Account Dropdown - fixed with side insets on mobile (like
                  the horizon popover above) instead of `absolute right-0`,
                  which live-reported overflowed off the right edge of a
                  narrow phone screen since a 288px-wide panel anchored to
                  this button's right edge has nowhere to go but off-screen
                  when the button itself sits near the viewport's edge. */}
              {isAccountDropdownOpen && currentUser && (
                <div className="fixed left-3 right-3 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 text-slate-800 space-y-3 animate-in fade-in zoom-in-95 duration-100">
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

                  {/* On phones the agenda pill is hidden; its facts live here. */}
                  <div className="sm:hidden rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                    <dl className="text-xs space-y-1">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Last scan</dt>
                        <dd className="font-bold text-slate-900">{agendaScan ? formatShortDateTime(agendaScan.at) : 'Not scanned yet'}</dd>
                      </div>
                      {agendaScan && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500">Synced until</dt>
                          <dd className="font-bold text-slate-900">{monthYear(agendaScan.until)}</dd>
                        </div>
                      )}
                    </dl>
                    {onOpenScanAgenda && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountDropdownOpen(false);
                          onOpenScanAgenda();
                        }}
                        className="w-full py-2 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>Scan agenda</span>
                      </button>
                    )}
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

                    {/* The header's Feedback button is hidden on phones; it lives here there. */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountDropdownOpen(false);
                        navigate('/feedback');
                      }}
                      className="sm:hidden w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-600" />
                      <span>Feedback</span>
                    </button>

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
