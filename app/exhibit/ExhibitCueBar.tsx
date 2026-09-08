import type { ScenarioDirective } from '../../engine/exhibit/ScenarioController';
import styles from './Exhibit.module.css';

export function ExhibitCueBar({ directive }: { directive: ScenarioDirective }) {
  return (
    <section className={styles.cueBar} aria-label="展陈提示" aria-live="polite">
      <strong>{directive.label}</strong>
      <progress
        value={directive.progress}
        max="1"
        aria-label={`${directive.label}进度`}
      />
      <span>
        {directive.cue?.label ??
          (directive.completed ? '演示完成' : '自由观察')}
      </span>
    </section>
  );
}
