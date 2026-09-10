export type ObservationLayer =
  | 'mechanical'
  | 'gas-combustion'
  | 'thermal-cooling'
  | 'lubrication'
  | 'transmission-hydraulic';

export interface CylinderProcessState {
  cylinder: number;
  phaseDeg: number;
  pressureBar: number;
  temperatureC: number;
  burnFraction: number;
  /** Trapped fresh charge for this cylinder and 720-degree cycle. */
  chargeMassMg: number;
  intakeFlowGps: number;
  exhaustFlowGps: number;
  firing: boolean;
}

export interface EngineSystemsState {
  time: number;
  running: boolean;
  rpm: number;
  angle: number;
  throttle: number;
  load: number;
  manifoldPressureKpa: number;
  boostKpa: number;
  airflowGps: number;
  fuelFlowGps: number;
  turboRpmNormalized: number;
  netTorqueNm: number;
  exhaustTempC: number;
  coolantTempC: number;
  oilTempC: number;
  oilPressureKpa: number;
  coolantFlowLpm: number;
  thermostat: number;
  vibrationAmplitude: number;
  cylinders: CylinderProcessState[];

  /** Cycle-mean torque; calibrated independently from the teaching pressure trace. */
  averageNetTorqueNm: number;
  effectiveThrottle: number;
  exhaustEnergyKw: number;
  cylinderHeadTempC: number;
  exhaustManifoldTempC: number;
  turboTempC: number;
  oilPumpRpm: number;
  waterPumpRpm: number;
}

export interface DctHydraulicState {
  linePressureBar: number;
  pumpRpm: number;
  valveCommands: [number, number];
  clutchPressureBar: [number, number];
  forkPressureBar: [number, number, number, number];
  oilTempC: number;
  coolerFlowLpm: number;

  clutchEngagement: [number, number];
  clutchDiscTempC: [number, number];
  slipPowerKw: [number, number];
  slipEnergyJ: [number, number];
}

export interface EngineSystemsInput {
  throttle: number;
  load: number;
  rpm: number;
  running: boolean;
}

export interface EngineBenchInput {
  ignition: boolean;
  governorEnabled?: boolean;
  starter: boolean;
  throttle: number;
  targetRpm: number;
  load: number;
}

export interface EngineBenchState {
  time: number;
  rpm: number;
  angle: number;
  starterTorqueNm: number;
  inertiaKgM2: number;
  idleControl: number;
  targetRpm: number;
  load: number;
  engine: EngineSystemsState;
}

export interface DctHydraulicInput {
  engineRpm: number;
  pumpCommand: number;
  valveCommands: [number, number];
  forkCommands: [number, number, number, number];
  clutchSlipRpm: [number, number];
  clutchTorqueNm: [number, number];
  coolerCommand: number;
}

export interface EngineSystemsInitialOptions {
  ambientTempC?: number;
  rpm?: number;
  angle?: number;
  warm?: boolean;
}
import type { SimulationState } from '../physics';
import type { PowertrainState } from '../powertrain';

export interface ExhibitCue {
  id: string;
  label: string;
  focus: 'engine' | 'intake' | 'exhaust' | 'turbo' | 'clutch' | 'gears';
  camera?: string;
  slowMotion?: number;
  active: boolean;
}

export interface EngineFrame {
  simulation: SimulationState;
  systems: EngineSystemsState;
  powertrain?: PowertrainState;
  hydraulic?: DctHydraulicState;
  layer: ObservationLayer;
  cue?: ExhibitCue;
}
