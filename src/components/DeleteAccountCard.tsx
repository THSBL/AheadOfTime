import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { SettingsRow } from './SettingsRow';
import { aiJsonHeaders } from '../services/aiRequest';
import { getCurrentUser, logoutAndClearAccountSession, normalizeUserId } from '../services/accountManager';
import { clearGoogleSession } from '../services/googleAuth';

/**
 * Settings -> Account: delete the account and everything stored for it
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
    <SettingsRow
      tone="danger"
      icon={<Trash2 className="w-[18px] h-[18px]" />}
      title="Delete account"
      subtitle="Plans, profile, links and settings"
      open={Boolean(error)}
    >
      <p>
        Permanently deletes your plans and tasks, profile, Telegram link, Background Sync access (also revoked at Google), feedback and
        settings. Events already in your Google Calendar stay there.
      </p>
      {step === 'idle' ? (
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold cursor-pointer"
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
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={typed.trim() !== 'DELETE' || isDeleting}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete everything
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </SettingsRow>
  );
};
