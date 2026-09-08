import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
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
  Sparkles
} from 'lucide-react';
import { CalendarEvent } from '../types';
import { db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

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
  events?: CalendarEvent[];
  userId?: string;
}

export const TelegramIntegrationCard: React.FC<TelegramIntegrationCardProps> = ({ events = [], userId = 'user_default' }) => {
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const [isVerifyingManual, setIsVerifyingManual] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
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
  const firestoreUnsubRef = useRef<(() => void) | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (firestoreUnsubRef.current) {
      firestoreUnsubRef.current();
      firestoreUnsubRef.current = null;
    }
  };

  /**
   * Polls /api/telegram/status?code=<pairCode>
   */
  const checkStatus = async (pairCodeToCheck?: string | null, silent = false): Promise<boolean> => {
    if (!silent) setIsLoading(true);
    try {
      const codeParam = pairCodeToCheck ? `?code=${encodeURIComponent(pairCodeToCheck)}` : '';
      const res = await fetch(`/api/telegram/status${codeParam}`);
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
    let isMounted = true;
    checkStatus(null, false);

    // Also check Firestore telegram_users collection on mount
    const checkFirestoreUser = async () => {
      try {
        if (!userId) return;
        const userDocRef = doc(db, 'telegram_users', userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data()?.linked && isMounted) {
          const user = userSnap.data()?.username || userSnap.data()?.telegram_username || 'Telegram User';
          setIsLinked(true);
          setUsername(user);
          if (typeof window !== 'undefined') {
            localStorage.setItem('aot_telegram_linked', 'true');
            localStorage.setItem('aot_telegram_user', user);
          }
          return;
        }

        const q = query(collection(db, 'telegram_users'), where('user_id', '==', userId));
        const qSnap = await getDocs(q);
        if (!qSnap.empty && isMounted) {
          const docData = qSnap.docs[0].data();
          if (docData.linked !== false) {
            const user = docData.username || docData.telegram_username || 'Telegram User';
            setIsLinked(true);
            setUsername(user);
            if (typeof window !== 'undefined') {
              localStorage.setItem('aot_telegram_linked', 'true');
              localStorage.setItem('aot_telegram_user', user);
            }
          }
        }
      } catch (e) {
        // Fallback gracefully
      }
    };
    checkFirestoreUser();

    return () => {
      isMounted = false;
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

    // 1. Request pairing link directly from live Cloud Run pairing endpoint
    try {
      const response = await fetch('https://telegram-webhook-705347156449.europe-west1.run.app/pair', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url || data.deepLink) {
          pairingUrl = data.url || data.deepLink;
          const match = pairingUrl.match(/[?&]start=([^&]+)/);
          if (match && match[1]) {
            randomToken = match[1];
          }
        }
      }
    } catch (err) {
      console.warn('[TelegramCard] Cloud Run direct pair endpoint fetch fallback:', err);
    }

    // Fallback if needed
    if (!randomToken) {
      randomToken = `pair_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
    }
    if (!pairingUrl) {
      pairingUrl = `https://t.me/AheadTimebot?start=${randomToken}`;
    }

    setActivePairCode(randomToken);
    setPairingLink(pairingUrl);
    setIsWaitingForHandshake(true);

    // 2. Write staging doc to Firestore at pairings/<randomToken>
    try {
      await setDoc(doc(db, 'pairings', randomToken), {
        user_id: userId,
        linked: false,
        created_at: new Date()
      });
    } catch (err) {
      console.warn('Firestore setDoc staging notice (using backend synchronization):', err);
    }

    // 3. Register pairing on local backend server for dual-stack support
    try {
      await fetch('/api/telegram/pair-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: randomToken }),
      });
    } catch (e) {
      // Offline fallback
    }

    // Open Telegram Bot with deep link
    try {
      window.open(pairingUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('window.open notice:', e);
    }

    // 4. Set up real-time Firestore listener (onSnapshot) on that specific pairings/<randomToken> document
    try {
      const unsub = onSnapshot(doc(db, 'pairings', randomToken), (docSnap) => {
        if (docSnap.exists() && docSnap.data().linked) {
          const detectedUser = docSnap.data().username || 'Telegram User';
          const detectedChat = docSnap.data().chat_id || docSnap.data().chatId || '';

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
        }
      });
      firestoreUnsubRef.current = unsub;
    } catch (err) {
      console.warn('Firestore onSnapshot notice:', err);
    }

    // Start dual-layer polling every 2 seconds
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
      const verified = await checkStatus(codeToCheck, true);

      if (verified) {
        setIsVerifyingManual(false);
        return;
      }

      // 2. If not detected via webhook yet, trigger manual link fallback
      const customUsername = manualUsernameInput.trim() || 'Telegram User';
      const res = await fetch('/api/telegram/manual-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activePairCode || 'pair_manual',
          username: customUsername,
        }),
      });

      const data = await res.json();
      if (data.ok && data.linked) {
        const linkedUser = data.username || customUsername;
        setIsLinked(true);
        setUsername(linkedUser);
        if (data.chatId) {
          setChatId(data.chatId);
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('aot_telegram_linked', 'true');
          localStorage.setItem('aot_telegram_user', linkedUser);
          if (data.chatId) {
            localStorage.setItem('aot_telegram_chat_id', String(data.chatId));
          }
        }

        stopPolling();
        setIsWaitingForHandshake(false);
        setPairingLink(null);
        setActivePairCode(null);
        setShowManualInput(false);

        setFeedback({
          type: 'success',
          message: `🎉 Connected! AheadOfTime calendar assistant is linked to @${linkedUser}.`,
        });
      } else {
        setShowManualInput(true);
        setFeedback({
          type: 'error',
          message: 'Could not auto-verify yet. Please enter your Telegram username below to confirm.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Verification request failed.',
      });
    } finally {
      setIsVerifyingManual(false);
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
      await fetch('/api/telegram/pair-code', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_default', chatId }),
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

  /**
   * Send test reminder alert
   */
  const handleSendTestMessage = async () => {
    if (!chatId || chatId === '123456789' || chatId === 123456789) {
      setFeedback({
        type: 'error',
        message: 'No active Telegram chat linked yet. Click "Connect Telegram" and tap Start in @AheadTimebot first to link your chat.',
      });
      return;
    }

    setIsSendingTest(true);
    setFeedback(null);

    try {
      const sampleEvent: CalendarEvent = events[0] || {
        id: `evt_${Date.now()}`,
        title: 'Scottish Highlands Trip (with 4 friends)',
        eventDate: '2026-10-14',
        endDate: '2026-10-18',
        eventTime: '09:00',
        location: 'Scottish Highlands',
        status: 'milestones_active',
        category: 'travel_trip',
        context: {
          customNote: 'Scottish Highlands trip with friends',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: [
          {
            id: 'ms-1',
            eventId: `evt_${Date.now()}`,
            title: 'Lodging & Transport Locked',
            tMinusLabel: 'T-21d',
            tMinusOffsetMinutes: -30240,
            calculatedDate: '2026-09-23',
            category: 'logistics',
            status: 'pending',
            deliverables: [
              { deliverable_id: 'del-1', title: 'Book rental car / train passes', type: 'coordination', is_completed: false },
              { deliverable_id: 'del-2', title: 'Reserve group stay / cabin', type: 'coordination', is_completed: false }
            ]
          },
          {
            id: 'ms-2',
            eventId: `evt_${Date.now()}`,
            title: 'Headcount & Group Costs Settled',
            tMinusLabel: 'T-14d',
            tMinusOffsetMinutes: -20160,
            calculatedDate: '2026-09-30',
            category: 'logistics',
            status: 'pending',
            deliverables: [
              { deliverable_id: 'del-3', title: 'Confirm headcount with all 4 friends', type: 'coordination', is_completed: false },
              { deliverable_id: 'del-4', title: 'Collect shared budget/expenses', type: 'coordination', is_completed: false }
            ]
          },
          {
            id: 'ms-3',
            eventId: `evt_${Date.now()}`,
            title: 'Gear & Bags Packed',
            tMinusLabel: 'T-2d',
            tMinusOffsetMinutes: -2880,
            calculatedDate: '2026-10-12',
            category: 'logistics',
            status: 'pending',
            deliverables: [
              { deliverable_id: 'del-5', title: 'Pack hiking boots & weather gear', type: 'coordination', is_completed: false },
              { deliverable_id: 'del-6', title: 'Check offline trail maps', type: 'coordination', is_completed: false }
            ]
          }
        ]
      };

      const res = await fetch('/api/telegram/send-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          event: sampleEvent,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFeedback({
          type: 'success',
          message: 'Test alert sent! Check your Telegram chat.',
        });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({
          type: 'error',
          message: data.description || 'Dispatched alert simulation to Telegram session.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const formattedUsername = username.startsWith('@') ? username : `@${username}`;

  return (
    <div id="telegram-integration-card" className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-all duration-200 space-y-5">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0 shadow-2xs">
            {/* Telegram Plane Vector */}
            <svg className="w-6 h-6 text-[#2AABEE]" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#2AABEE" fillOpacity="0.12" />
              <path
                d="M17.5 7.5L6.5 11.5L10.5 13.5L14.5 9.5L11.5 14.5L16.5 17.5L17.5 7.5Z"
                fill="#2AABEE"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">
              Telegram Assistant
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Receive proactive reminder alerts and plan trips on the go.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="self-start sm:self-center shrink-0">
          {isLinked ? (
            <span id="telegram-status-active" className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Active</span>
            </span>
          ) : (
            <span id="telegram-status-unlinked" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Not Linked
            </span>
          )}
        </div>
      </div>

      {/* Body Content */}
      {isLinked ? (
        /* STATE: Active / Linked */
        <div className="space-y-4 pt-1 animate-in fade-in duration-200">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span id="telegram-connected-user" className="font-semibold text-slate-900 text-sm">
                  {formattedUsername}
                </span>
                {chatId ? (
                  <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    ID: {chatId}
                  </span>
                ) : null}
              </div>
              <p className="text-slate-500 text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Live calendar assistant linked and listening for natural scheduling prompts
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                id="btn-send-telegram-test"
                type="button"
                onClick={handleSendTestMessage}
                disabled={isSendingTest}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-200 text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
                <span>{isSendingTest ? 'Sending...' : 'Send Test Alert'}</span>
              </button>

              <button
                id="btn-disconnect-telegram"
                type="button"
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="px-3 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 font-medium rounded-lg text-xs transition flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* STATE: Not Linked */
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-600 leading-relaxed">
            Message the bot naturally like <span className="font-medium text-slate-800 italic">"Trip to Scottish Highlands Oct 14-18 with 4 friends"</span>. The assistant extracts dates, checks calendar availability, and generates reverse T-Minus preparation runways.
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
                <div className="flex items-start gap-2.5">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-sky-900">
                      Waiting for you to tap "Start" in Telegram...
                    </p>
                    <p className="text-[11px] text-sky-700">
                      If Telegram did not open automatically,{' '}
                      <a
                        href={pairingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-bold hover:text-sky-950"
                      >
                        click here to open Telegram
                      </a>
                      .
                    </p>
                  </div>
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
    </div>
  );
};
