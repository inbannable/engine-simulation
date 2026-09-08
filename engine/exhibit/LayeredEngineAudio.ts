import type { EngineFrame } from './types';

export type ExhibitAudioStatus =
  | 'off'
  | 'starting'
  | 'running'
  | 'unavailable'
  | 'disposed';

type AudioContextFactory = () => AudioContext;

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

/**
 * Persistent procedural voices for the exhibit. Construction is silent and
 * does not touch AudioContext; only enableFromUserGesture may create/resume it.
 */
export class LayeredEngineAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly oscillators: OscillatorNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly combustionOscillators: OscillatorNode[] = [];
  private readonly combustionGains: GainNode[] = [];
  private intakeOscillator: OscillatorNode | null = null;
  private intakeGain: GainNode | null = null;
  private exhaustOscillator: OscillatorNode | null = null;
  private exhaustGain: GainNode | null = null;
  private turboOscillator: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private timingOscillator: OscillatorNode | null = null;
  private timingGain: GainNode | null = null;
  private gearOscillator: OscillatorNode | null = null;
  private gearGain: GainNode | null = null;
  private cameraX = 0;
  private cameraY = 160;
  private cameraZ = 1_000;
  private _status: ExhibitAudioStatus = 'off';

  constructor(private readonly contextFactory?: AudioContextFactory) {}

  get status() {
    return this._status;
  }

  /** Call this method directly from a click/tap/keyboard activation handler. */
  async enableFromUserGesture() {
    if (this._status === 'disposed') return false;
    if (this._status === 'running') return true;
    this._status = 'starting';
    try {
      if (!this.context) {
        const create =
          this.contextFactory ??
          (() => {
            if (typeof AudioContext === 'undefined')
              throw new Error('Web Audio unavailable');
            return new AudioContext();
          });
        this.context = create();
        this.buildGraph(this.context);
      }
      await this.context.resume();
      if (this.context.state !== 'running')
        throw new Error('Audio context did not enter running state');
      this._status = 'running';
      return true;
    } catch {
      this._status = 'unavailable';
      this.releaseGraph();
      await this.closeContext();
      return false;
    }
  }

  setCameraPosition(x: number, y: number, z: number) {
    if (Number.isFinite(x)) this.cameraX = x;
    if (Number.isFinite(y)) this.cameraY = y;
    if (Number.isFinite(z)) this.cameraZ = z;
  }

  update(frame: EngineFrame) {
    const context = this.context;
    if (this._status !== 'running' || !context) return;
    const now = context.currentTime;
    const rpm = clamp(frame.simulation.rpm, 0, 8_000);
    const shiftLoad =
      frame.powertrain?.phase === 'handover' ||
      frame.powertrain?.phase === 'synchronize'
        ? 0.56
        : 1;
    const engineWeight = this.cameraWeight(0, 130, 0);
    const intakeWeight = this.cameraWeight(-220, 250, 150);
    const exhaustWeight = this.cameraWeight(260, 245, -130);
    const gearboxWeight = this.cameraWeight(450, 90, 50);
    const exhaustPulse = frame.systems.cylinders.reduce(
      (maximum, cylinder) => Math.max(maximum, cylinder.exhaustFlowGps),
      0,
    );

    for (let index = 0; index < 5; index++) {
      const cylinder = frame.systems.cylinders[index];
      const combustion = clamp(cylinder?.burnFraction ?? 0);
      this.ramp(
        this.combustionOscillators[index]?.frequency,
        46 + rpm * 0.018 + index * 2.5,
        now,
      );
      this.ramp(
        this.combustionGains[index]?.gain,
        combustion * 0.055 * shiftLoad * engineWeight,
        now,
      );
    }
    this.ramp(this.intakeOscillator?.frequency, 62 + rpm * 0.026, now);
    this.ramp(
      this.intakeGain?.gain,
      clamp(frame.systems.airflowGps / 500) * 0.07 * intakeWeight,
      now,
    );
    this.ramp(this.exhaustOscillator?.frequency, 38 + rpm * 0.012, now);
    this.ramp(
      this.exhaustGain?.gain,
      clamp(exhaustPulse / 100) * 0.09 * shiftLoad * exhaustWeight,
      now,
    );
    this.ramp(
      this.turboOscillator?.frequency,
      280 + clamp(frame.systems.turboRpmNormalized) * 2_700,
      now,
    );
    this.ramp(
      this.turboGain?.gain,
      clamp(frame.systems.boostKpa / 160) * 0.035 * exhaustWeight,
      now,
    );
    this.ramp(this.timingOscillator?.frequency, 75 + rpm * 0.04, now);
    this.ramp(
      this.timingGain?.gain,
      clamp(rpm / 8_000) * 0.022 * engineWeight,
      now,
    );
    this.ramp(this.gearOscillator?.frequency, 95 + rpm * 0.055, now);
    this.ramp(
      this.gearGain?.gain,
      clamp(Math.abs(frame.powertrain?.wheelTorque ?? 0) / 5_000) *
        0.035 *
        gearboxWeight,
      now,
    );
  }

  mute() {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.025);
  }

  unmute() {
    if (this.master && this.context && this._status === 'running')
      this.master.gain.setTargetAtTime(0.85, this.context.currentTime, 0.04);
  }

  async dispose() {
    if (this._status === 'disposed') return;
    this._status = 'disposed';
    this.releaseGraph();
    await this.closeContext();
  }

  private releaseGraph() {
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // A failed/closed AudioContext may already have stopped the voice.
      }
    }
    for (const node of this.nodes) node.disconnect();
    this.oscillators.length = 0;
    this.nodes.length = 0;
    this.combustionOscillators.length = 0;
    this.combustionGains.length = 0;
    this.intakeOscillator = null;
    this.intakeGain = null;
    this.exhaustOscillator = null;
    this.exhaustGain = null;
    this.turboOscillator = null;
    this.turboGain = null;
    this.timingOscillator = null;
    this.timingGain = null;
    this.gearOscillator = null;
    this.gearGain = null;
    this.master = null;
  }

  private buildGraph(context: AudioContext) {
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    master.gain.value = 0.85;
    compressor.threshold.value = -18;
    compressor.ratio.value = 6;
    master.connect(compressor);
    compressor.connect(context.destination);
    this.master = master;
    this.nodes.push(master, compressor);

    for (let index = 0; index < 5; index++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index % 2 ? 'triangle' : 'sine';
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start();
      this.combustionOscillators.push(oscillator);
      this.combustionGains.push(gain);
      this.oscillators.push(oscillator);
      this.nodes.push(oscillator, gain);
    }

    const intake = this.createFilteredVoice(
      context,
      master,
      'sine',
      'bandpass',
      430,
    );
    this.intakeOscillator = intake.oscillator;
    this.intakeGain = intake.gain;
    const exhaust = this.createFilteredVoice(
      context,
      master,
      'sawtooth',
      'lowpass',
      310,
    );
    this.exhaustOscillator = exhaust.oscillator;
    this.exhaustGain = exhaust.gain;
    const turbo = this.createVoice(context, master, 'sine');
    this.turboOscillator = turbo.oscillator;
    this.turboGain = turbo.gain;
    const timing = this.createVoice(context, master, 'square');
    this.timingOscillator = timing.oscillator;
    this.timingGain = timing.gain;
    const gear = this.createVoice(context, master, 'triangle');
    this.gearOscillator = gear.oscillator;
    this.gearGain = gear.gain;
  }

  private createVoice(
    context: AudioContext,
    output: AudioNode,
    type: OscillatorType,
  ) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start();
    this.oscillators.push(oscillator);
    this.nodes.push(oscillator, gain);
    return { oscillator, gain };
  }

  private createFilteredVoice(
    context: AudioContext,
    output: AudioNode,
    type: OscillatorType,
    filterType: BiquadFilterType,
    filterFrequency: number,
  ) {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = type;
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    filter.Q.value = 1.4;
    gain.gain.value = 0;
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    oscillator.start();
    this.oscillators.push(oscillator);
    this.nodes.push(oscillator, filter, gain);
    return { oscillator, gain };
  }

  private ramp(parameter: AudioParam | undefined, value: number, now: number) {
    parameter?.setTargetAtTime(value, now, 0.025);
  }

  private cameraWeight(x: number, y: number, z: number) {
    const distance = Math.hypot(
      this.cameraX - x,
      this.cameraY - y,
      this.cameraZ - z,
    );
    return clamp(1.25 - distance / 1_800, 0.45, 1.15);
  }

  private async closeContext() {
    const context = this.context;
    this.context = null;
    this.master = null;
    if (!context) return;
    try {
      await context.close();
    } catch {
      // Audio teardown must never interrupt the simulation.
    }
  }
}
