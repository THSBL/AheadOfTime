import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { aiJsonHeaders } from '../services/aiRequest';
import { getCurrentUser, logoutAndClearAccountSession, normalizeUserId } from '../services/accountManager';
import { clearGoogleSession } from '../services/googleAuth';

/**
 * Settings -> Credentials: delete the account and everything stored for it
 * (server: DELETE /api/auth/account). Two steps, the second asks the user
 * to type DELETE. Nothing in their own Google Calendar is touched.
 */
export const DeleteAccountCard: React.FC = () => {
  const [step, setStep] = useState<'idle' | 'confirm'>('idle');
  const [typed, setTyped] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearThisDevice = () => {
    const userKey = normalizeUserId(getCurrentUser()?.id);
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('aot_') || key.startsWith('tminus_') || key.includes(userKey) || key.startsWith('onboarding_profile')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // Storage unavailable: nothing to clear.
    }
    logoutAndClearAccountSession();
    clearGoogleSession();
  };

  const deleteAccount = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: aiJsonHeaders(),
        body: JSON.stringify({ confirm: 'DELETE' }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again, then try once more.' : 'Deleting failed - please try again.');
      clearThisDevice();
      window.location.href = '/';
    } catch (err: any) {
      setError(err?.message || 'Deleting failed - please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-rose-200 shadow-xs p-5 sm:p-6 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Delete account</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Permanently deletes your plans and tasks, profile, Telegram link, Background Sync access (also revoked at Google),
            feedback and settings. Events already pushed to your Google Calendar stay there.
          </p>
        </div>
      </div>

      {step === 'idle' ? (
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="px-4 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold cursor-pointer"
        >
          Delete my account...
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700" htmlFor="confirm-delete">
            Type DELETE to confirm. This can't be undone.
          </label>
          <input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="w-full bg-slate-50 text-slate-900 text-sm px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-400"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setTyped('');
                setError(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={typed.trim() !== 'DELETE' || isDeleting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete everything
            </button>
          </div>
          {error && <p className="text-xs text-rose-700">{error}</p>}
        </div>
      )}
    </div>
  );
};
