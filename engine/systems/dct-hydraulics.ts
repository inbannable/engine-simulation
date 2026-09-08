import {
  approach,
  finiteClamp,
  smoothstep,
  validateNonNegative,
  validateUnit,
} from './math';
import { DCT_HYDRAULICS_SPEC, type DctHydraulicsSpec } from './spec';
import type { DctHydraulicInput, DctHydraulicState } from './types';

const RPM_TO_RAD_S = Math.PI / 30;

const initialInput = (): DctHydraulicInput => ({
  engineRpm: 0,
  pumpCommand: 0,
  valveCommands: [0, 0],
  forkCommands: [0, 0, 0, 0],
  clutchSlipRpm: [0, 0],
  clutchTorqueNm: [0, 0],
  coolerCommand: 0,
});

export class DctHydraulics {
  public readonly state: DctHydraulicState;
  public input: DctHydraulicInput = initialInput();

  private remainder = 0;
  private ticks = 0;

  constructor(
    public readonly spec: DctHydraulicsSpec = DCT_HYDRAULICS_SPEC,
    initialOilTempC = spec.ambientTempC,
  ) {
    const oilTempC = finiteClamp(
      initialOilTempC,
      spec.ambientTempC,
      160,
      spec.ambientTempC,
    );
    this.state = {
      linePressureBar: 0,
      pumpRpm: 0,
      valveCommands: [0, 0],
      clutchPressureBar: [0, 0],
      forkPressureBar: [0, 0, 0, 0],
      oilTempC,
      coolerFlowLpm: 0,
      clutchEngagement: [0, 0],
      clutchDiscTempC: [oilTempC, oilTempC],
      slipPowerKw: [0, 0],
      slipEnergyJ: [0, 0],
    };
  }

  configure(next: Partial<DctHydraulicInput>) {
    for (const key of Object.keys(next)) {
      if (
        ![
          'engineRpm',
          'pumpCommand',
          'valveCommands',
          'forkCommands',
          'clutchSlipRpm',
          'clutchTorqueNm',
          'coolerCommand',
        ].includes(key)
      )
        throw new Error(`Unknown DCT hydraulic input: ${key}`);
    }
    if (next.engineRpm !== undefined)
      validateNonNegative('engineRpm', next.engineRpm);
    if (next.pumpCommand !== undefined)
      validateUnit('pumpCommand', next.pumpCommand);
    if (next.coolerCommand !== undefined)
      validateUnit('coolerCommand', next.coolerCommand);
    if (next.valveCommands !== undefined) {
      if (next.valveCommands.length !== 2)
        throw new Error('Two clutch valve commands are required');
      next.valveCommands.forEach((value) =>
        validateUnit('valveCommand', value),
      );
    }
    if (next.forkCommands !== undefined) {
      if (next.forkCommands.length !== 4)
        throw new Error('Four fork commands are required');
      next.forkCommands.forEach((value) => validateUnit('forkCommand', value));
    }
    if (next.clutchSlipRpm !== undefined) {
      if (next.clutchSlipRpm.length !== 2)
        throw new Error('Two clutch slip values are required');
      next.clutchSlipRpm.forEach((value) => {
        if (!Number.isFinite(value))
          throw new Error('clutchSlipRpm must be finite');
      });
    }
    if (next.clutchTorqueNm !== undefined) {
      if (next.clutchTorqueNm.length !== 2)
        throw new Error('Two clutch torque values are required');
      next.clutchTorqueNm.forEach((value) => {
        if (!Number.isFinite(value))
          throw new Error('clutchTorqueNm must be finite');
      });
    }
    this.input = {
      ...this.input,
      ...next,
      valveCommands: next.valveCommands
        ? [...next.valveCommands]
        : [...this.input.valveCommands],
      forkCommands: next.forkCommands
        ? [...next.forkCommands]
        : [...this.input.forkCommands],
      clutchSlipRpm: next.clutchSlipRpm
        ? [...next.clutchSlipRpm]
        : [...this.input.clutchSlipRpm],
      clutchTorqueNm: next.clutchTorqueNm
        ? [...next.clutchTorqueNm]
        : [...this.input.clutchTorqueNm],
    };
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

  pressureToEngagement(pressureBar: number) {
    const p = this.spec;
    return smoothstep(
      (pressureBar - p.clutchTouchPressureBar) /
        (p.clutchFullPressureBar - p.clutchTouchPressureBar),
    );
  }

  private tick() {
    const { state: s, input, spec: p } = this;
    const dt = p.step;
    this.ticks++;
    s.valveCommands = [...input.valveCommands];

    const pumpTargetRpm = input.engineRpm * 0.72 * input.pumpCommand;
    s.pumpRpm = finiteClamp(
      approach(s.pumpRpm, pumpTargetRpm, dt, 0.09),
      0,
      6500,
      0,
    );
    const availablePressure =
      p.maxLinePressureBar * smoothstep(s.pumpRpm / 2200) * input.pumpCommand;
    s.linePressureBar = finiteClamp(
      approach(s.linePressureBar, availablePressure, dt, 0.045),
      0,
      p.maxLinePressureBar,
      0,
    );

    for (let i = 0; i < 2; i++) {
      const pressureTarget = s.linePressureBar * input.valveCommands[i];
      s.clutchPressureBar[i] = finiteClamp(
        approach(
          s.clutchPressureBar[i],
          pressureTarget,
          dt,
          p.clutchPressureTimeS,
        ),
        0,
        p.maxLinePressureBar,
        0,
      );
      s.clutchEngagement[i] = finiteClamp(
        this.pressureToEngagement(s.clutchPressureBar[i]),
        0,
        1,
        0,
      );
      const slipPowerW = Math.abs(
        input.clutchTorqueNm[i] * input.clutchSlipRpm[i] * RPM_TO_RAD_S,
      );
      s.slipPowerKw[i] = finiteClamp(slipPowerW / 1000, 0, 1500, 0);
      s.slipEnergyJ[i] = finiteClamp(
        s.slipEnergyJ[i] + slipPowerW * dt,
        0,
        1e9,
        s.slipEnergyJ[i],
      );
      const heatRateCPerS = (slipPowerW * 0.72) / 18000;
      const coolingRateCPerS =
        (s.clutchDiscTempC[i] - s.oilTempC) *
        (0.022 + s.coolerFlowLpm * 0.0008);
      s.clutchDiscTempC[i] = finiteClamp(
        s.clutchDiscTempC[i] + (heatRateCPerS - coolingRateCPerS) * dt,
        p.ambientTempC,
        500,
        p.ambientTempC,
      );
    }

    for (let i = 0; i < 4; i++) {
      const target = s.linePressureBar * input.forkCommands[i] * 0.82;
      s.forkPressureBar[i] = finiteClamp(
        approach(s.forkPressureBar[i], target, dt, p.forkPressureTimeS),
        0,
        p.maxLinePressureBar,
        0,
      );
    }

    s.coolerFlowLpm = finiteClamp(
      18 * smoothstep(s.pumpRpm / 2600) * input.coolerCommand,
      0,
      18,
      0,
    );
    const oilHeatW = (s.slipPowerKw[0] + s.slipPowerKw[1]) * 1000 * 0.28;
    const passiveCoolingW = (s.oilTempC - p.ambientTempC) * 7;
    const coolerCoolingW =
      (s.oilTempC - p.ambientTempC) * s.coolerFlowLpm * 2.2;
    s.oilTempC = finiteClamp(
      s.oilTempC + ((oilHeatW - passiveCoolingW - coolerCoolingW) / 48000) * dt,
      p.ambientTempC,
      180,
      p.ambientTempC,
    );
  }
}
