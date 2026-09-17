import { extractBearerToken, verifyGoogleAccessToken } from '../../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../../server/telegramStore.js';
import { signOAuthState } from '../../../server/notifyActionToken.js';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

// Kept in sync by hand with src/services/googleAuth.ts's CALENDAR_SCOPES -
// not imported directly since that file is browser-only (references the
// global `google` object). Background sync needs the same read/write
// access to Calendar events and Tasks the in-app "Push to Cal" flow
// already asks for, nothing more.
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

function getRedirectUri(req: any): string {
  const configured = process.env.APP_URL?.trim();
  const origin = configured || `https://${req.headers?.host}`;
  return `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
}

/**
 * Step 1 of the authorization-code flow used ONLY for background sync
 * (distinct from the implicit token-client flow used everywhere else in
 * the app, which can never issue a refresh token). Returns the consent
 * URL to redirect the browser to, rather than redirecting itself, so the
 * client can call this as a fetch first (proving identity via the
 * existing Google access token) and then do the actual full-page
 * navigation - a plain GET redirect here would have no way to check
 * Authorization headers first.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ ok: false, error: 'Google client id is not configured.' });
  }

  const signed = signOAuthState(verified.email);
  if (!signed) {
    return res.status(500).json({ ok: false, error: 'NOTIFY_LINK_SECRET is not configured.' });
  }

  // Ensure the user row exists now rather than deferring to the callback -
  // the callback has no verified bearer token of its own to fall back on
  // if this lookup somehow failed there instead.
  await findOrCreateUserByEmail(verified.email);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    access_type: 'offline', // the whole point: only this flag can produce a refresh_token
    prompt: 'consent', // force the consent screen every time so a refresh_token is issued even on a repeat grant
    scope: CALENDAR_SCOPES,
    state: signed.state,
  });

  return res.status(200).json({ ok: true, authorizeUrl: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}` });
}
