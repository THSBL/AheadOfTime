/**
 * One readable line for a Gemini failure, e.g.
 * "429 RESOURCE_EXHAUSTED: You exceeded your current quota...". The SDK's
 * error message is Google's JSON error body as a string, which Vercel's
 * log viewer collapses to "{ error: {…} }" - hiding the only useful part.
 */
export function describeGeminiError(err: unknown): string {
  const e = err as any;
  if (!e) return 'unknown error';
  const raw = typeof e.message === 'string' ? e.message : typeof e === 'string' ? e : '';
  try {
    const start = raw.indexOf('{');
    const body = start >= 0 ? JSON.parse(raw.slice(start)) : null;
    const inner = body?.error;
    if (inner) {
      return [inner.code ?? e.status, inner.status, '-', inner.message].filter((x) => x !== undefined && x !== null && x !== '').join(' ').slice(0, 500);
    }
  } catch {
    // not JSON - fall through
  }
  const status = e.status ?? e.code;
  return `${status ? `${status} ` : ''}${raw || String(e)}`.slice(0, 500);
}
