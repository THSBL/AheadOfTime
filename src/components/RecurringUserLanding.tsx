import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ListChecks, MapPin, ChevronRight, Loader2, RefreshCw, LogIn } from 'lucide-react';
import { Logo } from './Logo';
import { getCurrentUser, loadUserEvents, setCurrentUser as setGlobalCurrentUser, AuthUser } from '../services/accountManager';
import {
  getStoredAccessToken,
  isTokenExpired,
  setStoredAccessToken,
  requestGoogleCalendarToken,
  DEFAULT_CLIENT_ID,
} from '../services/googleAuth';
import { fetchPrimaryCalendarProfile, GoogleCalendarProfile } from '../services/googleCalendar';
import { computeStripeOneStatus, computeStripeTwoCopy, StripeOneLevel } from '../utils/recurringLandingCopy';
import { ROAD_STRIPE_SHAPES } from '../utils/roadStripeShape';
import { useRoad3DClipPath, ROAD_3D_BEVEL_STYLE } from '../utils/useRoad3DClipPath';
import { usePageMeta, DEFAULT_TITLE, DEFAULT_DESCRIPTION } from '../utils/usePageMeta';

// ---------------------------------------------------------------------------
// Show cadence
// ---------------------------------------------------------------------------
// The full ~2.5s intro plays at most once per browser SESSION (i.e. once per
// tab) - replaying it on every single in-app navigation back to "/" would
// get old fast, but a fresh tab/reload is exactly when a "welcome back"
// moment should still land. Uses sessionStorage rather than localStorage on
// purpose: a same-day-but-new-tab visit (or a dev testing the page
// repeatedly across reloads in a fresh tab) still sees the intro, instead of
// it staying silently suppressed for the rest of the calendar day. To change
// this cadence later, this is the one spot to touch:
//   - once per calendar day instead: swap sessionStorage for localStorage
//     and compare against today's date, as this used to work.
//   - always replay: delete this whole block and always start at 'stripes'.
const LAST_SHOWN_KEY = 'aot_intro_shown_this_session';

function shouldSkipIntroToday(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(LAST_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroShownToday(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(LAST_SHOWN_KEY, '1');
  } catch {
    // Non-fatal - worst case the intro replays next load.
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// Intro phases - simpler than the earlier hand-drawn-SVG badge version,
// which needed intermediate beats ('calendar', 'squares', 'pin') to drive
// its own sequential draw-in. The hero is now a real rendered image (see
// the img below) with just one fade/scale entrance, so the only phases
// anything still reads are 'settle' (stripes start expanding) and 'done'
// (stripes become clickable).
const INTRO_PHASES = ['stripes', 'settle', 'done'] as const;
type IntroPhase = (typeof INTRO_PHASES)[number];

// Cumulative timeline (ms) for each beat. Stripe draw-in itself
// (~250/200/250ms, accelerating) is handled inside StripeButton via CSS
// transition-delay, not here.
const PHASE_SCHEDULE: Array<{ phase: IntroPhase; at: number }> = [
  { phase: 'settle', at: 700 },
  { phase: 'done', at: 1050 },
];

// How long the "selected" navigation transition holds on screen before the
// route actually changes - long enough to read as a deliberate transition,
// short enough not to feel like a delay.
const SELECT_TRANSITION_MS = 260;

const STRIPE_ONE_STYLES: Record<StripeOneLevel, { bg: string; border: string; text: string; dot: string }> = {
  // Reuses this app's existing overdue/urgent/on-track conventions
  // (EventTimelineRadar.tsx, MyWeekAhead.tsx) instead of a fresh palette -
  // emerald is remapped to the app's mint/forest green in index.css's
  // @theme block, so "sage green" here IS the same mint used everywhere else.
  overdue: { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-900', dot: 'bg-rose-500' },
  due_soon: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900', dot: 'bg-amber-500' },
  clear: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900', dot: 'bg-emerald-500' },
};

// sessionStorage flag for "open on Timeline & Tasks" - App.tsx's activeTab
// has no URL representation of its own, so this follows the exact same
// "set a flag before navigating, consume it once on mount" convention as
// aot_open_scan_modal (see OnboardingPage.tsx / App.tsx's scan-trigger
// effect) rather than inventing a new mechanism.
const OPEN_TAB_KEY = 'aot_open_tab';

export const RecurringUserLanding: React.FC = () => {
  usePageMeta(DEFAULT_TITLE, DEFAULT_DESCRIPTION);
  const navigate = useNavigate();

  const [reducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const [skipIntro] = useState<boolean>(() => shouldSkipIntroToday());
  const [phase, setPhase] = useState<IntroPhase>(() => (skipIntro || prefersReducedMotion() ? 'done' : 'stripes'));
  // Drives the CSS-transition "draw in" on the three stripes - starts false
  // so the first committed frame is the "undrawn" state, then flips true a
  // tick later so the browser actually has something to transition FROM.
  const [mounted, setMounted] = useState<boolean>(() => skipIntro || prefersReducedMotion());
  const [fadeIn, setFadeIn] = useState<boolean>(() => !(skipIntro || prefersReducedMotion()));
  // Which stripe (if any) the user just activated - drives the "smooth
  // transition when selecting one of the 3 elements" beat: the chosen
  // stripe scales up slightly and the other two fade back, then the route
  // actually changes once that reads on screen instead of jump-cutting.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const referenceDateISO = useMemo(() => new Date().toISOString(), []);

  const events = useMemo(() => {
    const user = getCurrentUser();
    if (!user?.id) return [];
    return loadUserEvents(user.id);
  }, []);

  const stripeOne = useMemo(() => computeStripeOneStatus(events, referenceDateISO), [events, referenceDateISO]);
  const stripeTwoCopy = useMemo(() => computeStripeTwoCopy(events, referenceDateISO), [events, referenceDateISO]);

  // Kick off the mount transition + (unless skipped) the phase timeline.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    if (fadeIn) {
      const fadeTimer = window.setTimeout(() => setFadeIn(false), 20);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(fadeTimer);
      };
    }
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipIntro || reducedMotion) return;
    const timers = PHASE_SCHEDULE.map(({ phase: p, at }) => window.setTimeout(() => setPhase(p), at));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark this session as "shown" once the intro actually plays through.
  useEffect(() => {
    if (skipIntro || reducedMotion) return;
    if (phase === 'done') {
      markIntroShownToday();
    }
  }, [phase, skipIntro, reducedMotion]);

  const isSettled = phase === 'settle' || phase === 'done';
  const isInteractive = phase === 'done' && selectedIndex === null;

  const navigateAfterSelect = (index: number, go: () => void) => {
    if (!isInteractive) return;
    if (reducedMotion) {
      go();
      return;
    }
    setSelectedIndex(index);
    window.setTimeout(go, SELECT_TRANSITION_MS);
  };

  const goToWeekAhead = () => navigateAfterSelect(0, () => navigate('/dashboard'));

  const goToTimelineAndTasks = () =>
    navigateAfterSelect(1, () => {
      try {
        sessionStorage.setItem(OPEN_TAB_KEY, 'tasks');
      } catch {
        // Falls back to the default tab (My Week Ahead) - still lands in the app.
      }
      navigate('/dashboard');
    });

  const goToNewEvent = () =>
    navigateAfterSelect(2, () => {
      // Lands on the Create New Event tab (freeform input + presets), not
      // /events/new's ManualEventModal wizard - that modal is what the
      // header's own "+" button opens for a quick guided add, but "Plan
      // Something New" here is meant to match MyWeekAhead's own "Plan
      // something new" ghost button, which already opens this same tab.
      try {
        sessionStorage.setItem(OPEN_TAB_KEY, 'chat');
      } catch {
        // Falls back to the default tab (My Week Ahead) - still lands in the app.
      }
      navigate('/dashboard');
    });

  const stripeOneStyle = STRIPE_ONE_STYLES[stripeOne.level];

  return (
    <div
      className={`relative z-10 min-h-screen w-full bg-[#182A42] flex flex-col items-center font-sans text-slate-900 selection:bg-[#182A42] selection:text-white transition-opacity duration-300 ${
        fadeIn ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Slim top bar - just the wordmark, no marketing chrome, since a
          recurring user shouldn't be re-pitched the product every visit. */}
      <div className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-6xl mx-auto w-full flex items-center p-4 sm:p-6 lg:px-10">
          <Logo variant="small" />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-14">
        <h1 className="text-center text-white/90 text-sm sm:text-base font-semibold tracking-wide px-4">
          Welcome back. Here's the road ahead.
        </h1>

        {/* One continuous "shield" - the badge and the three stripes used to
            be a small icon floating above a separate stack of cards; a
            single glass panel now holds both, narrow at the top (matching
            the badge) and flaring out to the stripes' own full width below,
            so the whole thing reads as one flowing shape instead of
            disconnected pieces. The panel is an SVG path in a 0-100 x 0-100
            viewBox with preserveAspectRatio="none": it always stretches to
            fill whatever height the real content needs (the stripe copy can
            wrap to 2 lines at some widths), so the flare's proportions stay
            correct without needing to know that height up front. */}
        <div className="relative mt-6 w-full max-w-xl">
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{
              // A 70px-offset shadow layer used to live here to make the
              // flare's diagonal shoulders "trail" a shadow further down
              // the page - in practice it did the opposite of "follow the
              // shape": shifted 70px down, its copy of the (narrow) top
              // read as a wide, disconnected halo bulging past the
              // shoulders, while its copy of the (wide) bottom landed well
              // past the panel's own bottom edge, leaving the actual
              // bottom corners with barely any shadow at all. Replaced
              // with a tight edge shadow plus one moderate-offset shadow
              // that stays visually attached to the silhouette at both the
              // narrow top and the wide bottom corners, plus the same
              // faint mint-tinted glow for warmth. All three follow the
              // SVG's actual rendered alpha shape, not a bounding box.
              filter:
                'drop-shadow(0 4px 8px rgba(0,0,0,0.4)) drop-shadow(0 20px 28px rgba(0,0,0,0.38)) drop-shadow(0 3px 16px rgba(161,200,186,0.2))',
            }}
          >
            <path
              d="M 33,0 L 67,0 Q 75,0 75,6 L 75,22 C 75,29 92,38 98,52 L 98,92 Q 98,100 89,100 L 11,100 Q 2,100 2,92 L 2,52 C 8,38 25,29 25,22 L 25,6 Q 25,0 33,0 Z"
              fill="rgba(255,255,255,0.035)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="relative flex flex-col items-center pt-6 pb-7 px-4 sm:px-6">
            {/* The hero mark - a real rendered image (public/assets/road-ahead-hero.png)
                instead of a hand-drawn SVG recreation, which could never
                match this look. It stays on screen after the intro finishes
                (it never needs to disappear - "the animation IS the loading
                of the nav", not a splash bolted in front of it) and just
                fades/scales in on mount rather than the old sequential
                draw-in, since there's no longer a separate outline/grid/pin
                to animate piece by piece. */}
            <img
              src="/assets/road-ahead-hero.png"
              alt="Ahead Of Time"
              className={`w-32 h-32 sm:w-44 sm:h-44 object-contain transition-[opacity,transform] duration-500 ease-out hover:scale-110 ${
                mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
              }`}
              style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.3))' }}
            />

            {/* The three road stripes - decorative during the intro, real
                clickable navigation once settled. Each stripe's outer
                margin (12% / 6% / 0%, i.e. 76% / 88% / 100% wide) and its
                own clip-path top-taper (see ROAD_STRIPE_SHAPES) are chosen
                together so bottom-of-stripe-N lines up exactly with
                top-of-stripe-(N+1) - a continuous telescoping cascade
                rather than 3 independently-tapered boxes that only
                approximately lined up. If either a margin or a
                topInsetRatio changes, the other stripe's matching edge has
                to be recomputed too, or the seam breaks again. */}
            <nav
              aria-label="Quick navigation"
              className="mt-8 sm:mt-10 w-full flex flex-col gap-2 sm:gap-3"
            >
              <StripeButton
            index={0}
            marginClassName="mx-[12%]"
            shapeIndex={0}
            colorClassName={`${stripeOneStyle.bg} ${stripeOneStyle.border}`}
            barColorClassName={stripeOneStyle.dot}
            mounted={mounted}
            isSettled={isSettled}
            isInteractive={isInteractive}
            isSelected={selectedIndex === 0}
            isDimmed={selectedIndex !== null && selectedIndex !== 0}
            drawDuration={250}
            drawDelay={0}
            buildDelay={0}
            onClick={goToWeekAhead}
            icon={<CalendarClock className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 ${stripeOneStyle.text}`} />}
            eyebrow="THIS WEEK"
            eyebrowClassName={stripeOneStyle.text}
            content={stripeOne.copy}
            contentClassName={stripeOneStyle.text}
            ariaLabel={`This week: ${stripeOne.copy}. Go to My Week Ahead.`}
          />

          <StripeButton
            index={1}
            marginClassName="mx-[6%]"
            shapeIndex={1}
            colorClassName="bg-white border-slate-200"
            barColorClassName="bg-[#447463]"
            mounted={mounted}
            isSettled={isSettled}
            isInteractive={isInteractive}
            isSelected={selectedIndex === 1}
            isDimmed={selectedIndex !== null && selectedIndex !== 1}
            drawDuration={200}
            drawDelay={250}
            buildDelay={90}
            onClick={goToTimelineAndTasks}
            icon={<ListChecks className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#447463]" />}
            eyebrow="NEXT 30 DAYS"
            eyebrowClassName="text-[#447463]"
            content={stripeTwoCopy}
            contentClassName="text-slate-800"
            ariaLabel={`Next 30 days: ${stripeTwoCopy}. Go to Timeline & Tasks.`}
          />

          <StripeButton
            index={2}
            marginClassName="mx-0"
            shapeIndex={2}
            colorClassName="bg-white border-[#EE9F2A]/40"
            barColorClassName="bg-[#EE9F2A]"
            mounted={mounted}
            isSettled={isSettled}
            isInteractive={isInteractive}
            isSelected={selectedIndex === 2}
            isDimmed={selectedIndex !== null && selectedIndex !== 2}
            drawDuration={250}
            drawDelay={450}
            buildDelay={180}
            onClick={goToNewEvent}
            icon={<MapPin className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-[#EE9F2A]" />}
            eyebrow="PLAN SOMETHING NEW"
            eyebrowClassName="text-[#EE9F2A]"
            content="Tell us what's coming up."
            contentClassName="text-slate-800"
            ariaLabel="Plan something new. Tell us what's coming up."
          />
            </nav>
          </div>
        </div>

        <CalendarConnectionFooter />
      </div>
    </div>
  );
};

/**
 * Small, deliberately quiet status row under the stripes - "just available
 * and not too visible": connected users see which account is syncing plus a
 * tiny Sync action, unconnected users get a plain Sign in link. Mirrors
 * GoogleCalendarIntegrationCard's own connect/re-sync calls exactly (same
 * token storage, same profile cache) rather than inventing a second way to
 * authenticate - this is just a minimal, muted presentation of the same
 * state that card shows in Settings.
 */
const CalendarConnectionFooter: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());
  const [profile, setProfile] = useState<GoogleCalendarProfile | null>(() => {
    try {
      const saved = sessionStorage.getItem('gcal_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isConnected = Boolean(accessToken && !isTokenExpired());

  useEffect(() => {
    if (!isConnected || profile) return;
    fetchPrimaryCalendarProfile(accessToken as string)
      .then((p) => {
        setProfile(p);
        sessionStorage.setItem('gcal_profile', JSON.stringify(p));
      })
      .catch(() => {
        // Quiet by design - this footer never shows an error state, the
        // full Google Calendar card in Settings is where that belongs.
      });
  }, [isConnected, profile, accessToken]);

  const handleSignIn = async () => {
    setIsBusy(true);
    setNotice(null);
    try {
      const tokenRes = await requestGoogleCalendarToken(DEFAULT_CLIENT_ID);
      setStoredAccessToken(tokenRes.accessToken, tokenRes.expiresIn);
      setAccessToken(tokenRes.accessToken);

      const nextProfile = await fetchPrimaryCalendarProfile(tokenRes.accessToken);
      setProfile(nextProfile);
      sessionStorage.setItem('gcal_profile', JSON.stringify(nextProfile));

      if (nextProfile?.id) {
        const userEmail = nextProfile.id.toLowerCase().trim();
        const user: AuthUser = {
          id: userEmail,
          email: userEmail,
          name: nextProfile.summary || nextProfile.id,
          timeZone: nextProfile.timeZone,
          provider: 'google',
          connectedAt: new Date().toISOString(),
        };
        setGlobalCurrentUser(user);
      }
    } catch {
      setNotice('Sign-in was cancelled.');
      window.setTimeout(() => setNotice(null), 3000);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSync = async () => {
    if (!accessToken) return;
    setIsBusy(true);
    setNotice(null);
    try {
      const nextProfile = await fetchPrimaryCalendarProfile(accessToken);
      setProfile(nextProfile);
      sessionStorage.setItem('gcal_profile', JSON.stringify(nextProfile));
      setNotice('Synced');
      window.setTimeout(() => setNotice(null), 2000);
    } catch {
      setNotice('Sync failed - try again from Settings.');
      window.setTimeout(() => setNotice(null), 3000);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mt-6 sm:mt-8 flex items-center justify-center">
      {isConnected ? (
        <div className="flex items-center gap-2 text-[11px] sm:text-xs text-white/45">
          <span className="truncate max-w-[12rem] sm:max-w-xs">
            {notice || `Synced with ${profile?.id || profile?.summary || 'Google Calendar'}`}
          </span>
          <span className="text-white/20">·</span>
          <button
            type="button"
            onClick={handleSync}
            disabled={isBusy}
            className="inline-flex items-center gap-1 text-white/45 hover:text-white/80 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSignIn}
          disabled={isBusy}
          className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs text-white/45 hover:text-white/80 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
          {notice || (isBusy ? 'Signing in...' : 'Sign in to sync your calendar')}
        </button>
      )}
    </div>
  );
};

interface StripeButtonProps {
  index: number;
  marginClassName: string;
  shapeIndex: number;
  colorClassName: string;
  barColorClassName: string;
  mounted: boolean;
  isSettled: boolean;
  isInteractive: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  drawDuration: number;
  drawDelay: number;
  buildDelay: number;
  onClick: () => void;
  icon: React.ReactNode;
  eyebrow: string;
  eyebrowClassName: string;
  content: string;
  contentClassName: string;
  ariaLabel: string;
}

const StripeButton: React.FC<StripeButtonProps> = ({
  marginClassName,
  shapeIndex,
  colorClassName,
  barColorClassName,
  mounted,
  isSettled,
  isInteractive,
  isSelected,
  isDimmed,
  drawDuration,
  drawDelay,
  buildDelay,
  onClick,
  icon,
  eyebrow,
  eyebrowClassName,
  content,
  contentClassName,
  ariaLabel,
}) => {
  // Measured in real px (not a percentage-based CSS clip-path) so the
  // trapezoid can have rounded, gently-bowed edges that stay correct at any
  // button width instead of a fixed set of breakpoint values - see
  // roadStripeShape.ts for why a static polygon() couldn't do this. Shared
  // with MyWeekAhead's status banner via useRoad3DClipPath, rather than
  // each place re-implementing its own ResizeObserver wiring.
  const { ref: buttonRef, clipPath } = useRoad3DClipPath<HTMLButtonElement>(ROAD_STRIPE_SHAPES[shapeIndex]);

  return (
    <div
      className={`${marginClassName} transition-[opacity,transform] duration-300 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{
        transitionDelay: `${buildDelay}ms`,
        // filter lives on this wrapper, not the clipped button itself, so
        // overflow-hidden on the button can never interfere with the shadow
        // rendering outside its box. drop-shadow (not box-shadow) is
        // required here because it follows the button's actual clipped
        // silhouette instead of its rectangular border-box. Kept small/tight
        // relative to the shared panel's own shadow (see the panel <svg>'s
        // filter) - this is just enough to lift the button off the panel,
        // not a second competing shadow of its own.
        filter: 'drop-shadow(0 4px 7px rgba(0,0,0,0.28))',
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={isInteractive ? onClick : undefined}
        aria-disabled={!isInteractive}
        tabIndex={isInteractive ? 0 : -1}
        aria-label={ariaLabel}
        style={{ clipPath, ...ROAD_3D_BEVEL_STYLE }}
        className={[
          'relative w-full border text-left overflow-hidden',
          'transition-[colors,transform,opacity] duration-300 ease-out',
          isInteractive ? 'cursor-pointer hover:scale-[1.015] hover:brightness-[0.97] active:scale-[0.99]' : 'cursor-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          isSelected ? 'scale-[1.02] shadow-lg' : '',
          isDimmed ? 'opacity-40 scale-[0.98]' : '',
          colorClassName,
        ].join(' ')}
      >
        {/* Decorative "road stripe" - visible pre-settle, fades out once the
            real content below expands. Draw-in uses a plain CSS transition
            (scaleX from the left edge) rather than Framer Motion - simpler
            and just as effective for a one-shot reveal; Motion is reserved
            for the calendar/squares/pin choreography in RoadAheadHero. */}
        <div
          aria-hidden
          className={`h-2.5 sm:h-3 w-full ${barColorClassName} transition-[transform,opacity] ease-out ${
            isSettled ? 'opacity-0' : mounted ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
          }`}
          style={{
            transformOrigin: 'left center',
            transitionDuration: `${drawDuration}ms`,
            transitionDelay: `${drawDelay}ms`,
          }}
        />

        {/* Real nav content - collapsed to 0 height pre-settle via the
            grid-template-rows trick (animates smoothly to "auto" height
            without needing to measure it in JS), then expands + fades in. */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            isSettled ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <div
              className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 transition-opacity duration-300 ${
                isSettled ? 'opacity-100 delay-150' : 'opacity-0'
              }`}
            >
              <div className="shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/70 border border-black/5 flex items-center justify-center">
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] sm:text-xs font-bold uppercase tracking-wide ${eyebrowClassName}`}>
                  {eyebrow}
                </div>
                {/* No truncate - on a narrow phone, this stripe's own
                    inward margin (part of the telescoping-cascade taper
                    tuned for desktop widths) leaves little enough room
                    that real copy ("Nothing tracked yet") was clipping to
                    "Nothing tracke...". Wrapping to a second line instead
                    keeps every word readable; the grid-rows animation
                    above already sizes to whatever height the content
                    actually needs, wrapped or not. */}
                <div className={`text-sm sm:text-base font-bold leading-snug ${contentClassName}`}>{content}</div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 text-slate-400" />
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};
