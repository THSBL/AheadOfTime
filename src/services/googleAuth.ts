/**
 * Google Identity Services (GIS) Token Client Service
 * Uses client-side OAuth 2.0 with the user's project Web Client ID.
 */

declare const google: any;

export const DEFAULT_CLIENT_ID = '705347156449-npiab082970nc26q27ln55g4ti4tj8i9.apps.googleusercontent.com';
export const DEFAULT_PROJECT_ID = 'mycalendarsync-507311';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
].join(' ');

export function getStoredClientId(): string {
  if (typeof window === 'undefined') return DEFAULT_CLIENT_ID;
  const stored = localStorage.getItem('gcal_custom_client_id');
  return (stored && stored.trim().length > 0) ? stored.trim() : DEFAULT_CLIENT_ID;
}

export function setStoredClientId(clientId: string): void {
  if (typeof window !== 'undefined') {
    if (clientId && clientId.trim().length > 0) {
      localStorage.setItem('gcal_custom_client_id', clientId.trim());
    } else {
      localStorage.removeItem('gcal_custom_client_id');
    }
  }
}

export function getStoredProjectId(): string {
  if (typeof window === 'undefined') return DEFAULT_PROJECT_ID;
  const stored = localStorage.getItem('gcal_custom_project_id');
  return (stored && stored.trim().length > 0) ? stored.trim() : DEFAULT_PROJECT_ID;
}

export function setStoredProjectId(projectId: string): void {
  if (typeof window !== 'undefined') {
    if (projectId && projectId.trim().length > 0) {
      localStorage.setItem('gcal_custom_project_id', projectId.trim());
    } else {
      localStorage.removeItem('gcal_custom_project_id');
    }
  }
}

export function isTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  const token = sessionStorage.getItem('gcal_access_token');
  if (!token) return true;
  const expiresAtStr = sessionStorage.getItem('gcal_token_expires_at');
  if (!expiresAtStr) return false;
  const expiresAt = Number(expiresAtStr);
  if (isNaN(expiresAt)) return false;
  // If token expires within 30 seconds, treat as expired
  return Date.now() > (expiresAt - 30000);
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (isTokenExpired()) {
    sessionStorage.removeItem('gcal_access_token');
    sessionStorage.removeItem('gcal_token_expires_at');
    return null;
  }
  return sessionStorage.getItem('gcal_access_token');
}

export function setStoredAccessToken(token: string | null, expiresInSeconds?: number): void {
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('gcal_access_token', token);
      const lifetime = Number(expiresInSeconds) || 3500;
      sessionStorage.setItem('gcal_token_expires_at', String(Date.now() + lifetime * 1000));
    } else {
      sessionStorage.removeItem('gcal_access_token');
      sessionStorage.removeItem('gcal_token_expires_at');
    }
  }
}

/**
 * Ensure Google Identity Services script is ready
 */
export async function ensureGisLoaded(): Promise<void> {
  if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
    return;
  }

  return new Promise((resolve, reject) => {
    // Check if script element exists
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      const interval = setInterval(() => {
        if (typeof google !== 'undefined' && google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        if (typeof google !== 'undefined' && google?.accounts?.oauth2) resolve();
        else reject(new Error('Timeout loading Google Identity Services'));
      }, 5000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export interface GoogleAuthResponse {
  accessToken: string;
  expiresIn?: number;
}

/**
 * Request Google Calendar Access Token using GIS
 */
export async function requestGoogleCalendarToken(
  clientId: string,
  loginHint?: string
): Promise<GoogleAuthResponse> {
  await ensureGisLoaded();

  return new Promise((resolve, reject) => {
    try {
      const clientConfig: any = {
        client_id: clientId.trim(),
        scope: CALENDAR_SCOPES,
        prompt: 'select_account',
        callback: (response: any) => {
          if (response.error) {
            console.warn('GIS Auth Error callback:', response);
            reject(new Error(response.error_description || response.error || 'Google authentication failed'));
          } else if (response.access_token) {
            setStoredAccessToken(response.access_token, response.expires_in);
            resolve({
              accessToken: response.access_token,
              expiresIn: response.expires_in,
            });
          } else {
            reject(new Error('No access token received from Google'));
          }
        },
        error_callback: (err: any) => {
          console.warn('GIS Non-OAuth error callback:', err);
          reject(new Error(err?.message || 'Authentication window encountered an error'));
        },
      };

      if (loginHint && loginHint.trim()) {
        clientConfig.hint = loginHint.trim();
      }

      const client = google.accounts.oauth2.initTokenClient(clientConfig);

      // Explicitly request prompt: 'select_account' to allow selecting from all Google accounts
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (e: any) {
      console.error('Failed to initialize GIS Token Client:', e);
      reject(e);
    }
  });
}

export function clearGoogleSession(): void {
  setStoredAccessToken(null);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('gcal_profile');
  }
}

export function isAuthErrorMessage(messageOrError: any): boolean {
  if (!messageOrError) return false;
  const msg = typeof messageOrError === 'string' ? messageOrError : (messageOrError.message || String(messageOrError));
  const lower = msg.toLowerCase();
  return (
    lower.includes('invalid authentication credentials') ||
    lower.includes('invalid credentials') ||
    lower.includes('expected oauth 2 access token') ||
    lower.includes('insufficient authentication scopes') ||
    lower.includes('unauthenticated') ||
    lower.includes('(401)') ||
    lower.includes('status: 401') ||
    lower.includes('token expired') ||
    lower.includes('401')
  );
}
