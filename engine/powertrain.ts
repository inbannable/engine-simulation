/** Educational DQ500-family model. SI internally; displayed rpm and km/h. */
export type Gear = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type DriveMode = 'N' | 'R' | 'D' | 'S' | 'M';
export const SYNC_GROUPS = [
  [1, 5],
  [3, 7],
  [-1, 4],
  [2, 6],
] as const;
export const GEARS = [
  { gear: 1, clutch: 0, ratio: 3.562, final: 4.058, shaft: 1 },
  { gear: 2, clutch: 1, ratio: 2.526, final: 3.45, shaft: 2 },
  { gear: 3, clutch: 0, ratio: 1.678, final: 3.45, shaft: 2 },
  { gear: 4, clutch: 1, ratio: 1.021, final: 4.058, shaft: 1 },
  { gear: 5, clutch: 0, ratio: 0.788, final: 4.058, shaft: 1 },
  { gear: 6, clutch: 1, ratio: 0.76, final: 3.45, shaft: 2 },
  { gear: 7, clutch: 0, ratio: 0.634, final: 3.45, shaft: 2 },
  { gear: -1, clutch: 1, ratio: -2.789, final: 4.058, shaft: 1 },
] as const;
export const gearInfo = (g: Gear) => GEARS.find((x) => x.gear === g);
export function selectorTarget(g: Gear, index: number) {
  const pair: readonly number[] = SYNC_GROUPS[index];
  return pair.includes(g) ? (g === pair[0] ? -7 : 7) : 0;
}
/** All sleeves on the incoming clutch must clear before a dog can lock. */
export function selectorReady(s: PowertrainState, g: Gear) {
  const clutch = gearInfo(g)?.clutch;
  return SYNC_GROUPS.every(
    (pair, i) =>
      gearInfo(pair[0])?.clutch !== clutch ||
      Math.abs(s.selectorPositions[i] - selectorTarget(g, i)) < 0.01,
  );
}
export const totalRatio = (g: Gear) => {
  const x = gearInfo(g);
  return x ? x.ratio * x.final : 0;
};
export interface PowertrainSpec {
  step: number;
  mass: number;
  radius: number;
  engineInertia: number;
  rolling: number;
  dragArea: number;
  airDensity: number;
  grip: number;
  brakeForce: number;
  clutchCapacity: number;
  idle: number;
  limit: number;
  response: number;
  prepareTime: number;
  handoverTime: number;
  holdTime: number;
}
export const POWERTRAIN_SPEC: PowertrainSpec = {
  step: 1 / 600,
  mass: 1645,
  radius: 0.32,
  engineInertia: 0.32,
  rolling: 0.012,
  dragArea: 0.755,
  airDensity: 1.225,
  grip: 1.05,
  brakeForce: 18000,
  clutchCapacity: 680,
  idle: 800,
  limit: 7000,
  response: 0.18,
  prepareTime: 0.32,
  handoverTime: 0.38,
  holdTime: 1.2,
};
export interface DriverInput {
  throttle: number;
  brake: number;
  mode: DriveMode;
}
export interface ClutchState {
  engagement: number;
  slip: number;
  torque: number;
  status: 'open' | 'slipping' | 'locked';
  heat: number;
}
export interface ShiftSample {
  time: number;
  rpm: number;
  k1: number;
  k2: number;
  slip1: number;
  slip2: number;
}
export interface PowertrainState {
  time: number;
  rpm: number;
  speed: number;
  angle: number;
  wheelAngle: number;
  inputRpm: number[];
  inputAngle: number[];
  selected: Gear[];
  gear: Gear;
  target: Gear;
  preselected: Gear;
  phase: 'steady' | 'prepare' | 'handover' | 'synchronize';
  phaseTime: number;
  held: number;
  throttle: number;
  engineTorque: number;
  wheelTorque: number;
  clutches: ClutchState[];
  queue: number[];
  message: string;
  history: ShiftSample[];
  lastShift: ShiftSample[];
  synchronizer: number;
  mode: DriveMode;
  pendingGear: Gear;
  preselectionTime: number;
  selectorPositions: number[];
}
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const RAD = Math.PI / 30;
export function fullThrottleTorque(rpm: number) {
  if (rpm < 2250) return 160 + 340 * clamp((rpm - 800) / 1450);
  if (rpm <= 5600) return 500;
  return 294000 / (rpm * RAD);
}
export const rpmAtSpeed = (g: Gear, speed: number, spec = POWERTRAIN_SPEC) =>
  ((speed / spec.radius) * totalRatio(g)) / RAD;
export function initialPowertrain(): PowertrainState {
  return {
    time: 0,
    rpm: 800,
    speed: 0,
    angle: 0,
    wheelAngle: 0,
    inputRpm: [0, 0],
    inputAngle: [0, 0],
    selected: [0, 0],
    gear: 0,
    target: 0,
    preselected: 0,
    phase: 'steady',
    phaseTime: 0,
    held: 0,
    throttle: 0,
    engineTorque: 0,
    wheelTorque: 0,
    clutches: [0, 1].map(() => ({
      engagement: 0,
      slip: 800,
      torque: 0,
      status: 'open',
      heat: 0,
    })),
    queue: [],
    message: '',
    history: [],
    lastShift: [],
    synchronizer: 0,
    mode: 'N',
    pendingGear: 0,
    preselectionTime: 0,
    selectorPositions: [0, 0, 0, 0],
  };
}
/** Friction impulse cannot overshoot zero slip, hence cannot add kinetic energy. */
export function frictionImpulse(
  slip: number,
  inverseInertia: number,
  capacityImpulse: number,
) {
  return clamp(slip / inverseInertia, -capacityImpulse, capacityImpulse);
}
export class Powertrain {
  /** Optional coupled solver. Called once inside every mechanical fixed step. */
  systems?: {
    step(
      state: Readonly<PowertrainState>,
      command: [number, number],
      seconds: number,
    ): { torque: number; engagement: [number, number] };
  };
  state = initialPowertrain();
  input: DriverInput = { throttle: 0, brake: 0, mode: 'N' };
  private remainder = 0;
  private lastDirection = 0;
  constructor(public readonly spec = POWERTRAIN_SPEC) {}
  reset() {
    this.state = initialPowertrain();
    this.input = { throttle: 0, brake: 0, mode: 'N' };
    this.remainder = 0;
    this.lastDirection = 0;
  }
  configure(next: Partial<DriverInput>) {
    for (const k of Object.keys(next))
      if (!['mode', 'throttle', 'brake'].includes(k))
        throw new Error('未知动力系统输入');
    for (const key of ['throttle', 'brake'] as const)
      if (
        next[key] !== undefined &&
        (!Number.isFinite(next[key]) || next[key]! < 0 || next[key]! > 1)
      )
        throw new Error('踏板范围为 0–1');
    if (
      next.mode !== undefined &&
      !['N', 'R', 'D', 'S', 'M'].includes(next.mode)
    )
      throw new Error('未知驾驶模式');
    const s = this.state,
      mode = next.mode ?? this.input.mode;
    if (mode !== this.input.mode) {
      const direction = mode === 'N' ? 0 : mode === 'R' ? -1 : 1;
      const reverseChange =
        mode !== 'N' &&
        (mode === 'R' ||
          (this.lastDirection !== 0 && direction !== this.lastDirection));
      const opposing =
        mode !== 'N' &&
        ((mode === 'R' && s.speed > 0.2) || (mode !== 'R' && s.speed < -0.2));
      if (
        opposing ||
        (reverseChange &&
          (Math.abs(s.speed) > 0.2 || (next.brake ?? this.input.brake) < 0.2))
      ) {
        s.message = '前进 / 倒挡切换须接近静止并踩刹车';
        return false;
      }
      if (mode === 'N') {
        s.gear = s.target = s.preselected = 0;
        s.selected = [0, 0];
        s.phase = 'steady';
        s.queue = [];
        s.pendingGear = 0;
        s.preselectionTime = 0;
      } else if (s.gear === 0 || s.gear < 0 !== (mode === 'R')) {
        s.target =
          mode === 'R'
            ? -1
            : (GEARS.find(
                (g) =>
                  g.gear > 0 && rpmAtSpeed(g.gear, s.speed, this.spec) < 4000,
              )?.gear ?? 7);
        s.gear = 0;
        s.selected = [0, 0];
        s.preselected = s.pendingGear = 0;
        s.preselectionTime = 0;
        s.phase = 'prepare';
        s.phaseTime = 0;
        s.queue = [];
        s.history = [];
        s.held = 0;
      }
    }
    if (mode !== 'N') this.lastDirection = mode === 'R' ? -1 : 1;
    Object.assign(this.input, next);
    s.mode = mode;
    s.message = '';
    return true;
  }
  requestShift(direction: number) {
    if (this.input.mode !== 'M') {
      this.state.message = '手动升降挡需要 M 模式';
      return false;
    }
    if (direction !== 1 && direction !== -1)
      throw new Error('升降挡请求须为 +1 或 -1');
    if (this.state.queue.length >= 4) {
      this.state.message = '换挡队列已满（4）';
      return false;
    }
    this.state.queue.push(direction);
    return true;
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error('时间须为非负有限数');
    this.remainder += seconds;
    while (this.remainder + 1e-12 >= this.spec.step) {
      this.tick();
      this.remainder -= this.spec.step;
    }
    return this.state;
  }
  private shift(g: Gear) {
    const s = this.state;
    if (g < 1 || g > 7 || g === s.gear) return;
    if (rpmAtSpeed(g, s.speed, this.spec) > this.spec.limit - 100) {
      s.message = '拒绝降挡：目标挡将超转';
      return;
    }
    s.pendingGear = 0;
    s.preselectionTime = 0;
    s.target = g;
    s.phase = s.preselected === g ? 'handover' : 'prepare';
    s.phaseTime = 0;
    s.history = [];
    s.message = '';
  }
  private tick() {
    const s = this.state,
      p = this.spec,
      dt = p.step,
      d = this.input;
    s.time += dt;
    s.held += dt;
    s.phaseTime += dt;
    if (s.phase === 'steady' && s.gear > 0) {
      if (d.mode === 'M' && s.queue.length)
        this.shift((s.gear + s.queue.shift()!) as Gear);
      else if ((d.mode === 'D' || d.mode === 'S') && s.held > p.holdTime) {
        const up =
          d.mode === 'D' ? 2300 + 3600 * d.throttle : 4500 + 2000 * d.throttle;
        const down =
          d.mode === 'D' ? 1200 + 700 * d.throttle : 2400 + 800 * d.throttle;
        if (s.rpm > up && s.gear < 7) this.shift((s.gear + 1) as Gear);
        else if (rpmAtSpeed(s.gear, s.speed, p) < down && s.gear > 1)
          this.shift((s.gear - 1) as Gear);
      }
      if (s.phase === 'steady' && !s.preselected) {
        s.pendingGear = (s.gear === 7 ? 6 : s.gear + 1) as Gear;
        s.preselectionTime += dt;
        const free = gearInfo(s.pendingGear)!.clutch;
        s.selected[free] = 0;
        if (
          s.preselectionTime >= p.prepareTime &&
          selectorReady(s, s.pendingGear)
        ) {
          s.preselected = s.pendingGear;
          s.selected[free] = s.preselected;
          s.pendingGear = 0;
        }
      }
    }
    if (s.phase === 'prepare') {
      s.synchronizer = clamp(s.phaseTime / p.prepareTime);
      s.selected[gearInfo(s.target)!.clutch] = 0;
      if (s.phaseTime >= p.prepareTime && selectorReady(s, s.target)) {
        s.selected[gearInfo(s.target)!.clutch] = s.target;
        s.preselected = s.target;
        s.phase = 'handover';
        s.phaseTime = 0;
      }
    }
    if (s.phase === 'handover' && s.phaseTime >= p.handoverTime) {
      s.phase = 'synchronize';
      s.phaseTime = 0;
    }
    const old = gearInfo(s.gear)?.clutch,
      incoming = gearInfo(s.target)?.clutch;
    const linearShare =
      s.phase === 'handover'
        ? clamp(s.phaseTime / p.handoverTime)
        : s.phase === 'synchronize'
          ? 1
          : 0;
    const share = linearShare * linearShare * (3 - 2 * linearShare);
    const command = [0, 0];
    if (old !== undefined && d.mode !== 'N') command[old] = 1 - share;
    if (incoming !== undefined && share) command[incoming] = share;
    const targetRpm = rpmAtSpeed(s.target, s.speed, p);
    let throttle = d.throttle;
    if (s.phase === 'handover' && s.target > s.gear) throttle *= 0.35;
    if (s.phase !== 'steady' && s.target < s.gear && s.rpm < targetRpm)
      throttle = Math.max(throttle, clamp((targetRpm - s.rpm) / 900));
    s.throttle += (throttle - s.throttle) * (1 - Math.exp(-dt / p.response));
    const idle = clamp((p.idle - s.rpm) * 0.8, 0, 140);
    s.engineTorque =
      fullThrottleTorque(s.rpm) * s.throttle * clamp((p.limit - s.rpm) / 120) -
      (1 - s.throttle) * (18 + s.rpm * 0.006) +
      idle;
    const coupled = this.systems?.step(s, [command[0], command[1]], dt);
    if (coupled)
      s.engineTorque = coupled.torque * clamp((p.limit - s.rpm) / 120) + idle;
    let omega = s.rpm * RAD + (s.engineTorque / p.engineInertia) * dt;
    const resist =
      p.mass * 9.81 * p.rolling +
      0.5 * p.airDensity * p.dragArea * s.speed ** 2 +
      d.brake * p.brakeForce;
    s.speed =
      Math.sign(s.speed) *
      Math.max(0, Math.abs(s.speed) - (resist / p.mass) * dt);
    let wheelImpulse = 0;
    for (let i = 0; i < 2; i++) {
      const c = s.clutches[i],
        ratio = totalRatio(s.selected[i]);
      let engagement = coupled ? coupled.engagement[i] : command[i];
      // Neutral and unlocked selector dogs remain hard mechanical interlocks.
      if (d.mode === 'N' || !s.selected[i]) engagement = 0;
      if (Math.abs(rpmAtSpeed(s.selected[i], s.speed, p)) < 950)
        engagement *= d.brake > 0.1 ? 0 : 0.05 + 0.35 * d.throttle;
      if (s.rpm < 700) engagement *= clamp((s.rpm - 550) / 150);
      c.engagement = engagement;
      c.torque = 0;
      c.status = 'open';
      if (ratio && engagement > 0) {
        const slip = omega - (s.speed / p.radius) * ratio;
        const inv = 1 / p.engineInertia + ratio ** 2 / (p.mass * p.radius ** 2);
        const tractionBudget = Math.max(
          0,
          p.grip * p.mass * 9.81 * p.radius * dt - Math.abs(wheelImpulse),
        );
        const capacity = Math.min(
          p.clutchCapacity * engagement * dt,
          tractionBudget / Math.abs(ratio),
        );
        const impulse = frictionImpulse(slip, inv, capacity);
        omega -= impulse / p.engineInertia;
        s.speed += (impulse * ratio) / (p.mass * p.radius);
        wheelImpulse += impulse * ratio;
        c.torque = impulse / dt;
        c.heat += Math.max(0, impulse * slip - 0.5 * impulse ** 2 * inv);
        c.status =
          Math.abs(slip - impulse * inv) < 1e-6 &&
          engagement > 0.99 &&
          s.phase !== 'handover'
            ? 'locked'
            : 'slipping';
      }
    }
    s.rpm = omega / RAD;
    s.wheelTorque = wheelImpulse / dt;
    s.angle += s.rpm * 6 * dt;
    s.wheelAngle += (s.speed / p.radius) * dt;
    for (let i = 0; i < 2; i++) {
      const preparing = s.phase === 'prepare' ? s.target : s.pendingGear;
      const progress = s.phase === 'prepare' ? s.phaseTime : s.preselectionTime;
      const wanted = s.selected[i]
        ? rpmAtSpeed(s.selected[i], s.speed, p)
        : preparing && gearInfo(preparing)!.clutch === i
          ? s.inputRpm[i] +
            (rpmAtSpeed(preparing, s.speed, p) - s.inputRpm[i]) *
              Math.min(1, dt / Math.max(dt, p.prepareTime - progress))
          : s.inputRpm[i] * Math.exp(-dt * 0.5);
      s.inputRpm[i] = wanted;
      s.inputAngle[i] += wanted * RAD * dt;
      s.clutches[i].slip = s.rpm - wanted;
    }
    if (
      s.phase === 'synchronize' &&
      incoming !== undefined &&
      (s.clutches[incoming].status === 'locked' ||
        (Math.abs(targetRpm) < 950 && s.phaseTime > 0.5))
    ) {
      s.gear = s.target;
      s.phase = 'steady';
      s.held = 0;
      s.preselected = 0;
      s.preselectionTime = 0;
      s.lastShift = [...s.history];
    }
    SYNC_GROUPS.forEach((pair, i) => {
      const candidate =
        s.phase === 'prepare' && s.phaseTime > p.prepareTime / 2
          ? s.target
          : s.pendingGear && s.preselectionTime > p.prepareTime / 2
            ? s.pendingGear
            : 0;
      const selected =
        s.selected.find((g) => (pair as readonly number[]).includes(g)) ||
        ((pair as readonly number[]).includes(candidate) ? candidate : 0);
      const target = selected ? (selected === pair[0] ? -7 : 7) : 0;
      s.selectorPositions[i] += clamp(
        target - s.selectorPositions[i],
        -50 * dt,
        50 * dt,
      );
    });
    if (s.phase !== 'steady' && Math.round(s.time / dt) % 6 === 0) {
      s.history.push({
        time: s.time,
        rpm: s.rpm,
        k1: s.clutches[0].torque,
        k2: s.clutches[1].torque,
        slip1: s.clutches[0].slip,
        slip2: s.clutches[1].slip,
      });
      if (s.history.length > 1000) s.history.shift();
    }
  }
}
