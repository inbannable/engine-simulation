import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  EXHIBIT_SCENARIOS,
  ExhibitScenarioController,
  LayeredEngineAudio,
  OBSERVATION_LAYERS,
  OBSERVATION_LAYER_FIXTURES,
  SCENARIO_FIXTURES,
  SystemLayerRenderer,
  recommendedExhibitPixelRatio,
  setThermalColor,
} from '../engine/exhibit/index';

void test('fixtures cover every observation layer and curated scenario', () => {
  assert.deepEqual(Object.keys(OBSERVATION_LAYER_FIXTURES), [
    ...OBSERVATION_LAYERS,
  ]);
  assert.deepEqual(Object.keys(SCENARIO_FIXTURES), [...EXHIBIT_SCENARIOS]);
  for (const frame of Object.values(SCENARIO_FIXTURES)) {
    assert.equal(frame.systems.cylinders.length, 5);
    assert.equal(frame.simulation.sound, false);
  }
});

void test('cold start lasts twelve seconds and skip/cancel rules are distinct', () => {
  const controller = new ExhibitScenarioController(false);
  assert.equal(controller.snapshot().scenario, 'cold-start');
  assert.equal(controller.snapshot().duration, 12);
  controller.advance(2);
  const rotated = controller.modelRotated();
  assert.equal(rotated.active, true);
  assert.equal(rotated.cameraTransition, 'none');
  assert.equal(rotated.cue, undefined);
  const cancelled = controller.parameterChanged();
  assert.equal(cancelled.active, false);
  assert.equal(cancelled.cancelledBy, 'parameter');
  assert.equal(cancelled.completed, false);

  controller.start('cold-start');
  const skipped = controller.skip();
  assert.equal(skipped.progress, 1);
  assert.equal(skipped.cancelledBy, 'skip');
  assert.equal(skipped.completed, true);
});

void test('reduced motion cuts cameras and suppresses strong flash', () => {
  const directive = new ExhibitScenarioController(true).snapshot();
  assert.equal(directive.cameraTransition, 'cut');
  assert.equal(directive.strongFlash, false);
});

void test('scenario directives expose inputs, initial state, layer and cue only', () => {
  const controller = new ExhibitScenarioController(false, false);
  for (const scenario of EXHIBIT_SCENARIOS) {
    const directive = controller.start(scenario);
    assert.deepEqual(
      Object.keys(directive.inputs).every((key) =>
        [
          'targetRpm',
          'playing',
          'throttle',
          'brake',
          'driveMode',
          'requestedGear',
        ].includes(key),
      ),
      true,
    );
    assert.ok(OBSERVATION_LAYERS.includes(directive.layer));
  }
});

void test('renderer reuses resources, stays under draw-call budget and disposes', () => {
  const scene = new THREE.Scene();
  const renderer = new SystemLayerRenderer(scene, new Map(), {
    mobile: false,
    reducedMotion: false,
  });
  const initial = renderer.diagnostics();
  assert.equal(initial.resources, 4);
  assert.equal(initial.sceneObjects, 2);
  for (let pass = 0; pass < 100; pass++) {
    for (const layer of OBSERVATION_LAYERS)
      renderer.update(OBSERVATION_LAYER_FIXTURES[layer]);
  }
  renderer.update(OBSERVATION_LAYER_FIXTURES['gas-combustion']);
  const after = renderer.diagnostics();
  assert.equal(after.resources, initial.resources);
  assert.equal(after.sceneObjects, initial.sceneObjects);
  assert.ok(after.drawCalls <= 2);
  assert.ok(after.particles <= 160);
  renderer.dispose();
  assert.equal(renderer.diagnostics().resources, 0);
  assert.equal(renderer.diagnostics().disposed, true);
  assert.equal(scene.getObjectByName('SystemLayerRenderer'), undefined);
});

void test('mobile DPR/particle policy and continuous thermal scale are bounded', () => {
  assert.equal(recommendedExhibitPixelRatio(3, false), 1.5);
  assert.equal(recommendedExhibitPixelRatio(3, true), 1);
  const cold = setThermalColor(new THREE.Color(), 20);
  const warm = setThermalColor(new THREE.Color(), 500);
  const hot = setThermalColor(new THREE.Color(), 1_000);
  assert.notEqual(cold.getHex(), warm.getHex());
  assert.notEqual(warm.getHex(), hot.getHex());
  const renderer = new SystemLayerRenderer(
    new THREE.Scene(),
    {},
    {
      mobile: true,
    },
  );
  renderer.update(OBSERVATION_LAYER_FIXTURES.lubrication);
  assert.ok(renderer.diagnostics().particles <= 72);
  assert.equal(renderer.diagnostics().drawCalls, 1);
  renderer.dispose();
});

void test('audio stays off until gesture and initialization failure degrades safely', async () => {
  let attempted = 0;
  const audio = new LayeredEngineAudio(() => {
    attempted++;
    throw new Error('Audio device unavailable');
  });
  assert.equal(audio.status, 'off');
  assert.equal(attempted, 0);
  audio.update(SCENARIO_FIXTURES.idle);
  assert.equal(attempted, 0);
  assert.equal(await audio.enableFromUserGesture(), false);
  assert.equal(audio.status, 'unavailable');
  assert.equal(attempted, 1);
  assert.doesNotThrow(() => audio.update(SCENARIO_FIXTURES['full-load']));
  await audio.dispose();
  assert.equal(audio.status, 'disposed');
});
