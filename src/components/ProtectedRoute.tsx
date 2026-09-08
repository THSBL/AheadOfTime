import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { getStoredAccessToken, isTokenExpired } from '../services/googleAuth';

interface ProtectedRouteProps {
  isAuthenticated?: boolean;
  children?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ isAuthenticated, children }) => {
  const location = useLocation();

  // Check storage or props for auth status
  const hasCompletedOnboarding = typeof window !== 'undefined' && (
    localStorage.getItem('aot_onboarding_completed') === 'true' ||
    localStorage.getItem('has_completed_onboarding') === 'true'
  );

  const isConnected = typeof window !== 'undefined' && (
    localStorage.getItem('aot_calendar_connected') === 'true' ||
    Boolean(getStoredAccessToken() && !isTokenExpired())
  );

  const searchParams = new URLSearchParams(location.search);
  const hasDeepLinkEvent = searchParams.has('event_id') || searchParams.has('eventId');

  if (hasDeepLinkEvent && typeof window !== 'undefined') {
    try {
      localStorage.setItem('aot_onboarding_completed', 'true');
      localStorage.setItem('has_completed_onboarding', 'true');
    } catch (e) {
      console.warn('Failed to set onboarding flag:', e);
    }
  }

  const authenticated = isAuthenticated ?? (hasCompletedOnboarding || isConnected || hasDeepLinkEvent);

  if (!authenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/?returnTo=${returnTo}`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
