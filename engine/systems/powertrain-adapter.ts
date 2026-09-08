import type { PowertrainState } from '../powertrain';
import { DctHydraulics } from './dct-hydraulics';
import { EngineSystems } from './engine-systems';
import { calibratedFullLoadTorqueNm } from './spec';

/**
 * Read-only bridge for the existing Powertrain state. The original solver owns
 * vehicle dynamics; these systems add observable gas, heat and hydraulic state.
 */
export class PowertrainSystemsAdapter {
  constructor(
    public readonly engine = new EngineSystems(),
    public readonly dct = new DctHydraulics(),
  ) {}

  advance(powertrain: Readonly<PowertrainState>, seconds: number) {
    const torqueCapacity = Math.max(
      1,
      calibratedFullLoadTorqueNm(Math.max(800, powertrain.rpm)),
    );
    this.engine.configure({
      rpm: Math.max(0, powertrain.rpm),
      running: powertrain.rpm >= 120,
      throttle: powertrain.throttle,
      load: Math.min(1, Math.abs(powertrain.engineTorque) / torqueCapacity),
    });
    this.dct.configure({
      engineRpm: Math.max(0, powertrain.rpm),
      pumpCommand: powertrain.rpm > 100 ? 1 : 0,
      valveCommands: [
        powertrain.clutches[0].engagement,
        powertrain.clutches[1].engagement,
      ],
      forkCommands: [
        Math.min(1, Math.abs(powertrain.selectorPositions[0]) / 7),
        Math.min(1, Math.abs(powertrain.selectorPositions[1]) / 7),
        Math.min(1, Math.abs(powertrain.selectorPositions[2]) / 7),
        Math.min(1, Math.abs(powertrain.selectorPositions[3]) / 7),
      ],
      clutchSlipRpm: [powertrain.clutches[0].slip, powertrain.clutches[1].slip],
      clutchTorqueNm: [
        powertrain.clutches[0].torque,
        powertrain.clutches[1].torque,
      ],
      coolerCommand: powertrain.rpm > 100 ? 1 : 0,
    });
    this.engine.advance(seconds);
    this.dct.advance(seconds);
    return { engine: this.engine.state, dct: this.dct.state };
  }
}
