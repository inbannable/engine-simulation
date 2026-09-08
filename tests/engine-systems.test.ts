import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Powertrain } from '../engine/powertrain';
import {
  calibratedFullLoadTorqueNm,
  DctHydraulics,
  EngineBench,
  EngineSystems,
  firingEventsBetween,
  PowertrainSystemsAdapter,
} from '../engine/systems';

const STEP = 1 / 600;

void test('one 720-degree cycle fires five times in 1-2-4-5-3 order', () => {
  const events = firingEventsBetween(0, 720);
  assert.deepEqual(
    events,
    [1, 2, 4, 5, 3].map((cylinder, index) => ({
      angle: index * 144,
      cylinder,
    })),
  );
});

void test('five cylinder teaching pressure traces retain their crank phase offsets', () => {
  const engine = new EngineSystems(undefined, { warm: true, rpm: 3000 });
  engine.configure({ rpm: 3000, running: true, throttle: 1, load: 1 });
  engine.advance(2);
  engine.setCrankAngle(0);
  assert.deepEqual(
    engine.state.cylinders.map((cylinder) => cylinder.phaseDeg),
    [0, 576, 144, 432, 288],
  );
  const pressureAtFire = engine.state.cylinders[0].pressureBar;
  for (const [cylinder, angle] of [
    [2, 144],
    [4, 288],
    [5, 432],
    [3, 576],
  ] as const) {
    engine.setCrankAngle(angle);
    const state = engine.state.cylinders[cylinder - 1];
    assert.equal(state.phaseDeg, 0);
    assert.equal(state.pressureBar, pressureAtFire);
    assert.equal(state.firing, true);
  }
});

void test('cold start builds oil pressure and settles near 800 rpm', () => {
  const bench = new EngineBench();
  bench.configure({ ignition: true, starter: true });
  bench.advance(0.1);
  assert.ok(bench.state.starterTorqueNm > 0);
  assert.equal(bench.state.inertiaKgM2, 0.32);
  bench.advance(19.9);
  assert.ok(
    bench.state.rpm > 760 && bench.state.rpm < 840,
    `${bench.state.rpm} rpm`,
  );
  assert.ok(bench.state.engine.running);
  assert.ok(bench.state.engine.oilPressureKpa > 100);
  assert.equal(bench.state.starterTorqueNm, 0);
  const prior = {
    time: bench.state.time,
    coolant: bench.state.engine.coolantTempC,
    oil: bench.state.engine.oilTempC,
    turbo: bench.state.engine.turboTempC,
  };
  bench.setCrankAngle(713);
  assert.equal(bench.state.angle, 713);
  assert.deepEqual(
    {
      time: bench.state.time,
      coolant: bench.state.engine.coolantTempC,
      oil: bench.state.engine.oilTempC,
      turbo: bench.state.engine.turboTempC,
    },
    prior,
  );
});

void test('turbo spool, lag and lift-off decay are bounded and continuous', () => {
  const engine = new EngineSystems(undefined, { warm: true, rpm: 4500 });
  engine.configure({ rpm: 4500, running: true, throttle: 0, load: 0 });
  engine.advance(1);
  engine.configure({ throttle: 1, load: 1 });
  const samples: number[] = [];
  for (let i = 0; i < 600; i++) {
    engine.advance(STEP);
    samples.push(engine.state.turboRpmNormalized);
  }
  assert.ok(samples[30] < samples[599]);
  assert.ok(samples[599] > 0.45);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1]);
    assert.ok(samples[i] - samples[i - 1] < 0.01);
  }
  const lifted = engine.state.turboRpmNormalized;
  engine.configure({ throttle: 0, load: 0 });
  const liftSamples: number[] = [];
  for (let i = 0; i < 150; i++) {
    engine.advance(STEP);
    liftSamples.push(engine.state.turboRpmNormalized);
  }
  assert.ok(Math.max(...liftSamples) - lifted < 0.08);
  for (let i = 1; i < liftSamples.length; i++)
    assert.ok(Math.abs(liftSamples[i] - liftSamples[i - 1]) < 0.01);
  assert.ok(engine.state.turboRpmNormalized < lifted);
  engine.advance(3);
  assert.ok(engine.state.turboRpmNormalized < lifted * 0.2);
});

void test('warm full-load mean torque matches the 500 Nm and 294 kW anchors', () => {
  for (const rpm of [2250, 3000, 5600, 6000, 7000]) {
    const engine = new EngineSystems(undefined, { warm: true, rpm });
    engine.configure({ rpm, running: true, throttle: 1, load: 1 });
    engine.advance(4);
    const expected = calibratedFullLoadTorqueNm(rpm);
    assert.ok(Math.abs(engine.state.averageNetTorqueNm - expected) < 1e-8);
    if (rpm <= 5600) assert.equal(expected, 500);
    else {
      const powerW = (expected * rpm * Math.PI) / 30;
      assert.ok(Math.abs(powerW - 294000) < 1e-7);
    }
  }
});

void test('cold engine warms, thermostat has hysteresis, and stopped engine cools', () => {
  const engine = new EngineSystems(undefined, { rpm: 4000 });
  engine.configure({ rpm: 4000, running: true, throttle: 1, load: 1 });
  const cold = engine.state.coolantTempC;
  engine.advance(300);
  assert.ok(engine.state.coolantTempC > cold + 60);
  assert.ok(engine.state.thermostat > 0.8);
  const hot = engine.state.coolantTempC;
  engine.configure({ rpm: 0, running: false, throttle: 0, load: 0 });
  for (let i = 0; i < 200 && engine.state.coolantTempC > 90; i++)
    engine.advance(1);
  assert.ok(engine.state.coolantTempC > 88);
  assert.ok(engine.state.thermostat > 0.8);
  engine.advance(1200);
  assert.ok(engine.state.coolantTempC < hot - 40);
  assert.ok(engine.state.oilTempC > 20 && engine.state.oilTempC < 60);
  assert.ok(engine.state.thermostat < 0.01);
});

void test('oil pressure rises with rpm and cold viscosity raises pressure', () => {
  const low = new EngineSystems(undefined, { warm: true, rpm: 800 });
  low.configure({ rpm: 800, running: true, throttle: 0.1, load: 0.1 });
  low.advance(1);
  const high = new EngineSystems(undefined, { warm: true, rpm: 5000 });
  high.configure({ rpm: 5000, running: true, throttle: 0.5, load: 0.5 });
  high.advance(1);
  const cold = new EngineSystems(undefined, { rpm: 800 });
  cold.configure({ rpm: 800, running: true, throttle: 0.1, load: 0.1 });
  cold.advance(1);
  assert.ok(high.state.oilPressureKpa > low.state.oilPressureKpa);
  assert.ok(cold.state.oilPressureKpa > low.state.oilPressureKpa);
});

void test('DCT line and piston pressure precede clutch engagement', () => {
  const dct = new DctHydraulics();
  dct.configure({
    engineRpm: 3000,
    pumpCommand: 1,
    valveCommands: [1, 0],
    forkCommands: [1, 0, 0, 0],
  });
  dct.advance(0.01);
  assert.ok(dct.state.linePressureBar > 0);
  assert.ok(dct.state.clutchPressureBar[0] > 0);
  assert.equal(dct.state.clutchEngagement[0], 0);
  dct.advance(0.5);
  assert.ok(dct.state.clutchPressureBar[0] > 10);
  assert.ok(dct.state.clutchEngagement[0] > 0.5);
  assert.ok(dct.state.forkPressureBar[0] > 5);
});

void test('DCT slip dissipation is non-negative and clutch discs cool afterward', () => {
  const dct = new DctHydraulics();
  dct.configure({
    engineRpm: 3000,
    pumpCommand: 1,
    valveCommands: [1, 0],
    clutchSlipRpm: [1500, 0],
    clutchTorqueNm: [300, 0],
    coolerCommand: 1,
  });
  dct.advance(10);
  const energy = dct.state.slipEnergyJ[0];
  const discTemp = dct.state.clutchDiscTempC[0];
  assert.ok(energy > 0);
  assert.ok(dct.state.slipPowerKw[0] >= 0);
  assert.ok(discTemp > dct.state.oilTempC);
  dct.configure({ clutchSlipRpm: [0, 0], clutchTorqueNm: [0, 0] });
  dct.advance(300);
  assert.equal(dct.state.slipEnergyJ[0], energy);
  assert.equal(dct.state.slipPowerKw[0], 0);
  assert.ok(dct.state.clutchDiscTempC[0] < discTemp);
});

void test('30/60/120 FPS, slow motion and different chunks give identical state', () => {
  function run(fps: number, rate = 1) {
    const engine = new EngineSystems(undefined, { warm: true, rpm: 3500 });
    engine.configure({ rpm: 3500, running: true, throttle: 0.72, load: 0.66 });
    for (let i = 0; i < (2 * fps) / rate; i++) engine.advance(rate / fps);
    return engine.state;
  }
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(60), run(120));
  assert.deepEqual(run(60), run(30, 0.1));

  const single = new EngineSystems(undefined, { warm: true, rpm: 3500 });
  single.configure({ rpm: 3500, running: true, throttle: 0.72, load: 0.66 });
  single.advance(2);
  assert.deepEqual(run(60), single.state);

  function runBench(fps: number, rate = 1) {
    const bench = new EngineBench();
    bench.configure({ ignition: true, starter: true });
    for (let i = 0; i < (2 * fps) / rate; i++) bench.advance(rate / fps);
    return bench.state;
  }
  assert.deepEqual(runBench(30), runBench(60));
  assert.deepEqual(runBench(60), runBench(120));
  assert.deepEqual(runBench(60), runBench(30, 0.1));

  function runDct(fps: number, rate = 1) {
    const dct = new DctHydraulics();
    dct.configure({
      engineRpm: 3200,
      pumpCommand: 1,
      valveCommands: [0.8, 0.2],
      forkCommands: [1, 0, 0.5, 0],
      clutchSlipRpm: [500, -250],
      clutchTorqueNm: [180, -90],
      coolerCommand: 0.7,
    });
    for (let i = 0; i < (2 * fps) / rate; i++) dct.advance(rate / fps);
    return dct.state;
  }
  assert.deepEqual(runDct(30), runDct(60));
  assert.deepEqual(runDct(60), runDct(120));
  assert.deepEqual(runDct(60), runDct(30, 0.1));
});

void test('bench target speed remains controllable across the 0-100% load range', () => {
  for (const load of [0, 0.5, 1]) {
    const bench = new EngineBench(undefined, undefined, { warm: true });
    bench.configure({ ignition: true, starter: true, targetRpm: 3000, load });
    bench.advance(20);
    assert.ok(
      Math.abs(bench.state.rpm - 3000) < 40,
      `${load}: ${bench.state.rpm}`,
    );
    assert.equal(bench.state.load, load);
  }
});

void test('all public numeric state remains finite and absolute pressures stay positive', () => {
  const engine = new EngineSystems(undefined, { rpm: 9000 });
  engine.configure({ rpm: 9000, running: true, throttle: 1, load: 1 });
  engine.advance(20);
  const dct = new DctHydraulics();
  dct.configure({
    engineRpm: 9000,
    pumpCommand: 1,
    valveCommands: [1, 1],
    forkCommands: [1, 1, 1, 1],
    clutchSlipRpm: [-9000, 9000],
    clutchTorqueNm: [-1000, 1000],
    coolerCommand: 1,
  });
  dct.advance(20);
  const visit = (value: unknown): void => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(visit);
  };
  visit(engine.state);
  visit(dct.state);
  assert.ok(engine.state.manifoldPressureKpa > 0);
  assert.ok(
    engine.state.cylinders.every((cylinder) => cylinder.pressureBar > 0),
  );
});

void test('powertrain adapter observes without mutating the existing solver state', () => {
  const powertrain = new Powertrain();
  powertrain.configure({ mode: 'D', throttle: 0.4 });
  powertrain.advance(2);
  const before = structuredClone(powertrain.state);
  const adapter = new PowertrainSystemsAdapter();
  const observed = adapter.advance(powertrain.state, 0.5);
  assert.deepEqual(powertrain.state, before);
  assert.equal(observed.engine.rpm, powertrain.state.rpm);
  assert.deepEqual(observed.dct.valveCommands, [
    powertrain.state.clutches[0].engagement,
    powertrain.state.clutches[1].engagement,
  ]);
});
