import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send, Star, MessageSquare, Loader2 } from 'lucide-react';
import { usePageMeta } from '../utils/usePageMeta';
import { getStoredAccessToken } from '../services/googleAuth';

interface Eligibility {
  csatEligible: boolean;
  lastCsatAt: string | null;
  nextEligibleAt: string | null;
}

const friendlyErrorMessage = (message: string | undefined): string =>
  message === 'Unauthorized' ? 'Please sign in with Google to submit feedback.' : (message || 'Something went wrong - please try again.');

const authHeaders = (): Record<string, string> => {
  const token = getStoredAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const FeedbackPage: React.FC = () => {
  const navigate = useNavigate();
  usePageMeta(
    'Feedback - Ahead Of Time',
    'Rate your experience or report an issue with Ahead Of Time, the reverse-planning calendar assistant.'
  );

  const [activeFlow, setActiveFlow] = useState<'csat' | 'general'>('csat');
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(true);

  const [csatScore, setCsatScore] = useState<number>(0);
  const [csatText, setCsatText] = useState('');
  const [generalText, setGeneralText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadEligibility = async () => {
      try {
        const res = await fetch('/api/feedback/eligibility', { headers: authHeaders() });
        const data = await res.json();
        if (data.ok) {
          setEligibility(data);
          setActiveFlow(data.csatEligible ? 'csat' : 'general');
        } else if (res.status === 401) {
          setIsSignedIn(false);
          setActiveFlow('general');
        }
      } catch (err) {
        console.warn('Feedback eligibility check notice:', err);
      } finally {
        setIsLoadingEligibility(false);
      }
    };
    loadEligibility();
  }, []);

  const handleSubmitCsat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (csatScore < 1) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ responseType: 'csat', score: csatScore, feedbackText: csatText.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to submit.');
      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err?.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generalText.trim()) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ responseType: 'general_feedback', feedbackText: generalText.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to submit.');
      setSubmitted(true);
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err?.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-xl transition font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 sm:py-10 w-full space-y-6">
        <div className="space-y-1.5 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Feedback</h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg leading-relaxed">
            Rate your experience or tell us about a bug or feature idea, any time.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white border border-emerald-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Thank you!</h2>
            <p className="text-slate-500 text-sm">Your feedback helps us improve Ahead Of Time.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            {/* Flow tabs */}
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                onClick={() => setActiveFlow('csat')}
                className={`flex-1 px-4 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeFlow === 'csat' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                <span>Rate Your Experience</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFlow('general')}
                className={`flex-1 px-4 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeFlow === 'general' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Report Something</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {isLoadingEligibility ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : activeFlow === 'csat' ? (
                !isSignedIn ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 text-center">
                    Please sign in with Google to rate your experience.
                  </div>
                ) : !eligibility?.csatEligible ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 text-center">
                    You're all set for this month - thanks for your last rating!
                    {eligibility?.nextEligibleAt && (
                      <> Next check-in available {new Date(eligibility.nextEligibleAt).toLocaleDateString()}.</>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSubmitCsat} className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">How's Ahead of Time working for you?</label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setCsatScore(n)}
                            className="p-1 cursor-pointer"
                            title={`${n} of 5`}
                          >
                            <Star
                              className={`w-8 h-8 transition-colors ${
                                n <= csatScore ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Anything you'd add? (optional)</label>
                      <textarea
                        rows={3}
                        value={csatText}
                        onChange={(e) => setCsatText(e.target.value)}
                        placeholder="What's working, what isn't..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    {errorMessage && <p className="text-xs text-rose-600 font-semibold">{errorMessage}</p>}
                    <button
                      type="submit"
                      disabled={csatScore < 1 || isSubmitting}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>Submit Rating</span>
                    </button>
                  </form>
                )
              ) : (
                <form onSubmit={handleSubmitGeneral} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Report a bug, request a feature, or share a thought - any time
                    </label>
                    <textarea
                      rows={5}
                      value={generalText}
                      onChange={(e) => setGeneralText(e.target.value)}
                      placeholder="Describe what happened or what you'd love to see..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                      required
                    />
                  </div>
                  {errorMessage && <p className="text-xs text-rose-600 font-semibold">{errorMessage}</p>}
                  <button
                    type="submit"
                    disabled={!generalText.trim() || isSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Submit</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
