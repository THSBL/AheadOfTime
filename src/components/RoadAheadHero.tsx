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
}

// 8 grid squares (not 9) in a 3-3-2 layout - the bottom-right slot is left
// empty on purpose so the pin below can occupy it without overlapping a
// square's corner. The source app-icon PNG does overlap the pin over the
// grid, but recreated at this size that overlap reads as visual noise/an
// unclear edge rather than an intentional marker - leaving the slot empty
// keeps the "pin marks a date on the calendar" idea without the mud.
const GRID_SQUARES: Array<{ x: number; y: number }> = [
  { x: 60, y: 68 }, { x: 92, y: 68 }, { x: 124, y: 68 },
  { x: 60, y: 100 }, { x: 92, y: 100 }, { x: 124, y: 100 },
  { x: 60, y: 132 }, { x: 92, y: 132 },
];

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
 * separately (see ROAD_STRIPES) rather than nesting them in this SVG.
 */
export const RoadAheadHero: React.FC<RoadAheadHeroProps> = ({ phase, reducedMotion = false, className = '' }) => {
  const reached = (target: IntroPhase) => reducedMotion || phaseAtLeast(phase, target);

  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Ahead Of Time"
    >
      {/* Navy badge background - a faint light stroke gives the badge a
          readable edge even though the page behind it is the same navy
          (drop-shadow alone barely shows up on a same-color background). */}
      <rect x={0} y={0} width={200} height={200} rx={40} fill={NAVY} stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />

      {/* Binding-ring tabs - pop in right as the calendar outline finishes drawing */}
      {[72, 114].map((tabX, i) => (
        <motion.rect
          key={`tab-${i}`}
          x={tabX}
          y={34}
          width={14}
          height={28}
          rx={7}
          fill="#FFFFFF"
          style={{ originX: 0.5, originY: 1 }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={reached('calendar') ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.15, delay: 0.35, ease: 'easeOut' }}
        />
      ))}

      {/* Calendar outline - stroke path-draw via pathLength, not a fade */}
      <motion.rect
        x={44}
        y={52}
        width={112}
        height={104}
        rx={16}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: reached('calendar') ? 1 : 0 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeInOut' }}
      />

      {/* Mint grid - 8 squares, 3/3/2 - see GRID_SQUARES for why the 9th
          (bottom-right) slot is left open for the pin. Each square pops
          0 -> ~115% -> 100% in sequence. */}
      {GRID_SQUARES.map(({ x, y }, i) => {
        const delay = reducedMotion ? 0 : i * (0.35 / GRID_SQUARES.length);
        return (
          <motion.rect
            key={`sq-${i}`}
            x={x}
            y={y}
            width={22}
            height={22}
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
          bounces back, and settles into the empty bottom-right grid slot,
          hanging slightly below the calendar's own bottom edge (matching
          the source logo) without covering any square. A drop-shadow keeps
          it visually "lifted" above the grid instead of looking pasted on. */}
      <g transform="translate(148,146)">
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
