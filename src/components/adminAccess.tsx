import React from 'react';
import { openSignIn } from './SignInModal';

/**
 * Why an admin page (/admin/blog, /admin/lessons) can't load, in words that
 * say what to do: not signed in on this browser, signed in with an address
 * that isn't in ADMIN_EMAILS, or the server not answering.
 */
export function adminErrorFrom(status: number, body: any): string {
  if (status === 401) return 'signed_out';
  if (status === 403) return `not_admin:${typeof body?.email === 'string' ? body.email : ''}`;
  return typeof body?.error === 'string' && body.error ? body.error : 'The page could not load. Try again in a minute.';
}

export const AdminAccessProblem: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => {
  const box = 'rounded-2xl border p-4 space-y-2 text-sm';
  if (error === 'signed_out') {
    return (
      <div className={`${box} bg-amber-50 border-amber-300 text-amber-900`}>
        <p className="font-bold">You're not signed in on this browser</p>
        <p>Or your sign-in has expired. Sign in with your admin account, then this page loads.</p>
        <button type="button" onClick={() => openSignIn('Sign in with your admin account.')} className="px-3 py-2 rounded-xl bg-[#182A42] text-white text-xs font-bold cursor-pointer">
          Sign in
        </button>
      </div>
    );
  }
  if (error.startsWith('not_admin:')) {
    const email = error.slice('not_admin:'.length);
    return (
      <div className={`${box} bg-amber-50 border-amber-300 text-amber-900`}>
        <p className="font-bold">{email ? `${email} isn't an admin account` : "This account isn't an admin account"}</p>
        <p>
          Either sign in with the address you use as admin, or add this address to <b>ADMIN_EMAILS</b> in Vercel (Project → Settings →
          Environment Variables; several addresses go comma-separated), then redeploy.
        </p>
      </div>
    );
  }
  return (
    <div className={`${box} bg-rose-50 border-rose-200 text-rose-800`}>
      <p>{error}</p>
      <button type="button" onClick={onRetry} className="px-3 py-2 rounded-xl border border-rose-300 text-xs font-bold cursor-pointer">
        Try again
      </button>
    </div>
  );
};
