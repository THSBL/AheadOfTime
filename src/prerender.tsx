/**
 * Build-time rendering of the public pages (scripts/prerender.mjs), so their
 * text ships in the HTML. Search engines, link previews and AI assistants
 * that don't run JavaScript read a real page instead of an empty shell. In
 * the browser nothing changes: main.tsx's createRoot replaces this markup
 * with the live app as it loads.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { LandingUSPPage } from './components/LandingUSPPage';
import { FeaturesPage } from './components/FeaturesPage';
import { HowItWorksPage } from './components/HowItWorksPage';
import { FaqPage } from './components/FaqPage';
import { PrivacyPage } from './components/PrivacyPage';

const noop = () => {};

export const PRERENDER_ROUTES: Array<{ path: string; file: string; element: () => React.ReactElement }> = [
  { path: '/', file: 'index.html', element: () => <LandingUSPPage onGetStarted={noop} onExploreDashboard={noop} onOpenPrivacyPolicy={noop} /> },
  { path: '/features', file: 'features.html', element: () => <FeaturesPage /> },
  { path: '/how-it-works', file: 'how-it-works.html', element: () => <HowItWorksPage /> },
  { path: '/faq', file: 'faq.html', element: () => <FaqPage /> },
  { path: '/privacy', file: 'privacy.html', element: () => <PrivacyPage /> },
];

/** The page's markup, and the title/description it sets (usePageMeta). */
export function renderRoute(path: string): { html: string; title?: string; description?: string } {
  const route = PRERENDER_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`No prerender route for ${path}`);
  const meta = ((globalThis as any).__aotPageMeta = {} as { title?: string; description?: string });
  const html = renderToString(<StaticRouter location={path}>{route.element()}</StaticRouter>);
  return { html, ...meta };
}
