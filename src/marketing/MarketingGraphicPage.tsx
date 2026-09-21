import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { MARKETING_SCENARIOS, getScenarioRules } from '../data/marketingScenarios';
import { MarketingGraphicCard } from './MarketingGraphicCard';

/**
 * Dev/marketing-only route: renders one MarketingGraphicCard full-bleed, nothing else,
 * so scripts/generate-marketing-graphics.ts can screenshot #graphic-card headlessly.
 * Not linked from anywhere in the app UI.
 */
export function MarketingGraphicPage() {
  const [searchParams] = useSearchParams();
  const scenarioId = searchParams.get('scenario');
  const scenario = MARKETING_SCENARIOS.find((s) => s.id === scenarioId);

  if (!scenario) {
    return (
      <div style={{ padding: 40, fontFamily: 'monospace' }}>
        Unknown or missing ?scenario=. Valid ids: {MARKETING_SCENARIOS.map((s) => s.id).join(', ')}
      </div>
    );
  }

  const rules = getScenarioRules(scenario);

  return (
    <MarketingGraphicCard title={scenario.title} emoji={scenario.emoji} subtitle={scenario.subtitle} rules={rules} />
  );
}
