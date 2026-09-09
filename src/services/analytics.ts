// Google Analytics 4 (GA4) Service for Ahead Of Time
// Tracks visitor activity, navigation, and user element interactions safely and responsibly.

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    posthog?: {
      capture: (eventName: string, properties?: Record<string, any>) => void;
    };
    analytics?: {
      page: (name?: string, properties?: Record<string, any>) => void;
      track?: (eventName: string, properties?: Record<string, any>) => void;
    };
  }
}

const DEFAULT_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string) || 'G-R1QGR1397K';

let isInitialized = false;
let activeMeasurementId = '';

/**
 * Initializes GA4 script and configures dataLayer
 */
export function initAnalytics(overrideMeasurementId?: string): boolean {
  if (typeof window === 'undefined') return false;

  const measurementId = (overrideMeasurementId || DEFAULT_MEASUREMENT_ID || '').trim();
  if (!measurementId || isInitialized) {
    if (measurementId && !isInitialized) {
      activeMeasurementId = measurementId;
    }
    return isInitialized;
  }

  activeMeasurementId = measurementId;

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: false, // We handle dynamic SPA pageviews explicitly
    anonymize_ip: true,
  });

  // Inject Google Tag script
  const existingScript = document.getElementById('ga-gtag-script');
  if (!existingScript) {
    const script = document.createElement('script');
    script.id = 'ga-gtag-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  isInitialized = true;
  return true;
}

/**
 * Checks if analytics is initialized with an active measurement ID
 */
export function isAnalyticsActive(): boolean {
  return isInitialized && !!activeMeasurementId;
}

/**
 * Gets the current configured measurement ID
 */
export function getMeasurementId(): string {
  return activeMeasurementId || DEFAULT_MEASUREMENT_ID;
}

/**
 * Tracks a page / view change (e.g. switching between Welcome, App, Privacy, Features)
 */
export function trackPageView(pagePath: string, pageTitle?: string) {
  if (!isAnalyticsActive() && typeof window !== 'undefined' && DEFAULT_MEASUREMENT_ID) {
    initAnalytics();
  }

  if (typeof window !== 'undefined' && window.gtag && activeMeasurementId) {
    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_title: pageTitle || document.title,
      send_to: activeMeasurementId,
    });
  }
}

/**
 * Tracks custom user interactions and business events
 */
export function trackEvent(eventName: string, params: Record<string, any> = {}) {
  if (!isAnalyticsActive() && typeof window !== 'undefined' && DEFAULT_MEASUREMENT_ID) {
    initAnalytics();
  }

  if (typeof window !== 'undefined' && window.gtag && activeMeasurementId) {
    window.gtag('event', eventName, {
      ...params,
      timestamp: new Date().toISOString(),
      send_to: activeMeasurementId,
    });
  }
}

/**
 * Tracks button and UI element clicks
 */
export function trackButtonClick(buttonName: string, elementLocation: string, extra: Record<string, any> = {}) {
  trackEvent('ui_click', {
    element_name: buttonName,
    element_location: elementLocation,
    ...extra,
  });
}

/**
 * Tracks event runway creation
 */
export function trackEventCreation(category: string, eventTitle: string, milestoneCount: number) {
  trackEvent('create_event_runway', {
    event_category: category,
    event_title_length: eventTitle.length,
    milestone_count: milestoneCount,
  });
}

/**
 * Tracks completing or uncompleting a milestone task
 */
export function trackMilestoneToggle(milestoneTitle: string, isCompleted: boolean, category: string) {
  trackEvent('milestone_toggle', {
    milestone_title: milestoneTitle,
    is_completed: isCompleted,
    milestone_category: category,
  });
}

/**
 * Tracks account login / logout / switch actions
 */
export function trackAccountAction(action: 'login' | 'logout' | 'switch', accountId?: string) {
  trackEvent('account_action', {
    action_type: action,
    has_account: !!accountId,
  });
}
