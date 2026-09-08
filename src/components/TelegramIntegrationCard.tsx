import React, { useState, useEffect } from 'react';
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink, 
  Bot, 
  Zap, 
  ShieldCheck,
  Calendar
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
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [testChatId, setTestChatId] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/telegram/status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      console.error('Failed to load telegram status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRegisterWebhook = async () => {
    if (!status?.inferredWebhookUrl) return;
    setIsRegisteringWebhook(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: status.inferredWebhookUrl }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({
          type: 'success',
          message: 'Webhook registered successfully with Telegram! The bot is now listening.',
        });
        await fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: data.description || 'Failed to register webhook with Telegram.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleSendTestRefinement = async () => {
    const targetChat = testChatId.trim();
    if (!targetChat) {
      setFeedback({
        type: 'error',
        message: 'Please enter a Telegram Chat ID to send the test alert to (type /status to your bot to view your ID).',
      });
      return;
    }

    setIsSendingTest(true);
    setFeedback(null);

    // Pick first event or synthesize an executive test event
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
          daysBeforeEvent: 30,
          tMinusBadge: 'T-30d',
          tMinusLabel: 'T-30d',
          category: 'travel_trip',
          phase: 'foundation',
          isCompleted: false,
        },
        {
          id: 'ms-2',
          eventId: 'evt-test-1',
          title: 'Finalize Agenda & Alpine Guides',
          daysBeforeEvent: 14,
          tMinusBadge: 'T-14d',
          tMinusLabel: 'T-14d',
          category: 'travel_trip',
          phase: 'action',
          isCompleted: false,
        },
        {
          id: 'ms-3',
          eventId: 'evt-test-1',
          title: 'Weather Check & Packing Confirmation',
          daysBeforeEvent: 3,
          tMinusBadge: 'T-3d',
          tMinusLabel: 'T-3d',
          category: 'travel_trip',
          phase: 'final_prep',
          isCompleted: false,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/telegram/send-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: targetChat,
          event: sampleEvent,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({
          type: 'success',
          message: `Test refinement alert sent to Telegram chat ${targetChat}! Check your Telegram app.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.error || data.description || 'Failed to dispatch Telegram alert.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (!status?.inferredWebhookUrl) return;
    navigator.clipboard.writeText(status.inferredWebhookUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const webhookUrl = status?.inferredWebhookUrl || '';
  const isRegistered = Boolean(
    status?.webhookInfo?.url &&
    status.webhookInfo.url === webhookUrl
  );

  return (
    <div className="bg-slate-800/80 rounded-3xl border border-slate-700/80 p-6 space-y-6 shadow-xl backdrop-blur-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">Telegram Assistant Bot</h2>
              {status?.hasToken ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Token Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" /> Needs Token
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Bidirectional sync: Share plans in Telegram to build milestones, or receive refinement prompts on your phone.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={isLoading}
          className="self-start sm:self-auto text-xs text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5"
          title="Refresh Telegram status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Bot Identity Card if available */}
      {status?.botInfo && (
        <div className="bg-slate-900/60 border border-slate-700/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center font-bold text-sm">
              ✈️
            </div>
            <div>
              <p className="text-sm font-semibold text-white">@{status.botInfo.username}</p>
              <p className="text-xs text-slate-400">
                Bot Name: {status.botInfo.first_name} • Active Sessions: {status.activeSessions}
              </p>
            </div>
          </div>
          <a
            href={`https://t.me/${status.botInfo.username}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 px-3 py-1.5 rounded-xl transition"
          >
            <span>Open in Telegram</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Webhook Configuration Block */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Live Webhook Endpoint
          </label>
          {isRegistered ? (
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3 stroke-[3]" /> Registered & Receiving
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Registration Required
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/80 rounded-2xl p-2 px-3">
          <input
            type="text"
            readOnly
            value={webhookUrl}
            className="w-full bg-transparent text-xs text-slate-300 font-mono focus:outline-hidden selection:bg-sky-500 selection:text-white"
          />
          <button
            type="button"
            onClick={handleCopyWebhookUrl}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition shrink-0"
            title="Copy webhook URL"
          >
            {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleRegisterWebhook}
            disabled={isRegisteringWebhook || !status?.hasToken}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-md shadow-sky-500/20 cursor-pointer"
          >
            <Zap className={`w-4 h-4 ${isRegisteringWebhook ? 'animate-spin' : ''}`} />
            <span>{isRegisteringWebhook ? 'Registering with Telegram...' : 'Register Webhook with Telegram'}</span>
          </button>

          <span className="text-xs text-slate-400 font-medium">
            Calls <code className="text-slate-300 text-[11px]">setWebhook</code> automatically.
          </span>
        </div>
      </div>

      {/* Test Refinement Alert Dispatcher */}
      <div className="border-t border-slate-700/60 pt-5 space-y-3">
        <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
          Test Outbound Refinement Notification
        </label>
        <p className="text-xs text-slate-400">
          Send a simulated event refinement card directly to your Telegram chat to test the deep-link back into this app.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            placeholder="Your Telegram Chat ID (e.g. 123456789)"
            value={testChatId}
            onChange={(e) => setTestChatId(e.target.value)}
            className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-hidden flex-1"
          />
          <button
            type="button"
            onClick={handleSendTestRefinement}
            disabled={isSendingTest || !status?.hasToken}
            className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-xl transition shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSendingTest ? 'Sending...' : 'Send Test Alert'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <div className="flex-1">{feedback.message}</div>
        </div>
      )}

      {/* Instructions Accordion / Step-by-Step */}
      <div className="border-t border-slate-700/60 pt-5 space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-sky-400" />
          How it works
        </h3>
        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside pl-1 leading-relaxed">
          <li>
            <strong className="text-slate-200">User plans in Telegram:</strong> Send any message like{' '}
            <code className="text-sky-300 bg-slate-900/60 px-1 py-0.5 rounded text-[11px]">
              Trip to Scottish Highlands Oct 14-18 with 4 friends
            </code>.
          </li>
          <li>
            <strong className="text-slate-200">Ahead Of Time processes runway:</strong> The bot parses dates, creates the Google Calendar item, and drafts 3-5 T-Minus backward milestones.
          </li>
          <li>
            <strong className="text-slate-200">Refinement Card delivered:</strong> The bot replies on Telegram with an inline button{' '}
            <span className="text-sky-300 font-semibold">[ 🛠️ Refine Prep Timeline in App ]</span>.
          </li>
          <li>
            <strong className="text-slate-200">Deep-link launch:</strong> Tapping the button opens this applet directly at Step 2 to tailor gear, food, transit, and bookings.
          </li>
        </ol>
      </div>
    </div>
  );
};
