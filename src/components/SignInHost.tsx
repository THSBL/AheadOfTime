import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SignInModal, OPEN_SIGN_IN_EVENT } from './SignInModal';
import { requestGoogleCalendarToken, getStoredClientId } from '../services/googleAuth';
import { fetchPrimaryCalendarProfile } from '../services/googleCalendar';
import { setCurrentUser as setGlobalCurrentUser, AuthUser } from '../services/accountManager';
import { trackAccountAction } from '../services/analytics';

/**
 * The one sign-in window for every page (summary, Settings, dashboard).
 * It used to live inside the dashboard only, so "Sign in" on Settings or the
 * summary page did nothing - and the only button that worked there was
 * Google's "Connect", a dead end for Outlook and Apple Calendar users.
 * Signing in with Google here announces the new account
 * (aot_account_switched), which the dashboard and Settings already follow.
 */
export const SignInHost: React.FC = () => {
  const location = useLocation();
  const [state, setState] = useState<{ open: boolean; reason?: string }>({ open: false });

  useEffect(() => {
    const onOpen = (e: Event) => setState({ open: true, reason: (e as CustomEvent<{ reason?: string }>).detail?.reason });
    window.addEventListener(OPEN_SIGN_IN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SIGN_IN_EVENT, onOpen);
  }, []);

  // "Get a new link" from an expired sign-in email lands on /?signin=email.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('signin') === 'email') setState({ open: true });
  }, [location.search]);

  const signInWithGoogle = async () => {
    setState({ open: false });
    try {
      const res = await requestGoogleCalendarToken(getStoredClientId());
      if (!res?.accessToken) return;
      const profile = await fetchPrimaryCalendarProfile(res.accessToken);
      if (!profile?.id) return;
      const userEmail = profile.id.toLowerCase().trim();
      sessionStorage.setItem('gcal_profile', JSON.stringify(profile));
      try {
        localStorage.setItem('aot_onboarding_completed', 'true');
      } catch {
        // storage blocked: the session still works for this visit
      }
      const user: AuthUser = {
        id: userEmail,
        email: userEmail,
        name: profile.summary || profile.id,
        timeZone: profile.timeZone,
        provider: 'google',
        connectedAt: new Date().toISOString(),
      };
      setGlobalCurrentUser(user);
      trackAccountAction('login', user.id);
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  return (
    <SignInModal
      isOpen={state.open}
      reason={state.reason}
      onClose={() => setState({ open: false })}
      onGoogle={() => void signInWithGoogle()}
    />
  );
};
