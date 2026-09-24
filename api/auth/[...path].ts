import { resolveAuthRoute } from '../../server/authRouting.js';
import { handleAuthorize, handleStatus, handleFindings, handleCallback } from '../../server/googleAuthRoutes.js';

// One function for every sign-in provider and action:
//   /api/auth/google/authorize | status | findings | callback
// (formerly api/auth/google/index.ts + callback.ts - two of the Hobby
// plan's 12 functions). See server/authRouting.ts for why this is a
// catch-all rather than a vercel.json rewrite.
export default async function handler(req: any, res: any) {
  const route = resolveAuthRoute(req.query);
  // Per-user, authenticated state that changes when env/settings change:
  // never let a browser or proxy answer these from a cache (a 304 replay of
  // an old "not configured" body would hide the Background Sync card).
  res.setHeader('Cache-Control', 'no-store');
  if (!route) {
    return res.status(404).json({ ok: false, error: 'Unknown auth route' });
  }
  switch (route.action) {
    case 'authorize':
      return handleAuthorize(req, res);
    case 'status':
      return handleStatus(req, res);
    case 'findings':
      return handleFindings(req, res);
    case 'callback':
      return handleCallback(req, res);
  }
}
