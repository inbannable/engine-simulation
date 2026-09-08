import {
  clamp,
  finiteClamp,
  mod,
  smoothstep,
  validateNonNegative,
  validateUnit,
} from './math';
import {
  calibratedFullLoadTorqueNm,
  ENGINE_BENCH_SPEC,
  ENGINE_SYSTEMS_SPEC,
  type EngineBenchSpec,
  type EngineSystemsSpec,
} from './spec';
import { EngineSystems } from './engine-systems';
import type {
  EngineBenchInput,
  EngineBenchState,
  EngineSystemsInitialOptions,
} from './types';

const RPM_TO_RAD_S = Math.PI / 30;

export class EngineBench {
  public readonly systems: EngineSystems;
  public readonly state: EngineBenchState;
  public input: EngineBenchInput;

  private remainder = 0;
  private ticks = 0;

  constructor(
    public readonly spec: EngineBenchSpec = ENGINE_BENCH_SPEC,
    engineSpec: EngineSystemsSpec = ENGINE_SYSTEMS_SPEC,
    options: EngineSystemsInitialOptions = {},
  ) {
    if (Math.abs(spec.step - engineSpec.step) > 1e-12)
      throw new Error(
        'EngineBench and EngineSystems must use the same fixed step',
      );
    this.systems = new EngineSystems(engineSpec, options);
    this.input = {
      ignition: false,
      starter: false,
      throttle: 0,
      targetRpm: spec.idleRpm,
      load: 0,
    };
    this.state = {
      time: 0,
      rpm: this.systems.state.rpm,
      angle: this.systems.state.angle,
      starterTorqueNm: 0,
      inertiaKgM2: spec.inertiaKgM2,
      idleControl: 0,
      targetRpm: spec.idleRpm,
      load: 0,
      engine: this.systems.state,
    };
  }

  configure(next: Partial<EngineBenchInput>) {
    for (const key of Object.keys(next)) {
      if (
        !['ignition', 'starter', 'throttle', 'targetRpm', 'load'].includes(key)
      )
        throw new Error(`Unknown engine bench input: ${key}`);
    }
    if (next.throttle !== undefined) validateUnit('throttle', next.throttle);
    if (next.load !== undefined) validateUnit('load', next.load);
    if (next.targetRpm !== undefined)
      validateNonNegative('targetRpm', next.targetRpm);
    if (next.ignition !== undefined && typeof next.ignition !== 'boolean')
      throw new Error('ignition must be boolean');
    if (next.starter !== undefined && typeof next.starter !== 'boolean')
      throw new Error('starter must be boolean');
    Object.assign(this.input, next);
    return this.state;
  }

  advance(seconds: number) {
    validateNonNegative('seconds', seconds);
    this.remainder += seconds;
    const steps = Math.floor(
      (this.remainder + this.spec.step * 1e-9) / this.spec.step,
    );
    this.remainder -= steps * this.spec.step;
    if (Math.abs(this.remainder) < this.spec.step * 1e-9) this.remainder = 0;
    for (let i = 0; i < steps; i++) this.tick();
    return this.state;
  }

  /** Scrubbing is phase-only: it cannot rewind temperatures or accumulated time. */
  setCrankAngle(angleDeg: number) {
    this.systems.setCrankAngle(angleDeg);
    this.state.angle = mod(angleDeg, 720);
    return this.state;
  }

  private tick() {
    const { state: s, input, spec: p } = this;
    const dt = p.step;
    this.ticks++;

    const targetRpm = clamp(input.targetRpm, 0, 7000);
    const speedError = targetRpm - s.rpm;
    const governor = input.ignition
      ? clamp(input.load + 0.068 + speedError * 0.00155)
      : 0;
    s.idleControl = governor;
    s.targetRpm = targetRpm;
    s.load = input.load;

    s.starterTorqueNm =
      input.starter && s.rpm < p.starterCutoutRpm
        ? p.starterTorqueNm * clamp((p.starterCutoutRpm - s.rpm) / 120, 0.28, 1)
        : 0;
    const loadTorque =
      input.load *
      calibratedFullLoadTorqueNm(Math.max(p.idleRpm, s.rpm)) *
      smoothstep(s.rpm / Math.max(350, targetRpm));
    const revCut = clamp((7200 - s.rpm) / 200);
    const engineTorque = this.systems.state.averageNetTorqueNm * revCut;
    const angularAcceleration =
      (engineTorque + s.starterTorqueNm - loadTorque) / p.inertiaKgM2;
    const omega = Math.max(0, s.rpm * RPM_TO_RAD_S + angularAcceleration * dt);
    s.rpm = finiteClamp(omega / RPM_TO_RAD_S, 0, 7250, 0);

    const combustionEnabled = input.ignition && s.rpm >= p.combustionStartRpm;
    this.systems.configure({
      rpm: s.rpm,
      running: combustionEnabled,
      throttle: Math.max(input.throttle, governor),
      load: input.load,
    });
    this.systems.advance(dt);
    s.time = this.ticks * dt;
    s.angle = this.systems.state.angle;
  }
}
