import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chainEnvelope } from '../engine/chain';
void test('export contains all named animation anchors and separate shells', () => {
  const bytes = readFileSync(
    new URL('../public/models/rs3-ea855-evo.glb', import.meta.url),
  );
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  const json = JSON.parse(
    bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)),
  ) as { nodes: { name?: string; translation?: number[] }[] };
  const names = new Set(json.nodes.map((n) => n.name));
  for (const name of [
    'Cover',
    'FrontShell',
    'RearShell',
    'Body',
    'Accessories',
    'Core',
    'Timing',
    'Crankshaft',
    'IntakeCam',
    'ExhaustCam',
  ])
    assert.ok(names.has(name), name);
  for (let i = 1; i <= 5; i++) {
    for (const prefix of ['Piston', 'Rod'])
      assert.ok(names.has(`${prefix}_${i}`));
    for (const side of ['Intake', 'Exhaust'])
      for (let j = 0; j < 2; j++)
        for (const part of ['Valve', 'Spring'])
          assert.ok(names.has(`${side}${part}_${i}_${j}`));
  }
  const cam = (name: string) =>
    json.nodes.find((n) => n.name === name)!.translation!;
  assert.ok(
    Math.abs(cam('IntakeCam')[2] - cam('ExhaustCam')[2]) > 2 * 38.2,
    'Cam gears must not intersect',
  );
  assert.equal(
    names.has('Main shaft'),
    false,
    'Continuous shaft would intersect connecting rods',
  );
});
void test('chain envelope keeps both stages outside sprocket circles', () => {
  for (const circles of [
    [
      { y: 0, z: 0, r: 32 },
      { y: 157, z: 0, r: 51 },
    ],
    [
      { y: 157, z: 0, r: 31 },
      { y: 294, z: -44, r: 38.5 },
      { y: 294, z: 44, r: 38.5 },
    ],
  ]) {
    const hull = chainEnvelope(circles);
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i],
        b = hull[(i + 1) % hull.length],
        dy = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dy, dz);
      assert.ok(length > 0);
      for (const c of circles) {
        const distance = (dy * (c.z - a[1]) - dz * (c.y - a[0])) / length;
        assert.ok(distance >= c.r - 0.04, 'Chain crosses a sprocket body');
      }
    }
  }
});
