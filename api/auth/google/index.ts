import { extractBearerToken, verifyGoogleAccessToken } from '../../../server/googleAuthVerify.js';
import { findOrCreateUserByEmail } from '../../../server/telegramStore.js';
import { signOAuthState } from '../../../server/notifyActionToken.js';
import { hasBackgroundSyncLinked, unlinkBackgroundSync } from '../../../server/googleOAuthTokenStore.js';

// Consolidated Vercel function for /api/auth/google/authorize (GET) and
// /api/auth/google/status (GET/DELETE) - vercel.json rewrites both old
// paths here with an ?action= query param, so the frontend and
// server.ts's own Express routes need no changes. api/auth/google/callback.ts
// stays its own separate file/function - its path is the OAuth redirect
// URI registered by hand in Google Cloud Console, so it can't be merged
// away without also updating that external config. Vercel's Hobby plan
// caps a deployment at 12 serverless functions; merging same-domain
// endpoints like this is how this project stays under that cap as routes
// are added over time (see api/telegram/[...path].ts for the same
// pattern applied earlier). Logic below is ported verbatim from the two
// files this replaces.
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

async function handleAuthorize(req: any, res: any) {
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

async function handleStatus(req: any, res: any) {
  const verified = await verifyGoogleAccessToken(extractBearerToken(req));
  if (!verified) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const userId = await findOrCreateUserByEmail(verified.email);

  if (req.method === 'GET') {
    const linked = await hasBackgroundSyncLinked(userId);
    return res.status(200).json({ ok: true, linked });
  }

  if (req.method === 'DELETE') {
    await unlinkBackgroundSync(userId);
    return res.status(200).json({ ok: true, linked: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default async function handler(req: any, res: any) {
  const action = (req.query?.action as string) || 'status';

  if (action === 'authorize') {
    return handleAuthorize(req, res);
  }
  if (action === 'status') {
    return handleStatus(req, res);
  }

  return res.status(404).json({ ok: false, error: 'Unknown action' });
}
