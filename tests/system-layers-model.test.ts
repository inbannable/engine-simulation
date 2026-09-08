import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const bytes = readFileSync(
  new URL('../public/models/rs3-ea855-evo.glb', import.meta.url),
);
const g = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
const get = (name: string) => {
  const n = g.nodes.find((n: any) => n.name === name);
  assert.ok(n, name);
  return n;
};
void test('system hierarchy and all 26 ordered canonical paths', () => {
  assert.ok(bytes.length <= 15_000_000);
  assert.equal(g.animations, undefined);
  const root = get('SystemLayers');
  assert.deepEqual(
    root.children.map((i: number) => g.nodes[i].name).sort(),
    [
      'AirSystem',
      'OilSystem',
      'CoolantSystem',
      'HydraulicSystem',
      'SystemMotionAnchors',
    ].sort(),
  );
  const domains: Record<string, string[]> = {
    air: [
      'air_intake',
      ...Array.from({ length: 5 }, (_, i) => `air_cylinder_${i + 1}`),
    ],
    exhaust: [
      'exhaust_turbo',
      ...Array.from({ length: 5 }, (_, i) => `exhaust_cylinder_${i + 1}`),
    ],
    oil: ['oil_main', 'oil_crank', 'oil_head', 'oil_turbo'],
    coolant: ['coolant_block', 'coolant_head', 'coolant_turbo'],
    hydraulic: [
      'hydraulic_k1',
      'hydraulic_k2',
      'hydraulic_fork_15',
      'hydraulic_fork_37',
      'hydraulic_fork_4r',
      'hydraulic_fork_26',
      'hydraulic_return',
    ],
  };
  const anchors = g.nodes.filter((n: any) => n.extras?.role === 'anchor');
  assert.equal(anchors.length, 167);
  for (const [domain, paths] of Object.entries(domains))
    for (const path of paths) {
      const nodes = anchors
        .filter((n: any) => n.extras.path === path)
        .sort((a: any, b: any) => a.extras.order - b.extras.order);
      assert.ok(nodes.length >= 2, path);
      nodes.forEach((n: any, i: number) => {
        assert.deepEqual(n.extras, {
          system: domain,
          path,
          order: i,
          direction: 1,
          role: 'anchor',
        });
        assert.equal(
          n.name,
          `SYS_${domain.toUpperCase()}_${path.toUpperCase()}_${String(i).padStart(2, '0')}`,
        );
        assert.ok(n.translation.every(Number.isFinite));
      });
      get('SYS_ROUTE_' + path);
    }
  assert.equal(new Set(g.nodes.map((n: any) => n.name)).size, g.nodes.length);
});
void test('rotor local origins, axes and motion metadata remain explicit', () => {
  for (const [name, motion, xyz, axis] of [
    ['SYSTurboRotor', 'turbo', [95, 158, -159], [0, 0, 1]],
    ['SYSStarterRotor', 'starter', [299, -112, 0], [1, 0, 0]],
    ['SYSStarterRingGear', 'engine', [299, 0, 0], [1, 0, 0]],
    ['SYSHydraulicPump', 'hydraulicPump', [365, -115, -90], [1, 0, 0]],
    ['SYSWaterPump', 'waterPump', [-240, 105, 90], [1, 0, 0]],
    ['SYSOilPump', 'oilPump', [-235, 25, 95], [1, 0, 0]],
  ] as const) {
    const n = get(name);
    assert.equal(n.extras.ptMotion, motion);
    assert.deepEqual(n.translation, xyz);
    assert.deepEqual(n.extras.axis, axis);
    assert.equal(n.rotation, undefined);
    assert.equal(n.scale, undefined);
    const shaft = get(name + '_shaft');
    assert.equal(shaft.translation, undefined);
    const primitive = g.meshes[shaft.mesh].primitives[0];
    const pos = g.accessors[primitive.attributes.POSITION];
    pos.min.forEach((v: number, i: number) =>
      assert.ok(
        Math.abs(v + pos.max[i]) < 1e-5,
        'shaft centered on local origin',
      ),
    );
  }
  assert.deepEqual(
    get('SYSStarterRingGear').translation,
    get('DCTFlywheel').translation,
  );
});
