import type { DriveMode, Gear } from '../powertrain';
import type { ObservationLayer, ExhibitCue } from './types';

export const EXHIBIT_SCENARIOS = [
  'cold-start',
  'idle',
  'full-load',
  'high-rpm-overrun',
  'warm-up',
  'heat-soak',
  'shift-2-3',
  'engine-braking',
  'low-speed-creep',
] as const;

export type ExhibitScenarioId = (typeof EXHIBIT_SCENARIOS)[number];

export const EXHIBIT_SCENARIO_LABELS: Record<ExhibitScenarioId, string> = {
  'cold-start': '冷启动',
  idle: '怠速',
  'full-load': '全负荷',
  'high-rpm-overrun': '高转松油',
  'warm-up': '暖机演示',
  'heat-soak': '热浸',
  'shift-2-3': '2→3 换挡',
  'engine-braking': '发动机制动',
  'low-speed-creep': '低速蠕行',
};

export interface ExhibitInputs {
  targetRpm?: number;
  playing?: boolean;
  throttle?: number;
  brake?: number;
  driveMode?: DriveMode;
  requestedGear?: Gear;
}

export interface ExhibitInitialConditions {
  ambientTemperatureC?: number;
  coolantTemperatureC?: number;
  oilTemperatureC?: number;
  selectedGear?: Gear;
  vehicleSpeedKmh?: number;
}

export interface ScenarioDirective {
  scenario: ExhibitScenarioId;
  label: string;
  elapsed: number;
  duration: number;
  progress: number;
  inputs: Readonly<ExhibitInputs>;
  initialConditions?: Readonly<ExhibitInitialConditions>;
  layer: ObservationLayer;
  cue?: Readonly<ExhibitCue>;
  cameraTransition: 'fly' | 'cut' | 'none';
  strongFlash: boolean;
  active: boolean;
  completed: boolean;
  cancelledBy?: 'parameter' | 'skip' | 'manual';
}

interface ScenarioStep {
  at: number;
  inputs: ExhibitInputs;
  layer: ObservationLayer;
  cue?: ExhibitCue;
}

interface ScenarioDefinition {
  duration: number;
  initialConditions?: ExhibitInitialConditions;
  steps: readonly ScenarioStep[];
}

const cue = (
  id: string,
  label: string,
  focus: ExhibitCue['focus'],
  camera: string,
  slowMotion?: number,
): ExhibitCue => ({ id, label, focus, camera, slowMotion, active: true });

const DEFINITIONS: Record<ExhibitScenarioId, ScenarioDefinition> = {
  'cold-start': {
    duration: 12,
    initialConditions: {
      ambientTemperatureC: 8,
      coolantTemperatureC: 8,
      oilTemperatureC: 8,
    },
    steps: [
      {
        at: 0,
        inputs: { playing: true, targetRpm: 1_250, throttle: 0 },
        layer: 'gas-combustion',
        cue: cue('cold-fire', '五缸依次点火', 'engine', 'section', 0.35),
      },
      {
        at: 3,
        inputs: { playing: true, targetRpm: 1_050, throttle: 0 },
        layer: 'lubrication',
        cue: cue('cold-oil', '建立机油循环', 'engine', 'timing'),
      },
      {
        at: 7,
        inputs: { playing: true, targetRpm: 900, throttle: 0 },
        layer: 'thermal-cooling',
        cue: cue('cold-thermal', '观察暖机路径', 'engine', 'iso'),
      },
    ],
  },
  idle: {
    duration: 8,
    steps: [
      {
        at: 0,
        inputs: { playing: true, targetRpm: 800, throttle: 0 },
        layer: 'mechanical',
        cue: cue('idle-balance', '五缸怠速节律', 'engine', 'iso'),
      },
    ],
  },
  'full-load': {
    duration: 8,
    steps: [
      {
        at: 0,
        inputs: { playing: true, targetRpm: 6_200, throttle: 1 },
        layer: 'gas-combustion',
        cue: cue('full-intake', '增压进气与燃烧', 'intake', 'intake', 0.5),
      },
      {
        at: 4,
        inputs: { playing: true, targetRpm: 6_500, throttle: 1 },
        layer: 'thermal-cooling',
        cue: cue('full-turbo', '排气能量进入涡轮', 'turbo', 'exhaust', 0.5),
      },
    ],
  },
  'high-rpm-overrun': {
    duration: 7,
    steps: [
      {
        at: 0,
        inputs: { playing: true, targetRpm: 5_800, throttle: 0 },
        layer: 'gas-combustion',
        cue: cue('overrun', '高转速松开油门', 'exhaust', 'exhaust', 0.5),
      },
    ],
  },
  'warm-up': {
    duration: 12,
    initialConditions: {
      ambientTemperatureC: 20,
      coolantTemperatureC: 20,
      oilTemperatureC: 20,
    },
    steps: [
      {
        at: 0,
        inputs: { playing: true, targetRpm: 1_500, throttle: 0.12 },
        layer: 'thermal-cooling',
        cue: cue('warm-up', '暖机回路', 'engine', 'section'),
      },
    ],
  },
  'heat-soak': {
    duration: 10,
    initialConditions: {
      ambientTemperatureC: 30,
      coolantTemperatureC: 96,
      oilTemperatureC: 105,
    },
    steps: [
      {
        at: 0,
        inputs: { playing: false, targetRpm: 0, throttle: 0 },
        layer: 'thermal-cooling',
        cue: cue('heat-soak', '停机后的热分布', 'turbo', 'exhaust'),
      },
    ],
  },
  'shift-2-3': {
    duration: 6,
    initialConditions: { selectedGear: 2, vehicleSpeedKmh: 52 },
    steps: [
      {
        at: 0,
        inputs: {
          playing: true,
          targetRpm: 3_800,
          throttle: 0.55,
          driveMode: 'M',
          requestedGear: 2,
        },
        layer: 'transmission-hydraulic',
        cue: cue('shift-preselect', '三挡预选', 'gears', 'gears', 0.2),
      },
      {
        at: 2,
        inputs: {
          playing: true,
          targetRpm: 3_200,
          throttle: 0.22,
          driveMode: 'M',
          requestedGear: 3,
        },
        layer: 'transmission-hydraulic',
        cue: cue('shift-handover', 'K2 → K1 扭矩交接', 'clutch', 'clutch', 0.1),
      },
    ],
  },
  'engine-braking': {
    duration: 8,
    initialConditions: { selectedGear: 3, vehicleSpeedKmh: 80 },
    steps: [
      {
        at: 0,
        inputs: {
          playing: true,
          targetRpm: 3_500,
          throttle: 0,
          driveMode: 'M',
          requestedGear: 3,
        },
        layer: 'mechanical',
        cue: cue('engine-braking', '动力路径反向传递', 'gears', 'gears', 0.35),
      },
    ],
  },
  'low-speed-creep': {
    duration: 8,
    initialConditions: { selectedGear: 1, vehicleSpeedKmh: 0 },
    steps: [
      {
        at: 0,
        inputs: {
          playing: true,
          targetRpm: 800,
          throttle: 0,
          brake: 0,
          driveMode: 'D',
          requestedGear: 1,
        },
        layer: 'transmission-hydraulic',
        cue: cue('creep', 'K1 受控滑摩', 'clutch', 'clutch', 0.25),
      },
    ],
  },
};

export class ExhibitScenarioController {
  private current: ExhibitScenarioId = 'cold-start';
  private elapsed = 0;
  private active = true;
  private cameraActive = true;
  private completed = false;
  private cancelledBy: ScenarioDirective['cancelledBy'];

  constructor(
    private readonly reducedMotion = false,
    autoStart = true,
  ) {
    this.active = autoStart;
  }

  start(id: ExhibitScenarioId) {
    this.current = id;
    this.elapsed = 0;
    this.active = true;
    this.cameraActive = true;
    this.completed = false;
    this.cancelledBy = undefined;
    return this.snapshot();
  }

  advance(deltaSeconds: number) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error('工况时间步必须是非负有限数');
    if (this.active) {
      this.elapsed = Math.min(
        DEFINITIONS[this.current].duration,
        this.elapsed + deltaSeconds,
      );
      if (this.elapsed >= DEFINITIONS[this.current].duration) {
        this.active = false;
        this.cameraActive = false;
        this.completed = true;
      }
    }
    return this.snapshot();
  }

  parameterChanged() {
    return this.cancel('parameter');
  }

  modelRotated() {
    this.cameraActive = false;
    return this.snapshot();
  }

  skip() {
    return this.cancel('skip', true);
  }

  cancelManually() {
    return this.cancel('manual');
  }

  snapshot(): ScenarioDirective {
    const definition = DEFINITIONS[this.current];
    let step = definition.steps[0];
    for (const candidate of definition.steps)
      if (candidate.at <= this.elapsed) step = candidate;
    const selectedCue =
      step.cue && this.cameraActive
        ? { ...step.cue, active: this.active }
        : undefined;
    return {
      scenario: this.current,
      label: EXHIBIT_SCENARIO_LABELS[this.current],
      elapsed: this.elapsed,
      duration: definition.duration,
      progress: this.elapsed / definition.duration,
      inputs: step.inputs,
      initialConditions:
        this.elapsed === 0 ? definition.initialConditions : undefined,
      layer: step.layer,
      cue: selectedCue,
      cameraTransition: selectedCue
        ? this.reducedMotion
          ? 'cut'
          : 'fly'
        : 'none',
      strongFlash: this.active && !this.reducedMotion,
      active: this.active,
      completed: this.completed,
      cancelledBy: this.cancelledBy,
    };
  }

  private cancel(
    reason: NonNullable<ScenarioDirective['cancelledBy']>,
    completed = false,
  ) {
    this.active = false;
    this.cameraActive = false;
    this.completed = completed;
    this.cancelledBy = reason;
    if (completed) this.elapsed = DEFINITIONS[this.current].duration;
    return this.snapshot();
  }
}

export const scenarioDefinition = (id: ExhibitScenarioId) => DEFINITIONS[id];
