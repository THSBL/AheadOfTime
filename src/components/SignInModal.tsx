import React, { useEffect, useState } from 'react';
import { Loader2, Mail, X, Check } from 'lucide-react';

export const OPEN_SIGN_IN_EVENT = 'aot_open_sign_in';

/** Opens the sign-in window from anywhere (Settings, onboarding, a feature that needs an account). */
export function openSignIn(reason?: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT, { detail: { reason } }));
}

interface SignInModalProps {
  isOpen: boolean;
  reason?: string;
  onClose: () => void;
  onGoogle: () => void;
}

/**
 * Sign in: with Google (which also connects Google Calendar), or with a
 * one-time link by email for people who use Apple Calendar or Outlook.
 */
export const SignInModal: React.FC<SignInModalProps> = ({ isOpen, reason, onClose, onGoogle }) => {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSentTo(null);
    setError(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/email-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'That did not work. Try again.');
      setSentTo(email.trim());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-slate-800 animate-in fade-in zoom-in-95 duration-150"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
        <h2 id="sign-in-title" className="text-lg font-black text-[#182A42]">
          Sign in to Ahead Of Time
        </h2>
        <p className="mt-1 text-sm text-slate-500">{reason || 'Your plans on every device, updates, Telegram and the calendar feed.'}</p>

        {sentTo ? (
          <div className="mt-5 p-4 rounded-2xl bg-[#eef6f3] border border-[#cfe3dc] text-sm text-[#20463a] space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Check your inbox
            </p>
            <p>
              We sent a sign-in link to <b>{sentTo}</b>. It works once, for 15 minutes. Nothing there? Check your spam folder.
            </p>
            <button type="button" onClick={() => setSentTo(null)} className="text-xs font-bold underline underline-offset-2 cursor-pointer">
              Use another address
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onGoogle}
              className="mt-5 w-full py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Continue with Google
            </button>
            <p className="mt-1.5 text-[11px] text-slate-400 text-center">Also connects Google Calendar.</p>

            <div className="my-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex-1 h-px bg-slate-200" /> or <span className="flex-1 h-px bg-slate-200" />
            </div>

            <form onSubmit={sendLink} className="space-y-2">
              <label htmlFor="sign-in-email" className="text-xs font-bold text-slate-600">
                Email (for Apple Calendar, Outlook or any other calendar)
              </label>
              <input
                id="sign-in-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#182A42]"
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="w-full py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Email me a sign-in link
              </button>
              {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
};
