'use client';

import {
  EXHIBIT_SCENARIOS,
  EXHIBIT_SCENARIO_LABELS,
  scenarioDefinition,
  type ExhibitScenarioId,
} from '../../engine/exhibit/ScenarioController';
import styles from './Exhibit.module.css';

export function ScenarioStrip({
  value,
  running,
  onSelect,
}: {
  value?: ExhibitScenarioId;
  running: boolean;
  onSelect: (scenario: ExhibitScenarioId) => void;
}) {
  return (
    <nav className={styles.scenarioStrip} aria-label="策展工况">
      {EXHIBIT_SCENARIOS.map((scenario) => (
        <button
          type="button"
          key={scenario}
          aria-pressed={running && value === scenario}
          onClick={() => onSelect(scenario)}
        >
          {EXHIBIT_SCENARIO_LABELS[scenario]}
          <span>约 {scenarioDefinition(scenario).duration} 秒</span>
        </button>
      ))}
    </nav>
  );
}
