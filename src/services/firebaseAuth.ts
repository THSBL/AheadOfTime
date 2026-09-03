import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events'
];

let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Initialize auth state listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Perform Firebase Google Sign-In with Calendar Scopes and Account Selector
 */
export const googleSignInWithCalendar = async (
  loginHint?: string
): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    
    // Add Calendar Scopes
    CALENDAR_SCOPES.forEach((scope) => provider.addScope(scope));

    // Force Google Account Chooser & pre-fill test email if provided
    const customParams: Record<string, string> = {
      prompt: 'select_account',
    };
    if (loginHint && loginHint.trim()) {
      customParams.login_hint = loginHint.trim();
    }
    provider.setCustomParameters(customParams);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google sign-in. Please ensure permissions are granted.');
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('gcal_access_token', credential.accessToken);
    }

    return {
      user: result.user,
      accessToken: credential.accessToken,
    };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      console.warn('Google Sign-In popup was closed before completion.');
    } else {
      console.warn('Google Sign-In Notice:', error?.message || error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getCachedAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    return sessionStorage.getItem('gcal_access_token');
  }
  return null;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('gcal_access_token', token);
    } else {
      sessionStorage.removeItem('gcal_access_token');
    }
  }
};

export const logoutGoogle = async () => {
  await signOut(auth);
  setCachedAccessToken(null);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('gcal_profile');
  }
};
