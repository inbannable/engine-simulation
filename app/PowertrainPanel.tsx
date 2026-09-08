'use client';
import {
  GEARS,
  totalRatio,
  rpmAtSpeed,
  SYNC_GROUPS,
  type Powertrain,
  type DriveMode,
} from '../engine/powertrain';
const phases = {
  steady: '稳定传动 / 下一挡预选',
  prepare: '同步器准备',
  handover: '离合器扭矩交接',
  synchronize: '转速同步与锁止',
};
const status = { open: '断开', slipping: '滑摩', locked: '锁止传动' };
export function PowertrainPanel({
  model,
  linked,
  toggle,
  refresh,
  step,
  clock,
}: {
  clock: {
    playing: boolean;
    rate: number;
    togglePlay: () => void;
    setRate: (n: number) => void;
  };
  model: Powertrain;
  linked: boolean;
  toggle: () => void;
  refresh: () => void;
  step: () => void;
}) {
  const s = model.state,
    samples = s.phase === 'steady' ? s.lastShift : s.history;
  const line = (key: 'rpm' | 'k1' | 'k2' | 'slip1' | 'slip2', scale: number) =>
    samples
      .map(
        (v, i) =>
          `${10 + (i / Math.max(1, samples.length - 1)) * 570},${(key === 'rpm' ? 130 : 75) - (v[key] / scale) * (key === 'rpm' ? 110 : 60)}`,
      )
      .join(' ');
  return (
    <section className="powertrain-panel" aria-label="双离合动力系统">
      <div className="pt-heading">
        <div>
          <h2>七挡双离合 · 动力系统</h2>
          <p>同代齿比参考 · 教学动力学与换挡时序</p>
        </div>
        <button aria-pressed={linked} onClick={toggle}>
          {linked ? '动力系统联动' : '发动机独立观察'}
        </button>
      </div>
      {linked && (
        <>
          <div className="pt-modes">
            <button onClick={clock.togglePlay}>
              {clock.playing ? '暂停' : '播放'}
            </button>
            <label>
              统一时钟{' '}
              <select
                aria-label="动力系统播放速度"
                value={clock.rate}
                onChange={(e) => clock.setRate(+e.target.value)}
              >
                {[1, 0.1, 0.05, 0.02, 0.01].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate === 1 ? '实时 1×' : `慢放 ${rate}×`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="pt-driver">
            <div className="pt-modes">
              {(['N', 'R', 'D', 'S', 'M'] as DriveMode[]).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={model.input.mode === mode}
                  onClick={() => {
                    model.configure({ mode });
                    refresh();
                  }}
                >
                  {mode}
                </button>
              ))}
              <button
                onClick={() => {
                  model.requestShift(-1);
                  refresh();
                }}
              >
                − 降挡
              </button>
              <button
                onClick={() => {
                  model.requestShift(1);
                  refresh();
                }}
              >
                ＋ 升挡
              </button>
              <button onClick={step}>单步 1/60 秒</button>
            </div>
            {(['throttle', 'brake'] as const).map((key) => (
              <label key={key}>
                {key === 'throttle' ? '油门' : '刹车'}{' '}
                {Math.round(model.input[key] * 100)}%
                <input
                  aria-label={key === 'throttle' ? '油门' : '刹车'}
                  type="range"
                  min="0"
                  max="1"
                  step=".01"
                  value={model.input[key]}
                  onChange={(e) => {
                    model.configure({ [key]: +e.target.value });
                    refresh();
                  }}
                />
              </label>
            ))}
          </div>
          <output className="pt-notice">
            {s.message || phases[s.phase]} · 队列 {s.queue.length}/4 · 模拟时间{' '}
            {s.time.toFixed(2)} s
          </output>
          <div className="pt-selector-grid" aria-label="同步套与拨叉实时行程">
            {SYNC_GROUPS.map((pair, i) => {
              const selected = s.selected.find((g) =>
                (pair as readonly number[]).includes(g),
              );
              return (
                <div className="pt-selector" key={i}>
                  <span>
                    {pair.map((g) => (g === -1 ? 'R' : g)).join(' / ')} 同步套
                  </span>
                  <div className="pt-selector-track">
                    <i
                      style={{
                        left: `${50 + (s.selectorPositions[i] / 7) * 44}%`,
                      }}
                    />
                  </div>
                  <small>
                    {s.selectorPositions[i].toFixed(1)} mm ·{' '}
                    {selected
                      ? `${selected === -1 ? 'R' : selected}挡接合`
                      : Math.abs(s.selectorPositions[i]) > 0.1
                        ? '拨叉移动 / 同步'
                        : '中位'}
                  </small>
                </div>
              );
            })}
          </div>
          <div className="pt-paths" aria-label="当前动力传递方向">
            {GEARS.filter(
              (g) =>
                s.selected[g.clutch] === g.gear &&
                Math.abs(s.clutches[g.clutch].torque) > 1,
            ).map((g) => {
              const torque = s.clutches[g.clutch].torque;
              const route = [
                '发动机',
                `K${g.clutch + 1}`,
                ...(g.gear === -1 ? ['二挡中转', '倒挡'] : [`${g.gear}挡`]),
                `输出轴${g.shaft}`,
                '主减速',
                '车轮',
              ];
              return (
                <p className={`pt-path k${g.clutch + 1}`} key={g.gear}>
                  <strong>
                    {torque >= 0 ? '驱动' : '发动机制动'} ·{' '}
                    {Math.abs(torque).toFixed(0)} Nm
                  </strong>
                  <span>
                    {(torque >= 0 ? route : route.reverse()).join(' → ')}
                  </span>
                </p>
              );
            })}
            <p>发光箭头表示承载方向；预选齿轮保持暗色。箭头移动为方向示意。</p>
          </div>
          <div className="pt-values">
            {[
              [
                '当前 → 目标',
                `${s.gear === 0 ? 'N' : s.gear === -1 ? 'R' : s.gear} → ${s.target === 0 ? 'N' : s.target === -1 ? 'R' : s.target}`,
              ],
              ['预选挡', s.preselected || '—'],
              ['发动机', `${s.rpm.toFixed(0)} rpm`],
              ['车速', `${(s.speed * 3.6).toFixed(1)} km/h`],
              ['总传动比', totalRatio(s.gear).toFixed(3)],
              ['轮端扭矩', `${s.wheelTorque.toFixed(0)} Nm`],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="pt-clutches">
            {s.clutches.map((c, i) => (
              <article key={i} className={`k${i + 1}`}>
                <h3>
                  K{i + 1} → 输入轴 {i + 1}{' '}
                  <small>
                    {c.status === 'open' &&
                    s.preselected &&
                    s.selected[i] === s.preselected
                      ? '预选 · 无发动机扭矩'
                      : status[c.status]}
                  </small>
                </h3>
                <progress
                  aria-label={`K${i + 1} 接合程度`}
                  value={c.engagement}
                  max="1"
                />
                <p>
                  接合 {(c.engagement * 100).toFixed(0)}% ·{' '}
                  {s.inputRpm[i].toFixed(0)} rpm
                </p>
                <p>
                  滑差 {c.slip.toFixed(0)} rpm · 扭矩 {c.torque.toFixed(0)} Nm ·
                  耗散 {(c.heat / 1000).toFixed(1)} kJ
                </p>
              </article>
            ))}
          </div>
          <details open>
            <summary>最近一次换挡曲线</summary>
            <p>
              白色：发动机 0–8000 rpm · 橙色 K1 / 蓝色 K2：−700–700 Nm ·
              横轴：换挡模拟时间
            </p>
            {samples.length > 1 ? (
              <>
                <svg
                  viewBox="0 0 600 150"
                  aria-label="换挡时发动机转速及双离合传递扭矩曲线"
                >
                  <path
                    d="M10 15V130H590M10 75H590"
                    stroke="#626c77"
                    fill="none"
                  />
                  {(['rpm', 'k1', 'k2'] as const).map((key, i) => (
                    <polyline
                      key={key}
                      points={line(key, i ? 700 : 8000)}
                      fill="none"
                      stroke={['#e8edf5', '#ffad55', '#59bdff'][i]}
                      strokeWidth="2"
                    />
                  ))}
                </svg>
                <p>滑差曲线：橙色 K1 / 蓝色 K2，纵轴 ±8000 rpm，中心为零</p>
                <svg viewBox="0 0 600 150" aria-label="双离合滑差曲线">
                  <path d="M10 75H590" stroke="#626c77" fill="none" />
                  {(['slip1', 'slip2'] as const).map((key, i) => (
                    <polyline
                      key={key}
                      points={line(key, 8000)}
                      fill="none"
                      stroke={i ? '#59bdff' : '#ffad55'}
                      strokeWidth="2"
                    />
                  ))}
                </svg>
                <p>
                  {samples[0].time.toFixed(2)} –{' '}
                  {samples.at(-1)!.time.toFixed(2)} s
                </p>
              </>
            ) : (
              <p>完成换挡后保留曲线；当前无记录。</p>
            )}
          </details>
        </>
      )}
      <details>
        <summary>七挡对比与资料范围</summary>
        <p>
          统一取 3000 rpm / 100 km/h，滚动半径 0.32
          m。倍率为理想总传动比。奇偶离合器分组与输出轴分组不同。
        </p>
        <div className="pt-table">
          <table>
            <thead>
              <tr>
                <th>挡</th>
                <th>离合器</th>
                <th>齿比</th>
                <th>主减速</th>
                <th>倍率</th>
                <th>3000 rpm 车速</th>
                <th>100 km/h 转速</th>
              </tr>
            </thead>
            <tbody>
              {GEARS.map((g) => (
                <tr key={g.gear}>
                  <td>{g.gear === -1 ? 'R' : g.gear}</td>
                  <td>K{g.clutch + 1}</td>
                  <td>{Math.abs(g.ratio).toFixed(3)}</td>
                  <td>{g.final.toFixed(3)}</td>
                  <td>{totalRatio(g.gear).toFixed(3)}</td>
                  <td>
                    {(
                      ((((3000 * Math.PI) / 30) * 0.32) / totalRatio(g.gear)) *
                      3.6
                    ).toFixed(1)}
                  </td>
                  <td>{rpmAtSpeed(g.gear, 100 / 3.6).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          2021 EA855 evo 400 PS / 500 Nm；完整齿比采用 Audi 同代后期规格。DQ500
          0BT 内部结构参考 SSP 454；几何、惯量、阻力、离合器容量及 D/S
          控制均为教学近似，不代表原厂加速性能。
        </p>
      </details>
    </section>
  );
}
