/**
 * Builds the clip-path `path()` string for one "road stripe" nav button on
 * RecurringUserLanding - a rounded, gently-bowed trapezoid instead of a
 * plain rectangle or a razor-straight diagonal cut. Split out as a pure
 * function (rather than computed inline) so the geometry can be unit
 * tested without mounting a component or faking ResizeObserver.
 *
 * Why not a static CSS `clip-path: polygon(...)`, like the first version of
 * this component used: percentage-based polygons can't express rounded
 * corners or curves, and mixing a Tailwind `rounded-2xl` border-radius with
 * a hard diagonal polygon cut produced lopsided corners (rounded on one
 * side of the cut, sharp on the other) instead of a single coherent shape.
 * Computing the path in real pixels from the button's own measured size
 * (see the ResizeObserver in RecurringUserLanding's StripeButton) lets every
 * corner - including the ones the diagonal passes through - be rounded by
 * the same path, and lets the diagonal sides bow outward slightly for a
 * less rigid, more "flowing" silhouette.
 */
export interface RoadStripeShapeOptions {
  /** How much narrower the top edge is than the bottom, as a fraction of width (0..0.4). */
  topInsetRatio: number;
  /** Corner rounding radius in px, clamped to fit the shape. */
  cornerRadius: number;
  /** Outward bow on each diagonal side, in px (0 = perfectly straight). */
  bow: number;
}

interface Point {
  x: number;
  y: number;
}

function along(a: Point, b: Point, distance: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(1, distance / len);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function buildRoadStripeClipPath(width: number, height: number, options: RoadStripeShapeOptions): string {
  if (!(width > 0) || !(height > 0)) {
    // Degenerate/unmeasured size (e.g. first render before layout) - a
    // full-box path is a safe no-op clip rather than emitting NaN.
    return 'path("M 0 0 L 1 0 L 1 1 L 0 1 Z")';
  }

  const topInsetRatio = Math.min(0.4, Math.max(0, options.topInsetRatio));
  const topInset = width * topInsetRatio;

  const topLeft: Point = { x: topInset, y: 0 };
  const topRight: Point = { x: width - topInset, y: 0 };
  const bottomRight: Point = { x: width, y: height };
  const bottomLeft: Point = { x: 0, y: height };

  // Radius can never exceed half the height (or the two edges it sits
  // between would overlap) or leave the top edge with negative length.
  const radius = Math.max(
    0,
    Math.min(options.cornerRadius, height * 0.45, topInset > 0 ? topInset * 0.85 : height * 0.45, width * 0.2)
  );

  const p1 = along(topLeft, topRight, radius);
  const p2 = along(topRight, topLeft, radius);
  const p3 = along(topRight, bottomRight, radius);
  const p4 = along(bottomRight, topRight, radius);
  const p5 = along(bottomRight, bottomLeft, radius);
  const p6 = along(bottomLeft, bottomRight, radius);
  const p7 = along(bottomLeft, topLeft, radius);
  const p8 = along(topLeft, bottomLeft, radius);

  const bow = Math.max(0, options.bow);
  const rightMid: Point = { x: (p3.x + p4.x) / 2 + bow, y: (p3.y + p4.y) / 2 };
  const leftMid: Point = { x: (p7.x + p8.x) / 2 - bow, y: (p7.y + p8.y) / 2 };

  const d = [
    `M ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `Q ${topRight.x} ${topRight.y} ${p3.x} ${p3.y}`,
    `Q ${rightMid.x} ${rightMid.y} ${p4.x} ${p4.y}`,
    `Q ${bottomRight.x} ${bottomRight.y} ${p5.x} ${p5.y}`,
    `L ${p6.x} ${p6.y}`,
    `Q ${bottomLeft.x} ${bottomLeft.y} ${p7.x} ${p7.y}`,
    `Q ${leftMid.x} ${leftMid.y} ${p8.x} ${p8.y}`,
    `Q ${topLeft.x} ${topLeft.y} ${p1.x} ${p1.y}`,
    'Z',
  ].join(' ');

  return `path("${d}")`;
}

/**
 * Per-stripe shape config for the 3 RecurringUserLanding nav buttons -
 * decreasing topInsetRatio from stripe 1 to 3 keeps the existing
 * "farthest/narrowest first, closest/widest last" perspective (paired with
 * each stripe's own increasing outer width from marginClassName), just
 * with rounded, bowed edges instead of a straight polygon cut.
 */
export const ROAD_STRIPE_SHAPES: RoadStripeShapeOptions[] = [
  { topInsetRatio: 0.1, cornerRadius: 16, bow: 7 },
  { topInsetRatio: 0.055, cornerRadius: 16, bow: 6 },
  { topInsetRatio: 0.02, cornerRadius: 16, bow: 5 },
];
