import {
  approach,
  clamp,
  finiteClamp,
  mod,
  smoothstep,
  validateNonNegative,
  validateUnit,
} from './math';
import {
  calibratedFullLoadTorqueNm,
  ENGINE_SYSTEMS_SPEC,
  type EngineSystemsSpec,
} from './spec';
import type {
  CylinderProcessState,
  EngineSystemsInitialOptions,
  EngineSystemsInput,
  EngineSystemsState,
} from './types';

const TWO_PI = Math.PI * 2;

export interface FiringEvent {
  angle: number;
  cylinder: number;
}

/** Returns events in the half-open crank-angle interval [fromDeg, toDeg). */
export function firingEventsBetween(
  fromDeg: number,
  toDeg: number,
  spec: EngineSystemsSpec = ENGINE_SYSTEMS_SPEC,
) {
  if (!Number.isFinite(fromDeg) || !Number.isFinite(toDeg) || toDeg < fromDeg)
    return [];
  const events: FiringEvent[] = [];
  const spacing = spec.cycleDeg / spec.cylinders;
  const first = Math.ceil(fromDeg / spacing - 1e-12);
  const lastExclusive = Math.ceil(toDeg / spacing - 1e-12);
  for (let eventIndex = first; eventIndex < lastExclusive; eventIndex++) {
    const orderIndex = mod(eventIndex, spec.cylinders);
    events.push({
      angle: eventIndex === 0 ? 0 : eventIndex * spacing,
      cylinder: spec.firingOrder[orderIndex],
    });
  }
  return events;
}

export class EngineSystems {
  public readonly state: EngineSystemsState;
  public input: EngineSystemsInput = {
    throttle: 0,
    load: 0,
    rpm: 0,
    running: false,
  };

  private remainder = 0;
  private ticks = 0;
  private thermostatLatchedOpen = false;
  private readonly ambientTempC: number;

  constructor(
    public readonly spec: EngineSystemsSpec = ENGINE_SYSTEMS_SPEC,
    options: EngineSystemsInitialOptions = {},
  ) {
    this.ambientTempC = finiteClamp(options.ambientTempC ?? 20, -40, 55, 20);
    const warm = options.warm ?? false;
    const rpm = finiteClamp(options.rpm ?? 0, 0, 9000, 0);
    this.input.rpm = rpm;
    this.input.running = rpm >= 180;
    this.state = {
      time: 0,
      running: this.input.running,
      rpm,
      angle: mod(options.angle ?? 0, this.spec.cycleDeg),
      throttle: 0,
      load: 0,
      manifoldPressureKpa: rpm > 0 ? 36 : this.spec.ambientPressureKpa,
      boostKpa: 0,
      airflowGps: 0,
      fuelFlowGps: 0,
      turboRpmNormalized: 0,
      netTorqueNm: 0,
      averageNetTorqueNm: 0,
      effectiveThrottle: 0,
      exhaustEnergyKw: 0,
      exhaustTempC: warm ? 520 : this.ambientTempC,
      coolantTempC: warm ? 90 : this.ambientTempC,
      oilTempC: warm ? 95 : this.ambientTempC,
      oilPressureKpa: 0,
      coolantFlowLpm: 0,
      thermostat: warm ? 0.35 : 0,
      vibrationAmplitude: 0,
      cylinderHeadTempC: warm ? 108 : this.ambientTempC,
      exhaustManifoldTempC: warm ? 480 : this.ambientTempC,
      turboTempC: warm ? 420 : this.ambientTempC,
      oilPumpRpm: 0,
      waterPumpRpm: 0,
      cylinders: [],
    };
    this.thermostatLatchedOpen = warm;
    this.refreshCylinders();
  }

  configure(next: Partial<EngineSystemsInput>) {
    for (const key of Object.keys(next)) {
      if (!['throttle', 'load', 'rpm', 'running'].includes(key))
        throw new Error(`Unknown engine systems input: ${key}`);
    }
    if (next.throttle !== undefined) validateUnit('throttle', next.throttle);
    if (next.load !== undefined) validateUnit('load', next.load);
    if (next.rpm !== undefined) validateNonNegative('rpm', next.rpm);
    if (next.running !== undefined && typeof next.running !== 'boolean')
      throw new Error('running must be boolean');
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

  /** Changes only the 720-degree phase; time, gas-path inertia and heat are untouched. */
  setCrankAngle(angleDeg: number) {
    if (!Number.isFinite(angleDeg)) throw new Error('angle must be finite');
    this.state.angle = mod(angleDeg, this.spec.cycleDeg);
    this.refreshCylinders();
    return this.state;
  }

  private tick() {
    const { state: s, spec: p, input } = this;
    const dt = p.step;
    this.ticks++;
    s.time = this.ticks * dt;
    s.rpm = finiteClamp(input.rpm, 0, 9000, s.rpm);
    s.running = Boolean(input.running && s.rpm >= 120);
    s.load = finiteClamp(input.load, 0, 1, 0);
    s.angle = mod(s.angle + s.rpm * 6 * dt, p.cycleDeg);

    s.effectiveThrottle = approach(
      s.effectiveThrottle,
      input.throttle,
      dt,
      p.throttleTimeConstantS,
    );
    if (Math.abs(s.effectiveThrottle - input.throttle) < 1e-12)
      s.effectiveThrottle = input.throttle;
    s.throttle = finiteClamp(s.effectiveThrottle, 0, 1, 0);

    const speedDrive = smoothstep((s.rpm - 1350) / 3600);
    const combustionLoad = s.running ? Math.max(s.throttle, s.load * 0.72) : 0;
    const turboTarget = clamp(
      speedDrive * combustionLoad * (0.55 + 0.45 * s.throttle),
    );
    const turboTau =
      turboTarget > s.turboRpmNormalized
        ? p.turboSpoolTimeS
        : p.turboDecayTimeS;
    s.turboRpmNormalized = finiteClamp(
      approach(s.turboRpmNormalized, turboTarget, dt, turboTau),
      0,
      1,
      0,
    );
    s.boostKpa = finiteClamp(
      p.maxBoostKpa * s.turboRpmNormalized ** 1.7,
      0,
      p.maxBoostKpa,
      0,
    );

    const throttleArea = smoothstep(Math.min(1, s.throttle * 1.25));
    const manifoldTarget =
      s.rpm < 1
        ? p.ambientPressureKpa
        : 29 + (p.ambientPressureKpa + s.boostKpa - 29) * throttleArea;
    s.manifoldPressureKpa = finiteClamp(
      approach(
        s.manifoldPressureKpa,
        manifoldTarget,
        dt,
        p.manifoldTimeConstantS,
      ),
      18,
      p.ambientPressureKpa + p.maxBoostKpa,
      p.ambientPressureKpa,
    );

    const intakeTempK = clamp(
      this.ambientTempC + 273.15 + s.boostKpa * 0.12,
      220,
      420,
    );
    const airDensityKgM3 =
      (s.manifoldPressureKpa * 1000) / (287.05 * intakeTempK);
    const volumetricEfficiency = clamp(
      0.72 +
        0.25 * smoothstep((s.rpm - 700) / 3000) -
        0.1 * smoothstep((s.rpm - 6500) / 1800),
      0.55,
      1.02,
    );
    const sweptM3PerSecond = ((p.displacementL / 1000) * s.rpm) / 120;
    s.airflowGps = finiteClamp(
      s.running
        ? sweptM3PerSecond * airDensityKgM3 * volumetricEfficiency * 1000
        : 0,
      0,
      500,
      0,
    );
    const afr =
      p.stoichiometricAfr -
      (p.stoichiometricAfr - p.fullLoadAfr) *
        smoothstep((s.throttle - 0.55) / 0.45);
    s.fuelFlowGps = finiteClamp(s.airflowGps / afr, 0, 45, 0);

    const frictionNm =
      (6 + s.rpm * 0.006) * (1 + 0.28 * clamp((55 - s.oilTempC) / 55));
    const warmFactor =
      0.82 + 0.18 * clamp((Math.min(s.oilTempC, s.coolantTempC) - 20) / 65);
    const fullLoadTorque = calibratedFullLoadTorqueNm(Math.max(800, s.rpm));
    s.averageNetTorqueNm = finiteClamp(
      s.running
        ? -frictionNm + s.throttle * (fullLoadTorque * warmFactor + frictionNm)
        : -frictionNm * smoothstep(s.rpm / 250),
      -100,
      550,
      0,
    );
    const firingHarmonic = Math.sin((TWO_PI * s.angle) / 144);
    s.netTorqueNm = finiteClamp(
      s.averageNetTorqueNm +
        Math.abs(s.averageNetTorqueNm) * 0.14 * firingHarmonic,
      -140,
      650,
      s.averageNetTorqueNm,
    );
    s.vibrationAmplitude = finiteClamp(
      (0.015 + 0.12 * combustionLoad) *
        (0.4 + 0.6 * Math.abs(firingHarmonic)) *
        smoothstep(s.rpm / 650),
      0,
      1,
      0,
    );

    const fuelPowerKw = s.fuelFlowGps * 43;
    s.exhaustEnergyKw = finiteClamp(
      fuelPowerKw * (0.22 + 0.11 * combustionLoad),
      0,
      520,
      0,
    );
    const exhaustTarget = s.running
      ? this.ambientTempC + 135 + 720 * combustionLoad
      : this.ambientTempC;
    s.exhaustTempC = finiteClamp(
      approach(s.exhaustTempC, exhaustTarget, dt, s.running ? 2.8 : 14),
      this.ambientTempC,
      1050,
      this.ambientTempC,
    );

    this.updateThermalAndPumps(combustionLoad, dt);
    this.refreshCylinders();
  }

  private updateThermalAndPumps(combustionLoad: number, dt: number) {
    const { state: s, spec: p } = this;
    if (s.coolantTempC >= p.thermostatOpenC) this.thermostatLatchedOpen = true;
    else if (s.coolantTempC <= p.thermostatCloseC)
      this.thermostatLatchedOpen = false;
    s.thermostat = finiteClamp(
      approach(s.thermostat, this.thermostatLatchedOpen ? 1 : 0, dt, 7),
      0,
      1,
      0,
    );

    const coolantTarget = s.running
      ? 91 + 10 * combustionLoad - 5 * s.thermostat
      : this.ambientTempC;
    const oilTarget = s.running ? 91 + 24 * combustionLoad : this.ambientTempC;
    const headTarget = s.running
      ? s.coolantTempC + 18 + 72 * combustionLoad
      : this.ambientTempC;
    const manifoldTarget = s.running
      ? this.ambientTempC + 75 + 630 * combustionLoad
      : this.ambientTempC;
    const turboTarget = s.running
      ? this.ambientTempC + 55 + 560 * combustionLoad
      : this.ambientTempC;

    s.coolantTempC = finiteClamp(
      approach(s.coolantTempC, coolantTarget, dt, s.running ? 115 : 650),
      this.ambientTempC,
      125,
      this.ambientTempC,
    );
    s.oilTempC = finiteClamp(
      approach(s.oilTempC, oilTarget, dt, s.running ? 180 : 900),
      this.ambientTempC,
      145,
      this.ambientTempC,
    );
    s.cylinderHeadTempC = finiteClamp(
      approach(s.cylinderHeadTempC, headTarget, dt, s.running ? 24 : 520),
      this.ambientTempC,
      230,
      this.ambientTempC,
    );
    s.exhaustManifoldTempC = finiteClamp(
      approach(s.exhaustManifoldTempC, manifoldTarget, dt, s.running ? 8 : 400),
      this.ambientTempC,
      950,
      this.ambientTempC,
    );
    s.turboTempC = finiteClamp(
      approach(s.turboTempC, turboTarget, dt, s.running ? 14 : 560),
      this.ambientTempC,
      900,
      this.ambientTempC,
    );

    s.oilPumpRpm = finiteClamp(s.rpm * 0.82, 0, 7500, 0);
    s.waterPumpRpm = finiteClamp(s.rpm * 0.68, 0, 6200, 0);
    const viscosityFactor = clamp(1 + (90 - s.oilTempC) * 0.006, 0.62, 1.42);
    const oilPressureTarget =
      s.rpm < 20 ? 0 : clamp((72 + s.rpm * 0.066) * viscosityFactor, 0, 560);
    s.oilPressureKpa = finiteClamp(
      approach(
        s.oilPressureKpa,
        oilPressureTarget,
        dt,
        s.rpm > 20 ? 0.075 : 0.35,
      ),
      0,
      600,
      0,
    );
    const pumpFlow = s.rpm * 0.014;
    s.coolantFlowLpm = finiteClamp(
      pumpFlow * (0.38 + 0.62 * s.thermostat),
      0,
      110,
      0,
    );
  }

  private refreshCylinders() {
    const { state: s, spec: p } = this;
    const manifoldBar = s.manifoldPressureKpa / 100;
    const perCylinderFlow = s.airflowGps / p.cylinders;
    const chargeG =
      s.rpm > 1 ? (s.airflowGps * 120) / (s.rpm * p.cylinders) : 0;
    s.cylinders = p.cylinderPhaseOffsetsDeg.map((offset, index) => {
      const phaseDeg = mod(s.angle - offset, p.cycleDeg);
      const intakePosition = clamp((phaseDeg - 360) / 180);
      const exhaustPosition = clamp((phaseDeg - 180) / 180);
      const intakeShape =
        phaseDeg >= 360 && phaseDeg < 540
          ? Math.sin(Math.PI * intakePosition)
          : 0;
      const exhaustShape =
        phaseDeg >= 180 && phaseDeg < 360
          ? Math.sin(Math.PI * exhaustPosition)
          : 0;
      const compression =
        phaseDeg >= 540
          ? manifoldBar * (1 + 11.5 * ((phaseDeg - 540) / 180) ** 3)
          : manifoldBar;
      const burnWindow = phaseDeg < 105 ? phaseDeg / 105 : 0;
      const burnFraction =
        s.running && phaseDeg < 105
          ? 1 - Math.exp(-5.2 * burnWindow ** 2.4)
          : 0;
      const combustionPressure =
        s.running && phaseDeg < 180
          ? (32 + 54 * s.load + 25 * s.throttle) *
            Math.exp(-(((phaseDeg - 14) / 47) ** 2)) *
            (0.45 + 0.55 * clamp(chargeG / 0.85))
          : 0;
      const pressureBar = finiteClamp(
        Math.max(manifoldBar * 0.72, compression + combustionPressure),
        0.12,
        145,
        1,
      );
      const temperatureC = finiteClamp(
        s.cylinderHeadTempC +
          18 * (pressureBar - manifoldBar) +
          burnFraction * 620,
        this.ambientTempC,
        2400,
        this.ambientTempC,
      );
      const cylinder: CylinderProcessState = {
        cylinder: index + 1,
        phaseDeg,
        pressureBar,
        temperatureC,
        burnFraction: finiteClamp(burnFraction, 0, 1, 0),
        chargeMassMg: finiteClamp(chargeG * 1000, 0, 3000, 0),
        intakeFlowGps: finiteClamp(
          perCylinderFlow * 3.15 * intakeShape,
          0,
          500,
          0,
        ),
        exhaustFlowGps: finiteClamp(
          (perCylinderFlow + s.fuelFlowGps / p.cylinders) * 3.15 * exhaustShape,
          0,
          500,
          0,
        ),
        firing: Boolean(s.running && phaseDeg < 24),
      };
      return cylinder;
    });
  }
}
