import { findOrCreateUserByEmail } from '../../../server/telegramStore.js';
import { verifyOAuthState } from '../../../server/notifyActionToken.js';
import { exchangeAuthorizationCode, storeRefreshToken, grantIncludesTasks } from '../../../server/googleOAuthTokenStore.js';

function getRedirectUri(req: any): string {
  const configured = process.env.APP_URL?.trim();
  const origin = configured || `https://${req.headers?.host}`;
  return `${origin.replace(/\/$/, '')}/api/auth/google/callback`;
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
export default async function handler(req: any, res: any) {
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
    // Linked either way (Calendar works), but say so when Tasks wasn't ticked.
    const result = grantIncludesTasks(exchanged.scope) ? 'connected' : 'partial';
    return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=${result}`);
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return res.redirect(302, `${appOrigin}/settings/credentials?background_sync=error`);
  }
}
