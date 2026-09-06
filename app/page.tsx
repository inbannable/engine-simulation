'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  Square,
  SkipForward,
  Volume2,
  VolumeX,
  RotateCcw,
  MoveUpRight,
  Info,
  X,
  ChevronRight,
  Expand,
  Wind,
  Activity,
  Check,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  INITIAL,
  STAGES,
  ORDER,
  OFFSETS,
  evaluateEngine,
  mod,
  advanceRPM,
  firingEvents,
  type SimulationState,
  type ViewMode,
} from '../engine/physics';
import { EngineAudio } from '../engine/audio';
import type { SceneHandle } from '../engine/scene';
const MODES = [
  ['solid', '实物'],
  ['cutaway', '剖切'],
  ['mechanism', '机构'],
] as const;
const CAMERA_OPTIONS = [
  ['iso', '总览'],
  ['intake', '进气侧'],
  ['exhaust', '排气侧'],
  ['timing', '正时侧'],
  ['top', '顶部'],
  ['section', '五缸剖面'],
];
export default function Home() {
  const infoDialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLDivElement>(null),
    scene = useRef<SceneHandle | null>(null),
    state = useRef<SimulationState>({ ...INITIAL }),
    audio = useRef<EngineAudio | null>(null);
  const [ui, setUI] = useState({ ...INITIAL }),
    [loaded, setLoaded] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [showInfo, setShowInfo] = useState(false),
    [camera, setCamera] = useState('iso'),
    [fps, setFps] = useState(0),
    [notice, setNotice] = useState(''),
    [counts, setCounts] = useState({ events: 0, calls: 0, triangles: 0 });
  const patch = (next: Partial<SimulationState>) => {
    Object.assign(state.current, next);
    setUI({ ...state.current });
    if (next.playing === false || next.sound === false) audio.current?.mute();
  };
  const chooseCamera = (name: string) => {
    setCamera(name);
    scene.current?.camera(name);
  };
  useEffect(() => {
    const controller = new AbortController();
    let raf = 0,
      last = 0,
      lastUI = 0,
      fpsStart = 0,
      frames = 0,
      totalEvents = 0;
    let mounted = true;
    audio.current = new EngineAudio();
    import('../engine/scene')
      .then(async (m) => {
        if (!canvas.current || !mounted) return;
        const view = await m.createScene(
          canvas.current,
          (n) => patch({ selected: n }),
          (n) => {
            if (mounted) setProgress(n);
          },
          controller.signal,
        );
        if (!mounted) {
          view.dispose();
          return;
        }
        scene.current = view;
        view.camera(state.current.mode === 'solid' ? 'iso' : 'section');
        setLoaded(true);
        const loop = (now: number) => {
          if (!mounted) return;
          const dt = last ? (now - last) / 1000 : 0;
          last = now;
          const s = state.current,
            previous = s.angle;
          if (s.playing && !document.hidden) {
            const advanced = advanceRPM(s.rpm, s.targetRpm, dt);
            s.rpm = advanced.rpm;
            s.angle += s.realtime
              ? advanced.degrees
              : s.rate > 0
                ? advanced.degrees * s.rate
                : Math.min(30, s.rpm) * 6 * dt;
            const events = firingEvents(previous, s.angle);
            totalEvents += events.length;
            if (s.sound)
              for (const e of events)
                audio.current?.fire(
                  e.cylinder,
                  s.rpm,
                  !s.realtime,
                  dt > 0
                    ? ((e.angle - previous) / (s.angle - previous)) *
                        Math.min(dt, 0.1)
                    : 0,
                );
          }
          view.update(s);
          frames++;
          if (now - fpsStart > 1000) {
            setFps(Math.round((frames * 1000) / (now - fpsStart)));
            frames = 0;
            fpsStart = now;
            setCounts({ events: totalEvents, ...view.metrics() });
          }
          if (now - lastUI > 90) {
            setUI({ ...s });
            lastUI = now;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch((e) => {
        if (mounted && !controller.signal.aborted) {
          setError(e instanceof Error ? e.message : '无法初始化三维视图');
          setNotice('请确认浏览器已启用硬件加速，并重试。');
        }
      });
    const visibility = () => {
      last = 0;
      if (document.hidden) {
        patch({ playing: false });
        audio.current?.mute();
        setNotice('离开页面后已暂停，点击播放继续。');
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted = false;
      controller.abort();
      cancelAnimationFrame(raf);
      scene.current?.dispose();
      scene.current = null;
      void audio.current?.dispose();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [attempt]);
  useEffect(() => {
    if (showInfo) infoDialog.current?.showModal();
    else infoDialog.current?.close();
  }, [showInfo]);
  useEffect(() => {
    type Context = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_engine_state',
        description: '读取发动机当前转速、曲轴角、观察模式和五缸阶段。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => ({
          ...state.current,
          angle: mod(state.current.angle),
          cylinders: evaluateEngine(state.current.angle).map((c) => ({
            cylinder: c.cylinder,
            stage: STAGES[c.stage].name,
          })),
        }),
      },
      {
        name: 'configure_engine',
        description:
          '设置发动机转速、暂停/播放、观察模式或指定曲轴角。与页面控件使用同一状态。',
        inputSchema: {
          type: 'object',
          properties: {
            rpm: { type: 'number', minimum: 800, maximum: 7000 },
            angle: { type: 'number', minimum: 0, maximum: 720 },
            playing: { type: 'boolean' },
            mode: { type: 'string', enum: ['solid', 'cutaway', 'mechanism'] },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('输入必须是对象');
          const v = input as Record<string, unknown>;
          for (const k of Object.keys(v))
            if (!['rpm', 'angle', 'playing', 'mode'].includes(k))
              throw new Error('未知字段');
          if (
            v.rpm !== undefined &&
            (typeof v.rpm !== 'number' ||
              !Number.isFinite(v.rpm) ||
              v.rpm < 800 ||
              v.rpm > 7000)
          )
            throw new Error('转速须为800–7000');
          if (
            v.angle !== undefined &&
            (typeof v.angle !== 'number' ||
              !Number.isFinite(v.angle) ||
              v.angle < 0 ||
              v.angle > 720)
          )
            throw new Error('转角须为0–720');
          if (v.playing !== undefined && typeof v.playing !== 'boolean')
            throw new Error('playing须为布尔值');
          if (
            v.mode !== undefined &&
            (typeof v.mode !== 'string' ||
              !['solid', 'cutaway', 'mechanism'].includes(v.mode))
          )
            throw new Error('未知模式');
          const next: Partial<SimulationState> = {};
          if (v.rpm !== undefined) next.targetRpm = v.rpm as number;
          if (v.angle !== undefined) {
            next.angle = v.angle as number;
            next.playing = false;
          }
          if (v.playing !== undefined) next.playing = v.playing as boolean;
          if (v.mode !== undefined) next.mode = v.mode as ViewMode;
          patch(next);
          if (next.mode)
            chooseCamera(next.mode === 'solid' ? 'iso' : 'section');
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          return { ...state.current, angle: mod(state.current.angle) };
        },
      },
    ];
    for (const tool of tools)
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* Browser may not support proposed API */
      }
    return () => lifecycle.abort();
  }, []);
  function chooseMode(mode: ViewMode) {
    patch({ mode });
    chooseCamera(mode === 'solid' ? 'iso' : 'section');
  }
  async function toggleAudio() {
    if (ui.sound) {
      patch({ sound: false });
      return;
    }
    try {
      await audio.current?.enable();
      patch({ sound: true });
    } catch {
      setNotice('声音未能启用，请再次点击声音按钮。');
    }
  }
  function seek(angle: number) {
    patch({ angle, playing: false });
    setNotice('');
  }
  function togglePlay() {
    patch({ playing: !state.current.playing });
    setNotice('');
  }
  const angle =
      !ui.playing && ui.angle > 0 && mod(ui.angle) === 0 ? 720 : mod(ui.angle),
    cylinders = evaluateEngine(ui.angle),
    selected = cylinders[ui.selected - 1],
    stage = STAGES[selected.stage];
  const displayRpm = ui.playing
    ? ui.realtime
      ? ui.rpm
      : ui.rate > 0
        ? ui.rpm * ui.rate
        : 30
    : 0;
  return (
    <main>
      <header>
        <div className="brand">
          <b>
            RS<span>3</span>
          </b>
          <i />
          <div>
            机械实验室<small>FIVE-CYLINDER ENGINE LAB</small>
          </div>
        </div>
        <div className="header-right">
          <span className="header-note">2021 RS 3 · EA855 EVO</span>
          <button className="text-button" onClick={() => setShowInfo(true)}>
            <Info size={16} />
            模型与资料
          </button>
        </div>
      </header>
      <section className="workspace">
        <div className="stage">
          <div className="stage-heading">
            <p>AUDI SPORT / 2.5 TFSI</p>
            <h1>五缸，同一个心跳。</h1>
            <span>
              {ui.mode === 'solid'
                ? '以实物为参考的独立发动机总成'
                : ui.mode === 'cutaway'
                  ? '缸体纵向剖切 · 观察五缸协同工作'
                  : '运动机构 · 曲轴、连杆与配气传动'}
            </span>
          </div>
          <div className="canvas" ref={canvas} />
          {(!loaded || error) && (
            <div className="loading-overlay">
              <div>
                {error ? (
                  <>
                    <Info size={28} />
                    <h3>三维视图暂不可用</h3>
                    <p>{error}</p>
                    <p>需要支持 WebGL 的浏览器与硬件加速。</p>
                    <button
                      onClick={() => {
                        setLoaded(false);
                        setError('');
                        setProgress(0);
                        setAttempt((n) => n + 1);
                      }}
                    >
                      重新加载
                    </button>
                  </>
                ) : (
                  <>
                    <div className="loading-ring" />
                    <h3>正在装配发动机</h3>
                    <p>
                      {progress < 95
                        ? '加载分件模型'
                        : '准备金属材质与机械机构'}{' '}
                      · {Math.round(progress)}%
                    </p>
                    <progress max={100} value={progress} />
                  </>
                )}
              </div>
            </div>
          )}
          <fieldset className="view-tabs" aria-label="模型显示模式">
            {MODES.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={ui.mode === value}
                className={ui.mode === value ? 'active' : ''}
                onClick={() => chooseMode(value)}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <div className="camera-tools">
            <label>
              <Expand size={15} />
              <select
                aria-label="预设视角"
                value={camera}
                onChange={(e) => chooseCamera(e.target.value)}
              >
                {CAMERA_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              title="重置视角"
              aria-label="重置视角"
              onClick={() =>
                chooseCamera(ui.mode === 'solid' ? 'iso' : 'section')
              }
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="stage-bottom">
            <span>
              <span className={'live-dot ' + (ui.playing ? 'running' : '')} />
              {ui.playing ? (ui.realtime ? '实时运行' : '慢速观察') : '已暂停'}
              <i />
              显示 {Math.round(displayRpm)} rpm
            </span>
            <span className="fps">{fps} FPS</span>
          </div>
          <div className="orbit-hint">
            拖动旋转 · 滚轮缩放{ui.mode !== 'solid' ? ' · 点击缸号观察' : ''}
          </div>
          <div className="mode-options">
            {ui.mode === 'solid' && (
              <button
                className={ui.cover ? 'selected' : ''}
                aria-pressed={ui.cover}
                onClick={() => patch({ cover: !ui.cover })}
              >
                {ui.cover ? (
                  <Check size={14} />
                ) : (
                  <span className="empty-check" />
                )}
                发动机饰盖
              </button>
            )}
            <button
              className={ui.flow ? 'selected' : ''}
              aria-pressed={ui.flow}
              onClick={() => patch({ flow: !ui.flow })}
            >
              <Wind size={15} />
              气流
            </button>
            <button
              className={ui.vibration ? 'selected' : ''}
              aria-pressed={ui.vibration}
              onClick={() => patch({ vibration: !ui.vibration })}
            >
              <Activity size={15} />
              振动
            </button>
          </div>
        </div>
        <aside>
          <div className="aside-title">
            <span className="eyebrow">THE INLINE FIVE</span>
            <span className="engine-badge">2.5 TFSI</span>
          </div>
          <div className="mini-specs">
            <div>
              <strong>
                400<small>PS</small>
              </strong>
              <span>最大功率</span>
            </div>
            <div>
              <strong>
                500<small>Nm</small>
              </strong>
              <span>最大扭矩</span>
            </div>
          </div>
          <div className="firing">
            <div className="section-label">
              <span>点火顺序</span>
              <small>间隔 144°</small>
            </div>
            <div className="firing-order">
              {ORDER.map((n, i) => (
                <span key={n}>
                  <button
                    className={ui.selected === n ? 'selected' : ''}
                    style={
                      {
                        '--c': STAGES[cylinders[n - 1].stage].color,
                      } as React.CSSProperties
                    }
                    onClick={() => patch({ selected: n })}
                    aria-label={`选择第${n}缸`}
                    aria-pressed={ui.selected === n}
                  >
                    {n}
                    <i className={cylinders[n - 1].firing ? 'fired' : ''} />
                  </button>
                  {i < 4 && <ChevronRight size={12} />}
                </span>
              ))}
            </div>
          </div>
          <div
            className="cylinder-detail"
            style={{ '--c': stage.color } as React.CSSProperties}
          >
            <div className="section-label">
              <span>气缸 {ui.selected.toString().padStart(2, '0')}</span>
              <span className="phase-badge">{stage.name}</span>
            </div>
            <div className="piston-diagram">
              <svg
                viewBox="0 0 220 126"
                aria-label={`第${ui.selected}缸正在${stage.name}`}
              >
                <defs>
                  <linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor={stage.color} stopOpacity=".4" />
                    <stop
                      offset="1"
                      stopColor={stage.color}
                      stopOpacity=".02"
                    />
                  </linearGradient>
                </defs>
                <path
                  d="M62 115V16H158V115"
                  fill="none"
                  stroke="#555f6c"
                  strokeWidth="3"
                />
                <path d="M64 19H156" stroke={stage.color} strokeWidth="2" />
                <rect
                  x="65"
                  y="21"
                  width="90"
                  height={15 + (190.4 - selected.pistonY) * 0.55}
                  fill="url(#gasFill)"
                />
                <g
                  transform={`translate(0,${(190.4 - selected.pistonY) * 0.55})`}
                >
                  <rect
                    x="65"
                    y="36"
                    width="90"
                    height="20"
                    rx="2"
                    fill="#929da9"
                  />
                  <path
                    d="M66 41H154M66 46H154"
                    stroke="#343e49"
                    strokeWidth="2"
                  />
                  <path d="M109 57L118 101" stroke="#73818e" strokeWidth="8" />
                </g>
                <path
                  d="M73 6V22M66 22H80"
                  stroke={selected.intakeLift > 0 ? '#62b7f1' : '#6a7580'}
                  strokeWidth="3"
                />
                <path
                  d="M147 6V22M140 22H154"
                  stroke={selected.exhaustLift > 0 ? '#a5b4c4' : '#6a7580'}
                  strokeWidth="3"
                />
                <text x="175" y="65" fill={stage.color} fontSize="24">
                  {selected.downward ? '↓' : '↑'}
                </text>
              </svg>
              <span>{stage.en}</span>
            </div>
            <p className="stage-description">{stage.description}</p>
            <div className="detail-grid">
              <span>
                缸内相位<b>{selected.phase.toFixed(0)}°</b>
              </span>
              <span>
                活塞运动
                <b>
                  {selected.downward ? (
                    <ArrowDown size={13} />
                  ) : (
                    <ArrowUp size={13} />
                  )}{' '}
                  {selected.downward ? '下行' : '上行'}
                </b>
              </span>
              <span>
                进气门
                <b className={selected.intakeLift > 0.01 ? 'open' : ''}>
                  {selected.intakeLift > 0.01 ? '开启' : '关闭'}
                </b>
              </span>
              <span>
                排气门
                <b className={selected.exhaustLift > 0.01 ? 'open' : ''}>
                  {selected.exhaustLift > 0.01 ? '开启' : '关闭'}
                </b>
              </span>
            </div>
          </div>
          <p className="teaching-note">
            <Info size={13} />
            固定教学配气 · 燃烧与气流为示意
          </p>
          <button className="source-link" onClick={() => setShowInfo(true)}>
            尺寸、来源与模型精度 <MoveUpRight size={14} />
          </button>
        </aside>
      </section>
      <section className="controls" aria-label="模拟控制">
        <div className="transport-row">
          <div className="transport">
            <button
              className="play-button"
              onClick={togglePlay}
              aria-label={ui.playing ? '暂停' : '播放'}
              disabled={!loaded}
            >
              {ui.playing ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </button>
            <button
              aria-label="停止并复位"
              title="停止并复位"
              onClick={() => {
                seek(0);
                patch({ rpm: 800 });
              }}
            >
              <Square size={16} />
            </button>
            <button
              aria-label="前进1度"
              title="前进1°"
              onClick={() => seek(state.current.angle + 1)}
            >
              +1°
            </button>
            <button
              aria-label="下一次点火"
              title="下一次点火"
              onClick={() =>
                seek((Math.floor(state.current.angle / 144) + 1) * 144)
              }
            >
              <SkipForward size={18} />
            </button>
          </div>
          <div className="rpm-control">
            <div className="rpm-label">
              <label htmlFor="rpm">工况转速</label>
              <strong>
                {Math.round(ui.rpm).toLocaleString('en-US')} <small>rpm</small>
              </strong>
            </div>
            <input
              id="rpm"
              aria-label="工况转速"
              type="range"
              min="800"
              max="7000"
              step="50"
              value={ui.targetRpm}
              onInput={(e) => patch({ targetRpm: +e.currentTarget.value })}
            />
            <div className="rpm-presets">
              {[800, 2000, 4000, 7000].map((r) => (
                <button
                  key={r}
                  className={ui.targetRpm === r ? 'selected' : ''}
                  onClick={() => patch({ targetRpm: r })}
                >
                  {r === 800 ? '怠速' : r.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </div>
          <div className="speed-control">
            <div className="speed-tabs">
              <button
                className={!ui.realtime ? 'active' : ''}
                onClick={() => patch({ realtime: false })}
              >
                观察模式
              </button>
              <button
                className={ui.realtime ? 'active' : ''}
                onClick={() => patch({ realtime: true })}
              >
                实时模式
              </button>
            </div>
            <div className="speed-description">
              {ui.realtime ? (
                <span>真实角速度 · 高转速可能出现频闪</span>
              ) : (
                <>
                  <select
                    aria-label="慢放倍率"
                    value={ui.rate}
                    onChange={(e) => patch({ rate: +e.target.value })}
                  >
                    <option value="0">自动慢放 · 30 rpm</option>
                    <option value="0.01">0.01×</option>
                    <option value="0.05">0.05×</option>
                    <option value="0.1">0.1×</option>
                  </select>
                  <span>
                    {ui.rate > 0
                      ? ui.rate.toFixed(2)
                      : (30 / ui.rpm).toFixed(3)}
                    ×
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            className={'audio-button ' + (ui.sound ? 'selected' : '')}
            onClick={toggleAudio}
            aria-label={ui.sound ? '关闭声音' : '开启声音'}
          >
            {ui.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
            <span>
              {ui.sound ? '声音已开' : '声音关闭'}
              <small>{ui.realtime ? '合成五缸声浪' : '慢放点火提示'}</small>
            </span>
          </button>
        </div>
        <div className="timeline-heading">
          <div>
            <span>四冲程工作循环</span>
            <small>曲轴两圈 · 凸轮轴一圈</small>
          </div>
          <output aria-label="曲轴转角">
            {angle.toFixed(1).padStart(5, '0')}
            <small>° / 720°</small>
          </output>
        </div>
        <div className="cycle-timeline">
          <div className="time-axis">
            <span>气缸</span>
            <div>
              {[0, 180, 360, 540, 720].map((a) => (
                <span key={a} style={{ left: `${a / 7.2}%` }}>
                  {a}°
                </span>
              ))}
            </div>
          </div>
          <div className="tracks">
            {cylinders.map((c) => (
              <button
                className={
                  'track-row ' + (c.cylinder === ui.selected ? 'selected' : '')
                }
                key={c.cylinder}
                aria-label={`查看气缸${c.cylinder}阶段`}
                onClick={() => patch({ selected: c.cylinder })}
              >
                <span>{c.cylinder.toString().padStart(2, '0')}</span>
                <div className="track">
                  {[0, 1, 2, 3].flatMap((s) => {
                    const start = mod(OFFSETS[c.cylinder - 1] + s * 180),
                      end = start + 180;
                    return [
                      { start, end: Math.min(end, 720) },
                      ...(end > 720 ? [{ start: 0, end: end - 720 }] : []),
                    ].map((seg, k) => (
                      <i
                        key={`${s}-${k}`}
                        style={{
                          left: `${seg.start / 7.2}%`,
                          width: `${(seg.end - seg.start) / 7.2}%`,
                          background: STAGES[s].color,
                        }}
                      />
                    ));
                  })}
                  <b style={{ left: `${angle / 7.2}%` }} />
                </div>
                <em style={{ color: STAGES[c.stage].color }}>
                  {STAGES[c.stage].name}
                </em>
              </button>
            ))}
          </div>
          <input
            className="angle-scrubber"
            type="range"
            aria-label="曲轴角度"
            min="0"
            max="720"
            step="1"
            value={angle}
            onInput={(e) => seek(+e.currentTarget.value)}
          />
        </div>
        <div className="timeline-footer">
          <div className="legend">
            {STAGES.map((s) => (
              <span key={s.name}>
                <i style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
          <span>{notice || '拖动时间轴暂停并逐度观察'}</span>
          <small>
            {counts.calls} 绘制 · {Math.round(counts.triangles / 1000)}k 三角面
          </small>
        </div>
      </section>
      <footer>
        <span>
          AUDI RS 3 8Y <i /> 2,480 cm³ <i /> 82.5 × 92.8 mm
        </span>
        <span>实物参考重建 / 非原厂 CAD</span>
      </footer>
      <dialog
        ref={infoDialog}
        className="info-modal"
        aria-label="模型与资料"
        onClose={() => setShowInfo(false)}
      >
        <button
          className="close-modal"
          aria-label="关闭资料"
          onClick={() => setShowInfo(false)}
          autoFocus
        >
          <X size={22} />
        </button>
        <p className="eyebrow">MODEL & REFERENCES</p>
        <h2>看见机械，也了解边界。</h2>
        <p>
          以 2021 Audi RS3 8Y 为基准。模型依据公开照片及 EA855 evo
          培训图解自行重建，外形与附件尺寸为近似，不是原厂 CAD 或制造图纸。
        </p>
        <dl>
          <dt>官方尺寸</dt>
          <dd>缸径 82.5 mm · 行程 92.8 mm · 1→2→4→5→3 · 点火间隔 144°</dd>
          <dt>同系列结构参考</dt>
          <dd>88 mm 缸距 · DOHC / 20 气门 · 变速箱侧两级正时链</dd>
          <dt>建模与教学近似</dt>
          <dd>
            144 mm 连杆中心距、8 mm
            气门升程、附件及铸件外形。固定配气曲线不包含原厂 AVS/VVT
            标定、气门重叠或点火提前。
          </dd>
          <dt>转速与视听</dt>
          <dd>
            800 rpm 为演示怠速，7,000 rpm
            为演示上限。合成声音、气流与振动为示意，不计算真实缸压、温度、涡轮响应或
            ECU 控制。
          </dd>
        </dl>
        <div className="reference-links">
          <a
            href="https://www.audi.com/en/high-performance-redefined-audi-rs-3-sportback-and-rs-3-sedan-2021-14310/the-engine-legendary-five-cylinder-14313"
            target="_blank"
            rel="noreferrer"
          >
            Audi · 2021 RS3 发动机说明 <MoveUpRight size={14} />
          </a>
          <a
            href="https://static.nhtsa.gov/odi/tsbs/2017/MC-10127901-9999.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Audi · EA855 evo 技术培训手册 <MoveUpRight size={14} />
          </a>
          <a
            href="https://www.audi.com/en/photos/detail/audi-rs-3-sedan-127100"
            target="_blank"
            rel="noreferrer"
          >
            Audi · 实物参考图 A250065 <MoveUpRight size={14} />
          </a>
          <a href="/models/rs3-ea855-evo.glb" download>
            下载分件 GLB 模型 <MoveUpRight size={14} />
          </a>
        </div>
      </dialog>
    </main>
  );
}
