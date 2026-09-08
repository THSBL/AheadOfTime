import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Copy, 
  Check, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  Key, 
  RefreshCw,
  Server
} from 'lucide-react';
import { 
  getStoredClientId, 
  setStoredClientId, 
  DEFAULT_CLIENT_ID 
} from '../services/googleAuth';
import { CalendarEvent } from '../types';

interface AdvancedDeveloperSettingsDrawerProps {
  events?: CalendarEvent[];
}

export const AdvancedDeveloperSettingsDrawer: React.FC<AdvancedDeveloperSettingsDrawerProps> = ({ events = [] }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [telegramStatus, setTelegramStatus] = useState<any | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [customClientId, setCustomClientId] = useState<string>(getStoredClientId());
  const [savedClientIdFeedback, setSavedClientIdFeedback] = useState<string | null>(null);
  const [manualChatId, setManualChatId] = useState<string>('');
  const [isSendingManualTest, setIsSendingManualTest] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/telegram/status');
      const data = await res.json();
      setTelegramStatus(data);
    } catch (err) {
      console.warn('Failed to load status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  const handleCopyWebhookUrl = () => {
    const url = telegramStatus?.inferredWebhookUrl || `${window.location.origin}/api/telegram/webhook`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleRegisterWebhook = async () => {
    const url = telegramStatus?.inferredWebhookUrl || `${window.location.origin}/api/telegram/webhook`;
    setIsRegisteringWebhook(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/set-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: url }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({
          type: 'success',
          message: 'Webhook registered successfully with Telegram API!',
        });
        await fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: data.description || 'Failed to register webhook.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setIsRegisteringWebhook(false);
    }
  };

  const handleSaveClientId = () => {
    setStoredClientId(customClientId);
    setSavedClientIdFeedback('OAuth Client ID saved. Refresh to apply to new sign-ins.');
    setTimeout(() => setSavedClientIdFeedback(null), 3000);
  };

  const handleResetClientId = () => {
    setCustomClientId(DEFAULT_CLIENT_ID);
    setStoredClientId(DEFAULT_CLIENT_ID);
    setSavedClientIdFeedback('Reset to default Web Client ID.');
    setTimeout(() => setSavedClientIdFeedback(null), 3000);
  };

  const handleSendManualTest = async () => {
    const targetChat = manualChatId.trim();
    if (!targetChat) {
      setFeedback({
        type: 'error',
        message: 'Please enter a target Chat ID.',
      });
      return;
    }

    setIsSendingManualTest(true);
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
          }
        ]
      };

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
          message: `Test alert dispatched to Telegram chat ${targetChat}!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.description || 'Failed to dispatch message.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Network error' });
    } finally {
      setIsSendingManualTest(false);
    }
  };

  return (
    <div className="border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-2xs transition-all duration-200">
      {/* Drawer Toggle Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 block">
              Advanced Developer Settings
            </span>
            <span className="text-[11px] text-slate-500">
              Webhook endpoints, custom credentials, and manual dispatch
            </span>
          </div>
        </div>

        <div className="text-slate-400">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isOpen && (
        <div className="px-5 pb-6 pt-2 border-t border-slate-100 space-y-6 text-xs animate-in fade-in duration-200">
          {/* Webhook Registration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                Telegram Webhook Endpoint
              </label>
              {telegramStatus?.webhookInfo?.url ? (
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold text-[11px] flex items-center gap-1 border border-emerald-200/60">
                  <Check className="w-3 h-3 stroke-[2.5]" /> Registered
                </span>
              ) : (
                <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold text-[11px] border border-amber-200/60">
                  Not Registered
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2 px-3">
              <input
                type="text"
                readOnly
                value={telegramStatus?.inferredWebhookUrl || `${window.location.origin}/api/telegram/webhook`}
                className="w-full bg-transparent text-slate-700 font-mono text-xs focus:outline-hidden selection:bg-sky-500 selection:text-white"
              />
              <button
                type="button"
                onClick={handleCopyWebhookUrl}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition shrink-0"
                title="Copy Webhook URL"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleRegisterWebhook}
                disabled={isRegisteringWebhook}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-semibold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className={`w-3.5 h-3.5 ${isRegisteringWebhook ? 'animate-spin text-sky-400' : ''}`} />
                <span>{isRegisteringWebhook ? 'Registering...' : 'Register Webhook with Telegram'}</span>
              </button>
              <span className="text-[11px] text-slate-500">
                Calls Telegram <code className="text-slate-700 bg-slate-100 px-1 py-0.5 rounded">setWebhook</code>
              </span>
            </div>
          </div>

          {/* Google OAuth Client ID Override */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-slate-500" />
              Google Web Client ID Override
            </label>
            <p className="text-slate-500 text-[11px]">
              Optionally specify a custom OAuth 2.0 Web Client ID from your own Google Cloud Console.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={customClientId}
                onChange={(e) => setCustomClientId(e.target.value)}
                placeholder="e.g., 705347156449-...apps.googleusercontent.com"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:bg-white focus:border-slate-400 focus:outline-hidden"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveClientId}
                  className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleResetClientId}
                  className="px-3 py-2 text-slate-400 hover:text-slate-700 text-xs font-medium cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {savedClientIdFeedback && (
              <p className="text-[11px] text-emerald-600 font-medium">{savedClientIdFeedback}</p>
            )}
          </div>

          {/* Manual Test Dispatcher */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block">
              Manual Telegram Test Alert Dispatcher
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                placeholder="Target Chat ID (e.g. 123456789)"
                value={manualChatId}
                onChange={(e) => setManualChatId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:bg-white focus:border-slate-400 focus:outline-hidden flex-1"
              />
              <button
                type="button"
                onClick={handleSendManualTest}
                disabled={isSendingManualTest}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingManualTest ? 'Sending...' : 'Send Test'}</span>
              </button>
            </div>
          </div>

          {/* Diagnostics Summary */}
          {telegramStatus && (
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span>Runtime Diagnostics</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600">
                <div>Bot Name: <strong className="text-slate-800">@{telegramStatus.botInfo?.username || 'AheadTimebot'}</strong></div>
                <div>Token Status: <strong className="text-slate-800">{telegramStatus.hasToken ? 'Loaded (Env)' : 'Missing'}</strong></div>
                <div>Active Sessions: <strong className="text-slate-800">{telegramStatus.activeSessions || 0}</strong></div>
                <div>Stored Events: <strong className="text-slate-800">{telegramStatus.storedEventsCount || 0}</strong></div>
              </div>
            </div>
          )}

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="flex-1">{feedback.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
