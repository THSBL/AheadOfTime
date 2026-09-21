/**
 * The Google OAuth client id the server uses for Background Sync.
 *
 * A client id is public (it ships in the browser bundle and the consent-screen
 * URL), so unlike the secrets it can safely have a default. In production the
 * `VITE_GOOGLE_CLIENT_ID` variable was not visible to the serverless
 * functions at runtime (it is a build-time variable for the browser bundle),
 * which silently disabled Background Sync. GOOGLE_OAUTH_CLIENT_ID overrides
 * everything; otherwise VITE_GOOGLE_CLIENT_ID; otherwise the app's own client
 * (the same default src/services/googleCalendar.ts uses in the browser).
 */
export const DEFAULT_GOOGLE_CLIENT_ID = '705347156449-npiab082970nc26q27ln55g4ti4tj8i9.apps.googleusercontent.com';

export function getGoogleClientId(): string {
  return (
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    process.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
    DEFAULT_GOOGLE_CLIENT_ID
  );
}
