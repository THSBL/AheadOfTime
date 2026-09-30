/**
 * The app's own public address, for links in emails, Telegram messages,
 * calendar feeds and redirects. Never taken blindly from the request: the
 * Host / X-Forwarded-Host headers can be set by whoever sends it, which
 * would let a crafted request produce links or redirects to someone else's
 * site. APP_URL decides when set; otherwise only our own domains, this
 * Vercel deployment and local development are accepted.
 */

export const DEFAULT_APP_ORIGIN = 'https://aheadoftime.app';

const OWN_HOSTS = new Set(['aheadoftime.app', 'www.aheadoftime.app']);

function allowedHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/:\d+$/, '');
  if (OWN_HOSTS.has(bare)) return true;
  if (bare === 'localhost' || bare === '127.0.0.1') return true;
  // This deployment's own Vercel addresses (previews), as Vercel reports them.
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter(Boolean)
    .map((h) => String(h).toLowerCase());
  return vercel.includes(bare);
}

export function appOrigin(req?: any): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const raw = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  if (raw && allowedHost(raw)) {
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(raw);
    return `${local ? 'http' : 'https'}://${raw}`;
  }
  return DEFAULT_APP_ORIGIN;
}
