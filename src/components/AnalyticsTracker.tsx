import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initAnalytics, trackPageView } from '../services/analytics';

/**
 * AnalyticsTracker listens to route changes via react-router-dom location
 * and fires virtual pageview events to GA4, gated on cookie consent (see
 * initAnalytics/hasAnalyticsConsent in services/analytics.ts).
 */
export const AnalyticsTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const pagePath = location.pathname + location.search + location.hash;
    const pageTitle = document.title || 'Ahead Of Time';

    trackPageView(pagePath, pageTitle);

    // Console logging in dev mode for verification
    if (import.meta.env.DEV) {
      console.log(`[Analytics Virtual Pageview] -> ${pagePath}`);
    }
  }, [location]);

  return null;
};
