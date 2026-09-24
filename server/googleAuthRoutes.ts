/**
 * Google sign-in / Background Sync routes, served by the single catch-all
 * function api/auth/[...path].ts (moved here unchanged from the former
 * api/auth/google/index.ts and api/auth/google/callback.ts, which were two
 * of the Hobby plan's 12 serverless functions). Public URLs are unchanged:
 * /api/auth/google/{authorize,status,findings,callback} - including the
 * callback, which is the redirect URI registered in Google Cloud Console.
 */
import { extractBearerToken, verifyGoogleAccessToken } from './googleAuthVerify.js';
import { findOrCreateUserByEmail, TelegramSessionStore } from './telegramStore.js';
import { signOAuthState, verifyOAuthState } from './notifyActionToken.js';
import {
  hasBackgroundSyncLinked,
  unlinkBackgroundSync,
  isBackgroundSyncConfigured,
  missingBackgroundSyncConfig,
  getGoogleClientSecret,
  describeSecretShape,
  exchangeAuthorizationCode,
  storeRefreshToken,
  getNotifyPrefs,
  setNotifyPrefs,
} from './googleOAuthTokenStore.js';
import { mergeNotifyPrefs } from './notifyPrefs.js';
import { listPendingFindings, dismissAllFindings } from './agendaFindingsStore.js';
import { isEmailConfigured } from './emailService.js';
import { getGoogleClientId } from './googleClientId.js';
import { sendTestUpdate } from './sendTestUpdate.js';

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

export async function handleAuthorize(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const clientId = getGoogleClientId();
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

export async function handleStatus(req: any, res: any) {
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const userId = await findOrCreateUserByEmail(verified.email);

  if (req.method === 'GET') {
    const missingConfig = missingBackgroundSyncConfig();
    if (missingConfig.length > 0) {
      // Names only, never values: tells the owner (via the function logs)
      // why the Background Sync card is hidden.
      console.warn('Background sync is not configured; missing env vars:', missingConfig.join(', '));
    }
    const secret = getGoogleClientSecret();
    if (secret && !secret.startsWith('GOCSPX-')) {
      // Shape only: Google client secrets start with GOCSPX-. A value that
      // does not is the usual reason the consent round trip ends in
      // "invalid_client".
      console.warn('GOOGLE_OAUTH_CLIENT_SECRET does not look like a Google client secret;', describeSecretShape(secret));
    }
    const linked = await hasBackgroundSyncLinked(userId);
    // The daily digest is delivered over Telegram, so the UI needs to know
    // whether this user has paired it (or the toggle would silently do nothing).
    const telegramSession = await TelegramSessionStore.getLinkedSessionForWebUser(verified.email);
    return res.status(200).json({
      ok: true,
      linked,
      configured: isBackgroundSyncConfigured(),
      telegramLinked: Boolean(telegramSession?.chatId),
      emailConfigured: isEmailConfigured(),
      email: verified.email,
      prefs: linked ? (await getNotifyPrefs(userId)).prefs : null,
      prefsSaved: linked ? (await getNotifyPrefs(userId)).saved : false,
    });
  }

  if (req.method === 'POST' && req.body?.sendTest) {
    if (!(await hasBackgroundSyncLinked(userId))) {
      return res.status(409).json({ ok: false, error: 'Turn on Background Sync first.' });
    }
    const result = await sendTestUpdate({ userId, email: verified.email, appUrl: process.env.APP_URL?.trim() || '' });
    return res.status(200).json({ ok: result.ok, ...result });
  }

  if (req.method === 'PUT') {
    if (!(await hasBackgroundSyncLinked(userId))) {
      return res.status(409).json({ ok: false, error: 'Turn on Background Sync first.' });
    }
    const current = await getNotifyPrefs(userId);
    const next = mergeNotifyPrefs(req.body?.prefs, current.prefs);
    if (!next) {
      return res.status(400).json({ ok: false, error: 'Those preferences are not valid.' });
    }
    await setNotifyPrefs(userId, next);
    return res.status(200).json({ ok: true, prefs: next });
  }

  if (req.method === 'DELETE') {
    await unlinkBackgroundSync(userId);
    return res.status(200).json({ ok: true, linked: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * The in-app fallback notice: new calendar events the daily scan found that
 * no Telegram/email message covered. GET lists them, POST dismisses them.
 */
export async function handleFindings(req: any, res: any) {
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const userId = await findOrCreateUserByEmail(verified.email);

  if (req.method === 'GET') {
    const findings = await listPendingFindings(userId, new Date().toISOString());
    return res.status(200).json({ ok: true, findings });
  }
  if (req.method === 'POST') {
    await dismissAllFindings(userId);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}



function getAppOrigin(req: any): string {
  const configured = process.env.APP_URL?.trim();
  return (configured || `https://${req.headers?.host}`).replace(/\/$/, '');
}

/**
 * Step 2 of the authorization-code flow: Google redirects the browser
 * here with ?code=...&state=.... No Authorization header is available on
 * this request (it's a plain browser navigation from Google, not a fetch
 * from our own client) - the signed state from step 1 is the only proof
 * of which user initiated this.
 */
export async function handleCallback(req: any, res: any) {
  const { code, state, error: oauthError } = req.query || {};
  const appOrigin = getAppOrigin(req);

  if (oauthError) {
    // The user declined consent, or Google returned some other error -
    // send them back to settings with a plain query flag rather than a
    // raw error page.
    return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=declined`);
  }

  const verifiedState = verifyOAuthState(typeof state === 'string' ? state : undefined);
  if (!verifiedState || typeof code !== 'string') {
    return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=error`);
  }

  try {
    const userId = await findOrCreateUserByEmail(verifiedState.email);
    const exchanged = await exchangeAuthorizationCode(code, getRedirectUri(req));

    if (!exchanged) {
      // No refresh_token came back - most likely this user already
      // granted offline access before and Google didn't re-issue one.
      // Treat as a soft failure: tell them to try disconnecting and
      // reconnecting from Google's own account permissions page if they
      // genuinely need a fresh grant, rather than silently pretending
      // this succeeded.
      return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=no_refresh_token`);
    }

    await storeRefreshToken(userId, exchanged.refreshToken, exchanged.scope);
    return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=connected`);
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=error`);
  }
}
