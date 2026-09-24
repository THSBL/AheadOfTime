/**
 * Route resolution for the single auth function api/auth/[...path].ts.
 * One catch-all function serves every sign-in provider so adding one (e.g.
 * Microsoft/Outlook) never costs another serverless function - the Hobby
 * plan caps a deployment at 12. A catch-all (not a vercel.json rewrite) on
 * purpose: the OAuth callback's ?code=&state= then reach the function
 * untouched, the same way api/telegram/[...path].ts already receives its
 * own query parameters in production.
 */
export type AuthProvider = 'google';
export type AuthAction = 'authorize' | 'status' | 'findings' | 'callback';

const PROVIDERS = new Set<AuthProvider>(['google']);
const ACTIONS = new Set<AuthAction>(['authorize', 'status', 'findings', 'callback']);

export function resolveAuthRoute(query: Record<string, unknown> | undefined): { provider: AuthProvider; action: AuthAction } | null {
  const raw = query?.['...path'];
  const segments = (Array.isArray(raw) ? raw : [raw]).filter((s): s is string => typeof s === 'string' && s.length > 0);
  const [provider, action = 'status'] = segments;
  if (segments.length > 2 || !PROVIDERS.has(provider as AuthProvider) || !ACTIONS.has(action as AuthAction)) return null;
  return { provider: provider as AuthProvider, action: action as AuthAction };
}
