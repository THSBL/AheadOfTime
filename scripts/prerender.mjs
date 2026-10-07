// After `vite build`: renders the public pages into their own HTML files
// (see src/prerender.tsx), and keeps an empty shell for the app's other
// routes (dist/app.html - vercel.json sends those there), so signed-in
// pages never flash marketing text while the app loads.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { build } from 'vite';

const OUT = 'dist';
const SSR_OUT = 'dist-prerender';

await build({ logLevel: 'warn', build: { ssr: 'src/prerender.tsx', outDir: SSR_OUT, emptyOutDir: true } });

// Browser-only globals some components read while rendering; on the server
// they behave like a first-time visitor with nothing stored.
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
};
globalThis.sessionStorage = globalThis.localStorage;

const { PRERENDER_ROUTES, renderRoute } = await import(`../${SSR_OUT}/prerender.js`);
const shell = readFileSync(`${OUT}/index.html`, 'utf8');
if (!shell.includes('<div id="root">')) throw new Error('index.html has no <div id="root">');

// The empty shell for every other route.
writeFileSync(`${OUT}/app.html`, shell);

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const route of PRERENDER_ROUTES) {
  const { html, title, description } = renderRoute(route.path);
  let page = shell.replace(/<div id="root">[\s\S]*?<\/div>\s*<\/body>/, `<div id="root"><div data-prerendered="">${html}</div></div>\n  </body>`);
  if (!page.includes('data-prerendered')) throw new Error('could not place the page into #root');
  if (title) page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(title)}</title>`);
  if (description) page = page.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escape(description)}$2`);
  if (route.path !== '/') page = page.replace(/(<link rel="canonical" href="https:\/\/aheadoftime\.app)\/(")/, `$1${route.path}$2`);
  writeFileSync(`${OUT}/${route.file}`, page);
  console.log(`prerendered ${route.path} -> ${OUT}/${route.file} (${Math.round(html.length / 1024)} KB)`);
}
rmSync(SSR_OUT, { recursive: true, force: true });

// Google AdSense asks every site that shows its ads for /ads.txt naming the
// publisher. Written only when the publisher id is configured.
const adClient = (process.env.VITE_ADSENSE_CLIENT || '').trim();
const pub = adClient.replace(/^ca-/, '');
if (/^pub-\d{10,20}$/.test(pub)) {
  writeFileSync(`${OUT}/ads.txt`, `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
  console.log(`wrote ${OUT}/ads.txt for ${pub}`);
}
