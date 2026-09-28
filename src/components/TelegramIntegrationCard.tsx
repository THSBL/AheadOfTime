import { canUseAppSession, bearerHeader } from '../services/appSession';
import { SettingsRow, SettingsPill, rowButtonClass } from './SettingsRow';
import { OpenTelegramButton } from './OpenTelegramButton';
import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Check,
  ExternalLink,
  LogOut,
  Loader2,
  Smartphone,
  ShieldCheck,
  UserCheck,
  Sparkles,
  Copy
} from 'lucide-react';
import { getStoredAccessToken } from '../services/googleAuth';

interface TelegramStatusResponse {
  ok?: boolean;
  linked?: boolean;
  status?: string;
  username?: string;
  chatId?: number | string;
  telegram_chat_id?: number | string;
  telegram_linked?: boolean;
  isLinked?: boolean;
  session?: any;
  isConfigured?: boolean;
  hasToken?: boolean;
  botInfo?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
  } | null;
  webhookInfo?: {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  } | null;
  activeSessions?: number;
}

interface TelegramIntegrationCardProps {
  userId?: string;
}

export const TelegramIntegrationCard: React.FC<TelegramIntegrationCardProps> = ({ userId }) => {
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const [isVerifyingManual, setIsVerifyingManual] = useState<boolean>(false);
  const [isUnlinking, setIsUnlinking] = useState<boolean>(false);

  const [isLinked, setIsLinked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aot_telegram_linked') === 'true';
    }
    return false;
  });

  const [username, setUsername] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aot_telegram_user') || 'Telegram User';
    }
    return 'Telegram User';
  });

  const [chatId, setChatId] = useState<string | number>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aot_telegram_chat_id') || '';
    }
    return '';
  });

  const [pairingLink, setPairingLink] = useState<string | null>(null);
  const [activePairCode, setActivePairCode] = useState<string | null>(null);
  const [isWaitingForHandshake, setIsWaitingForHandshake] = useState<boolean>(false);
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [manualUsernameInput, setManualUsernameInput] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const pollingRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  /**
   * Polls /api/telegram/status?code=<pairCode>
   */
  const checkStatus = async (pairCodeToCheck?: string | null, silent = false): Promise<boolean> => {
    // The status endpoint reveals a real linked account's username/chatId,
    // so it requires proof of who's asking - without a live Google session
    // there's nothing to check (and nothing to leak), so skip the call
    // entirely rather than let it come back "not linked" every time.
    const accessToken = getStoredAccessToken();
    // The app session cookie also identifies the user once the Google token is gone.
    if (!accessToken && !(await canUseAppSession())) {
      setIsLinked(false);
      return false;
    }
    if (!silent) setIsLoading(true);
    try {
      const codeParam = pairCodeToCheck ? `?code=${encodeURIComponent(pairCodeToCheck)}` : '';
      const res = await fetch(`/api/telegram/status${codeParam}`, {
        headers: bearerHeader(accessToken),
      });
      const data: TelegramStatusResponse = await res.json().catch(() => ({}));

      setStatus(data);

      const linked = Boolean(data.linked || data.telegram_linked || data.isLinked);

      if (linked) {
        const detectedUser = data.username || (data as any).session?.username || 'Telegram User';
        const detectedChat = data.chatId || data.telegram_chat_id || (data as any).session?.chatId || '';

        setIsLinked(true);
        setUsername(detectedUser);
        if (detectedChat) setChatId(detectedChat);

        if (typeof window !== 'undefined') {
          localStorage.setItem('aot_telegram_linked', 'true');
          localStorage.setItem('aot_telegram_user', detectedUser);
          if (detectedChat) {
            localStorage.setItem('aot_telegram_chat_id', String(detectedChat));
          }
        }

        stopPolling();
        setIsWaitingForHandshake(false);
        setPairingLink(null);
        setActivePairCode(null);
        setShowManualInput(false);
        setIsLinking(false);

        setFeedback({
          type: 'success',
          message: `🎉 Connected! Telegram assistant (@${detectedUser}) is now active.`,
        });

        return true;
      }
      return false;
    } catch (err: any) {
      console.warn('[Telegram Card] Failed to poll status:', err?.message);
      return false;
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    checkStatus(null, false);

    return () => {
      stopPolling();
    };
  }, [userId]);

  /**
   * Initiates the pairing handshake
   */
  const handleStartLinking = async () => {
    setIsLinking(true);
    setFeedback(null);
    setShowManualInput(false);

    let pairingUrl = '';
    let randomToken = '';

    // Generating a pairing code ties this Telegram chat to your real
    // account, so it has to come from our own backend, which verifies
    // your sign-in and resolves your real email server-side - NOT from a
    // client-generated random code or the old, unrelated Cloud Run
    // pairing service. Those produced a code that was shown to the user
    // but never actually registered against their real account, which is
    // exactly why linking silently fell back to an anonymous placeholder
    // even when the user was signed in.
    const accessToken = getStoredAccessToken();
    if (!accessToken && !(await canUseAppSession())) {
      setIsLinking(false);
      setFeedback({
        type: 'error',
        message: 'Please sign in (and make sure your calendar connection is active) before connecting Telegram.',
      });
      return;
    }

    try {
      const res = await fetch('/api/telegram/pair-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...bearerHeader(accessToken),
        },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        setIsLinking(false);
        setFeedback({
          type: 'error',
          message: 'Could not start Telegram pairing - please sign in again and retry.',
        });
        return;
      }
      const data = await res.json();
      randomToken = data.pairingCode || data.pairCode;
      pairingUrl = data.deepLink;
    } catch (err) {
      setIsLinking(false);
      setFeedback({ type: 'error', message: 'Could not reach the server to start Telegram pairing. Please try again.' });
      return;
    }

    if (!randomToken || !pairingUrl) {
      setIsLinking(false);
      setFeedback({ type: 'error', message: 'Could not generate a pairing code. Please try again.' });
      return;
    }

    setActivePairCode(randomToken);
    setPairingLink(pairingUrl);
    setIsWaitingForHandshake(true);

    // Best-effort staging doc for the Firestore-based status listener below
    // Open Telegram Bot with deep link
    try {
      window.open(pairingUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('window.open notice:', e);
    }

    // Poll the (now auth-required) status endpoint every 2 seconds until
    // the backend confirms the link - this is the actual source of truth
    // (a parallel Firestore listener used to sit alongside this, but
    // nothing server-side ever wrote to that collection, so it never
    // fired; removed rather than left as an unused, directly-queryable
    // client-side read of another concern's data).
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = window.setInterval(async () => {
      const success = await checkStatus(randomToken, true);
      if (success) {
        stopPolling();
        setIsLinking(false);
      }
    }, 2000);

    // Auto timeout polling after 3 minutes
    setTimeout(() => {
      if (pollingRef.current) {
        stopPolling();
        setIsWaitingForHandshake(false);
        setIsLinking(false);
      }
    }, 180000);
  };

  /**
   * Emergency Bypass / Manual Verification
   */
  const handleManualVerification = async () => {
    setIsVerifyingManual(true);
    setFeedback(null);

    try {
      // 1. First try an immediate fresh check against server with active pairing code
      const codeToCheck = activePairCode || localStorage.getItem('aot_telegram_pair_code');
      const verified = await checkStatus(codeToCheck, false);

      if (verified) {
        setIsLinking(false);
        setIsVerifyingManual(false);
        return;
      }

      // 2. Not linked yet. There is no way to link without the bot: the
      // old "manual link" linked the code to whichever Telegram chat was
      // most recently active - possibly someone else's.
      setFeedback({
        type: 'error',
        message: 'Not linked yet. Open the bot in Telegram, send the link code (tap Start), then check again.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Verification request failed.',
      });
    } finally {
      setIsVerifyingManual(false);
      setIsLinking(false);
    }
  };

  /**
   * Disconnect / Unlink
   */
  const handleUnlink = async () => {
    setIsUnlinking(true);
    setFeedback(null);
    try {
      stopPolling();
      const unlinkToken = getStoredAccessToken();
      await fetch('/api/telegram/pair-code', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(unlinkToken ? { Authorization: `Bearer ${unlinkToken}` } : {}),
        },
      }).catch(() => ({}));

      setIsLinked(false);
      setUsername('Telegram User');
      setChatId('');
      setPairingLink(null);
      setActivePairCode(null);
      setIsWaitingForHandshake(false);
      setShowManualInput(false);

      if (typeof window !== 'undefined') {
        localStorage.removeItem('aot_telegram_linked');
        localStorage.removeItem('aot_telegram_user');
        localStorage.removeItem('aot_telegram_chat_id');
      }

      setFeedback({
        type: 'success',
        message: 'Telegram Assistant unlinked.',
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to unlink account' });
    } finally {
      setIsUnlinking(false);
    }
  };

  const formattedUsername = username.startsWith('@') ? username : `@${username}`;

  const telegramIcon = (
    <svg className="w-[18px] h-[18px] text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.5 4.2 2.9 11.4c-1.2.5-1.2 1.2 0 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.5-1.2z" />
    </svg>
  );

  return (
    <SettingsRow
      id="telegram-integration-card"
      icon={telegramIcon}
      title="Telegram"
      subtitle={isLinked ? formattedUsername : 'Plan and adjust by chatting, on the go'}
      open={Boolean(feedback) || Boolean(pairingLink)}
      right={isLinked ? <OpenTelegramButton /> : <SettingsPill on={false}>Not linked</SettingsPill>}
    >
      {/* Body Content */}
      {isLinked ? (
        /* STATE: Active / Linked */
        <div className="space-y-2.5">
          <p>
            <b>Open</b> jumps straight into the chat with the bot and wakes it up at the same moment, so your first message gets a quick answer.
          </p>
          <button
            id="btn-disconnect-telegram"
            type="button"
            onClick={handleUnlink}
            disabled={isUnlinking}
            className={rowButtonClass}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      ) : (
        /* STATE: Not Linked */
        <div className="space-y-4 pt-1">
          <p>
            Message the bot like <span className="italic">"Trip to the Highlands Oct 14-18 with 4 friends"</span> and it writes your prep plan.
          </p>

          <div className="space-y-3">
            <button
              id="btn-link-telegram-assistant"
              type="button"
              onClick={handleStartLinking}
              disabled={isLinking}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#24A1DE] hover:bg-[#1E8EC5] disabled:opacity-60 text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLinking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Waiting for Telegram...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .39z" />
                  </svg>
                  <span>Connect Telegram</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </>
              )}
            </button>

            {/* Handshake Polling State with Fallback Bypass */}
            {isWaitingForHandshake && pairingLink && (
              <div className="p-4 rounded-xl bg-sky-50 border border-sky-200/90 text-xs text-sky-950 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-sky-900">
                        Waiting for Telegram Handshake...
                      </p>
                      <p className="text-[11px] text-sky-700">
                        Tap "Start" in Telegram or send the pairing command directly to <strong>@AheadTimebot</strong>.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      stopPolling();
                      setIsWaitingForHandshake(false);
                      setIsLinking(false);
                      setPairingLink(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={pairingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#24A1DE] hover:bg-[#1E8EC5] text-white font-semibold rounded-lg text-xs transition shadow-2xs"
                  >
                    <span>Open in Telegram</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  {activePairCode && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`/start ${activePairCode}`);
                        setFeedback({ type: 'success', message: `Copied: /start ${activePairCode}` });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-sky-200 hover:bg-sky-100 text-sky-900 font-medium rounded-lg text-xs transition cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy: /start {activePairCode.slice(0, 10)}...</span>
                    </button>
                  )}
                </div>

                {/* Manual Verification Fallback */}
                <div className="pt-2 border-t border-sky-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <button
                    id="btn-verify-telegram-fallback"
                    type="button"
                    onClick={handleManualVerification}
                    disabled={isVerifyingManual}
                    className="text-[11px] font-semibold text-sky-800 hover:text-sky-950 underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                  >
                    {isVerifyingManual ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Verifying connection...</span>
                      </>
                    ) : (
                      <>
                        <span>Already tapped start in Telegram? Click to verify</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowManualInput(!showManualInput)}
                    className="text-[11px] text-sky-700 hover:text-sky-900 font-medium"
                  >
                    {showManualInput ? 'Hide manual entry' : 'Enter username manually'}
                  </button>
                </div>

                {/* Optional Username Input Drawer */}
                {showManualInput && (
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. @your_telegram_handle"
                      value={manualUsernameInput}
                      onChange={(e) => setManualUsernameInput(e.target.value)}
                      className="flex-1 bg-white border border-sky-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={handleManualVerification}
                      disabled={isVerifyingManual}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notifications / Feedback */}
      {feedback && (
        <div
          id="telegram-card-feedback"
          className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button 
            type="button" 
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700 font-bold ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </SettingsRow>
  );
};
