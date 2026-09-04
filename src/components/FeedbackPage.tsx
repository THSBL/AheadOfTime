import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { MessageSquare, Send, CheckCircle2, ArrowLeft } from 'lucide-react';

export const FeedbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [category, setCategory] = useState<'bug' | 'feature' | 'ux' | 'other'>('bug');
  const [feedbackText, setFeedbackText] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    // Store feedback in local storage for demo persistence
    const existing = JSON.parse(localStorage.getItem('aot_user_feedback') || '[]');
    const newEntry = {
      id: `fb-${Date.now()}`,
      category,
      feedbackText,
      email,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    };
    localStorage.setItem('aot_user_feedback', JSON.stringify([newEntry, ...existing]));

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <Logo variant="dark" size="sm" />
          <div className="w-16" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full flex flex-col justify-center">
        {submitted ? (
          <div className="bg-slate-800/80 border border-emerald-500/40 rounded-3xl p-8 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-white">Thank you for your feedback!</h2>
            <p className="text-slate-400 text-sm">
              Your notes help us continuously refine Ahead Of Time's lead-time calculation rules and calendar synchronization.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <button
                onClick={() => setSubmitted(false)}
                className="text-xs text-slate-300 hover:text-white underline px-3 py-2"
              >
                Submit another response
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs tracking-wide uppercase">
                <MessageSquare className="w-4 h-4" />
                Beta Tester Feedback
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Help us improve Ahead Of Time</h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Report bugs, request timing categories, or share your thoughts on our milestone lead times.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Feedback Category</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'bug', label: '🐛 Bug Report' },
                    { id: 'feature', label: '💡 Feature Request' },
                    { id: 'ux', label: '🎨 UX / Design' },
                    { id: 'other', label: '💬 General' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCategory(item.id as any)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                        category === item.id
                          ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                          : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Your Message</label>
                <textarea
                  rows={4}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe what happened or what feature you'd love to see..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3 rounded-xl transition text-xs sm:text-sm shadow-md flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit Feedback
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
};
