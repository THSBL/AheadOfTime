import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Vercel runs each api/ function as plain Node ESM (no bundler), where a
 * relative import must name its file with ".js" - "../services/aiRequest"
 * works in the Vite build and in tests, but crashes the function on load.
 * That once took down both the chat and the Telegram bot (every function
 * that reached src/utils/timingAI.ts). This walks the static imports of
 * every function and fails on any relative one without an extension.
 */
const ROOT = path.resolve(__dirname, '..');
// Type-only imports are erased when compiled, so they never load at runtime.
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)[^'"`]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm;

function listFunctions(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFunctions(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

function resolveTs(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

describe('Vercel functions load under plain Node ESM', () => {
  it('every relative import reachable from api/ names its file with .js', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    const queue = listFunctions(path.join(ROOT, 'api'));
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = fs.readFileSync(file, 'utf8');
      const specs = [...source.matchAll(STATIC_IMPORT), ...source.matchAll(SIDE_EFFECT_IMPORT)].map((m) => m[1]);
      for (const spec of specs) {
        if (!/\.(js|json)$/.test(spec)) {
          problems.push(`${path.relative(ROOT, file)} imports "${spec}" without .js`);
          continue;
        }
        const target = resolveTs(file, spec);
        if (!target) problems.push(`${path.relative(ROOT, file)} imports "${spec}", which doesn't exist`);
        else queue.push(target);
      }
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });
});
