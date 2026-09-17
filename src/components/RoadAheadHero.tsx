import React from 'react';
import { motion } from 'motion/react';

/**
 * Ordered animation beats for the recurring-user landing intro. Each value
 * means "we have reached (or passed) this beat" - RoadAheadHero and the
 * road-stripe nav in RecurringUserLanding both read the same phase so the
 * calendar/pin animation and the stripe draw-in/settle stay in lockstep
 * without two separate timers drifting apart.
 */
export const INTRO_PHASES = ['stripes', 'calendar', 'squares', 'pin', 'settle', 'done'] as const;
export type IntroPhase = (typeof INTRO_PHASES)[number];

export function phaseAtLeast(phase: IntroPhase, target: IntroPhase): boolean {
  return INTRO_PHASES.indexOf(phase) >= INTRO_PHASES.indexOf(target);
}

const NAVY = '#182A42';
// Explicitly brighter/more saturated than the app-wide mint (#447463, still
// used everywhere else - stripe bars, icons) - the small grid squares here
// read as muted/low-contrast against the navy badge at icon size, so this
// mark gets its own, louder green rather than adjusting the shared token.
const MINT = '#a1c8ba';
const PIN_ORANGE = '#EE9F2A';

interface RoadAheadHeroProps {
  phase: IntroPhase;
  /**
   * Skip all motion and render the fully-formed badge instantly - true for
   * an actual prefers-reduced-motion user, but also passed by
   * RecurringUserLanding whenever the intro itself is being skipped (e.g.
   * a same-day reload starting straight at phase 'done'), since without
   * this Motion would still animate every element from its `initial` to
   * `animate` state over the normal durations on that first mount.
   */
  reducedMotion?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Calendar card geometry - kept as named constants (not magic numbers
// scattered through the JSX) because the grid, tabs and pin all have to
// line up against the SAME rect, and previous revisions of this file broke
// that alignment twice (grid squares poking out past the white outline's
// own inner edge; the pin overlapping grid squares) by tweaking one part's
// numbers without re-checking the others against it.
// A square card, not a rectangle - width and height MUST stay equal here,
// this was a real regression once already (a wider-than-tall calendar).
const CAL_X = 46;
const CAL_Y = 42;
const CAL_W = 108;
const CAL_H = 108;
const CAL_RX = 18;
const CAL_STROKE = 9;

// Full 3x3 grid, sized and positioned to stay strictly inside the calendar
// outline's own INNER edge - the outline is a 9px stroke centered on the
// rect boundary, so "inside the rect" isn't the same as "inside the visible
// white line". A previous revision's bottom row extended past the stroke's
// inner edge and rendered as green poking out from under the white border;
// this grid leaves a >=11px margin on every side of the (now square) interior.
const GRID_SQUARE = 20;
const GRID_SQUARES: Array<{ x: number; y: number }> = [
  { x: 62, y: 58 }, { x: 90, y: 58 }, { x: 118, y: 58 },
  { x: 62, y: 86 }, { x: 90, y: 86 }, { x: 118, y: 86 },
  { x: 62, y: 114 }, { x: 90, y: 114 }, { x: 118, y: 114 },
];

// Pin center/scale - placed BELOW the calendar card entirely (not
// overlapping its border or any grid square) with a clear gap on both
// sides, unlike the source PNG where the pin overlaps the bottom-right of
// the grid. That overlap reads fine at app-icon size; recreated bigger here
// it read as visual noise, so the pin gets its own clear space instead.
const PIN_CENTER_X = 100;
const PIN_CENTER_Y = 172;
const PIN_SCALE = 0.55;

/**
 * Recreation of the navy-badge calendar+pin mark from
 * public/assets/AheadOfTime_Small_logo.png as real, individually-animatable
 * SVG - the source PNG is flat, so its calendar/grid/pin can't be animated
 * directly. Colors are sampled from that PNG / reused from existing tokens
 * (navy #182A42 - already used elsewhere, e.g. Logo.tsx) except the grid's
 * mint and the pin's orange, which are deliberately punchier than their
 * source-logo/app-wide equivalents so they read clearly at icon size - see
 * the MINT/PIN_ORANGE comments above.
 *
 * The three road stripes themselves are NOT part of this badge - in the
 * source logo they sit below/outside the navy square, and here they double
 * as the real stripe-nav buttons, so RecurringUserLanding renders those
 * separately rather than nesting them in this SVG.
 */
export const RoadAheadHero: React.FC<RoadAheadHeroProps> = ({ phase, reducedMotion = false, className = '', style }) => {
  const reached = (target: IntroPhase) => reducedMotion || phaseAtLeast(phase, target);

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      style={style}
      role="img"
      aria-label="Ahead Of Time"
    >
      {/* Navy badge background - a faint light stroke gives the badge a
          readable edge even though the page behind it is the same navy
          (drop-shadow alone barely shows up on a same-color background). */}
      <rect x={0} y={0} width={200} height={200} rx={40} fill={NAVY} stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />

      {/* Binding-ring tabs - stop right at the calendar's own top edge so
          they read as rings piercing the binding, not as shapes floating
          into the grid below. Pop in as the calendar outline finishes
          drawing. */}
      {[CAL_X + CAL_W * 0.25 - 7, CAL_X + CAL_W * 0.75 - 7].map((tabX, i) => (
        <motion.rect
          key={`tab-${i}`}
          x={tabX}
          y={32}
          width={14}
          height={16}
          rx={6}
          fill="#FFFFFF"
          style={{ originX: 0.5, originY: 1 }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={reached('calendar') ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.15, delay: 0.35, ease: 'easeOut' }}
        />
      ))}

      {/* Calendar outline - stroke path-draw via pathLength, not a fade */}
      <motion.rect
        x={CAL_X}
        y={CAL_Y}
        width={CAL_W}
        height={CAL_H}
        rx={CAL_RX}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={CAL_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: reached('calendar') ? 1 : 0 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeInOut' }}
      />

      {/* Mint grid - each square pops 0 -> ~115% -> 100% in sequence. */}
      {GRID_SQUARES.map(({ x, y }, i) => {
        const delay = reducedMotion ? 0 : i * (0.35 / GRID_SQUARES.length);
        return (
          <motion.rect
            key={`sq-${i}`}
            x={x}
            y={y}
            width={GRID_SQUARE}
            height={GRID_SQUARE}
            rx={5}
            fill={MINT}
            style={{ originX: 0.5, originY: 0.5 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={
              reached('squares')
                ? { scale: reducedMotion ? 1 : [0, 1.15, 1], opacity: 1 }
                : { scale: 0, opacity: 0 }
            }
            transition={reducedMotion ? { duration: 0 } : { duration: 0.22, delay, times: [0, 0.6, 1] }}
          />
        );
      })}

      {/* Orange pin - "the hero moment": drops from above, overshoots,
          bounces back, and settles just below the calendar card, clear of
          its border and every grid square. A drop-shadow keeps it visually
          "lifted" rather than pasted flat onto the badge. */}
      <g transform={`translate(${PIN_CENTER_X},${PIN_CENTER_Y}) scale(${PIN_SCALE})`}>
        <motion.g
          style={{ filter: 'drop-shadow(0px 3px 3px rgba(0,0,0,0.35))' }}
          initial={{ y: -90, opacity: 0 }}
          animate={reached('pin') ? { y: 0, opacity: 1 } : { y: -90, opacity: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 260, damping: 9, mass: 0.9 }
          }
        >
          <path
            d="M0,-24 C13,-24 23,-14 23,-1 C23,14 0,42 0,42 C0,42 -23,14 -23,-1 C-23,-14 -13,-24 0,-24 Z"
            fill={PIN_ORANGE}
            stroke={NAVY}
            strokeWidth={2}
            strokeOpacity={0.25}
          />
          <circle cx={0} cy={-2} r={9} fill={NAVY} />
        </motion.g>
      </g>
    </svg>
  );
};
