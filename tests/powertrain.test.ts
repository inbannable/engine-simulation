import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Powertrain,
  GEARS,
  POWERTRAIN_SPEC as P,
  fullThrottleTorque,
  totalRatio,
  rpmAtSpeed,
  frictionImpulse,
  selectorReady,
  selectorTarget,
  type Gear,
} from '../engine/powertrain';

void test('incoming clutch waits for neutral clearance and full dog sleeve travel', () => {
  const m = rolling(3);
  m.advance(0.5); // fourth preselected; request second across the same clutch.
  assert.equal(m.state.preselected, 4);
  m.requestShift(-1);
  let entered = false;
  for (let i = 0; i < 1200; i++) {
    const before = m.state.phase;
    m.advance(P.step);
    if (m.state.phase === 'prepare') {
      assert.equal(m.state.clutches[1].torque, 0);
      assert.equal(m.state.selected[1], 0);
    }
    if (before === 'prepare' && m.state.phase === 'handover') {
      assert.ok(selectorReady(m.state, 2));
      assert.equal(m.state.selectorPositions[2], 0);
      assert.equal(m.state.selectorPositions[3], -7);
      entered = true;
    }
  }
  assert.ok(entered);
  assert.equal(m.state.gear, 2);
});
function rolling(g: Gear, rpm = 3000) {
  const m = new Powertrain();
  m.configure({ mode: 'M', throttle: 0.25 });
  const s = m.state;
  s.gear = s.target = g;
  s.phase = 'steady';
  s.selectorPositions = s.selectorPositions.map((_, i) => selectorTarget(g, i));
  s.selected = [0, 0];
  s.selected[GEARS.find((x) => x.gear === g)!.clutch] = g;
  s.speed = (((rpm * Math.PI) / 30) * P.radius) / totalRatio(g);
  s.rpm = rpm;
  s.held = 2;
  return m;
}
void test('drive and reverse from neutral select the dog before delivering torque', () => {
  for (const mode of ['D', 'R'] as const) {
    const m = new Powertrain();
    m.configure({ mode, brake: 1 });
    m.configure({ brake: 0, throttle: 0.2 });
    assert.equal(m.state.phase, 'prepare');
    for (let i = 0; i < 100; i++) {
      m.advance(P.step);
      assert.equal(m.state.wheelTorque, 0);
      assert.deepEqual(m.state.selected, [0, 0]);
    }
    m.advance(2);
    assert.equal(m.state.gear, mode === 'R' ? -1 : 1);
    assert.ok(selectorReady(m.state, mode === 'R' ? -1 : 1));
    assert.equal(Math.sign(m.state.speed), mode === 'R' ? -1 : 1);
  }
});
void test('official torque platform, power range, independent final drives', () => {
  for (const rpm of [2250, 3000, 5600])
    assert.equal(fullThrottleTorque(rpm), 500);
  for (const rpm of [6000, 7000])
    assert.ok(
      Math.abs((fullThrottleTorque(rpm) * rpm * Math.PI) / 30 - 294000) < 1e-7,
    );
  assert.equal(GEARS[4].final, 4.058);
  assert.equal(GEARS[5].final, 3.45);
});
void test('all gears satisfy lock constraint and wheel torque sum', () => {
  for (const g of GEARS) {
    const m = rolling(g.gear);
    m.advance(0.1);
    const s = m.state;
    assert.ok(
      Math.abs(s.rpm - rpmAtSpeed(g.gear, s.speed)) < 1e-7,
      `gear ${g.gear}`,
    );
    assert.ok(
      Math.abs(
        s.wheelTorque - s.clutches[g.clutch].torque * totalRatio(g.gear),
      ) < 1e-7,
    );
  }
});
void test('friction impulse is passive over both torque directions', () => {
  for (const slip of [-1000, -1, 0, 1, 1000])
    for (const capacity of [0.01, 1, 100]) {
      const inv = 3.5,
        j = frictionImpulse(slip, inv, capacity);
      assert.ok(-j * slip + 0.5 * j * j * inv <= 1e-9);
      assert.ok(Math.abs(j) <= capacity);
    }
});
void test('adjacent shifts finish without speed or rpm jumps and without double lock', () => {
  for (const [from, to] of [
    [1, 2],
    [2, 3],
    [5, 6],
    [6, 7],
    [2, 1],
    [3, 2],
    [7, 6],
  ]) {
    const m = rolling(from as Gear, 3000);
    m.advance(0.4);
    m.requestShift(to - from);
    const phases = new Set<string>();
    for (let i = 0; i < 2400; i++) {
      const rpm = m.state.rpm,
        speed = m.state.speed;
      m.advance(P.step);
      const s = m.state;
      phases.add(s.phase);
      assert.ok(Math.abs(s.rpm - rpm) < 80);
      assert.ok(Math.abs(s.speed - speed) < 0.05);
      assert.ok(s.clutches.filter((c) => c.status === 'locked').length <= 1);
    }
    assert.equal(
      m.state.gear,
      to,
      `${from}->${to}: ${m.state.phase} ${m.state.rpm}`,
    );
    assert.ok(phases.has('handover'));
    assert.ok(m.state.lastShift.length > 5);
    if (to < from && from != 7) assert.ok(phases.has('prepare'));
  }
});
void test('same simulated input at 30/60/120 fps and slow motion is deterministic', () => {
  function run(fps: number, rate = 1) {
    const m = new Powertrain();
    m.configure({ mode: 'D', throttle: 0.6 });
    for (let i = 0; i < (8 * fps) / rate; i++) m.advance(rate / fps);
    return m.state;
  }
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(60), run(120));
  assert.deepEqual(run(60), run(30, 0.1));
  const m = rolling(3);
  const snapshot = structuredClone(m.state);
  m.advance(0);
  assert.deepEqual(snapshot, m.state);
});
void test('neutral, creep, launch, stop, reverse interlock and overrev refusal', () => {
  const m = new Powertrain();
  m.configure({ throttle: 1 });
  m.advance(4);
  assert.equal(m.state.speed, 0);
  assert.ok(m.state.rpm <= 7010);
  m.configure({ throttle: 0, mode: 'D' });
  m.advance(3);
  assert.ok(m.state.speed > 0);
  m.configure({ throttle: 0.6 });
  m.advance(4);
  assert.ok(m.state.speed > 5);
  assert.equal(m.configure({ mode: 'R' }), false);
  m.configure({ throttle: 0, brake: 1 });
  m.advance(6);
  assert.ok(Math.abs(m.state.speed) < 0.05);
  assert.equal(m.configure({ mode: 'R' }), true);
  m.configure({ brake: 0, throttle: 0.2 });
  m.advance(3);
  assert.ok(m.state.speed < 0);
  const high = rolling(3, 6500);
  high.requestShift(-1);
  high.advance(0.1);
  assert.equal(high.state.gear, 3);
  assert.match(high.state.message, /超转/);
  for (let i = 0; i < 10; i++) high.requestShift(1);
  assert.equal(high.state.queue.length, 4);
});
void test('unselected target incurs preparation; selector travel is bounded and continuous', () => {
  const m = rolling(3);
  m.advance(0.4);
  m.requestShift(-1);
  let prepared = 0;
  for (let i = 0; i < 1200; i++) {
    const positions = [...m.state.selectorPositions];
    m.advance(P.step);
    if (m.state.phase === 'prepare') prepared += P.step;
    m.state.selectorPositions.forEach((x, j) => {
      assert.ok(Math.abs(x) <= 7);
      assert.ok(Math.abs(x - positions[j]) <= 50 * P.step + 1e-9);
    });
  }
  assert.ok(prepared >= P.prepareTime - 0.01);
});
void test('D shifts earlier than S; each automatic shift respects minimum hold', () => {
  function run(mode: 'D' | 'S') {
    const m = new Powertrain();
    m.configure({ mode, throttle: 0.45 });
    let first = 0,
      completedAt = 0,
      prior: string = m.state.phase;
    for (let i = 0; i < 600 * 35; i++) {
      m.advance(P.step);
      const s = m.state;
      if (s.phase !== 'steady' && prior === 'steady') {
        if (!first) first = s.rpm;
        assert.ok(s.time - completedAt >= P.holdTime - P.step * 2);
      }
      if (s.phase === 'steady' && prior !== 'steady') completedAt = s.time;
      prior = s.phase;
      if (i > 600 * 25) m.configure({ throttle: 0.45 + 0.01 * Math.sin(i) });
    }
    assert.ok(first > 0);
    return first;
  }
  assert.ok(run('S') > run('D') + 700);
});
void test('queued requests recheck rpm and neutral cancels all drive', () => {
  const m = rolling(3, 4000);
  m.requestShift(-1);
  m.requestShift(-1);
  m.advance(4);
  assert.equal(m.state.gear, 2);
  assert.match(m.state.message, /超转/);
  m.configure({ mode: 'N' });
  m.advance(0.1);
  assert.equal(m.state.wheelTorque, 0);
  assert.ok(m.state.clutches.every((c) => c.status === 'open'));
});
