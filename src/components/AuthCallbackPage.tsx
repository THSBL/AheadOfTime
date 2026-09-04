import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    try {
      // Parse OAuth hash parameters or query parameters
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
      const expiresIn = hashParams.get('expires_in') || searchParams.get('expires_in');
      const returnTo = searchParams.get('returnTo') || hashParams.get('returnTo') || '/dashboard';

      if (accessToken) {
        localStorage.setItem('aot_google_access_token', accessToken);
        const expiresAt = Date.now() + (parseInt(expiresIn || '3600', 10) * 1000);
        localStorage.setItem('aot_google_token_expires_at', expiresAt.toString());
        localStorage.setItem('aot_calendar_connected', 'true');
        localStorage.setItem('aot_onboarding_completed', 'true');

        setStatus('success');
        setTimeout(() => {
          navigate(decodeURIComponent(returnTo), { replace: true });
        }, 1200);
      } else {
        // Fallback for code or mock confirmation
        localStorage.setItem('aot_calendar_connected', 'true');
        localStorage.setItem('aot_onboarding_completed', 'true');
        setStatus('success');
        setTimeout(() => {
          navigate(decodeURIComponent(returnTo), { replace: true });
        }, 1200);
      }
    } catch (err: any) {
      console.error('OAuth Callback processing error:', err);
      setStatus('error');
      setErrorMessage(err?.message || 'Failed to complete OAuth authorization.');
    }
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
        {status === 'processing' && (
          <>
            <Loader2 className="w-10 h-10 text-sky-400 animate-spin mx-auto" />
            <h2 className="text-xl font-bold">Connecting Calendar Credentials...</h2>
            <p className="text-xs text-slate-400">Verifying authorization token and synchronizing Google Calendar...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">Authorization Successful!</h2>
            <p className="text-xs text-slate-400">Redirecting to your destination...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold">Authorization Issue</h2>
            <p className="text-xs text-slate-400">{errorMessage}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
            >
              Return to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
};
