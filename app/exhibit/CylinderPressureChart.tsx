import styles from './Exhibit.module.css';
import type { CylinderPressureSample } from '../../engine/exhibit/types';

const COLORS = ['#ffad55', '#59bdff', '#d9c06f', '#c49aff', '#77d69d'];
const DASHES = ['', '8 4', '2 3', '12 4 2 4', '5 3 1 3'];

export function CylinderPressureChart({
  samples,
  selectedCylinder = 1,
  maxPressureBar = 180,
}: {
  samples: readonly CylinderPressureSample[];
  selectedCylinder?: number;
  maxPressureBar?: number;
}) {
  const firstAngle = samples[0]?.angleDeg ?? 0;
  const angleSpan = Math.max(
    1,
    (samples.at(-1)?.angleDeg ?? firstAngle + 720) - firstAngle,
  );
  const pressureScale = Math.max(1, maxPressureBar);
  const points = (cylinder: number) =>
    samples
      .map((sample) => {
        const x = 42 + ((sample.angleDeg - firstAngle) / angleSpan) * 528;
        const y =
          158 -
          (Math.max(0, sample.pressuresBar[cylinder] ?? 0) / pressureScale) *
            142;
        return `${x},${y}`;
      })
      .join(' ');
  return (
    <figure className={styles.chart} aria-labelledby="pressure-chart-title">
      <h2 id="pressure-chart-title">五缸压力</h2>
      <svg
        viewBox="0 0 600 190"
        aria-labelledby="pressure-chart-svg-title pressure-chart-svg-desc"
      >
        <title id="pressure-chart-svg-title">五个气缸的压力曲线</title>
        <desc id="pressure-chart-svg-desc">
          横轴为曲轴转角，单位度；纵轴为压力，单位 bar。每缸使用不同颜色和线型。
        </desc>
        <path d="M42 16V158H570" fill="none" stroke="#6b7886" />
        {[0, 60, 120, 180].map((pressure) => {
          const y = 158 - (pressure / pressureScale) * 142;
          return (
            <g key={pressure}>
              <path d={`M42 ${y}H570`} stroke="#303b46" />
              <text
                x="36"
                y={y + 4}
                textAnchor="end"
                fill="#9eacba"
                fontSize="11"
              >
                {pressure}
              </text>
            </g>
          );
        })}
        {samples.length > 1 &&
          Array.from({ length: 5 }, (_, cylinder) => (
            <polyline
              key={cylinder}
              points={points(cylinder)}
              fill="none"
              stroke={COLORS[cylinder]}
              strokeDasharray={DASHES[cylinder]}
              strokeWidth={cylinder + 1 === selectedCylinder ? 3 : 1.5}
              opacity={cylinder + 1 === selectedCylinder ? 1 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {[0, 180, 360, 540, 720].map(angle => <text key={angle} x={42 + angle / 720 * 528} y="170" textAnchor="middle" fill="#9eacba" fontSize="10">{angle}</text>)}
        <text x="306" y="188" textAnchor="middle" fill="#9eacba" fontSize="12">
          曲轴转角（°）
        </text>
        <text x="10" y="13" fill="#9eacba" fontSize="12">
          bar
        </text>
      </svg>
      <ul className={styles.chartLegend} aria-label="气缸曲线图例">
        {COLORS.map((color, index) => (
          <li key={color} style={{ color }}>
            <span
              style={{ borderTopStyle: index === 0 ? 'solid' : 'dashed' }}
            />
            {index + 1} 缸 · {index === 0 ? '实线' : `线型 ${index + 1}`}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export type { CylinderPressureSample } from '../../engine/exhibit/types';
