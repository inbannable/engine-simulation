import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFileSync } from 'node:fs';
import { INITIAL } from '../engine/physics';
import { ExhibitRuntime } from '../engine/exhibit/ExhibitRuntime';
import { EXHIBIT_SCENARIOS } from '../engine/exhibit/ScenarioController';
import { readCadPaths } from '../engine/exhibit/cad-paths';

function finite(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (value && typeof value === 'object')
    Object.values(value).forEach(finite);
}
void test('all nine scenarios run coupled solvers with finite physical state', () => {
  for (const id of EXHIBIT_SCENARIOS) {
    const r = new ExhibitRuntime(),
      s = { ...INITIAL };
    r.start(id, s);
    for (let i = 0; i < 720; i++) {
      const frame = r.advance(1 / 60, 1 / 60, s);
      finite(frame);
      assert.ok(frame.systems.manifoldPressureKpa > 0);
      assert.ok(frame.systems.oilTempC >= -40 && frame.systems.oilTempC < 200);
      assert.ok(
        r.powertrain.state.clutches.filter((c) => c.status === 'locked')
          .length <= 1,
      );
    }
    if (id === 'shift-2-3') {
      assert.equal(r.powertrain.state.gear, 3);
      assert.equal(r.powertrain.state.phase, 'steady');
    }
    if (id === 'low-speed-creep') assert.ok(r.powertrain.state.speed > 0.5);
    if (id === 'cold-start') assert.ok(s.rpm > 750 && s.rpm < 1000);
    if (id === 'high-rpm-overrun')
      assert.ok(r.bench.systems.state.throttle < 0.01);
  }
});
void test('integrated 30/60/120 FPS and 0.1x yield the same fixed-step state', () => {
  const run = (fps: number, rate = 1) => {
    const r = new ExhibitRuntime(),
      s = { ...INITIAL };
    r.start('shift-2-3', s);
    r.scenarios.skip();
    for (let i = 0; i < (2 * fps) / rate; i++)
      r.advance(rate / fps, 1 / fps, s);
    return {
      engine: r.bench.systems.state,
      dct: r.adapter.dct.state,
      pt: r.powertrain.state,
    };
  };
  const reference = run(60);
  assert.deepEqual(run(30), reference);
  assert.deepEqual(run(120), reference);
  assert.deepEqual(run(60, 0.1), reference);
});
void test('mode transfer and phase scrub preserve thermal, turbo and hydraulic history', () => {
  const r = new ExhibitRuntime(),
    s = { ...INITIAL };
  r.start('full-load', s);
  r.advance(2, 2, s);
  const engine = r.bench.systems;
  const heat = engine.state.oilTempC,
    turbo = engine.state.turboRpmNormalized;
  const hydraulic = structuredClone(r.adapter.dct.state);
  r.setLinked(true);
  r.setLinked(false);
  r.bench.setCrankAngle(650);
  assert.equal(r.bench.systems, engine);
  assert.equal(engine.state.oilTempC, heat);
  assert.equal(engine.state.turboRpmNormalized, turbo);
  assert.deepEqual(r.adapter.dct.state, hydraulic);
  assert.equal(r.bench.state.angle, 650);
  const before = structuredClone(r.frame(s));
  r.advance(0, 0, s);
  assert.deepEqual(r.frame(s), before);
});
void test('CAD extras parser accepts final paths and rejects missing or duplicate anchors', () => {
  const bytes = readFileSync(
    new URL('../public/models/rs3-ea855-evo.glb', import.meta.url),
  );
  const glb = JSON.parse(
    bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)),
  ) as {
    nodes: {
      name: string;
      extras?: Record<string, unknown>;
      translation?: number[];
    }[];
  };
  const nodes = glb.nodes.map((n) => {
    const o = new T.Object3D();
    o.name = n.name;
    o.userData = n.extras ?? {};
    if (n.translation) o.position.fromArray(n.translation);
    return o;
  });
  assert.equal(readCadPaths(nodes).size, 26);
  const anchor = nodes.find((n) => n.userData.role === 'anchor')!;
  assert.throws(() => readCadPaths([...nodes, anchor.clone()]), /顺序/);
  assert.throws(
    () => readCadPaths(nodes.filter((n) => n.userData.path !== 'air_intake')),
    /缺失/,
  );
});
