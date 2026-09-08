'use client';

import {
  OBSERVATION_LAYERS,
  OBSERVATION_LAYER_LABELS,
  type ObservationLayer,
} from '../../engine/exhibit/types';
import styles from './Exhibit.module.css';

export function ObservationLayerSelector({
  value,
  onChange,
}: {
  value: ObservationLayer;
  onChange: (layer: ObservationLayer) => void;
}) {
  return (
    <fieldset className={styles.selector}>
      <legend className={styles.srOnly}>观察层</legend>
      {OBSERVATION_LAYERS.map((layer) => (
        <button
          key={layer}
          type="button"
          aria-pressed={value === layer}
          onClick={() => onChange(layer)}
        >
          {OBSERVATION_LAYER_LABELS[layer]}
        </button>
      ))}
    </fieldset>
  );
}
