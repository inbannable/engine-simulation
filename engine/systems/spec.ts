export interface EngineSystemsSpec {
  readonly step: number;
  readonly cylinders: number;
  readonly cycleDeg: number;
  readonly firingOrder: readonly number[];
  readonly cylinderPhaseOffsetsDeg: readonly number[];
  readonly displacementL: number;
  readonly ambientPressureKpa: number;
  readonly maxBoostKpa: number;
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly throttleTimeConstantS: number;
  readonly manifoldTimeConstantS: number;
  readonly turboSpoolTimeS: number;
  readonly turboDecayTimeS: number;
  readonly stoichiometricAfr: number;
  readonly fullLoadAfr: number;
  readonly thermostatOpenC: number;
  readonly thermostatCloseC: number;
  readonly educationalEstimate: true;
}

/**
 * Public vehicle anchors are kept separate from the teaching estimates below.
 * No absolute turbo shaft speed is claimed because a reliable model-specific
 * compressor speed source is not available.
 */
export const ENGINE_SYSTEMS_SPEC: EngineSystemsSpec = {
  step: 1 / 600,
  cylinders: 5,
  cycleDeg: 720,
  firingOrder: [1, 2, 4, 5, 3],
  cylinderPhaseOffsetsDeg: [0, 144, 576, 288, 432],
  displacementL: 2.48,
  ambientPressureKpa: 101.325,
  maxBoostKpa: 140,
  idleRpm: 800,
  redlineRpm: 7000,
  throttleTimeConstantS: 0.09,
  manifoldTimeConstantS: 0.075,
  turboSpoolTimeS: 0.62,
  turboDecayTimeS: 1.05,
  stoichiometricAfr: 14.7,
  fullLoadAfr: 12.2,
  thermostatOpenC: 93,
  thermostatCloseC: 88,
  educationalEstimate: true,
};

export interface EngineBenchSpec {
  readonly step: number;
  readonly inertiaKgM2: number;
  readonly starterTorqueNm: number;
  readonly starterCutoutRpm: number;
  readonly combustionStartRpm: number;
  readonly idleRpm: number;
  readonly maxLoadTorqueNm: number;
  readonly educationalEstimate: true;
}

export const ENGINE_BENCH_SPEC: EngineBenchSpec = {
  step: 1 / 600,
  inertiaKgM2: 0.32,
  starterTorqueNm: 72,
  starterCutoutRpm: 520,
  combustionStartRpm: 180,
  idleRpm: 800,
  maxLoadTorqueNm: 500,
  educationalEstimate: true,
};

export interface DctHydraulicsSpec {
  readonly step: number;
  readonly maxLinePressureBar: number;
  readonly clutchTouchPressureBar: number;
  readonly clutchFullPressureBar: number;
  readonly clutchPressureTimeS: number;
  readonly forkPressureTimeS: number;
  readonly ambientTempC: number;
  readonly educationalEstimate: true;
}

export const DCT_HYDRAULICS_SPEC: DctHydraulicsSpec = {
  step: 1 / 600,
  maxLinePressureBar: 20,
  clutchTouchPressureBar: 2.8,
  clutchFullPressureBar: 14,
  clutchPressureTimeS: 0.055,
  forkPressureTimeS: 0.08,
  ambientTempC: 20,
  educationalEstimate: true,
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const RPM_TO_RAD_S = Math.PI / 30;

/** Net, warm, full-load crankshaft torque from the exhibit's public anchors. */
export function calibratedFullLoadTorqueNm(rpm: number) {
  const speed = Math.max(0, rpm);
  if (speed < 2250) return 160 + 340 * clamp((speed - 800) / 1450);
  if (speed <= 5600) return 500;
  if (speed <= 7000) return 294000 / (speed * RPM_TO_RAD_S);
  return (294000 / (7000 * RPM_TO_RAD_S)) * clamp((7200 - speed) / 200);
}
