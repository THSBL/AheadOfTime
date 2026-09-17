import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { buildRoadStripeClipPath, RoadStripeShapeOptions } from './roadStripeShape';

/**
 * Measures an element's own rendered size (via ResizeObserver) and turns it
 * into a "road 3D" clip-path - the rounded, gently-bowed trapezoid first
 * built for RecurringUserLanding's stripe-nav buttons, reused wherever else
 * that same "fake 3D panel" look is wanted (e.g. MyWeekAhead's status
 * banner). Percentage-based CSS clip-path can't express the rounded
 * corners/bow (see roadStripeShape.ts's own doc comment), so this has to be
 * computed from real measured pixels instead of a static class.
 */
export function useRoad3DClipPath<T extends HTMLElement>(shape: RoadStripeShapeOptions): {
  ref: RefObject<T | null>;
  clipPath: string;
} {
  const ref = useRef<T | null>(null);
  const [clipPath, setClipPath] = useState<string>('none');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const { width, height } = el.getBoundingClientRect();
      setClipPath(buildRoadStripeClipPath(width, height, shape));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.topInsetRatio, shape.cornerRadius, shape.bow]);

  return { ref, clipPath };
}

/**
 * The fake embossed/3D border+bevel that goes with the clip-path above: a
 * light highlight top-left and a dark shadow bottom-right (as if lit from
 * above), plus an inset highlight/shadow band for a rounder, more embossed
 * feel than a plain outline. Border and inset box-shadow both still render
 * within the element's own painted box, so clip-path clips them along with
 * everything else - they hug the shape's actual cut corners instead of a
 * plain rectangle, unlike an outer box-shadow (which clip-path effectively
 * swallows; depth/lift for a clipped shape has to come from a wrapping
 * element's filter:drop-shadow instead).
 */
export const ROAD_3D_BEVEL_STYLE: CSSProperties = {
  borderWidth: '3px',
  borderStyle: 'solid',
  borderTopColor: 'rgba(255,255,255,0.85)',
  borderLeftColor: 'rgba(255,255,255,0.55)',
  borderRightColor: 'rgba(15,23,42,0.32)',
  borderBottomColor: 'rgba(15,23,42,0.45)',
  boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.5), inset 0 -3px 5px rgba(15,23,42,0.18)',
};
