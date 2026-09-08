'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export interface TelegramConnectProps {
  userId?: string;
  onConnected?: (username: string, chatId?: string | number) => void;
}

const CLOUD_RUN_PAIR_ENDPOINT = 'https://telegram-webhook-705347156449.europe-west1.run.app/pair';

export function TelegramConnect({ userId = 'user_default', onConnected }: TelegramConnectProps) {
  const [isLinked, setIsLinked] = useState<boolean>(false);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [activePairCode, setActivePairCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [manualName, setManualName] = useState<string>('');
  const [showManual, setShowManual] = useState<boolean>(false);
  const [checkingNow, setCheckingNow] = useState<boolean>(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // 1. On component mount, check if user is already connected via localStorage or Firestore telegram_users
  useEffect(() => {
    let isMounted = true;

    // Fast local state check
    if (typeof window !== 'undefined') {
      const storedLinked = localStorage.getItem('aot_telegram_linked') === 'true';
      const storedUser = localStorage.getItem('aot_telegram_user');
      if (storedLinked && storedUser) {
        setIsLinked(true);
        setTelegramUsername(storedUser);
      }
    }

    // Firestore query check in telegram_users collection
    const checkExistingUserDoc = async () => {
      try {
        if (!userId) return;
        
        // Check direct document /telegram_users/<userId>
        const userDocRef = doc(db, 'telegram_users', userId);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists() && userSnap.data()?.linked && isMounted) {
          const user = userSnap.data()?.username || userSnap.data()?.telegram_username || 'Telegram User';
          setIsLinked(true);
          setTelegramUsername(user);
          if (typeof window !== 'undefined') {
            localStorage.setItem('aot_telegram_linked', 'true');
            localStorage.setItem('aot_telegram_user', user);
          }
          return;
        }

        // Query by user_id field
        const q = query(collection(db, 'telegram_users'), where('user_id', '==', userId));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty && isMounted) {
          const docData = querySnapshot.docs[0].data();
          if (docData.linked !== false) {
            const user = docData.username || docData.telegram_username || 'Telegram User';
            setIsLinked(true);
            setTelegramUsername(user);
            if (typeof window !== 'undefined') {
              localStorage.setItem('aot_telegram_linked', 'true');
              localStorage.setItem('aot_telegram_user', user);
            }
          }
        }
      } catch (err) {
        console.warn('Telegram existing connection check notice:', err);
      }
    };

    checkExistingUserDoc();

    return () => {
      isMounted = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [userId]);

  const handlePairingSuccess = (username: string, chatId?: string | number) => {
    setIsLinked(true);
    setTelegramUsername(username);
    setLoading(false);
    setDeepLink(null);
    setActivePairCode(null);
    setShowManual(false);

    if (typeof window !== 'undefined') {
      localStorage.setItem('aot_telegram_linked', 'true');
      localStorage.setItem('aot_telegram_user', username);
      if (chatId) {
        localStorage.setItem('aot_telegram_chat_id', String(chatId));
      }
    }

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (onConnected) {
      onConnected(username, chatId);
    }
  };

  const verifyNow = async () => {
    setCheckingNow(true);
    try {
      const codeToCheck = activePairCode;
      if (codeToCheck) {
        // 1. Direct check in Firestore
        const docSnap = await getDoc(doc(db, 'pairings', codeToCheck));
        if (docSnap.exists() && docSnap.data().linked) {
          const user = docSnap.data().username || 'Telegram User';
          const chatId = docSnap.data().chat_id || docSnap.data().chatId;
          handlePairingSuccess(user, chatId);
          setCheckingNow(false);
          return;
        }

        // 2. Local status check
        const res = await fetch(`/api/telegram/status?code=${encodeURIComponent(codeToCheck)}`);
        const data = await res.json();
        if (data.linked || data.isLinked || data.telegram_linked) {
          const user = data.username || data.session?.username || 'Telegram User';
          const chatId = data.chatId || data.telegram_chat_id || data.session?.chatId;
          handlePairingSuccess(user, chatId);
          setCheckingNow(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Manual check error:', e);
    } finally {
      setTimeout(() => setCheckingNow(false), 500);
    }
  };

  const handleManualQuickLink = async () => {
    const username = manualName.trim() || 'Telegram User';
    try {
      await fetch('/api/telegram/manual-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activePairCode || 'pair_quick',
          username,
        }),
      });
    } catch (e) {
      // Ignore
    }
    handlePairingSuccess(username);
  };

  const startTelegramPairing = async () => {
    setLoading(true);

    let pairingUrl = '';
    let randomToken = '';

    // 1. Request pairing link directly from live Cloud Run pairing endpoint
    try {
      const response = await fetch(CLOUD_RUN_PAIR_ENDPOINT, {
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
      console.warn('[TelegramConnect] Cloud Run direct pair endpoint fetch fallback:', err);
    }

    // Fallback token if Cloud Run endpoint was unreachable or returned alternative structure
    if (!randomToken) {
      randomToken = `pair_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
    }
    if (!pairingUrl) {
      const botUsername = 'AheadTimebot';
      pairingUrl = `https://t.me/${botUsername}?start=${randomToken}`;
    }

    setDeepLink(pairingUrl);
    setActivePairCode(randomToken);

    // 2. Write temporary staging doc to Firestore at pairings/<randomToken>
    try {
      await setDoc(doc(db, 'pairings', randomToken), {
        user_id: userId,
        linked: false,
        created_at: new Date()
      });
    } catch (err) {
      console.warn('Firestore setDoc staging notice:', err);
    }

    // Also register on local backend server for dual-stack support
    try {
      await fetch('/api/telegram/pair-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: randomToken })
      });
    } catch (e) {
      // Offline fallback
    }

    // 3. Open Telegram Bot with deep link in a new tab/window
    try {
      window.open(pairingUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('Window open notice:', e);
    }

    // 4. Set up real-time Firestore listener (onSnapshot) on that specific pairings/<randomToken> document
    try {
      const unsubscribe = onSnapshot(doc(db, 'pairings', randomToken), (docSnap) => {
        if (docSnap.exists() && docSnap.data().linked) {
          const user = docSnap.data().username || 'Telegram User';
          const chatId = docSnap.data().chat_id || docSnap.data().chatId;
          handlePairingSuccess(user, chatId);
        }
      });
      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.warn('Firestore onSnapshot fallback notice:', err);
    }

    // Dual-layer polling fallback on /api/telegram/status?code=...
    if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/telegram/status?code=${encodeURIComponent(randomToken)}`);
        const data = await res.json();
        if (data.linked || data.isLinked || data.telegram_linked) {
          const user = data.username || data.session?.username || 'Telegram User';
          const chatId = data.chatId || data.telegram_chat_id || data.session?.chatId;
          handlePairingSuccess(user, chatId);
        }
      } catch (e) {
        // Polling retry
      }
    }, 2000);
  };

  const cancelPairing = () => {
    setLoading(false);
    setDeepLink(null);
    setActivePairCode(null);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const copyCommand = () => {
    if (!activePairCode) return;
    const command = `/start ${activePairCode}`;
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    setIsLinked(false);
    setTelegramUsername(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aot_telegram_linked');
      localStorage.removeItem('aot_telegram_user');
      localStorage.removeItem('aot_telegram_chat_id');
    }
  };

  return (
    <div className="p-4 border border-slate-200 rounded-xl bg-white shadow-xs">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg text-slate-900">Telegram Integration</h3>
        {isLinked && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            Active
          </span>
        )}
      </div>

      {isLinked ? (
        <div className="mt-2 space-y-2">
          <p className="text-emerald-600 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Connected as @{telegramUsername?.replace(/^@/, '') || 'Telegram User'}
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-xs text-slate-500 hover:text-rose-600 font-medium transition-colors cursor-pointer"
          >
            Disconnect Account
          </button>
        </div>
      ) : loading ? (
        <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm font-medium text-slate-900">Waiting for Telegram Handshake...</span>
            </div>
            <button
              type="button"
              onClick={cancelPairing}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-slate-600">
            If your browser blocked the new tab, click below to open <strong>@AheadTimebot</strong> or send the command directly:
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {deepLink && (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <span>Open in Telegram</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}

            {activePairCode && (
              <button
                type="button"
                onClick={copyCommand}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <span>{copied ? '✓ Copied Command' : `/start ${activePairCode.slice(0, 10)}...`}</span>
              </button>
            )}

            <button
              type="button"
              onClick={verifyNow}
              disabled={checkingNow}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <span>{checkingNow ? 'Checking...' : '✓ Verify Now'}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setShowManual(!showManual)}
              className="text-slate-600 hover:text-blue-600 font-medium underline underline-offset-2 cursor-pointer"
            >
              {showManual ? 'Hide Instant Link' : 'Cannot open Telegram? Quick Link'}
            </button>
          </div>

          {showManual && (
            <div className="pt-1 flex items-center gap-2">
              <input
                type="text"
                placeholder="Your Telegram @handle"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleManualQuickLink}
                className="px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md hover:bg-slate-900 transition-colors cursor-pointer"
              >
                Link Now
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-slate-600 mb-4">
            Connect your Telegram account to send natural language scheduling commands.
          </p>
          <button
            type="button"
            onClick={startTelegramPairing}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2"
          >
            Connect Telegram
          </button>
        </div>
      )}
    </div>
  );
}

export default TelegramConnect;
