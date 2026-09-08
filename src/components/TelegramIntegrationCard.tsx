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
  ShieldCheck
} from 'lucide-react';
import { CalendarEvent } from '../types';

interface TelegramStatus {
  isConfigured: boolean;
  hasToken: boolean;
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
  inferredWebhookUrl: string;
  activeSessions: number;
  storedEventsCount: number;
}

interface TelegramIntegrationCardProps {
  events?: CalendarEvent[];
}

export const TelegramIntegrationCard: React.FC<TelegramIntegrationCardProps> = ({ events = [] }) => {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLinking, setIsLinking] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [isUnlinking, setIsUnlinking] = useState<boolean>(false);
  const [isLinked, setIsLinked] = useState<boolean>(false);
  const [linkedSession, setLinkedSession] = useState<any | null>(null);
  const [pairingLink, setPairingLink] = useState<string | null>(null);
  const [isWaitingForHandshake, setIsWaitingForHandshake] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const pollingRef = useRef<number | null>(null);

  const fetchStatusAndSession = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [statusRes, pairRes] = await Promise.all([
        fetch('/api/telegram/status'),
        fetch('/api/telegram/pair-code')
      ]);

      const statusData = await statusRes.json();
      const pairData = await pairRes.json();

      setStatus(statusData);

      if (pairData.ok) {
        setIsLinked(Boolean(pairData.isLinked));
        setLinkedSession(pairData.session || null);
        if (pairData.isLinked && isWaitingForHandshake) {
          setIsWaitingForHandshake(false);
          setFeedback({
            type: 'success',
            message: 'Telegram Assistant connected successfully!'
          });
          if (pollingRef.current) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load Telegram status:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndSession();
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleStartLinking = async () => {
    setIsLinking(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/telegram/pair-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_default', email: 'Th.blanckaert@gmail.com' }),
      });
      const data = await res.json();

      if (data.ok && data.deepLink) {
        setPairingLink(data.deepLink);
        setIsWaitingForHandshake(true);

        // Open Telegram immediately in a new window/tab
        window.open(data.deepLink, '_blank', 'noopener,noreferrer');

        // Start background polling every 2.5 seconds to detect when user taps /start
        if (pollingRef.current) window.clearInterval(pollingRef.current);
        pollingRef.current = window.setInterval(() => {
          fetchStatusAndSession(true);
        }, 2500);

        // Auto stop polling after 3 minutes if not completed
        setTimeout(() => {
          if (pollingRef.current) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
            setIsWaitingForHandshake(false);
          }
        }, 180000);
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Unable to generate pairing link. Please try again.'
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Network error while connecting to Telegram.'
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    setIsUnlinking(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/pair-code', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_default' }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsLinked(false);
        setLinkedSession(null);
        setPairingLink(null);
        setIsWaitingForHandshake(false);
        if (pollingRef.current) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setFeedback({
          type: 'success',
          message: 'Telegram Assistant unlinked.',
        });
        setTimeout(() => setFeedback(null), 3500);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to unlink account' });
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!linkedSession?.chatId) {
      setFeedback({
        type: 'error',
        message: 'No active Telegram chat linked.',
      });
      return;
    }

    setIsSendingTest(true);
    setFeedback(null);

    try {
      const sampleEvent: CalendarEvent = events[0] || {
        id: `evt-test-${Date.now()}`,
        title: 'Executive Strategy Offsite',
        eventDate: '2026-10-15',
        eventTime: '09:00',
        location: 'Chamonix, France',
        status: 'milestones_active',
        category: 'travel_trip',
        milestones: [
          {
            id: 'ms-1',
            eventId: 'evt-test-1',
            title: 'Secure Mountain Chalet & Transport',
            targetDate: '2026-09-20',
            category: 'bookings',
            status: 'completed',
            urgency: 'high',
          },
          {
            id: 'ms-2',
            eventId: 'evt-test-1',
            title: 'Verify Alpine Gear & Weather Kit',
            targetDate: '2026-10-05',
            category: 'packing',
            status: 'pending',
            urgency: 'critical',
          }
        ]
      };

      const res = await fetch('/api/telegram/send-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: linkedSession.chatId,
          event: sampleEvent,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFeedback({
          type: 'success',
          message: 'Test alert sent to your Telegram chat! Check your Telegram messages.',
        });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({
          type: 'error',
          message: data.description || 'Failed to dispatch message to Telegram.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-all duration-200 space-y-5">
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
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              Not Linked
            </span>
          )}
        </div>
      </div>

      {/* Body State */}
      {isLinked ? (
        /* STATE B: Linked / Verified */
        <div className="space-y-4 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">
                  {linkedSession?.username ? `@${linkedSession.username}` : (linkedSession?.firstName || 'Connected Telegram User')}
                </span>
                <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  Chat ID: {linkedSession?.chatId}
                </span>
              </div>
              <p className="text-slate-500 text-[11px] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Live assistant ready for messages and lead-up reminders
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSendTestMessage}
                disabled={isSendingTest}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-200 text-xs transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
                <span>{isSendingTest ? 'Sending...' : 'Send Test Message'}</span>
              </button>

              <button
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
        /* STATE A: Not Linked */
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-600 leading-relaxed">
            Message the bot naturally like <span className="font-medium text-slate-800 italic">"Trip to Dolomites Oct 12-16"</span>. The assistant coordinates dates, checks calendar availability, and creates reverse lead-up checklists.
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleStartLinking}
              disabled={isLinking}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#24A1DE] hover:bg-[#1E8EC5] disabled:opacity-60 text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-xs hover:shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLinking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Connecting to Telegram...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .39z" />
                  </svg>
                  <span>Link Telegram Assistant</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </>
              )}
            </button>

            {/* Handshake Polling State */}
            {isWaitingForHandshake && pairingLink && (
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-start gap-2.5 animate-in fade-in duration-200">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
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
            )}
          </div>
        </div>
      )}

      {/* Notifications / Feedback */}
      {feedback && (
        <div
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
            className="text-slate-400 hover:text-slate-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
