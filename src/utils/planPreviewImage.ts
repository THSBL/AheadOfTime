/**
 * The picture a chat app (WhatsApp, Messenger, iMessage) shows under a
 * shared plan's link: "You are invited to:", the plan, its date and the
 * guests' next step. Drawn here, in the owner's browser, when they share or
 * change the plan, and stored with the link (server/sharedPlans.ts) - the
 * server needs no image library or fonts. 1200×630, the size chat apps show
 * large; a JPEG of a few dozen KB (WhatsApp skips heavy pictures).
 */

const NAVY = '#182A42';
const SAGE = '#95BFB5';
const MUTED = '#cbd5e1';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  // Cut at a word, with an ellipsis, when the title is longer than the lines.
  const used = lines.join(' ').split(/\s+/).length;
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.includes(' ') && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, last.lastIndexOf(' '));
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface PreviewInput {
  title: string;
  /** "Sat 20 Dec" or "Sat 20 Dec – Sun 28 Dec" */
  dateLine: string;
  /** "Share your wishlist by Sat 22 Nov", when guests have a step coming. */
  nextUp?: string | null;
}

export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;

/** Base64 JPEG (no data: prefix), or null where a canvas isn't available. */
export function drawPlanPreview(input: PreviewInput): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  if (!paintPlanPreview(canvas, input)) return null;
  try {
    return canvas.toDataURL('image/jpeg', 0.82).replace(/^data:image\/jpeg;base64,/, '');
  } catch {
    return null;
  }
}

/** Paints the picture onto a canvas (the share window shows it as it will look). */
export function paintPlanPreview(canvas: HTMLCanvasElement, input: PreviewInput): boolean {
  const W = PREVIEW_WIDTH;
  const H = PREVIEW_HEIGHT;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  const x = 90;
  const maxWidth = W - 2 * x;
  ctx.textBaseline = 'alphabetic';

  ctx.font = `800 64px ${FONT}`;
  const titleLines = wrapLines(ctx, input.title, maxWidth, 2);

  // Measure the block, then centre it vertically.
  const invitedH = 44;
  const titleLineH = 78;
  const dateH = 48;
  const pillH = input.nextUp ? 84 : 0;
  const gaps = 22 + 18 + (input.nextUp ? 40 : 0);
  const blockH = invitedH + titleLines.length * titleLineH + dateH + pillH + gaps;
  let y = Math.max(60, (H - blockH) / 2);

  ctx.fillStyle = SAGE;
  ctx.font = `800 36px ${FONT}`;
  y += 36;
  ctx.fillText('You are invited to:', x, y);
  y += invitedH - 36 + 22;

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 64px ${FONT}`;
  for (const line of titleLines) {
    y += 62;
    ctx.fillText(line, x, y);
    y += titleLineH - 62;
  }
  y += 18;

  ctx.fillStyle = MUTED;
  ctx.font = `500 36px ${FONT}`;
  y += 36;
  ctx.fillText(input.dateLine, x, y);
  y += dateH - 36;

  if (input.nextUp) {
    y += 40;
    ctx.font = `800 34px ${FONT}`;
    const label = wrapLines(ctx, `Next up: ${input.nextUp}`, maxWidth - 64, 1)[0] || '';
    const w = Math.min(maxWidth, ctx.measureText(label).width + 64);
    ctx.fillStyle = SAGE;
    roundRect(ctx, x, y, w, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = NAVY;
    ctx.fillText(label, x + 32, y + pillH / 2 + 12);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('Ahead Of Time', W - x, H - 48);
  ctx.textAlign = 'left';
  return true;
}
