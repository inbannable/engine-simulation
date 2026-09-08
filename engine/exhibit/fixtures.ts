import { initialPowertrain, type PowertrainState } from '../powertrain';
import { INITIAL, type SimulationState } from '../physics';
import type {
  CylinderPressureSample,
  EngineFrame,
  EngineSystemsState,
  ObservationLayer,
} from './types';
import type { ExhibitScenarioId } from './ScenarioController';

const cylinderValues = [
  [1, 0, 112, 1_720, 0.94, 548, 8, 3, true],
  [2, 144, 7.2, 185, 0.04, 486, 74, 2, false],
  [3, 576, 2.4, 760, 0, 421, 2, 82, false],
  [4, 288, 18.5, 510, 0.12, 512, 1, 4, false],
  [5, 432, 1.3, 92, 0, 462, 62, 1, false],
] as const;

export const EXHIBIT_SYSTEMS_FIXTURE: EngineSystemsState = {
  time: 4.25,
  running: true,
  rpm: 3_800,
  angle: 286,
  throttle: 0.72,
  load: 0.78,
  manifoldPressureKpa: 208,
  boostKpa: 108,
  airflowGps: 360,
  fuelFlowGps: 28.4,
  turboRpmNormalized: 0.78,
  netTorqueNm: 438,
  averageNetTorqueNm: 421,
  effectiveThrottle: 0.7,
  exhaustEnergyKw: 218,
  exhaustTempC: 875,
  coolantTempC: 92,
  oilTempC: 104,
  oilPressureKpa: 470,
  coolantFlowLpm: 106,
  thermostat: 0.84,
  vibrationAmplitude: 0.34,
  cylinderHeadTempC: 118,
  exhaustManifoldTempC: 820,
  turboTempC: 710,
  oilPumpRpm: 3_200,
  waterPumpRpm: 2_850,
  cylinders: cylinderValues.map(
    ([
      cylinder,
      phaseDeg,
      pressureBar,
      temperatureC,
      burnFraction,
      chargeMassMg,
      intakeFlowGps,
      exhaustFlowGps,
      firing,
    ]) => ({
      cylinder,
      phaseDeg,
      pressureBar,
      temperatureC,
      burnFraction,
      chargeMassMg,
      intakeFlowGps,
      exhaustFlowGps,
      firing,
    }),
  ),
};

function fixturePowertrain(): PowertrainState {
  const state = initialPowertrain();
  state.rpm = 3_800;
  state.speed = 14.5;
  state.gear = 2;
  state.target = 3;
  state.preselected = 3;
  state.phase = 'handover';
  state.phaseTime = 0.18;
  state.mode = 'M';
  state.selected = [3, 2];
  state.clutches[0] = {
    engagement: 0.48,
    slip: 420,
    torque: 230,
    status: 'slipping',
    heat: 4_200,
  };
  state.clutches[1] = {
    engagement: 0.52,
    slip: 280,
    torque: 245,
    status: 'slipping',
    heat: 3_900,
  };
  state.wheelTorque = 3_150;
  return state;
}

const fixtureSimulation = (
  targetRpm: number,
  playing = true,
): SimulationState => ({
  ...INITIAL,
  angle: 286,
  rpm: targetRpm,
  targetRpm,
  playing,
  sound: false,
  mode: 'cutaway',
});

export const createExhibitFixtureFrame = (
  layer: ObservationLayer,
  rpm = 3_800,
): EngineFrame => ({
  simulation: fixtureSimulation(rpm),
  systems: {
    ...EXHIBIT_SYSTEMS_FIXTURE,
    rpm,
    running: rpm > 0,
  },
  powertrain: fixturePowertrain(),
  hydraulic: {
    linePressureBar: 17.8,
    pumpRpm: 3_240,
    valveCommands: [0.48, 0.52],
    clutchPressureBar: [8.4, 9.1],
    forkPressureBar: [2.2, 7.4, 1.1, 4.8],
    oilTempC: 88,
    coolerFlowLpm: 14.2,
    clutchEngagement: [0.48, 0.52],
    clutchDiscTempC: [112, 118],
    slipPowerKw: [9.4, 8.7],
    slipEnergyJ: [4_200, 3_900],
  },
  layer,
});

export const OBSERVATION_LAYER_FIXTURES: Record<ObservationLayer, EngineFrame> =
  {
    mechanical: createExhibitFixtureFrame('mechanical'),
    'gas-combustion': createExhibitFixtureFrame('gas-combustion'),
    'thermal-cooling': createExhibitFixtureFrame('thermal-cooling'),
    lubrication: createExhibitFixtureFrame('lubrication'),
    'transmission-hydraulic': createExhibitFixtureFrame(
      'transmission-hydraulic',
    ),
  };

export const SCENARIO_FIXTURES: Record<ExhibitScenarioId, EngineFrame> = {
  'cold-start': createExhibitFixtureFrame('gas-combustion', 1_250),
  idle: createExhibitFixtureFrame('mechanical', 800),
  'full-load': createExhibitFixtureFrame('gas-combustion', 6_500),
  'high-rpm-overrun': createExhibitFixtureFrame('gas-combustion', 5_800),
  'warm-up': createExhibitFixtureFrame('thermal-cooling', 1_500),
  'heat-soak': {
    ...createExhibitFixtureFrame('thermal-cooling', 0),
    simulation: fixtureSimulation(0, false),
  },
  'shift-2-3': createExhibitFixtureFrame('transmission-hydraulic', 3_800),
  'engine-braking': createExhibitFixtureFrame('mechanical', 3_500),
  'low-speed-creep': createExhibitFixtureFrame('transmission-hydraulic', 800),
};

export const CYLINDER_PRESSURE_FIXTURE: readonly CylinderPressureSample[] = [
  { angleDeg: 0, pressuresBar: [1, 1.2, 1, 1.1, 1] },
  { angleDeg: 60, pressuresBar: [2, 8, 1.4, 1.1, 1.2] },
  { angleDeg: 120, pressuresBar: [8, 52, 2, 1.3, 1.5] },
  { angleDeg: 180, pressuresBar: [118, 24, 5, 1.8, 1.8] },
  { angleDeg: 240, pressuresBar: [36, 7, 65, 2.5, 2.2] },
  { angleDeg: 300, pressuresBar: [9, 2.5, 132, 8, 2.8] },
  { angleDeg: 360, pressuresBar: [3, 1.4, 31, 108, 4] },
  { angleDeg: 420, pressuresBar: [1.6, 1.1, 7, 42, 58] },
  { angleDeg: 480, pressuresBar: [1.2, 1, 2.4, 9, 126] },
  { angleDeg: 540, pressuresBar: [1, 1.1, 1.3, 2.5, 35] },
  { angleDeg: 600, pressuresBar: [1.1, 1.5, 1, 1.4, 8] },
  { angleDeg: 660, pressuresBar: [1.3, 2, 1.1, 1, 2.2] },
  { angleDeg: 720, pressuresBar: [1, 1.2, 1, 1.1, 1] },
];
