import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    posthog?: {
      capture: (eventName: string, properties?: Record<string, any>) => void;
    };
    analytics?: {
      page: (name?: string, properties?: Record<string, any>) => void;
    };
  }
}

/**
 * AnalyticsTracker listens to route changes via react-router-dom location
 * and automatically fires virtual pageview events to GA4, PostHog, or Segment.
 */
export const AnalyticsTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const pagePath = location.pathname + location.search + location.hash;
    const pageTitle = document.title || 'Ahead Of Time';

    // 1. Google Analytics 4 (gtag.js)
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: pagePath,
        page_title: pageTitle,
        page_location: window.location.href,
      });
    }

    // 2. PostHog Analytics
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture('$pageview', {
        $current_url: window.location.href,
        $pathname: location.pathname,
      });
    }

    // 3. Segment / Standard Analytics
    if (window.analytics && typeof window.analytics.page === 'function') {
      window.analytics.page(pageTitle, {
        path: pagePath,
        url: window.location.href,
      });
    }

    // Console logging in dev mode for verification
    if (import.meta.env.DEV) {
      console.log(`[Analytics Virtual Pageview] -> ${pagePath}`);
    }
  }, [location]);

  return null;
};
