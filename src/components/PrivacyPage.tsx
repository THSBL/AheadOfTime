import React, { useEffect } from 'react';
import { 
  ShieldCheck, 
  Calendar, 
  Lock, 
  Database, 
  Trash2, 
  Eye, 
  ExternalLink, 
  CheckCircle2, 
  ArrowLeft, 
  Mail, 
  FileText,
  Clock,
  Sparkles
} from 'lucide-react';
import { Logo } from './Logo';

interface PrivacyPageProps {
  onNavigateHome?: () => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigateHome }) => {
  useEffect(() => {
    // Update document title for SEO & OAuth compliance
    document.title = 'Privacy Policy & Google API Data Disclosure - Ahead Of Time';
    window.scrollTo(0, 0);
  }, []);

  const handleGoHome = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div 
            onClick={handleGoHome}
            className="cursor-pointer flex items-center gap-2 group"
            title="Ahead Of Time Home"
          >
            <Logo variant="small" />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGoHome}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-full transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-10">
        
        {/* Title & Badge */}
        <div className="space-y-4 text-center sm:text-left border-b border-slate-200 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <span>Official Privacy &amp; Data Policy</span>
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            Privacy Policy &amp; Google API Disclosure
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Last updated: September 4, 2026
            </span>
            <span>&bull;</span>
            <span>App: Ahead Of Time (https://aheadoftime.app)</span>
            <span>&bull;</span>
            <span>Applies to Web, Google OAuth, &amp; Calendar Integrations</span>
          </div>
        </div>

        {/* Executive Summary Box */}
        <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-3xl p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2.5 text-emerald-950 font-black text-base sm:text-lg">
            <Sparkles className="w-5 h-5 text-emerald-700 shrink-0" />
            <h2>Our Privacy Principles in Plain English</h2>
          </div>
          <p className="text-xs sm:text-sm text-emerald-900/90 leading-relaxed font-medium">
            Ahead Of Time exists to eliminate the scramble before important calendar events. 
            We do <strong>not</strong> sell your data, do <strong>not</strong> advertise to you, 
            do <strong>not</strong> inspect your personal communications, and do <strong>not</strong> use your calendar data to train public foundation models. 
            Your calendar data is processed purely to calculate preparation milestones and breathing room for your schedule.
          </p>
        </div>

        {/* Detailed Policy Sections */}
        <div className="space-y-10 text-sm text-slate-700 leading-relaxed">
          
          {/* Section 1: Overview */}
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">1</span>
              <span>Overview &amp; Scope</span>
            </h3>
            <p>
              This Privacy Policy explains how <strong>Ahead Of Time</strong> (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the Service&rdquo;), available at 
              <a href="https://aheadoftime.app" className="text-sky-700 hover:underline font-semibold ml-1">https://aheadoftime.app</a>, 
              collects, processes, stores, and protects information when you use our web application, onboarding engine, 
              and Google Calendar / Google Tasks integration.
            </p>
          </section>

          {/* Section 2: Google OAuth & Limited Use Policy (Crucial for Verification) */}
          <section className="space-y-6 bg-white border border-sky-200 rounded-3xl p-6 sm:p-8 shadow-xs">
            <div className="flex items-center gap-3 text-sky-950 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-2xl bg-sky-100 text-sky-800">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  2. Google User Data Access &amp; Limited Use Disclosure
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Detailed breakdown of every requested Google OAuth 2.0 API scope and functional justification
                </p>
              </div>
            </div>
            
            <p className="text-slate-700">
              Ahead Of Time allows users to connect their Google Account via Google Identity Services (GIS) / OAuth 2.0. 
              Ahead Of Time requests these scopes to scan upcoming schedule entries and insert backward-planned preparation milestones:
            </p>

            {/* Non-Sensitive Scopes Group */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider">
                  Non-Sensitive Scope
                </span>
                <span className="text-xs text-slate-500 font-medium">User Identity</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {/* userinfo.email */}
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs font-mono font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/80 break-all">
                      https://www.googleapis.com/auth/userinfo.email
                    </code>
                    <span className="text-[11px] font-semibold text-slate-500">Authentication</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    View user&rsquo;s primary Google account email address to authenticate identity, verify active connection status, and manage their Ahead Of Time session.
                  </p>
                </div>
              </div>
            </div>

            {/* Sensitive Scopes Group */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold uppercase tracking-wider">
                  Sensitive Scopes (Google Verification)
                </span>
                <span className="text-xs text-slate-500 font-medium">Calendar Metadata, Event Management &amp; Google Tasks Sync</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* calendar.readonly */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs font-mono font-bold text-sky-900 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200/80 break-all">
                      .../auth/calendar.readonly
                    </code>
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">See &amp; download calendar data</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    Used during initial account onboarding and daily scans to read the user&rsquo;s primary calendar metadata without altering existing entries, identifying events that require lead time (e.g., trips, parties, school theme days).
                  </p>
                </div>

                {/* calendar.events */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs font-mono font-bold text-sky-900 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200/80 break-all">
                      .../auth/calendar.events
                    </code>
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">View &amp; edit calendar events</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    Necessary to read full event details and directly write calculated T-minus preparation milestones (such as booking reservations, buying gifts, or packing reminders) onto the user&rsquo;s calendar schedule with appropriate lead time.
                  </p>
                </div>

                {/* tasks */}
                <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-xs font-mono font-bold text-sky-900 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200/80 break-all">
                      .../auth/tasks
                    </code>
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">Create, edit &amp; manage tasks</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                    Required to synchronize and manage preparation checklists directly in Google Tasks for users who prefer actionable to-do items alongside or instead of direct calendar time blocks.
                  </p>
                </div>
              </div>
            </div>

            {/* Mandatory Verbatim Limited Use Statement */}
            <div className="p-5 bg-sky-50/90 border border-sky-200 rounded-2xl space-y-2.5">
              <h4 className="font-bold text-xs uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-700" />
                <span>Google API Services User Data Policy Compliance</span>
              </h4>
              <p className="text-xs sm:text-sm text-sky-950 font-medium leading-relaxed">
                Ahead Of Time&rsquo;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                <a 
                  href="https://developers.google.com/terms/api-services-user-data-policy" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="underline font-bold text-sky-900 hover:text-sky-950 inline-flex items-center gap-1"
                >
                  Google API Services User Data Policy <ExternalLink className="w-3.5 h-3.5 inline" />
                </a>
                , including the Limited Use requirements.
              </p>
            </div>

            {/* Explicit AI / ML Model Training Prohibition */}
            <div className="p-5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-amber-700" />
                <span>Explicit Prohibition on AI &amp; Machine Learning Model Training</span>
              </h4>
              <p className="text-xs sm:text-sm text-amber-950 font-medium leading-relaxed">
                Ahead Of Time does <strong>NOT</strong> use Google Workspace APIs or any user data retrieved from Google APIs to train, retrain, fine-tune, or develop generalized artificial intelligence (AI) or machine learning (ML) foundation models. All data processing is strictly deterministic and localized to your specific preparation timeline calculations.
              </p>
            </div>
          </section>

          {/* Section 3: How We Use the Data */}
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">3</span>
              <span>How We Use Your Information</span>
            </h3>
            <p>
              We process your data exclusively to deliver the functionality of the Ahead Of Time application:
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <li className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-xs leading-snug">
                  <strong>Backward Milestone Computation:</strong> Calculating lead times for reservations, packing, tickets, and prep tasks.
                </span>
              </li>
              <li className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-xs leading-snug">
                  <strong>Demographic Calibration:</strong> Tailoring lead times based on user preferences (e.g. kids, mixed schedules).
                </span>
              </li>
              <li className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-xs leading-snug">
                  <strong>Calendar Synchronization:</strong> Pushing confirmed milestones and tasks directly to your connected Google accounts.
                </span>
              </li>
              <li className="p-3.5 rounded-2xl bg-white border border-slate-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-xs leading-snug">
                  <strong>Noise Suppression:</strong> Filtering out routine internal 1:1 meetings so you only see events that require preparation.
                </span>
              </li>
            </ul>
          </section>

          {/* Section 4: Storage, Security & Retention */}
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">4</span>
              <span>Data Storage, Security &amp; Retention</span>
            </h3>
            <div className="space-y-2">
              <p>
                Ahead Of Time is architected with a privacy-first, client-side approach:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 text-slate-600 text-xs sm:text-sm">
                <li><strong>No Central Database of User Calendars:</strong> We do not store copies of your full calendar database on persistent central servers.</li>
                <li><strong>Token Security:</strong> OAuth access tokens are held in short-lived client-side session storage on your device and are never written to permanent public storage.</li>
                <li><strong>Encryption in Transit:</strong> All communications between your browser, our API endpoints, and Google API servers are encrypted using modern Transport Layer Security (TLS/HTTPS).</li>
                <li><strong>Retention:</strong> Synced event plans are stored locally in your browser&rsquo;s LocalStorage so you can revisit them across sessions. Clearing browser data removes all local records instantly.</li>
              </ul>
            </div>
          </section>

          {/* Section 5: Data Commercialization, Advertising & AI Training Policy */}
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">5</span>
              <span>Data Commercialization, Advertising &amp; AI Training Policy</span>
            </h3>
            <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 text-slate-900 space-y-2.5">
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                In strict compliance with consumer privacy standards and the Google API Services User Data Policy:
              </p>
              <ul className="list-disc list-inside space-y-2 text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                <li>
                  <strong>No Sale of Google User Data:</strong> We <strong>NEVER</strong> sell, rent, trade, or transfer your Google Calendar or Google Tasks data to third-party data brokers, ad networks, or commercial aggregators.
                </li>
                <li>
                  <strong>Advertising &amp; Monetization Policy:</strong> To keep Ahead Of Time viable, the Service may display non-targeted, contextual advertisements or offer optional premium freemium subscription tiers. <strong>No Google Calendar or Task data is ever shared with or accessible to advertising providers</strong>, and Google user data is never used to serve targeted or retargeted advertisements.
                </li>
                <li>
                  <strong>Prohibition on AI Training:</strong> We <strong>NEVER</strong> use Google Workspace APIs or any data retrieved from Google APIs to train, retrain, fine-tune, or develop generalized artificial intelligence (AI) or machine learning (ML) models.
                </li>
                <li>
                  <strong>Human Inspection Restriction:</strong> We <strong>NEVER</strong> permit human employees or contractors to read your calendar events or task data, unless we have obtained your affirmative agreement for specific technical troubleshooting, security auditing, or to comply with applicable law.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 6: User Control & Revocation */}
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">6</span>
              <span>Your Rights: Erasure, Disconnection &amp; Revocation</span>
            </h3>
            <p>
              You maintain total authority over your data. You can exercise your rights at any time:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs sm:text-sm">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>In-App Disconnection &amp; Reset</span>
                </div>
                <p className="text-xs text-slate-600">
                  Clicking &ldquo;Disconnect&rdquo; in Google Calendar settings purges all stored tokens and cached event metadata from your browser immediately.
                </p>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs sm:text-sm">
                  <Lock className="w-4 h-4 text-sky-600" />
                  <span>Google Account Revocation</span>
                </div>
                <p className="text-xs text-slate-600">
                  You can revoke Ahead Of Time&rsquo;s access directly at any time via your 
                  <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="text-sky-700 underline font-semibold ml-1 inline-flex items-center gap-0.5">
                    Google Account Security Hub <ExternalLink className="w-3 h-3 inline" />
                  </a>.
                </p>
              </div>
            </div>
          </section>

          {/* Section 7: Contact Information */}
          <section className="space-y-3 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <Mail className="w-5 h-5 text-sky-600" />
              <span>7. Contact &amp; Privacy Officer</span>
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              If you have any questions, concerns, or requests regarding this Privacy Policy or how your calendar data is processed, please contact our team:
            </p>
            <div className="pt-2 text-xs sm:text-sm text-slate-900 font-medium space-y-1">
              <p><strong>Ahead Of Time Application Support</strong></p>
              <p>Website: <a href="https://aheadoftime.app" className="text-sky-700 underline">https://aheadoftime.app</a></p>
              <p>Direct Inquiries &amp; Support: <a href="mailto:bl.thomas.uk@gmail.com" className="text-sky-700 underline font-semibold">bl.thomas.uk@gmail.com</a></p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Logo variant="small" />
            <span>&copy; {new Date().getFullYear()} Ahead Of Time. All rights reserved.</span>
          </div>

          <button
            onClick={handleGoHome}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Return to Planner
          </button>
        </footer>

      </main>
    </div>
  );
};
