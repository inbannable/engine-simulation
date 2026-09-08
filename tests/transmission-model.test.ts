import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GEARS, SYNC_GROUPS } from '../engine/powertrain';
void test('GLB transmission anchors, shaft membership, ratios and selector travel', () => {
  const bytes = readFileSync(
    new URL('../public/models/rs3-ea855-evo.glb', import.meta.url),
  );
  const gltf = JSON.parse(
    bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)),
  ) as {
    nodes: {
      name: string;
      translation?: number[];
      rotation?: number[];
      extras?: Record<string, unknown>;
    }[];
  };
  const get = (name: string) => {
    const n = gltf.nodes.find((n) => n.name === name);
    assert.ok(n, name);
    return n;
  };
  for (const name of [
    'TransmissionInternals',
    'TransmissionRearSection',
    'DCTFlywheel',
    'ClutchK1',
    'ClutchK2',
    'InputShaftK1',
    'InputShaftK2',
    'OutputShaft1',
    'OutputShaft2',
    'FinalDrive',
    'ClutchPistonK1',
    'ClutchPistonK2',
    'Input front bearing',
    'Input rear bearing',
  ])
    get(name);
  assert.deepEqual(
    get('ClutchK1').translation,
    get('ClutchK2').translation,
    'wet clutch packs nest radially on the same axis',
  );
  for (let clutch = 1; clutch <= 2; clutch++) {
    for (let plate = 0; plate < 7; plate++) {
      const n = get(`ClutchPlateK${clutch}_${plate}`);
      assert.equal(n.extras?.ptMotion, 'plate');
      assert.equal(n.extras?.driving, plate % 2 === 0);
      assert.equal(n.extras?.baseX, n.translation?.[0] ?? 0);
    }
  }
  for (const g of GEARS) {
    const teeth = get('Free gear ' + g.gear);
    assert.equal(teeth.extras?.toothForm, 'involute helical');
    assert.equal(Math.abs(Number(teeth.extras?.helixAngle)), 24);
    assert.ok(Number(teeth.extras?.visualTeeth) >= 16);
    get('Dog engagement teeth ' + g.gear);
    get('Synchronizer cone ' + g.gear);
    const n = get('Gear_' + g.gear);
    assert.equal(n.extras?.clutch, g.clutch);
    assert.equal(n.extras?.shaft, g.shaft);
    assert.equal(n.extras?.final, g.final);
    assert.equal(n.extras?.ptMotion, 'gear');
    assert.equal(
      n.rotation,
      undefined,
      'local anchor starts without baked rotation',
    );
    assert.ok(
      n.translation && n.translation[0] >= 390 && n.translation[0] <= 570,
    );
    if (g.gear !== -1)
      assert.equal(get('DriveGear_' + g.gear).extras?.clutch, g.clutch);
  }
  ['15', '37', '4R', '26'].forEach((name, i) => {
    for (const kind of ['Synchronizer_', 'Fork_']) {
      const n = get(kind + name);
      assert.deepEqual(n.extras?.gears, SYNC_GROUPS[i]);
      assert.equal(n.extras?.travel, 7);
      assert.equal(n.extras?.baseX, n.translation?.[0]);
    }
  });
  assert.equal(
    gltf.nodes.some((n) => /reverse.?shaft/i.test(n.name)),
    false,
  );
  assert.equal(
    get('Gear_-1').translation?.[0],
    get('Gear_2').translation?.[0],
    'reverse shares second free gear plane',
  );
});
