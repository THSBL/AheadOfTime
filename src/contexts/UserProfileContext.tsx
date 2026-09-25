import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { OnboardingProfile } from '../types';
import { getCurrentUser, loadUserOnboardingProfile, saveUserOnboardingProfile } from '../services/accountManager';
import { fetchServerProfile, pushServerProfile } from '../services/profileSync';

interface UserProfileContextValue {
  profile: OnboardingProfile | null;
  saveProfile: (profile: OnboardingProfile) => void;
}

const UserProfileContext = createContext<UserProfileContextValue | undefined>(undefined);

/**
 * Single source of truth for the user's onboarding profile (home location,
 * family structure, calendar scope, etc). Derives the active account from
 * accountManager.getCurrentUser() itself and re-loads the profile whenever
 * the 'aot_account_switched' event fires (dispatched by accountManager's
 * setCurrentUser/logoutAndClearAccountSession) - it does not need to be fed
 * a currentUser prop by its consumers.
 */
export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<OnboardingProfile | null>(() =>
    loadUserOnboardingProfile(getCurrentUser()?.id)
  );

  // The server copy (per account) wins when it exists - the browser copy
  // can be missing (new device) or stale. With no server copy yet, the
  // browser's answers are uploaded, e.g. onboarding done before sign-in.
  const syncWithServer = useCallback(async (userId: string | null | undefined) => {
    if (!userId) return;
    const server = await fetchServerProfile();
    if (!server.ok || getCurrentUser()?.id !== userId) return;
    if (server.profile) {
      saveUserOnboardingProfile(server.profile, userId);
      setProfile(server.profile);
    } else {
      const local = loadUserOnboardingProfile(userId);
      if (local) void pushServerProfile(local);
    }
  }, []);

  useEffect(() => {
    void syncWithServer(getCurrentUser()?.id);
    // Also once the app session is confirmed (the first check may still be
    // running when this mounts).
    const onSession = () => void syncWithServer(getCurrentUser()?.id);
    window.addEventListener('aot_app_session_changed', onSession);
    return () => window.removeEventListener('aot_app_session_changed', onSession);
  }, [syncWithServer]);

  useEffect(() => {
    const handleAccountSwitched = (e: Event) => {
      const detailUser = (e as CustomEvent)?.detail?.user;
      const nextUser = detailUser !== undefined ? detailUser : getCurrentUser();
      setProfile(loadUserOnboardingProfile(nextUser?.id));
      void syncWithServer(nextUser?.id);
    };

    window.addEventListener('aot_account_switched', handleAccountSwitched as EventListener);
    return () => {
      window.removeEventListener('aot_account_switched', handleAccountSwitched as EventListener);
    };
  }, [syncWithServer]);

  const saveProfile = useCallback((nextProfile: OnboardingProfile) => {
    saveUserOnboardingProfile(nextProfile, getCurrentUser()?.id);
    // Best-effort server copy; the browser copy above already took effect.
    void pushServerProfile(nextProfile);
    // Update context state immediately so callers see the change without
    // waiting for the aot_account_switched event to round-trip.
    setProfile(nextProfile);
  }, []);

  return (
    <UserProfileContext.Provider value={{ profile, saveProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return ctx;
}
