/** Event-triggered synthesizer; equal firing intervals, cylinder-specific timbre. */
export class EngineAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private active = new Set<OscillatorNode>();
  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = 0.22;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 8;
      this.output.connect(filter);
      filter.connect(compressor);
      compressor.connect(this.context.destination);
    }
    await this.context.resume();
  }
  fire(cylinder: number, rpm: number, teaching: boolean, delay = 0) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.output) return;
    const o = ctx.createOscillator(),
      g = ctx.createGain(),
      t = ctx.currentTime + delay + 0.025;
    o.type = teaching ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(
      teaching ? 440 + cylinder * 45 : 65 + rpm * 0.023 + cylinder * 9,
      t,
    );
    o.frequency.exponentialRampToValueAtTime(
      teaching ? 220 : 48 + cylinder * 3,
      t + 0.05,
    );
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(teaching ? 0.18 : 0.25, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (teaching ? 0.1 : 0.065));
    o.connect(g);
    g.connect(this.output);
    this.active.add(o);
    o.onended = () => {
      this.active.delete(o);
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + 0.12);
  }
  mute() {
    for (const o of this.active) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    this.active.clear();
  }
  async dispose() {
    this.mute();
    await this.context?.close();
    this.context = null;
    this.output = null;
  }
}
