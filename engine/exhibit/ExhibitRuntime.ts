import { EngineBench } from '../systems/engine-bench';
import { EngineSystems } from '../systems/engine-systems';
import { PowertrainSystemsAdapter } from '../systems/powertrain-adapter';
import {
  Powertrain,
  gearInfo,
  rpmAtSpeed,
  selectorTarget,
} from '../powertrain';
import type { EngineFrame, ObservationLayer } from '../systems/types';
import type { SimulationState } from '../physics';
import {
  ExhibitScenarioController,
  type ExhibitScenarioId,
  type ScenarioDirective,
} from './ScenarioController';

/** One shared thermal/gas history; only the active mechanical solver owns phase. */
export class ExhibitRuntime {
  bench = new EngineBench(undefined, undefined, { ambientTempC: 8 });
  adapter = new PowertrainSystemsAdapter(this.bench.systems);
  readonly powertrain = new Powertrain();
  readonly scenarios: ExhibitScenarioController;
  linked = false;
  layer: ObservationLayer = 'gas-combustion';
  load = 0;
  private lastStep = '';
  private remainder = 0;
  setLayer(layer: ObservationLayer) {
    this.layer = layer;
  }
  setLoad(load: number) {
    this.load = load;
  }
  constructor(reducedMotion = false) {
    this.scenarios = new ExhibitScenarioController(reducedMotion);
    this.powertrain.systems = this.adapter;
    this.bench.configure({ ignition: true, starter: true });
  }
  setLinked(linked: boolean) {
    if (this.linked === linked) return;
    this.linked = linked;
    if (linked) {
      this.powertrain.state.rpm = this.bench.state.rpm;
      this.powertrain.state.angle = this.bench.state.angle;
    } else {
      this.bench.state.rpm = Math.max(0, this.powertrain.state.rpm);
      this.bench.setCrankAngle(this.powertrain.state.angle);
    }
  }
  reset(s: SimulationState) {
    this.scenarios.cancelManually();
    this.powertrain.reset();
    this.bench = new EngineBench(undefined, undefined, {
      rpm: 800,
      ambientTempC: 8,
    });
    this.bench.configure({ ignition: true, starter: true });
    this.adapter = new PowertrainSystemsAdapter(this.bench.systems);
    this.powertrain.systems = this.adapter;
    this.load = 0;
    this.remainder = 0;
    Object.assign(s, { rpm: 800, targetRpm: 800, angle: 0, playing: false });
  }
  start(id: ExhibitScenarioId, simulation: SimulationState) {
    const directive = this.scenarios.start(id);
    const initial = directive.initialConditions;
    this.setLinked(directive.inputs.driveMode !== undefined);
    if (initial?.ambientTemperatureC !== undefined) {
      const shared = new EngineSystems(undefined, {
        ambientTempC: initial.ambientTemperatureC,
        warm: id === 'heat-soak',
      });
      if (initial.coolantTemperatureC !== undefined)
        shared.state.coolantTempC = initial.coolantTemperatureC;
      if (initial.oilTemperatureC !== undefined)
        shared.state.oilTempC = initial.oilTemperatureC;
      this.bench = new EngineBench(undefined, undefined, {}, shared);
      this.adapter = new PowertrainSystemsAdapter(shared, this.adapter.dct);
      this.powertrain.systems = this.adapter;
    }
    if (initial?.selectedGear !== undefined) {
      this.powertrain.reset();
      const gear = initial.selectedGear;
      this.powertrain.configure({ mode: directive.inputs.driveMode ?? 'M' });
      const s = this.powertrain.state;
      s.gear = s.target = gear;
      s.phase = 'steady';
      s.selected = [0, 0];
      s.selected[gearInfo(gear)!.clutch] = gear;
      s.selectorPositions = s.selectorPositions.map((_, i) =>
        selectorTarget(gear, i),
      );
      s.speed = (initial.vehicleSpeedKmh ?? 0) / 3.6;
      s.rpm = Math.max(800, rpmAtSpeed(gear, s.speed));
    }
    if (id === 'full-load' || id === 'high-rpm-overrun') {
      const rpm = id === 'full-load' ? 6200 : 5800;
      const shared = new EngineSystems(undefined, { rpm, warm: true });
      shared.configure({ running: true, rpm, throttle: 1, load: 1 });
      shared.advance(3);
      this.bench = new EngineBench(undefined, undefined, {}, shared);
      this.adapter = new PowertrainSystemsAdapter(shared, this.adapter.dct);
      this.powertrain.systems = this.adapter;
    }
    this.lastStep = '';
    this.remainder = 0;
    simulation.mode = 'cutaway';
    simulation.realtime = true;
    simulation.rate = 1;
    simulation.playing = true;
    this.apply(directive, simulation);
    return directive;
  }
  private apply(d: ScenarioDirective, s: SimulationState) {
    if (!d.active) return;
    const key = `${d.scenario}:${JSON.stringify(d.inputs)}:${d.layer}`;
    if (key === this.lastStep) return;
    this.lastStep = key;
    const input = d.inputs;
    this.layer = d.layer;
    if (input.targetRpm !== undefined) s.targetRpm = input.targetRpm;
    this.bench.configure({
      ignition: d.scenario !== 'heat-soak',
      starter: d.scenario !== 'heat-soak',
      throttle: input.throttle ?? 0,
      governorEnabled: d.scenario !== 'high-rpm-overrun',
    });
    // Full-load dynamometer absorbs load; overrun disables the speed governor.
    this.load = d.scenario === 'full-load' ? 1 : 0;
    if (input.driveMode) {
      this.powertrain.configure({
        mode: input.driveMode,
        throttle: input.throttle ?? 0,
        brake: input.brake ?? 0,
      });
      if (
        input.requestedGear &&
        input.requestedGear !== this.powertrain.state.gear
      )
        this.powertrain.requestShift(
          Math.sign(input.requestedGear - this.powertrain.state.gear),
        );
    }
  }
  advance(seconds: number, presentationSeconds: number, s: SimulationState) {
    if (
      ![seconds, presentationSeconds].every((n) => Number.isFinite(n) && n >= 0)
    )
      throw new Error('非法时间步');
    const step = 1 / 600;
    const ratio = presentationSeconds > 0 ? seconds / presentationSeconds : 0;
    this.remainder += presentationSeconds;
    const count = Math.floor((this.remainder + 1e-12) / step);
    this.remainder -= count * step;
    for (let i = 0; i < count; i++) this.tick(step * ratio, step, s);
    return this.frame(s);
  }
  private tick(
    seconds: number,
    presentationSeconds: number,
    s: SimulationState,
  ) {
    this.apply(this.scenarios.snapshot(), s);
    if (this.linked) {
      this.powertrain.advance(seconds);
      s.rpm = this.powertrain.state.rpm;
      s.angle = this.powertrain.state.angle;
      this.bench.systems.configure({ rpm: Math.max(0, s.rpm) });
      this.bench.systems.state.rpm = s.rpm;
      this.bench.systems.setCrankAngle(s.angle);
    } else {
      this.bench.configure({ targetRpm: s.targetRpm, load: this.load });
      this.bench.advance(seconds);
      s.rpm = this.bench.state.rpm;
      s.angle = this.bench.state.angle;
      this.adapter.dct.configure({
        engineRpm: s.rpm,
        pumpCommand: s.rpm > 100 ? 1 : 0,
        valveCommands: [0, 0],
      });
      this.adapter.dct.advance(seconds);
    }
    this.scenarios.advance(presentationSeconds);
    return this.frame(s);
  }
  frame(s: SimulationState): EngineFrame {
    return {
      simulation: s,
      systems: this.bench.systems.state,
      hydraulic: this.adapter.dct.state,
      powertrain: this.linked ? this.powertrain.state : undefined,
      layer: this.layer,
      cue: this.scenarios.snapshot().cue,
    };
  }
}
