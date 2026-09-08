import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  AlertCircle, 
  Copy, 
  Check, 
  RefreshCw, 
  Smartphone, 
  Settings, 
  Radio, 
  ChevronRight, 
  ShieldCheck, 
  ListFilter,
  Trash2,
  X
} from 'lucide-react';
import { CalendarEvent, TMinusMilestone } from '../types';
import { WhatsAppEventSessionState } from '../types/whatsapp';

interface WhatsAppIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  onUpdateEventMilestones?: (eventId: string, newMilestones: TMinusMilestone[]) => void;
}

export const WhatsAppIntegrationModal: React.FC<WhatsAppIntegrationModalProps> = ({
  isOpen,
  onClose,
  events,
  onUpdateEventMilestones,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'simulator' | 'scan' | 'sessions' | 'docs'>('simulator');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Status state from backend
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);
  const [sessions, setSessions] = useState<WhatsAppEventSessionState[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Simulator controls
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    return events[0]?.id || '';
  });
  const [userPhone, setUserPhone] = useState<string>('+1 (555) 382-9104');
  const [userName, setUserName] = useState<string>('Alex');
  const [isSendingOutreach, setIsSendingOutreach] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Chat message input for simulator
  const [customReplyText, setCustomReplyText] = useState<string>(
    "It's a cabin trip with 6 friends, we need a dinner spot on Saturday and shared rides"
  );
  const [isSimulatingReply, setIsSimulatingReply] = useState(false);

  // Background scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);

  // Base URL calculation for Webhook URL display
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://aheadoftime.app';
  const webhookUrl = `${currentOrigin}/webhook/whatsapp`;
  const verifyToken = 'ahead_of_time_webhook_verify_secret';

  // Fetch status and sessions
  const fetchStatusAndSessions = async () => {
    setIsLoadingStatus(true);
    try {
      const [resStatus, resSessions] = await Promise.all([
        fetch('/api/whatsapp/status').then((r) => r.json()).catch(() => null),
        fetch('/api/whatsapp/sessions').then((r) => r.json()).catch(() => ({ sessions: [] })),
      ]);

      if (resStatus) setIntegrationStatus(resStatus);
      if (resSessions?.sessions) {
        setSessions(resSessions.sessions);
        if (resSessions.sessions.length > 0 && !selectedSessionId) {
          setSelectedSessionId(resSessions.sessions[0].sessionId);
        }
      }
    } catch (e) {
      console.warn('Could not load WhatsApp integration info:', e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatusAndSessions();
      if (!selectedEventId && events.length > 0) {
        setSelectedEventId(events[0].id);
      }
    }
  }, [isOpen, events]);

  const activeSession = sessions.find((s) => s.sessionId === selectedSessionId) || sessions[0];

  // Handler: Trigger Proactive Outreach
  const handleTriggerOutreach = async () => {
    const targetEvent = events.find((e) => e.id === selectedEventId);
    if (!targetEvent) return;

    setIsSendingOutreach(true);
    try {
      const res = await fetch('/api/whatsapp/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toPhone: userPhone,
          userFirstName: userName,
          eventId: targetEvent.id,
          eventTitle: targetEvent.title,
          eventDate: targetEvent.eventDate,
          eventLocation: targetEvent.location,
          notes: targetEvent.context?.notes,
        }),
      });

      const data = await res.json();
      if (data.session) {
        setSelectedSessionId(data.session.sessionId);
        await fetchStatusAndSessions();
      }
    } catch (err) {
      console.error('Failed to trigger outreach:', err);
    } finally {
      setIsSendingOutreach(false);
    }
  };

  // Handler: Simulate Button Click or Text Reply
  const handleSimulateIncoming = async (text: string, buttonPayload?: string) => {
    if (!activeSession) return;

    setIsSimulatingReply(true);
    try {
      const res = await fetch('/api/whatsapp/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPhone: activeSession.phoneNumber,
          text: text,
          buttonPayload: buttonPayload,
        }),
      });

      const data = await res.json();
      if (data.session) {
        // If milestones were confirmed, update AheadOfTime app state!
        if (data.session.status === 'CONFIRMED_SYNCED' && data.session.generatedMilestones && onUpdateEventMilestones) {
          onUpdateEventMilestones(data.session.eventId, data.session.generatedMilestones);
        }

        await fetchStatusAndSessions();
        setSelectedSessionId(data.session.sessionId);
      }
    } catch (err) {
      console.error('Failed to simulate reply:', err);
    } finally {
      setIsSimulatingReply(false);
    }
  };

  // Handler: Run Background Agenda Scan
  const handleRunBackgroundScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/whatsapp/scan-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events,
          userPhone,
          userFirstName: userName,
        }),
      });

      const data = await res.json();
      setScanResult(data);
      await fetchStatusAndSessions();
    } catch (err) {
      console.error('Failed to execute agenda scan:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, type: 'webhook' | 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'webhook') {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        id="whatsapp-integration-modal"
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-stone-900">
                  WhatsApp Reminder & Completion Tool
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Meta Cloud API
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Daily background agenda scan, proactive utility template outreach, and Gemini Flash intake
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStatusAndSessions}
              disabled={isLoadingStatus}
              title="Refresh status"
              className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-stone-200 bg-white gap-6">
          <button
            onClick={() => setActiveSubTab('simulator')}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'simulator'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Interactive Phone Simulator
          </button>
          <button
            onClick={() => setActiveSubTab('scan')}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'scan'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <ListFilter className="w-4 h-4" />
            Daily Background Scan (Cron)
          </button>
          <button
            onClick={() => setActiveSubTab('sessions')}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'sessions'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Active Sessions ({sessions.length})
          </button>
          <button
            onClick={() => setActiveSubTab('docs')}
            className={`py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeSubTab === 'docs'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Settings className="w-4 h-4" />
            Webhook & Meta Specs
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-50/50">
          {/* TAB 1: INTERACTIVE PHONE SIMULATOR */}
          {activeSubTab === 'simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Controls & Trigger */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                    <Radio className="w-4 h-4 text-emerald-600" />
                    1. Outbound Proactive Outreach Setup
                  </div>
                  <p className="text-xs text-stone-600">
                    Triggers the approved Meta Utility Template (<code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">ahead_of_time_event_alert</code>) within Meta's conversational policy.
                  </p>

                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">
                        Select Upcoming High-Prep Event
                      </label>
                      <select
                        value={selectedEventId}
                        onChange={(e) => setSelectedEventId(e.target.value)}
                        className="w-full text-xs bg-stone-50 border border-stone-300 rounded-lg p-2.5 text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      >
                        {events.map((evt) => (
                          <option key={evt.id} value={evt.id}>
                            {evt.title} ({evt.eventDate})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          User Name ({"{{1}}"})
                        </label>
                        <input
                          type="text"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                          className="w-full text-xs bg-stone-50 border border-stone-300 rounded-lg p-2 text-stone-800"
                          placeholder="Alex"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          WhatsApp Phone (E.164)
                        </label>
                        <input
                          type="text"
                          value={userPhone}
                          onChange={(e) => setUserPhone(e.target.value)}
                          className="w-full text-xs bg-stone-50 border border-stone-300 rounded-lg p-2 text-stone-800"
                          placeholder="+15551234567"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleTriggerOutreach}
                      disabled={isSendingOutreach || !selectedEventId}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                    >
                      {isSendingOutreach ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Sending Meta Utility Template...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Send Proactive WhatsApp Ping
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Simulated User Response Box */}
                {activeSession && (
                  <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        2. Simulate Inbound WhatsApp User Reply
                      </div>
                      <span className="text-[10px] font-mono bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                        24h window active
                      </span>
                    </div>
                    <p className="text-xs text-stone-600">
                      Type extra plans or details as if you were texting on WhatsApp. Gemini Flash extracts nested sub-activities & builds backward milestones.
                    </p>

                    <div className="space-y-2">
                      <textarea
                        value={customReplyText}
                        onChange={(e) => setCustomReplyText(e.target.value)}
                        rows={3}
                        className="w-full text-xs bg-stone-50 border border-stone-300 rounded-lg p-2.5 text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        placeholder="e.g., It's a cabin trip with 6 friends, we need a dinner spot on Saturday and shared rides..."
                      />

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSimulateIncoming(customReplyText)}
                          disabled={isSimulatingReply || !customReplyText.trim()}
                          className="flex-1 py-2 px-3 bg-stone-900 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isSimulatingReply ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Gemini Parsing Compound Context...
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              Send Reply to AheadOfTime Bot
                            </>
                          )}
                        </button>
                      </div>

                      {/* Quick preset replies */}
                      <div className="pt-2 border-t border-stone-100 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setCustomReplyText("It's a cabin trip with 6 friends, we need a dinner spot on Saturday and shared rides")}
                          className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-1 rounded"
                        >
                          Cabin Weekend (6 Friends)
                        </button>
                        <button
                          onClick={() => setCustomReplyText("Dave's 40th birthday party: 15 guests, need a cake ordered, group gift, and rooftop table")}
                          className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-1 rounded"
                        >
                          40th Birthday Party
                        </button>
                        <button
                          onClick={() => setCustomReplyText("Conference flight in morning, hotel booked, need taxi scheduled and presentation slides review")}
                          className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-1 rounded"
                        >
                          Work Conference Trip
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: WhatsApp Phone Screen UI */}
              <div className="lg:col-span-7 flex flex-col items-center">
                <div className="w-full max-w-md bg-stone-900 rounded-[38px] p-3 shadow-2xl border-4 border-stone-800">
                  {/* Phone Speaker & Notch */}
                  <div className="flex justify-center mb-2">
                    <div className="w-20 h-4 bg-stone-800 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-stone-700 mr-2" />
                      <div className="w-8 h-1 rounded-full bg-stone-700" />
                    </div>
                  </div>

                  {/* Phone Screen Container */}
                  <div className="bg-[#E5DDD5] rounded-[30px] overflow-hidden flex flex-col h-[560px] border border-stone-700">
                    {/* WhatsApp Top Bar */}
                    <div className="bg-[#075E54] text-white px-4 py-3 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                          AO
                        </div>
                        <div>
                          <div className="font-semibold text-xs leading-tight">AheadOfTime Bot</div>
                          <div className="text-[10px] text-emerald-200 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                            Official Business Account
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-emerald-100 font-mono">
                        {activeSession ? activeSession.status.replace(/_/g, ' ') : 'STANDBY'}
                      </div>
                    </div>

                    {/* Chat Bubbles Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                      {!activeSession ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-500">
                          <MessageSquare className="w-8 h-8 text-stone-400 mb-2 opacity-60" />
                          <p className="font-medium text-xs text-stone-700">No active conversation</p>
                          <p className="text-[11px] text-stone-500 mt-1">
                            Click <strong>"Send Proactive WhatsApp Ping"</strong> on the left to trigger the Meta utility template alert for an upcoming event.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="text-center my-1">
                            <span className="bg-white/80 backdrop-blur-xs text-stone-600 text-[10px] px-2.5 py-1 rounded-full shadow-xs">
                              Today (24-Hour Meta Service Window)
                            </span>
                          </div>

                          {activeSession.messagesTranscript.map((msg, idx) => {
                            const isBot = msg.sender === 'bot';
                            return (
                              <div
                                key={msg.id || idx}
                                className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                              >
                                <div
                                  className={`max-w-[88%] rounded-xl px-3.5 py-2.5 shadow-sm text-stone-800 ${
                                    isBot
                                      ? 'bg-white rounded-tl-none border border-stone-200/70'
                                      : 'bg-[#DCF8C6] rounded-tr-none text-stone-900'
                                  }`}
                                >
                                  <p className="whitespace-pre-line leading-relaxed text-[11.5px]">
                                    {msg.text}
                                  </p>
                                  <div className="flex items-center justify-end gap-1 mt-1">
                                    <span className="text-[9px] text-stone-400">
                                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {!isBot && <Check className="w-3 h-3 text-emerald-600" />}
                                  </div>
                                </div>

                                {/* Render Interactive Quick-Reply Buttons if OUTREACH_SENT */}
                                {isBot && msg.type === 'template' && activeSession.status === 'OUTREACH_SENT' && (
                                  <div className="mt-2 w-full max-w-[88%] space-y-1.5">
                                    <button
                                      onClick={() => handleSimulateIncoming('Add Details', `BTN_ADD_DETAILS:${activeSession.eventId}`)}
                                      disabled={isSimulatingReply}
                                      className="w-full py-2 px-3 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-medium text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      [ Add Details ]
                                    </button>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        onClick={() => handleSimulateIncoming('Track As-Is', `BTN_TRACK_AS_IS:${activeSession.eventId}`)}
                                        disabled={isSimulatingReply}
                                        className="py-1.5 px-2 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-medium text-[11px] rounded-lg shadow-xs text-center transition-colors"
                                      >
                                        [ Track As-Is ]
                                      </button>
                                      <button
                                        onClick={() => handleSimulateIncoming('Ignore', `BTN_IGNORE:${activeSession.eventId}`)}
                                        disabled={isSimulatingReply}
                                        className="py-1.5 px-2 bg-white hover:bg-stone-100 text-stone-500 border border-stone-300 font-medium text-[11px] rounded-lg shadow-xs text-center transition-colors"
                                      >
                                        [ Ignore ]
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Render Confirmation Buttons if MILESTONES_PENDING_CONFIRMATION */}
                                {isBot && activeSession.status === 'MILESTONES_PENDING_CONFIRMATION' && idx === activeSession.messagesTranscript.length - 1 && (
                                  <div className="mt-2 w-full max-w-[88%] space-y-1.5">
                                    <button
                                      onClick={() => handleSimulateIncoming('Push to Calendar', `BTN_PUSH_CALENDAR:${activeSession.eventId}`)}
                                      disabled={isSimulatingReply}
                                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      [ Push to Calendar ]
                                    </button>
                                    <button
                                      onClick={() => handleSimulateIncoming('Adjust', `BTN_ADJUST:${activeSession.eventId}`)}
                                      disabled={isSimulatingReply}
                                      className="w-full py-1.5 px-3 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-medium text-[11px] rounded-lg shadow-xs text-center transition-colors"
                                    >
                                      [ Adjust ]
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>

                    {/* WhatsApp Bottom Input Bar */}
                    <div className="bg-[#F0F2F5] px-3 py-2 border-t border-stone-300 flex items-center gap-2">
                      <input
                        type="text"
                        value={customReplyText}
                        onChange={(e) => setCustomReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customReplyText.trim()) {
                            handleSimulateIncoming(customReplyText);
                          }
                        }}
                        placeholder="Type a WhatsApp message..."
                        className="flex-1 text-xs bg-white border border-stone-200 rounded-full px-3 py-2 text-stone-800 focus:outline-none"
                      />
                      <button
                        onClick={() => handleSimulateIncoming(customReplyText)}
                        disabled={isSimulatingReply || !customReplyText.trim() || !activeSession}
                        className="w-8 h-8 rounded-full bg-[#075E54] text-white flex items-center justify-center hover:bg-[#128C7E] disabled:opacity-50 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DAILY BACKGROUND AGENDA SCAN (CRON) */}
          {activeSubTab === 'scan' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-stone-900">
                      Step 1: Daily Background Calendar Scanner (Scheduled Job)
                    </h3>
                    <p className="text-xs text-stone-600 mt-1 max-w-2xl leading-relaxed">
                      Every 24 hours, AheadOfTime evaluates your upcoming agenda. It automatically ignores daily chores, standups, and routine 1-on-1s, while identifying high-prep compound events (parties, trips, vacations, flights) that require backward reverse-logistics.
                    </p>
                  </div>
                  <button
                    onClick={handleRunBackgroundScan}
                    disabled={isScanning}
                    className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-sm transition-all whitespace-nowrap self-start disabled:opacity-50"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Scanning Agenda Events...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Run Daily Scan Now
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Scan Results Breakdown */}
              {scanResult && (
                <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <h4 className="text-sm font-semibold text-stone-900">
                      Scan Evaluation Results
                    </h4>
                    <div className="flex items-center gap-4 text-xs font-medium text-stone-600">
                      <span>Total Scanned: <strong>{scanResult.totalScanned}</strong></span>
                      <span className="text-emerald-600">High-Prep Identified: <strong>{scanResult.eligibleEvents?.length || 0}</strong></span>
                      <span className="text-blue-600">Outreach Dispatched: <strong>{scanResult.outreachSent?.length || 0}</strong></span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                      Event Evaluation Breakdown
                    </div>
                    <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden">
                      {scanResult.eligibleEvents?.map((item: any) => (
                        <div key={item.event.id} className="p-3.5 bg-emerald-50/40 flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-stone-900">{item.event.title}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {item.evaluation.leadTimeDays} Days Ahead
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-600">{item.evaluation.reason}</p>
                          </div>
                          <span className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-white border border-emerald-200 rounded shadow-xs">
                            Proactive Alert Sent
                          </span>
                        </div>
                      ))}

                      {scanResult.eligibleEvents?.length === 0 && (
                        <div className="p-6 text-center text-xs text-stone-500">
                          No high-prep events &gt;= 7 days in future detected in this scan batch.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Filtering Rules Matrix */}
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h4 className="text-sm font-semibold text-stone-900">
                  AheadOfTime Calendar Filtering Matrix
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg bg-red-50/60 border border-red-200 space-y-1.5">
                    <div className="font-semibold text-red-800 flex items-center gap-1.5">
                      <X className="w-3.5 h-3.5 text-red-600" />
                      Ignored Routine Work
                    </div>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      Standups, 1-on-1s, bi-weekly syncs, team retros, sprint planning, and all-hands are filtered out.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-amber-50/60 border border-amber-200 space-y-1.5">
                    <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      Ignored Personal Chores
                    </div>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      Daily gym workouts, grocery runs, laundry, dentist appointments, and passive birthday reminders.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                    <div className="font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Eligible High-Prep Triggers
                    </div>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      Cabin weekends, road trips, Dave's 40th birthday party, weddings, conferences, and flight bookings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVE SESSIONS */}
          {activeSubTab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    Active Event-Context Sessions ({sessions.length})
                  </h3>
                  <p className="text-xs text-stone-500">
                    State schema persisted in database while awaiting user replies across the 24-hour Meta service window.
                  </p>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-xl border border-stone-200 text-stone-500 text-xs">
                  No WhatsApp sessions stored yet. Trigger outreach from the Phone Simulator tab.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sessions.map((sess) => {
                    const isCurrent = activeSession?.sessionId === sess.sessionId;
                    return (
                      <div
                        key={sess.sessionId}
                        onClick={() => {
                          setSelectedSessionId(sess.sessionId);
                          setActiveSubTab('simulator');
                        }}
                        className={`p-4 rounded-xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md ${
                          isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-stone-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-xs text-stone-900">{sess.eventTitle}</div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              {sess.eventDate} • To: {sess.phoneNumber}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            sess.status === 'CONFIRMED_SYNCED' ? 'bg-emerald-100 text-emerald-800' :
                            sess.status === 'MILESTONES_PENDING_CONFIRMATION' ? 'bg-blue-100 text-blue-800' :
                            sess.status === 'OUTREACH_SENT' ? 'bg-amber-100 text-amber-800' :
                            'bg-stone-100 text-stone-700'
                          }`}>
                            {sess.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="mt-3 text-xs text-stone-600 line-clamp-2">
                          Latest transcript: {sess.messagesTranscript[sess.messagesTranscript.length - 1]?.text || 'No messages'}
                        </div>

                        <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
                          <span>Updated {new Date(sess.lastInteractionAt).toLocaleTimeString()}</span>
                          <span className="text-emerald-700 font-medium">Open in Simulator &rarr;</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: WEBHOOK & META SPECS */}
          {activeSubTab === 'docs' && (
            <div className="space-y-6">
              {/* Webhook Configuration Section */}
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Meta WhatsApp Cloud API Webhook Listener
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Configure this endpoint in your Meta App Dashboard under <strong>WhatsApp &gt; Configuration</strong>:
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Callback URL (Live & Verified)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="flex-1 text-xs font-mono bg-stone-50 border border-stone-300 rounded-lg p-2.5 text-stone-800"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                        className="py-2.5 px-3.5 bg-stone-900 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedWebhook ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Verify Token (<code className="font-mono text-emerald-700">hub.verify_token</code>)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={verifyToken}
                        className="flex-1 text-xs font-mono bg-stone-50 border border-stone-300 rounded-lg p-2.5 text-stone-800"
                      />
                      <button
                        onClick={() => copyToClipboard(verifyToken, 'token')}
                        className="py-2.5 px-3.5 bg-stone-900 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedToken ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Outbound Proactive Template Spec */}
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-3">
                <h4 className="text-sm font-semibold text-stone-900">
                  Deliverable 1: Outbound Proactive Utility Template Spec
                </h4>
                <p className="text-xs text-stone-600">
                  Meta-approved Utility Template (<code className="font-mono text-emerald-700">ahead_of_time_event_alert</code>) bypassing the 24-hour conversational window:
                </p>
                <div className="p-3.5 bg-stone-900 text-emerald-400 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed">
{`"Hi {{1}}! AheadOfTime spotted a new event on your calendar: *{{2}}* on *{{3}}*.
To build your custom runway (bookings, packing, gifts), what are the key details or extra plans for this?"

Buttons:
[ "Add Details" ]   -> payload: "BTN_ADD_DETAILS:<eventId>"
[ "Track As-Is" ]   -> payload: "BTN_TRACK_AS_IS:<eventId>"
[ "Ignore" ]        -> payload: "BTN_IGNORE:<eventId>"`}
                </div>
              </div>

              {/* Event Context Schema */}
              <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm space-y-3">
                <h4 className="text-sm font-semibold text-stone-900">
                  Deliverable 3: Database Event-Context State Schema
                </h4>
                <p className="text-xs text-stone-600">
                  Stored in database/session store while waiting for user response:
                </p>
                <div className="p-3.5 bg-stone-900 text-stone-300 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed">
{`interface WhatsAppEventSessionState {
  sessionId: string;                      // "wa-sess-<phone>-<eventId>"
  phoneNumber: string;                    // E.164 phone
  userFirstName: string;                  // {{1}}
  eventId: string;                        // AheadOfTime event ID
  eventTitle: string;                     // {{2}}
  eventDate: string;                      // YYYY-MM-DD ({{3}})
  status: WhatsAppSessionStatus;          // OUTREACH_SENT | WAITING_FOR_DETAILS | ...
  createdAt: string;                      // ISO timestamp
  sessionExpiresAt: string;               // ISO timestamp (createdAt + 24 hours)
  messagesTranscript: Array<{
    sender: 'user' | 'bot';
    text: string;
    timestamp: string;
  }>;
  gatheredContext: {
    partySize?: number;
    destination?: string;
    subActivities?: string[];
    diningPlan?: string;
  };
  generatedMilestones?: TMinusMilestone[];
}`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
