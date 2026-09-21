import React from 'react';
import { PrepTaskRule } from '../data/prepTimelineDatabase';

interface MarketingGraphicCardProps {
  title: string;
  emoji: string;
  subtitle: string;
  rules: PrepTaskRule[];
}

/**
 * Pure, static "T-minus runway" graphic used only by scripts/generate-marketing-graphics.ts
 * (Playwright screenshots the #graphic-card element rendered by MarketingGraphicPage).
 * Deliberately has no app state, handlers, or auth dependency.
 */
export const MarketingGraphicCard: React.FC<MarketingGraphicCardProps> = ({ title, emoji, subtitle, rules }) => {
  const sorted = [...rules].sort((a, b) => b.idealLeadDays - a.idealLeadDays);

  return (
    <div
      id="graphic-card"
      style={{
        width: 1200,
        minHeight: 1500,
        background: '#0E1511',
        color: '#E9EEE8',
        fontFamily: "'Source Serif 4', Georgia, serif",
        padding: '72px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 48,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6FBE9B',
          }}
        >
          Ahead Of Time &middot; T-minus runway
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 20 }}>
          <span>{emoji}</span>
          <span>{title}</span>
        </div>
        <div style={{ fontSize: 24, color: '#A6B4AA', fontStyle: 'italic' }}>{subtitle}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sorted.map((rule, i) => (
          <div key={rule.id} style={{ display: 'flex', gap: 28, position: 'relative', paddingBottom: i === sorted.length - 1 ? 0 : 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#0E1511',
                  background: '#6FBE9B',
                  padding: '6px 14px',
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                }}
              >
                {rule.badge}
              </div>
              {i !== sorted.length - 1 && <div style={{ flex: 1, width: 2, background: '#253128', marginTop: 8 }} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{rule.name}</div>
              <div style={{ fontSize: 18, color: '#A6B4AA', maxWidth: 880 }}>{rule.reason}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid #253128',
          paddingTop: 24,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 16,
          color: '#6C7A70',
        }}
      >
        aheadoftime.app &middot; type the date, get the backward plan
      </div>
    </div>
  );
};
