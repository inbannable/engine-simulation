export const ORDER = [1, 2, 4, 5, 3] as const;
export const OFFSETS = [0, 144, 576, 288, 432] as const;
export const STAGES = [
  {
    name: '做功',
    en: 'POWER',
    color: '#f29452',
    description: '火花点燃混合气，膨胀推动活塞下行，经连杆驱动曲轴。',
  },
  {
    name: '排气',
    en: 'EXHAUST',
    color: '#a5b4c4',
    description: '排气门打开，活塞上行，将废气推向排气歧管。',
  },
  {
    name: '进气',
    en: 'INTAKE',
    color: '#62b7f1',
    description: '进气门打开，活塞下行，空气进入气缸。',
  },
  {
    name: '压缩',
    en: 'COMPRESSION',
    color: '#bd9bea',
    description: '进排气门关闭，活塞上行，压缩缸内混合气。',
  },
] as const;
export interface EngineSpec {
  bore: number;
  stroke: number;
  rod: number;
  spacing: number;
  offsets: readonly number[];
}
export const SPEC: EngineSpec = {
  bore: 82.5,
  stroke: 92.8,
  rod: 144,
  spacing: 88,
  offsets: OFFSETS,
};
export const mod = (n: number, base = 720) => ((n % base) + base) % base;
const RAD = Math.PI / 180;
export function evaluateEngine(angle: number, spec = SPEC) {
  const r = spec.stroke / 2;
  return spec.offsets.map((offset, i) => {
    const phase = mod(angle - offset),
      theta = phase * RAD;
    const pinZ = r * Math.sin(theta),
      pinY = r * Math.cos(theta);
    const pistonY = pinY + Math.sqrt(spec.rod ** 2 - pinZ ** 2);
    const stage = Math.floor(phase / 180);
    const valveLift = (start: number) =>
      phase >= start && phase < start + 180
        ? 8 * Math.sin((phase - start) * RAD) ** 2
        : 0;
    return {
      cylinder: i + 1,
      x: (i - 2) * spec.spacing,
      phase,
      theta,
      stage,
      pinZ,
      pinY,
      pistonY,
      rodAngle: Math.atan2(-pinZ, pistonY - pinY),
      intakeLift: valveLift(360),
      exhaustLift: valveLift(180),
      camAngle: (angle * RAD) / 2,
      downward: phase < 180 || (phase >= 360 && phase < 540),
      firing: phase < 22,
    };
  });
}
export function firingEvents(from: number, to: number) {
  if (to < from) return [];
  const events: { angle: number; cylinder: number }[] = [];
  for (let k = Math.floor(from / 144) + 1; k <= Math.floor(to / 144); k++)
    events.push({ angle: k * 144, cylinder: ORDER[mod(k, 5)] });
  return events;
}
export function advanceRPM(current: number, target: number, dt: number) {
  const tau = 0.32,
    decay = Math.exp(-dt / tau);
  return {
    rpm: target + (current - target) * decay,
    degrees: 6 * (target * dt + (current - target) * tau * (1 - decay)),
  };
}
export type ViewMode = 'solid' | 'cutaway' | 'mechanism';
export interface SimulationState {
  angle: number;
  rpm: number;
  targetRpm: number;
  playing: boolean;
  mode: ViewMode;
  realtime: boolean;
  rate: number;
  sound: boolean;
  flow: boolean;
  vibration: boolean;
  cover: boolean;
  selected: number;
}
export const INITIAL: SimulationState = {
  angle: 0,
  rpm: 800,
  targetRpm: 800,
  playing: true,
  mode: 'solid',
  realtime: false,
  rate: 0,
  sound: false,
  flow: true,
  vibration: false,
  cover: true,
  selected: 1,
};
