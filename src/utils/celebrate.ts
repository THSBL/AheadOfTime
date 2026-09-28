import confetti from 'canvas-confetti';

// The app's own colours: navy, sage, green, plus a warm accent.
const BRAND_COLORS = ['#182A42', '#95BFB5', '#447463', '#f59e0b'];

/** Small burst for ticking off one task (same size the event page uses). */
export function celebrateTask(): void {
  confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 }, colors: BRAND_COLORS });
}

/** Bigger burst when the week's last open task is done. */
export function celebrateWeekDone(): void {
  confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 }, colors: BRAND_COLORS });
}
