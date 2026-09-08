'use client';

import type { ScenarioDirective } from '../../engine/exhibit/ScenarioController';
import styles from './Exhibit.module.css';

export function ColdStartOverlay({
  directive,
  onSkip,
}: {
  directive: ScenarioDirective;
  onSkip: () => void;
}) {
  if (directive.scenario !== 'cold-start' || !directive.active) return null;
  return (
    <aside className={styles.coldOverlay} aria-label="冷启动导览">
      <h2>冷启动导览</h2>
      <p>{directive.cue?.label ?? '正在准备发动机展示'}</p>
      <progress
        value={directive.elapsed}
        max={directive.duration}
        aria-label="冷启动导览进度"
      />
      <p>
        {Math.max(0, directive.duration - directive.elapsed).toFixed(0)}{' '}
        秒后进入自由观察
      </p>
      <button type="button" className={styles.skipButton} onClick={onSkip}>
        跳过导览
      </button>
    </aside>
  );
}
