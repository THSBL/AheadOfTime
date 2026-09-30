import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Check,
  RefreshCw,
  LogOut,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Zap,
  X
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
import { SettingsRow, SettingsPill, rowButtonClass, rowPrimaryClass } from './SettingsRow';
import { trackEvent } from '../services/analytics';
import { setCurrentUser as setGlobalCurrentUser, AuthUser, logoutAndClearAccountSession } from '../services/accountManager';
import { endAppSession } from '../services/appSession';

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

  // Auto Sync & Notify: server-side background sync, distinct from the
  // implicit-flow token above (that one lives in sessionStorage and can
  // never survive to be used by a cron - see server/googleOAuthTokenStore.ts's
  // own doc comment for why this needs its own separate OAuth grant).
  const [isBackgroundSyncLinked, setIsBackgroundSyncLinked] = useState<boolean | null>(null);
  // Only true once the server confirms this deployment has the secrets
  // background sync needs. Until then (or if it isn't set up) the card is
  // hidden, rather than offering a button that ends in a raw config error.
  const [isBackgroundSyncConfigured, setIsBackgroundSyncConfigured] = useState<boolean>(false);
  const [isLinkingBackgroundSync, setIsLinkingBackgroundSync] = useState<boolean>(false);
  const [backgroundSyncNotice, setBackgroundSyncNotice] = useState<string | null>(null);
  // False when Background Sync was linked without ticking Google Tasks.
  const [tasksGranted, setTasksGranted] = useState<boolean | null>(null);

  const isConnected = Boolean(accessToken && !isTokenExpired());

  useEffect(() => {
    if (!isConnected) return;
    const checkBackgroundSyncStatus = async () => {
      try {
        const res = await fetch('/api/auth/google/status', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (data.ok) {
          setIsBackgroundSyncLinked(data.linked);
          setIsBackgroundSyncConfigured(data.configured === true);
          setTasksGranted(typeof data.tasksGranted === 'boolean' ? data.tasksGranted : null);
        }
      } catch (err) {
        console.warn('Background sync status check notice:', err);
      }
    };
    checkBackgroundSyncStatus();
  }, [isConnected, accessToken]);

  // Arriving from Telegram's "Add plans automatically" button
  // (?setup=background_sync): bring this card into view and say what the
  // one remaining step is.
  const cardRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') !== 'background_sync') return;
    setBackgroundSyncNotice(
      isConnected
        ? 'Turn on Background Sync: plans you confirm with "Looks Good" in Telegram are then added to your Google Calendar automatically.'
        : 'Connect Google Calendar first, then turn on Background Sync: plans you confirm with "Looks Good" in Telegram are then added to your calendar automatically.'
    );
    setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    params.delete('setup');
    const newSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflects the redirect back from /api/auth/google/callback after the
  // consent screen round trip.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('background_sync');
    if (!result) return;

    const messages: Record<string, string> = {
      connected: 'Background Sync is on. Choose when and where you get your update under Settings → Updates.',
      partial: 'Background sync is connected, but Google Tasks wasn\'t ticked on Google\'s screen, so prep tasks can\'t be added. Disconnect and connect again, and tick every box.',
      declined: 'Background sync setup was cancelled.',
      no_refresh_token: 'Google didn\'t grant a fresh background-sync permission - try disconnecting and reconnecting from your Google Account\'s own connected-apps settings, then try again.',
      wrong_account: 'You picked a different Google account than the one you\'re signed in with. Connect background sync with the same account, or sign in with the other account first.',
      error: 'Something went wrong connecting background sync - please try again.',
    };
    setBackgroundSyncNotice(messages[result] || null);
    if (result === 'connected' || result === 'partial') setIsBackgroundSyncLinked(true);
    if (result === 'partial') setTasksGranted(false);

    // Clean the query param off the URL so a refresh doesn't re-show the notice.
    params.delete('background_sync');
    const newSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  }, []);

  const handleConnectBackgroundSync = async () => {
    if (!accessToken) return;
    setIsLinkingBackgroundSync(true);
    try {
      const res = await fetch('/api/auth/google/authorize', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.ok && data.authorizeUrl) {
        window.location.href = data.authorizeUrl;
      } else {
        setBackgroundSyncNotice(data.error || 'Could not start background sync setup.');
        setIsLinkingBackgroundSync(false);
      }
    } catch (err: any) {
      setBackgroundSyncNotice(err?.message || 'Could not start background sync setup.');
      setIsLinkingBackgroundSync(false);
    }
  };

  const handleDisconnectBackgroundSync = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/auth/google/status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // Still connected on the server: say so instead of pretending.
        setBackgroundSyncNotice("Couldn't disconnect background sync just now - please try again.");
        return;
      }
      setIsBackgroundSyncLinked(false);
      setBackgroundSyncNotice(
        data.googleRevoked === false
          ? 'Background sync disconnected here. Google didn\'t confirm removing access, so to be sure remove "Ahead Of Time" at myaccount.google.com/permissions.'
          : 'Background sync disconnected.'
      );
    } catch (err) {
      console.warn('Failed to disconnect background sync:', err);
      setBackgroundSyncNotice("Couldn't disconnect background sync just now - please try again.");
    }
  };

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

      // This card only ever updated its OWN local state and the shared
      // token - it never told the rest of the app whose account this now
      // is, so App.tsx's currentUser/events stayed on whatever was
      // previously cached (a real cross-account privacy bug: connecting a
      // brand-new Google account here still showed the PREVIOUS account's
      // calendar everywhere else, since nothing ever reloaded events for
      // the newly-authenticated identity). setGlobalCurrentUser dispatches
      // aot_account_switched, which App.tsx listens for to reload events
      // strictly scoped to this profile's own email.
      if (profile?.id) {
        const userEmail = profile.id.toLowerCase().trim();
        const user: AuthUser = {
          id: userEmail,
          email: userEmail,
          name: profile.summary || profile.id,
          timeZone: profile.timeZone,
          provider: 'google',
          connectedAt: new Date().toISOString(),
        };
        setGlobalCurrentUser(user);
      }

      setSuccessMessage('Successfully connected your Google Calendar and Tasks.');
      setTimeout(() => setSuccessMessage(null), 4000);
      trackEvent('calendar_connect', { provider: 'google', success: true });
    } catch (err: any) {
      console.error('Google authorization error:', err);
      setError(err?.message || 'Google Calendar connection was cancelled or failed.');
      trackEvent('calendar_connect', { provider: 'google', success: false });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearGoogleSession();
    setAccessToken(null);
    setCalendarProfile(null);
    // Same gap as connect, in reverse: clears this card's own display but
    // previously left the app-wide identity (and its cached events)
    // sitting there as if still connected. This app has no non-Google
    // identity to fall back to, so disconnecting Google IS signing out -
    // the same full sign-out as the header's (account caches on this
    // browser and the server session too).
    logoutAndClearAccountSession();
    void endAppSession();
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

  const calendarIcon = <Calendar className="w-[18px] h-[18px]" />;
  const dismissableNotice = (text: string, onDismiss: () => void, tone: 'info' | 'error' | 'success' = 'info') => (
    <div
      className={`p-2.5 rounded-xl text-xs flex items-start gap-2 ${
        tone === 'error'
          ? 'bg-rose-50 border border-rose-200 text-rose-800'
          : tone === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border border-slate-200 text-slate-700'
      }`}
    >
      {tone === 'error' ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : tone === 'success' ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : null}
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onDismiss} className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <>
      {/* Google Calendar */}
      <SettingsRow
        icon={calendarIcon}
        title="Google Calendar"
        subtitle={isConnected ? calendarProfile?.id || calendarProfile?.summary || 'Connected' : 'Scan your agenda and sync plans'}
        open={Boolean(error || successMessage)}
        right={
          isConnected ? (
            <SettingsPill on>Connected</SettingsPill>
          ) : (
            <button type="button" onClick={handleConnect} disabled={isConnecting} className={rowPrimaryClass}>
              {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{isConnecting ? 'Connecting…' : 'Connect'}</span>
            </button>
          )
        }
      >
        {isConnected ? (
          <>
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#447463] shrink-0" />
              <span>
                Calendar &amp; Tasks access{calendarProfile?.timeZone ? ` · ${calendarProfile.timeZone}` : ''}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleResync} disabled={isResyncing} className={rowButtonClass}>
                <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                <span>{isResyncing ? 'Checking…' : 'Re-sync'}</span>
              </button>
              <button type="button" onClick={handleDisconnect} className={rowButtonClass}>
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </>
        ) : (
          <p>Finds upcoming trips and events in your Google Calendar and adds your prep tasks to Google Tasks.</p>
        )}
        {successMessage && dismissableNotice(successMessage, () => setSuccessMessage(null), 'success')}
        {error && dismissableNotice(error, () => setError(null), 'error')}
      </SettingsRow>

      {/* Background Sync: a separate, long-lived Google grant (offline access) */}
      {(isBackgroundSyncConfigured || !isConnected) && (
        <div ref={cardRef} className="scroll-mt-24">
          <SettingsRow
            icon={<Zap className="w-[18px] h-[18px]" />}
            title="Background Sync"
            subtitle={
              !isConnected
                ? 'Connect Google Calendar first'
                : isBackgroundSyncLinked
                  ? 'Adds confirmed plans automatically'
                  : 'Add plans even when the app is closed'
            }
            open={Boolean(backgroundSyncNotice) || (isBackgroundSyncLinked === true && tasksGranted === false)}
            right={<SettingsPill on={Boolean(isConnected && isBackgroundSyncLinked)}>{isConnected && isBackgroundSyncLinked ? 'On' : 'Off'}</SettingsPill>}
          >
            <p>
              Plans you confirm in Telegram ("Looks Good") go straight into your Google Calendar and Tasks, and your agenda is checked for new
              events every day, even when the app is closed.
            </p>
            {isConnected && isBackgroundSyncConfigured && (
              <div className="flex flex-wrap gap-2">
                {isBackgroundSyncLinked ? (
                  <button type="button" onClick={handleDisconnectBackgroundSync} className={rowButtonClass}>
                    Turn off
                  </button>
                ) : (
                  <button type="button" onClick={handleConnectBackgroundSync} disabled={isLinkingBackgroundSync} className={rowPrimaryClass}>
                    {isLinkingBackgroundSync ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    <span>{isLinkingBackgroundSync ? 'Opening Google…' : 'Turn on'}</span>
                  </button>
                )}
              </div>
            )}
            {isBackgroundSyncLinked && tasksGranted === false && !backgroundSyncNotice && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                Prep tasks can't be added to Google Tasks: that permission wasn't ticked when Background Sync was turned on. Turn it off and on
                again, and tick every box on Google's screen.
              </div>
            )}
            {backgroundSyncNotice && dismissableNotice(backgroundSyncNotice, () => setBackgroundSyncNotice(null))}
          </SettingsRow>
        </div>
      )}
    </>
  );
};
