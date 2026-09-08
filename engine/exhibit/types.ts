import type { PowertrainState } from '../powertrain';
import type { SimulationState } from '../physics';
import type {
  CylinderProcessState,
  DctHydraulicState,
  EngineSystemsState,
  ObservationLayer,
} from '../systems/types';

export type {
  CylinderProcessState,
  DctHydraulicState,
  EngineSystemsState,
  ObservationLayer,
} from '../systems/types';

export type EngineCylinderState = CylinderProcessState;

export const OBSERVATION_LAYERS = [
  'mechanical',
  'gas-combustion',
  'thermal-cooling',
  'lubrication',
  'transmission-hydraulic',
] as const satisfies readonly ObservationLayer[];

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

export interface CylinderPressureSample {
  angleDeg: number;
  pressuresBar: readonly number[];
}

export const OBSERVATION_LAYER_LABELS: Record<ObservationLayer, string> = {
  mechanical: '机械',
  'gas-combustion': '气体与燃烧',
  'thermal-cooling': '热与冷却',
  lubrication: '润滑',
  'transmission-hydraulic': '传动液压',
};
