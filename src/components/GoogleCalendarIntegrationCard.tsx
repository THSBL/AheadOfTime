import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Check, 
  RefreshCw, 
  LogOut, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { 
  getStoredAccessToken, 
  isTokenExpired, 
  setStoredAccessToken, 
  clearGoogleSession, 
  requestGoogleCalendarToken,
  DEFAULT_CLIENT_ID
} from '../services/googleAuth';
import { 
  fetchPrimaryCalendarProfile, 
  GoogleCalendarProfile 
} from '../services/googleCalendar';
import { CalendarEvent } from '../types';

interface GoogleCalendarIntegrationCardProps {
  events?: CalendarEvent[];
  onSyncComplete?: (events: CalendarEvent[]) => void;
}

export const GoogleCalendarIntegrationCard: React.FC<GoogleCalendarIntegrationCardProps> = ({
  events = [],
  onSyncComplete
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(getStoredAccessToken());
  const [calendarProfile, setCalendarProfile] = useState<GoogleCalendarProfile | null>(() => {
    try {
      const saved = sessionStorage.getItem('gcal_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isResyncing, setIsResyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isConnected = Boolean(accessToken && !isTokenExpired());

  // Load calendar profile on mount if token exists but profile missing
  useEffect(() => {
    const checkProfile = async () => {
      if (accessToken && !isTokenExpired() && !calendarProfile) {
        try {
          const profile = await fetchPrimaryCalendarProfile(accessToken);
          setCalendarProfile(profile);
          sessionStorage.setItem('gcal_profile', JSON.stringify(profile));
        } catch (err: any) {
          console.warn('Failed to fetch profile on mount:', err);
        }
      }
    };
    checkProfile();
  }, [accessToken, calendarProfile]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const tokenRes = await requestGoogleCalendarToken(DEFAULT_CLIENT_ID);
      setStoredAccessToken(tokenRes.accessToken, tokenRes.expiresIn);
      setAccessToken(tokenRes.accessToken);

      const profile = await fetchPrimaryCalendarProfile(tokenRes.accessToken);
      setCalendarProfile(profile);
      sessionStorage.setItem('gcal_profile', JSON.stringify(profile));

      setSuccessMessage('Successfully connected your Google Calendar and Tasks.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Google authorization error:', err);
      setError(err?.message || 'Google Calendar connection was cancelled or failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearGoogleSession();
    setAccessToken(null);
    setCalendarProfile(null);
    setSuccessMessage('Google account disconnected.');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleResync = async () => {
    if (!accessToken || isTokenExpired()) {
      await handleConnect();
      return;
    }

    setIsResyncing(true);
    setError(null);
    try {
      const profile = await fetchPrimaryCalendarProfile(accessToken);
      setCalendarProfile(profile);
      sessionStorage.setItem('gcal_profile', JSON.stringify(profile));

      setSuccessMessage('Calendar synchronization verified and active.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError('Session expired. Please reconnect your account.');
      handleDisconnect();
    } finally {
      setIsResyncing(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-all duration-200 space-y-5">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-2xs">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" fill="#4285F4" fillOpacity="0.12" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 2V6" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 2V6" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 10H21" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="15" r="1.25" fill="#2563EB" />
              <circle cx="12" cy="15" r="1.25" fill="#2563EB" />
              <circle cx="16" cy="15" r="1.25" fill="#2563EB" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              Google Calendar & Tasks
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Scans upcoming events and syncs your lead-up milestones.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="self-start sm:self-center shrink-0">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Not Connected
            </span>
          )}
        </div>
      </div>

      {/* Body State */}
      {isConnected ? (
        /* STATE B: Connected */
        <div className="space-y-4 pt-1">
          {/* Account Detail Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {calendarProfile?.id || calendarProfile?.summary || 'Connected Google Account'}
                </span>
                {calendarProfile?.timeZone && (
                  <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    {calendarProfile.timeZone}
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Read/Write access authorized for Calendar & Google Tasks
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResync}
                disabled={isResyncing}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-200 text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin text-sky-600' : ''}`} />
                <span>{isResyncing ? 'Verifying...' : 'Re-sync'}</span>
              </button>

              <button
                type="button"
                onClick={handleDisconnect}
                className="px-3 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 font-medium rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* STATE A: Not Connected */
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-600 leading-relaxed">
            Link your Google Calendar to automatically scan upcoming trips, flights, and events, and publish synchronized preparation checklists directly into your Google Tasks.
          </p>

          <div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-2.5 cursor-pointer"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Connecting with Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Connect Google Calendar</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Notifications / Feedback */}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="flex-1">{error}</span>
          <button 
            type="button" 
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
