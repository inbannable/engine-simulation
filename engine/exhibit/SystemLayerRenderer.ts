import * as THREE from 'three';
import type {
  EngineCylinderState,
  EngineFrame,
  ObservationLayer,
} from './types';

export type GlbNodeIndex =
  | ReadonlyMap<string, THREE.Object3D>
  | Readonly<Record<string, THREE.Object3D>>;

export interface SystemLayerRendererOptions {
  reducedMotion?: boolean;
  mobile?: boolean;
  particleLimit?: number;
  glow?: boolean;
}

export interface SystemLayerRendererDiagnostics {
  drawCalls: number;
  particles: number;
  resources: number;
  sceneObjects: number;
  disposed: boolean;
  layer: ObservationLayer | null;
}

interface FlowRoute {
  points: Float32Array;
  count: number;
  speed: number;
  color: THREE.Color;
  intensity: number;
  signal: 'intake' | 'compressed' | 'exhaust' | 'coolant' | 'oil' | 'k1' | 'k2';
  cylinder?: number;
}

const HIDDEN_Y = -100_000;
const MAX_PARTICLES = 192;
const MAX_GLOWS = 12;

const FALLBACK_ANCHORS = {
  intake: new THREE.Vector3(-280, 265, 170),
  compressor: new THREE.Vector3(-145, 265, 90),
  plenum: new THREE.Vector3(-30, 250, 70),
  exhaust: new THREE.Vector3(180, 255, -110),
  turbo: new THREE.Vector3(330, 260, -130),
  oilPump: new THREE.Vector3(-210, -15, 70),
  oilGallery: new THREE.Vector3(0, 145, 30),
  radiator: new THREE.Vector3(-360, 80, -180),
  waterJacket: new THREE.Vector3(0, 145, -45),
  gearbox: new THREE.Vector3(455, 80, 40),
  valveBody: new THREE.Vector3(490, -10, 90),
  clutch: new THREE.Vector3(330, 75, 55),
} as const;

const NODE_NAMES: Record<keyof typeof FALLBACK_ANCHORS, readonly string[]> = {
  intake: ['IntakeManifold', 'IntakePlenum', 'ThrottleBody'],
  compressor: ['TurboCompressor', 'CompressorWheel', 'Turbo'],
  plenum: ['IntakePlenum', 'IntakeManifold'],
  exhaust: ['ExhaustManifold', 'ExhaustHeader'],
  turbo: ['Turbo', 'TurbineWheel', 'TurboHousing'],
  oilPump: ['OilPump', 'OilPan'],
  oilGallery: ['CylinderBlock', 'Block'],
  radiator: ['Radiator', 'CoolantInlet'],
  waterJacket: ['CylinderHead', 'CylinderBlock'],
  gearbox: ['GearboxHousing', 'TransmissionCase'],
  valveBody: ['ValveBody', 'Mechatronic'],
  clutch: ['DCTClutch', 'ClutchPack', 'DCTFlywheel'],
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

/** Integration policy for the owner of the WebGLRenderer. */
export const recommendedExhibitPixelRatio = (
  deviceRatio: number,
  mobile: boolean,
) => Math.min(deviceRatio, mobile ? 1 : 1.5);

/** Continuous 20–1,000 °C legend mapping, returned in linear RGB. */
export function setThermalColor(target: THREE.Color, temperatureC: number) {
  const t = clamp((temperatureC - 20) / 980);
  if (t < 0.38) {
    const local = t / 0.38;
    target.setRGB(0.08 + local * 0.12, 0.34 + local * 0.4, 0.88);
  } else if (t < 0.72) {
    const local = (t - 0.38) / 0.34;
    target.setRGB(0.2 + local * 0.8, 0.74 - local * 0.22, 0.88 - local * 0.72);
  } else {
    const local = (t - 0.72) / 0.28;
    target.setRGB(1, 0.52 + local * 0.38, 0.16 + local * 0.64);
  }
  return target;
}

/**
 * Additive exhibit overlays. All geometries, materials and instances are
 * allocated once; update only mutates matrices, colors and visibility.
 */
export class SystemLayerRenderer {
  private readonly root = new THREE.Group();
  private readonly particleGeometry = new THREE.IcosahedronGeometry(3.1, 0);
  private readonly particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
    toneMapped: false,
  });
  private readonly particles = new THREE.InstancedMesh(
    this.particleGeometry,
    this.particleMaterial,
    MAX_PARTICLES,
  );
  private readonly glowGeometry = new THREE.SphereGeometry(18, 10, 6);
  private readonly glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
    toneMapped: false,
  });
  private readonly glows = new THREE.InstancedMesh(
    this.glowGeometry,
    this.glowMaterial,
    MAX_GLOWS,
  );
  private readonly anchors: Record<
    keyof typeof FALLBACK_ANCHORS,
    THREE.Vector3
  >;
  private readonly cylinderAnchors: THREE.Vector3[];
  private readonly routes: Record<
    Exclude<ObservationLayer, 'mechanical'>,
    FlowRoute[]
  >;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly particleLimit: number;
  private readonly reducedMotion: boolean;
  private readonly glowEnabled: boolean;
  private activeLayer: ObservationLayer | null = null;
  private activeParticles = 0;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    nodeIndex: GlbNodeIndex,
    options: SystemLayerRendererOptions = {},
  ) {
    const detectedMobile =
      options.mobile ??
      (typeof window !== 'undefined' &&
        (window.innerWidth < 720 ||
          window.matchMedia('(pointer: coarse)').matches));
    this.reducedMotion =
      options.reducedMotion ??
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.particleLimit = Math.min(
      MAX_PARTICLES,
      options.particleLimit ?? (detectedMobile ? 72 : 160),
    );
    this.glowEnabled = options.glow ?? !detectedMobile;
    this.anchors = this.resolveAnchors(nodeIndex);
    this.cylinderAnchors = Array.from(
      { length: 5 },
      (_, index) => new THREE.Vector3((index - 2) * 88, 225, 0),
    );
    this.routes = this.createRoutes();
    this.root.name = 'SystemLayerRenderer';
    this.particles.name = 'ExhibitDirectionalFlow';
    this.glows.name = 'ExhibitStateGlow';
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.glows.frustumCulled = false;
    this.root.add(this.particles, this.glows);
    this.scene.add(this.root);
    this.hideInstances();
  }

  update(frame: EngineFrame) {
    if (this.disposed) return;
    this.activeLayer = frame.layer;
    this.root.visible = frame.layer !== 'mechanical';
    if (frame.layer === 'mechanical') {
      this.activeParticles = 0;
      return;
    }
    const routes = this.routes[frame.layer];
    const time = frame.systems.time;
    const density = clamp(
      frame.systems.cylinders.reduce(
        (sum, cylinder) => sum + cylinder.chargeMassMg,
        0,
      ) /
        Math.max(1, frame.systems.cylinders.length) /
        500,
      0.25,
      1.25,
    );
    const brightness =
      frame.layer === 'gas-combustion'
        ? clamp(
            Math.max(
              frame.systems.boostKpa / 160,
              frame.systems.cylinders.reduce(
                (maximum, cylinder) => Math.max(maximum, cylinder.burnFraction),
                0,
              ),
            ),
            0.2,
            1.2,
          )
        : frame.layer === 'transmission-hydraulic'
          ? clamp((frame.hydraulic?.linePressureBar ?? 0) / 20, 0.2, 1.2)
          : 0.82;
    let instance = 0;
    for (const route of routes) {
      const routeDrive =
        route.signal === 'intake'
          ? route.cylinder === undefined
            ? clamp(frame.systems.airflowGps / 500, 0.08, 1.25)
            : clamp(
                (frame.systems.cylinders[route.cylinder]?.intakeFlowGps ?? 0) /
                  100,
                0.05,
                1.25,
              )
          : route.signal === 'compressed'
            ? clamp(frame.systems.manifoldPressureKpa / 240, 0.1, 1.25)
            : route.signal === 'exhaust'
              ? clamp(
                  (frame.systems.cylinders[route.cylinder ?? 0]
                    ?.exhaustFlowGps ?? 0) / 100,
                  0.05,
                  1.25,
                )
              : route.signal === 'coolant'
                ? clamp(frame.systems.coolantFlowLpm / 90, 0.1, 1.25)
                : route.signal === 'oil'
                  ? clamp(frame.systems.oilPressureKpa / 600, 0.08, 1.25)
                  : clamp(
                      (frame.hydraulic?.clutchPressureBar[
                        route.signal === 'k1' ? 0 : 1
                      ] ?? 0) / 20,
                      0.06,
                      1.25,
                    );
      const visibleCount = Math.min(route.count, this.particleLimit - instance);
      for (let index = 0; index < visibleCount; index++) {
        const staticPhase = index / Math.max(1, visibleCount);
        const motion = this.reducedMotion
          ? 0
          : time * route.speed * (0.25 + routeDrive);
        const phase = (staticPhase + motion) % 1;
        this.sampleRoute(route.points, phase, this.position);
        const pulse = this.reducedMotion
          ? 0.86
          : 0.72 + 0.28 * Math.sin((phase + time * 0.25) * Math.PI * 2);
        const size = Math.max(
          0.7,
          route.intensity *
            pulse *
            routeDrive *
            (frame.layer === 'gas-combustion' ? density : 1),
        );
        this.scale.setScalar(size);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.particles.setMatrixAt(instance, this.matrix);
        this.color
          .copy(route.color)
          .multiplyScalar(
            clamp(route.intensity * brightness * routeDrive, 0.12, 1.4),
          );
        this.particles.setColorAt(instance, this.color);
        instance++;
      }
      if (instance >= this.particleLimit) break;
    }
    instance = this.addCylinderEffects(frame, instance);
    this.activeParticles = Math.min(this.particleLimit, instance);
    this.particles.count = this.activeParticles;
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor)
      this.particles.instanceColor.needsUpdate = true;
    this.updateGlows(frame);
  }

  diagnostics(): SystemLayerRendererDiagnostics {
    return {
      drawCalls: this.root.visible ? (this.glows.visible ? 2 : 1) : 0,
      particles: this.activeParticles,
      resources: this.disposed ? 0 : 4,
      sceneObjects: this.root.children.length,
      disposed: this.disposed,
      layer: this.activeLayer,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.root);
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
    this.root.clear();
    this.activeParticles = 0;
    this.activeLayer = null;
  }

  private resolveAnchors(nodeIndex: GlbNodeIndex) {
    const resolved = {} as Record<keyof typeof FALLBACK_ANCHORS, THREE.Vector3>;
    const read = (name: string) =>
      nodeIndex instanceof Map
        ? nodeIndex.get(name)
        : (nodeIndex as Readonly<Record<string, THREE.Object3D>>)[name];
    for (const key of Object.keys(FALLBACK_ANCHORS) as Array<
      keyof typeof FALLBACK_ANCHORS
    >) {
      const value = FALLBACK_ANCHORS[key].clone();
      for (const name of NODE_NAMES[key]) {
        const node = read(name);
        if (!node) continue;
        node.updateWorldMatrix(true, false);
        node.getWorldPosition(value);
        break;
      }
      resolved[key] = value;
    }
    return resolved;
  }

  private createRoutes() {
    const a = this.anchors;
    const route = (
      points: readonly THREE.Vector3[],
      count: number,
      speed: number,
      color: number,
      intensity = 1,
      signal: FlowRoute['signal'],
      cylinder?: number,
    ): FlowRoute => ({
      points: new Float32Array(points.flatMap((point) => point.toArray())),
      count,
      speed,
      color: new THREE.Color(color),
      intensity,
      signal,
      cylinder,
    });
    const cylinders = this.cylinderAnchors;
    const exhaustRoutes = cylinders.map((cylinder, index) =>
      route(
        [cylinder, a.exhaust, a.turbo],
        9,
        0.52,
        0xff5a2c,
        1.08,
        'exhaust',
        index,
      ),
    );
    return {
      'gas-combustion': [
        route([a.intake, a.compressor], 22, 0.32, 0x56bfff, 0.86, 'intake'),
        route([a.compressor, a.plenum], 22, 0.44, 0x7778ff, 1.04, 'compressed'),
        ...cylinders.map((cylinder, index) =>
          route([a.plenum, cylinder], 7, 0.38, 0x8b80ff, 0.9, 'intake', index),
        ),
        ...exhaustRoutes,
      ],
      'thermal-cooling': [
        route([a.radiator, a.waterJacket], 34, 0.22, 0x43bfff, 0.88, 'coolant'),
        route([a.waterJacket, a.radiator], 34, 0.22, 0xff8b4a, 0.88, 'coolant'),
      ],
      lubrication: [
        route([a.oilPump, a.oilGallery], 35, 0.26, 0xffc83d, 0.92, 'oil'),
        route([a.oilGallery, a.turbo], 24, 0.24, 0xffdd62, 0.74, 'oil'),
        route([a.oilGallery, a.oilPump], 28, 0.2, 0xb88422, 0.7, 'oil'),
      ],
      'transmission-hydraulic': [
        route([a.valveBody, a.clutch], 38, 0.28, 0xff9b38, 0.95, 'k1'),
        route([a.valveBody, a.gearbox], 38, 0.28, 0x4caeff, 0.95, 'k2'),
      ],
    } satisfies Record<Exclude<ObservationLayer, 'mechanical'>, FlowRoute[]>;
  }

  private addCylinderEffects(frame: EngineFrame, firstInstance: number) {
    let instance = firstInstance;
    if (frame.layer !== 'gas-combustion') return instance;
    for (let index = 0; index < 5 && instance < this.particleLimit; index++) {
      const cylinder = frame.systems.cylinders[index];
      const combustion = clamp(cylinder?.burnFraction ?? 0);
      const size = this.reducedMotion
        ? 2.2 + combustion * 1.8
        : 1.8 + combustion * 4.8;
      this.position.copy(this.cylinderAnchors[index]);
      this.scale.setScalar(size);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.particles.setMatrixAt(instance, this.matrix);
      this.color.setRGB(1, 0.52 + combustion * 0.42, 0.16 + combustion * 0.7);
      this.particles.setColorAt(instance, this.color);
      instance++;
    }
    return instance;
  }

  private updateGlows(frame: EngineFrame) {
    const thermal = frame.layer === 'thermal-cooling';
    const combustion = frame.layer === 'gas-combustion';
    this.glows.visible = this.glowEnabled && (thermal || combustion);
    if (!this.glows.visible) return;
    let instance = 0;
    for (let index = 0; index < 5; index++) {
      const cylinder = frame.systems.cylinders[index];
      const temperature = cylinder?.temperatureC ?? 20;
      const pulse = combustion ? clamp(cylinder?.burnFraction ?? 0) : 0.38;
      this.position.copy(this.cylinderAnchors[index]);
      this.scale.setScalar(0.72 + pulse * (this.reducedMotion ? 0.25 : 0.72));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.glows.setMatrixAt(instance, this.matrix);
      setThermalColor(this.color, temperature);
      this.glows.setColorAt(instance, this.color);
      instance++;
    }
    for (const [anchor, temperature, scale] of [
      [this.anchors.exhaust, frame.systems.exhaustManifoldTempC, 1.35],
      [this.anchors.turbo, frame.systems.turboTempC, 1.1],
      [this.anchors.waterJacket, frame.systems.coolantTempC, 1.6],
    ] as const) {
      this.position.copy(anchor);
      this.scale.setScalar(scale);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.glows.setMatrixAt(instance, this.matrix);
      setThermalColor(this.color, temperature);
      this.glows.setColorAt(instance, this.color);
      instance++;
    }
    this.glows.count = instance;
    this.glows.instanceMatrix.needsUpdate = true;
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
  }

  private sampleRoute(
    points: Float32Array,
    phase: number,
    target: THREE.Vector3,
  ) {
    const segments = points.length / 3 - 1;
    const position = clamp(phase) * segments;
    const segment = Math.min(segments - 1, Math.floor(position));
    const local = position - segment;
    const offset = segment * 3;
    target.set(
      points[offset] + (points[offset + 3] - points[offset]) * local,
      points[offset + 1] + (points[offset + 4] - points[offset + 1]) * local,
      points[offset + 2] + (points[offset + 5] - points[offset + 2]) * local,
    );
  }

  private hideInstances() {
    this.position.set(0, HIDDEN_Y, 0);
    this.scale.setScalar(0);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    for (let index = 0; index < MAX_PARTICLES; index++)
      this.particles.setMatrixAt(index, this.matrix);
    for (let index = 0; index < MAX_GLOWS; index++)
      this.glows.setMatrixAt(index, this.matrix);
    this.particles.count = 0;
    this.glows.count = 0;
    this.glows.visible = false;
  }
}

export const cylinderIntensity = (
  cylinder: EngineCylinderState | undefined,
) => ({
  flow: clamp(
    Math.max(cylinder?.intakeFlowGps ?? 0, cylinder?.exhaustFlowGps ?? 0) / 100,
  ),
  density: clamp((cylinder?.chargeMassMg ?? 0) / 500),
  brightness: clamp(cylinder?.burnFraction ?? 0),
});
