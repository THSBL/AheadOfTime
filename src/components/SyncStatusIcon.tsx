import React from 'react';

/**
 * The one sync icon used everywhere: a calendar with a green check when the
 * plan is in the user's calendar ("Synced"), a grey calendar with a clock
 * when it isn't yet ("Pending sync"). `tone` is the background it sits on.
 */
export const SyncStatusIcon: React.FC<{ synced: boolean; tone?: 'dark' | 'light'; size?: number; className?: string }> = ({
  synced,
  tone = 'dark',
  size = 20,
  className = '',
}) => {
  const label = synced ? 'Synced' : 'Pending sync';
  if (synced) {
    const body = tone === 'dark' ? '#ffffff' : '#ffffff';
    const line = tone === 'dark' ? '#ffffff' : '#182A42';
    const rule = tone === 'dark' ? '#223349' : '#182A42';
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label} className={`shrink-0 ${className}`}>
        <title>{label}</title>
        <path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" fill={body} stroke={line} strokeWidth="2" />
        <path d="M16 2v4M8 2v4" stroke={line} strokeWidth="2" />
        <path d="M3 10h18" stroke={rule} strokeWidth="1.6" />
        <circle cx="18" cy="18" r="5.2" fill="#447463" stroke="#fff" strokeWidth="1.4" />
        <path d="m15.8 18 1.5 1.5 2.8-2.8" stroke="#fff" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label} className={`shrink-0 ${className}`}>
      <title>{label}</title>
      <path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <circle cx="18" cy="18" r="5" />
      <path d="M18 16v2l1.3 1.2" strokeWidth="1.6" />
    </svg>
  );
};
