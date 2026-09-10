import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { OnboardingProfile } from '../types';
import { getCurrentUser, loadUserOnboardingProfile, saveUserOnboardingProfile } from '../services/accountManager';

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

  useEffect(() => {
    const handleAccountSwitched = (e: Event) => {
      const detailUser = (e as CustomEvent)?.detail?.user;
      const nextUser = detailUser !== undefined ? detailUser : getCurrentUser();
      setProfile(loadUserOnboardingProfile(nextUser?.id));
    };

    window.addEventListener('aot_account_switched', handleAccountSwitched as EventListener);
    return () => {
      window.removeEventListener('aot_account_switched', handleAccountSwitched as EventListener);
    };
  }, []);

  const saveProfile = useCallback((nextProfile: OnboardingProfile) => {
    saveUserOnboardingProfile(nextProfile, getCurrentUser()?.id);
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
