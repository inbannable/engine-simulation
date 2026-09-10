'use client';

import type { ExhibitAudioStatus } from '../../engine/exhibit/LayeredEngineAudio';
import type { EngineFrame } from '../../engine/exhibit/types';
import styles from './Exhibit.module.css';

const audioLabels: Record<ExhibitAudioStatus, string> = {
  off: '关闭（默认）',
  starting: '正在启用',
  running: '已开启',
  unavailable: '不可用，模拟继续',
  disposed: '已释放',
};

export function ExhibitStatusPanel({
  frame,
  audioStatus = 'off',
  onEnableAudio,
}: {
  frame: EngineFrame;
  audioStatus?: ExhibitAudioStatus;
  onEnableAudio?: () => void;
}) {
  const systems = frame.systems;
  return (
    <section className={styles.panel} aria-label="展品实时状态">
      <h2>实时状态</h2>
      <dl className={styles.statusGrid}>
        <div>
          <dt>发动机转速</dt>
          <dd>{frame.simulation.rpm.toFixed(0)} rpm</dd>
        </div>
        <div>
          <dt>增压压力</dt>
          <dd>{systems.boostKpa.toFixed(0)} kPa</dd>
        </div>
        <div>
          <dt>进气流量</dt>
          <dd>{systems.airflowGps.toFixed(1)} g/s</dd>
        </div>
        <div>
          <dt>冷却液</dt>
          <dd>{systems.coolantTempC.toFixed(0)} °C</dd>
        </div>
        <div>
          <dt>机油压力</dt>
          <dd>{systems.oilPressureKpa.toFixed(0)} kPa</dd>
        </div>
        <div>
          <dt>排气温度</dt>
          <dd>{systems.exhaustTempC.toFixed(0)} °C</dd>
        </div>
        {frame.hydraulic && (
          <div>
            <dt>变速箱液压</dt>
            <dd>{frame.hydraulic.linePressureBar.toFixed(1)} bar</dd>
          </div>
        )}
        <div><dt>机油温度</dt><dd>{systems.oilTempC.toFixed(0)} °C</dd></div>
        {frame.layer === 'gas-combustion' && <>
          <div><dt>涡轮相对转速</dt><dd>{(systems.turboRpmNormalized * 100).toFixed(0)}%（归一化）</dd></div>
          <div><dt>循环平均扭矩 / 功率</dt><dd>{systems.averageNetTorqueNm.toFixed(0)} Nm / {(systems.averageNetTorqueNm * systems.rpm * Math.PI / 30000).toFixed(0)} kW</dd></div>
          <div><dt>第 {frame.simulation.selected} 缸压力</dt><dd>{systems.cylinders[frame.simulation.selected - 1]?.pressureBar.toFixed(1)} bar</dd></div>
        </>}
        {frame.layer === 'transmission-hydraulic' && frame.hydraulic && <>
          <div><dt>K1 / K2 压力</dt><dd>{frame.hydraulic.clutchPressureBar.map(p => p.toFixed(1)).join(' / ')} bar</dd></div>
          <div><dt>K1 / K2 片温</dt><dd>{frame.hydraulic.clutchDiscTempC.map(t => t.toFixed(0)).join(' / ')} °C</dd></div>
        </>}
      </dl>
      <div
        className={styles.legend}
        aria-label="连续热色图例，20 至 1000 摄氏度"
      >
        <span>
          <i />
          20 °C 冷
        </span>
        <span>
          <i />
          250 °C 温
        </span>
        <span>
          <i />
          700 °C 热
        </span>
        <span>
          <i />
          1000 °C 极热
        </span>
      </div>
      <p className={styles.key}>
        <span className={styles.k1}>K1 橙色／实线</span>{' '}
        <span className={styles.k2}>K2 蓝色／虚线</span>{' '}
        标签与线型同时区分离合器，颜色不是唯一信息。
      </p>
      <div className={styles.audioRow}>
        <output aria-live="polite">声音：{audioLabels[audioStatus]}</output>
        {audioStatus !== 'running' && audioStatus !== 'disposed' && (
          <button
            type="button"
            className={styles.soundButton}
            onClick={onEnableAudio}
            disabled={!onEnableAudio || audioStatus === 'starting'}
            aria-label="开启分层发动机声音，默认关闭"
          >
            开启声音
          </button>
        )}
      </div>
    </section>
  );
}
