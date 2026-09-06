import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEngine,
  firingEvents,
  advanceRPM,
  SPEC,
  OFFSETS,
} from '../engine/physics';
const near = (a: number, b: number, e = 1e-8) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
void test('720 degrees: exactly five correctly spaced firings, no duplicate boundaries', () => {
  const ev = firingEvents(-0.01, 719.99);
  assert.deepEqual(
    ev.map((e) => e.cylinder),
    [1, 2, 4, 5, 3],
  );
  assert.deepEqual(
    ev.map((e) => e.angle),
    [0, 144, 288, 432, 576],
  );
  assert.deepEqual(firingEvents(0, 144), [{ angle: 144, cylinder: 2 }]);
  assert.equal(firingEvents(144, 144).length, 0);
  assert.equal(firingEvents(0, 720).length, 5);
  assert.equal(firingEvents(0, 7200).length, 50);
});
void test('all cylinders have exact 92.8mm stroke and constant rod length', () => {
  for (let i = 0; i < 5; i++) {
    near(
      evaluateEngine(OFFSETS[i])[i].pistonY -
        evaluateEngine(OFFSETS[i] + 180)[i].pistonY,
      SPEC.stroke,
    );
  }
  for (let a = 0; a < 720; a += 0.5)
    for (const c of evaluateEngine(a)) {
      near(Math.hypot(c.pistonY - c.pinY, c.pinZ), SPEC.rod);
      near(c.pinY + SPEC.rod * Math.cos(c.rodAngle), c.pistonY);
      near(c.pinZ + SPEC.rod * Math.sin(c.rodAngle), 0);
      assert.ok(
        c.pistonY + 27 < 229.5 - Math.max(c.intakeLift, c.exhaustLift),
        'Valve head must clear piston crown',
      );
    }
});
void test('valve sequence and half-speed camshaft', () => {
  for (const [a, s] of [
    [90, 0],
    [270, 1],
    [450, 2],
    [630, 3],
  ])
    assert.equal(evaluateEngine(a)[0].stage, s);
  near(evaluateEngine(720)[0].camAngle, 2 * Math.PI);
  near(evaluateEngine(450)[0].intakeLift, 8);
  near(evaluateEngine(270)[0].exhaustLift, 8);
  near(
    evaluateEngine(630)[0].intakeLift + evaluateEngine(630)[0].exhaustLift,
    0,
  );
  for (let i = 0; i < 5; i++)
    near(evaluateEngine(17)[i].pistonY, evaluateEngine(737)[i].pistonY);
});
void test('analytic RPM transition and angle are independent of frame rate', () => {
  function run(dts: number[]) {
    let rpm = 800,
      angle = 0;
    for (const dt of dts) {
      const n = advanceRPM(rpm, 7000, dt);
      rpm = n.rpm;
      angle += n.degrees;
    }
    return { rpm, angle };
  }
  const reference = run([2]);
  for (const fps of [30, 60, 120]) {
    const r = run(Array(fps * 2).fill(1 / fps));
    near(r.rpm, reference.rpm);
    near(r.angle, reference.angle, 1e-7);
  }
  const dropped = run([0.01, 0.09, 0.4, 0.5, 1]);
  near(dropped.angle, reference.angle, 1e-7);
  assert.equal(
    firingEvents(0, reference.angle).length,
    firingEvents(0, dropped.angle).length,
  );
});
