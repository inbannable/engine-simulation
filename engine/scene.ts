import {
  SystemLayerRenderer,
  recommendedExhibitPixelRatio,
} from './exhibit/SystemLayerRenderer';
import { readCadPaths } from './exhibit/cad-paths';
import type { EngineFrame } from './systems/types';
import * as T from 'three';
import { GEARS, SYNC_GROUPS, gearInfo, type Gear } from './powertrain';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chainEnvelope } from './chain';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { evaluateEngine, STAGES, mod } from './physics';
export const CAMERAS: Record<string, number[]> = {
  iso: [-950, 660, 1200],
  intake: [140, 360, 1550],
  exhaust: [140, 400, -1550],
  timing: [1000, 300, 180],
  top: [140, 1600, 1],
  gearbox: [1100, 440, 720],
  clutch: [180, 100, 470],
  gears: [160, 340, 530],
  section: [-150, 270, 1000],
};
export interface SceneHandle {
  update: (frame: EngineFrame) => void;
  cameraPosition: () => [number, number, number];
  camera: (name: string) => void;
  dispose: () => void;
  metrics: () => { calls: number; triangles: number };
}
function mergeStaticChildren(parent: T.Object3D) {
  if (parent.name === 'SystemLayers') return;
  for (const child of parent.children)
    if (!(child instanceof T.Mesh)) mergeStaticChildren(child);
  const batches = new Map<string, { material: T.Material; meshes: T.Mesh[] }>();
  for (const child of parent.children)
    if (
      child instanceof T.Mesh &&
      !Array.isArray(child.material) &&
      !child.name.includes('Spring_')
    ) {
      // Cast textures and curve-derived hoses can have different UV layouts.
      // Only merge compatible attribute sets; otherwise Three rejects the batch.
      const layout = Object.entries(
        (child.geometry as T.BufferGeometry).attributes,
      )
        .map(([name, attr]) => `${name}:${attr.itemSize}:${attr.normalized}`)
        .sort()
        .join('|');
      const key = `${child.material.uuid}:${layout}`;
      const batch = batches.get(key) || {
        material: child.material,
        meshes: [] as T.Mesh[],
      };
      batch.meshes.push(child);
      batches.set(key, batch);
    }
  for (const { material, meshes } of batches.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone().applyMatrix4(m.matrix);
      return g.index ? g.toNonIndexed() : g;
    });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    for (const m of meshes) {
      parent.remove(m);
      m.geometry.dispose();
    }
    const mesh = new T.Mesh(merged, material);
    mesh.name = 'Merged_' + parent.name + '_' + material.name;
    parent.add(mesh);
  }
}
export async function createScene(
  el: HTMLDivElement,
  onSelect: (n: number) => void,
  onProgress: (n: number) => void,
  signal: AbortSignal,
  onRotate: () => void = () => {},
  onError: (message: string) => void = () => {},
): Promise<SceneHandle> {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(
    recommendedExhibitPixelRatio(devicePixelRatio, window.innerWidth < 720),
  );
  renderer.setClearColor(0, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.93;
  el.appendChild(renderer.domElement);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    onError('WebGL 上下文丢失，请重新加载三维视图。');
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.setAttribute(
    'aria-label',
    '可旋转的 Audi RS3 发动机三维模型',
  );
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 135, 0);
  controls.enableDamping = !window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  controls.addEventListener('start', onRotate);
  controls.minDistance = 450;
  controls.maxDistance = 2800;
  controls.maxPolarAngle = Math.PI * 0.91;
  let activeCamera = 'iso';
  const setCamera = (name: string) => {
    activeCamera = name;
    const p = CAMERAS[name] || CAMERAS.iso;
    controls.target.set(
      ['gearbox', 'clutch', 'gears'].includes(name)
        ? name === 'clutch'
          ? 335
          : 460
        : name === 'section' || name === 'timing'
          ? 0
          : 130,
      135,
      0,
    );
    const fit = Math.max(1, 0.98 / Math.max(0.3, camera.aspect));
    camera.position
      .set(p[0], p[1] - 135, p[2])
      .multiplyScalar(fit)
      .add(controls.target);
    controls.update();
  };
  setCamera('iso');
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new T.HemisphereLight(0xd5e2ff, 0x171d27, 0.7));
  for (const [x, y, z, intensity, color] of [
    [-400, 700, 450, 1.8, 0xe6eeff],
    [500, 460, -280, 2, 0xffffff],
    [80, 300, 650, 0.65, 0xffe5cf],
  ]) {
    const l = new T.DirectionalLight(color, intensity);
    l.position.set(x, y, z);
    scene.add(l);
  }
  const floor = new T.Mesh(
    new T.PlaneGeometry(2400, 2400),
    new T.MeshBasicMaterial({
      color: 0x14181d,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -153;
  scene.add(floor);
  // Faint engineering datum under the assembly.
  const grid = new T.GridHelper(1350, 27, 0x404851, 0x2b333d);
  grid.position.set(130, -152, 0);
  (grid.material as T.Material).transparent = true;
  (grid.material as T.Material).opacity = 0.3;
  scene.add(grid);
  const ro = new ResizeObserver(() => resize());
  function resize() {
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const oldAspect = camera.aspect;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (Math.abs(oldAspect - camera.aspect) > 0.02) setCamera(activeCamera);
  }
  ro.observe(el);
  resize();
  let dead = false,
    model: T.Group | undefined;
  const cleanup = () => {
    if (dead) return;
    dead = true;
    ro.disconnect();
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    controls.dispose();
    env.dispose();
    scene.traverse((o) => {
      if (
        o instanceof T.Mesh ||
        o instanceof T.LineSegments ||
        o instanceof T.Sprite
      ) {
        o.geometry?.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m: T.Material) => {
          if (m instanceof T.SpriteMaterial) m.map?.dispose();
          m.dispose();
        });
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    const response = await fetch('/models/rs3-ea855-evo.glb', { signal });
    if (!response.ok) throw new Error('模型资源加载失败');
    const length = Number(response.headers.get('content-length')) || 12500000;
    const reader = response.body?.getReader();
    let data: ArrayBuffer;
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
        onProgress(Math.min(94, (total / length) * 94));
      }
      const bytes = new Uint8Array(total);
      let pos = 0;
      for (const c of chunks) {
        bytes.set(c, pos);
        pos += c.length;
      }
      data = bytes.buffer;
    } else data = await response.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(data, '');
    if (dead) {
      gltf.scene.traverse((o) => {
        if (o instanceof T.Mesh) o.geometry.dispose();
      });
      throw new Error('Aborted');
    }
    model = gltf.scene;
    const guides: T.Object3D[] = [];
    model.traverse((o) => {
      if (o.name.includes('chain guide')) guides.push(o);
    });
    guides.forEach((o) => {
      o.parent?.remove(o);
      if (o instanceof T.Mesh) o.geometry.dispose();
    });
    mergeStaticChildren(model);
    scene.add(model);
    onProgress(100);
  } catch (error) {
    cleanup();
    throw error;
  }
  const nodes = new Map<string, T.Object3D>();
  model.traverse((o) => {
    if (nodes.has(o.name)) throw new Error('模型节点重复：' + o.name);
    nodes.set(o.name, o);
  });
  let systemLayers: SystemLayerRenderer;
  try {
    systemLayers = new SystemLayerRenderer(scene, nodes, {
      cadPaths: readCadPaths(nodes.values()),
    });
  } catch (error) {
    cleanup();
    throw error;
  }
  const node = (name: string) => nodes.get(name);
  const setVisible = (name: string, value: boolean) => {
    const o = node(name);
    if (o) o.visible = value;
  };
  const rotate = (name: string, angle: number) => {
    const o = node(name);
    if (o) o.rotation.x = angle;
  };
  const torquePaths = GEARS.map((spec) => {
    const group = new T.Group();
    const anchor = node('Gear_' + spec.gear);
    const pos = anchor?.position ?? new T.Vector3();
    const points = [
      new T.Vector3(340, 0, 22),
      new T.Vector3(pos.x, 0, 22),
      new T.Vector3(pos.x, pos.y, pos.z + 22),
      new T.Vector3(575, pos.y, pos.z + 22),
    ];
    if (spec.gear === -1) points.splice(2, 0, new T.Vector3(pos.x, 45, -26));
    points.push(new T.Vector3(575, 45, 22));
    const color = spec.clutch ? 0x59bdff : 0xffad55;
    const material = new T.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
    const haloMaterial = new T.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.16,
      toneMapped: false,
    });
    const segments: {
      start: T.Vector3;
      direction: T.Vector3;
      length: number;
      markers: T.Mesh[];
    }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const delta = points[i + 1].clone().sub(points[i]);
      const length = delta.length();
      if (length < 1) continue;
      const direction = delta.normalize();
      const curve = new T.LineCurve3(points[i], points[i + 1]);
      for (const [radius, mat, order] of [
        [5, haloMaterial, 100],
        [2.1, material, 101],
      ] as const) {
        const tube = new T.Mesh(
          new T.TubeGeometry(curve, 1, radius, 8, false),
          mat,
        );
        tube.renderOrder = order;
        group.add(tube);
      }
      const markers = Array.from(
        { length: Math.max(1, Math.floor(length / 26)) },
        () => {
          const marker = new T.Mesh(new T.ConeGeometry(5.8, 15, 12), material);
          marker.renderOrder = 102;
          group.add(marker);
          return marker;
        },
      );
      segments.push({ start: points[i], direction, length, markers });
    }
    model.add(group);
    return { spec, group, segments, material, haloMaterial };
  });
  const effects = new T.Group();
  scene.add(effects);
  const gas: T.Mesh[] = [];
  const labels: T.Sprite[] = [];
  const pickables: T.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const mesh = new T.Mesh(
      new T.CylinderGeometry(39, 39, 1, 32),
      new T.MeshBasicMaterial({
        color: 0xf29452,
        transparent: true,
        opacity: 0.23,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
    effects.add(mesh);
    gas.push(mesh);
    const cn = document.createElement('canvas');
    cn.width = 128;
    cn.height = 128;
    const ctx = cn.getContext('2d')!;
    ctx.fillStyle = '#1e242d';
    ctx.beginPath();
    ctx.arc(64, 64, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8c98a8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f6f7f8';
    ctx.font = '48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 64, 81);
    const tex = new T.CanvasTexture(cn);
    tex.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(
      new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
    );
    sprite.position.set((i - 2) * 88, 385, 0);
    sprite.scale.set(32, 32, 1);
    sprite.userData.cylinder = i + 1;
    effects.add(sprite);
    labels.push(sprite);
    pickables.push(sprite);
    node('Piston_' + (i + 1))?.traverse((o) => {
      o.userData.cylinder = i + 1;
      if (o instanceof T.Mesh) pickables.push(o);
    });
  }
  const particleCount = 200,
    positions = new Float32Array(particleCount * 3),
    colors = new Float32Array(particleCount * 3);
  const pg = new T.BufferGeometry();
  pg.setAttribute('position', new T.BufferAttribute(positions, 3));
  pg.setAttribute('color', new T.BufferAttribute(colors, 3));
  const particles = new T.Points(
    pg,
    new T.PointsMaterial({
      size: 3,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
  effects.add(particles);
  // One reusable curve per timing stage, links advance by chain travel, not independent rotation.
  const chainDefs = [
    {
      x: 244,
      circles: [
        { y: 0, z: 0, r: 32 },
        { y: 157, z: 0, r: 51 },
      ],
      rate: 31.8,
    },
    {
      x: 258,
      circles: [
        { y: 157, z: 0, r: 31 },
        { y: 294, z: -44, r: 38.5 },
        { y: 294, z: 44, r: 38.5 },
      ],
      rate: 30.55 * 0.625,
    },
  ];
  const chains = chainDefs.map((c) => {
    const points = chainEnvelope(c.circles).map(
      ([y, z]) => new T.Vector3(c.x, y, z),
    );
    const curve = new T.CurvePath<T.Vector3>();
    for (let i = 0; i < points.length; i++)
      curve.add(new T.LineCurve3(points[i], points[(i + 1) % points.length]));
    const length = curve.getLength(),
      count = Math.round(length / 8);
    const mesh = new T.InstancedMesh(
      new T.BoxGeometry(5, 6, 3.5),
      new T.MeshStandardMaterial({
        color: 0xb0bac7,
        metalness: 0.8,
        roughness: 0.32,
      }),
      count,
    );
    scene.add(mesh);
    return { ...c, curve, length, count, mesh };
  });
  const temp = new T.Object3D(),
    up = new T.Vector3(0, 1, 0);
  let visibleMode = '';
  const pointer = new T.Vector2(),
    ray = new T.Raycaster();
  let down = [0, 0];
  const onDown = (e: PointerEvent) => {
    down = [e.clientX, e.clientY];
  };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    for (const hit of ray.intersectObjects(pickables, false)) {
      let o: T.Object3D | null = hit.object,
        vis = true;
      while (o) {
        if (!o.visible) vis = false;
        o = o.parent;
      }
      if (vis) {
        onSelect(hit.object.userData.cylinder);
        break;
      }
    }
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  model?.traverse((o) => {
    if (!o.userData.ptMotion) return;
    o.traverse((child) => {
      if (
        child instanceof T.Mesh &&
        child.material instanceof T.MeshStandardMaterial
      ) {
        child.material = child.material.clone();
        child.material.emissive.copy(child.material.color);
        child.material.emissiveIntensity = 0;
        child.material.userData.ptTint = true;
        child.material.userData.ptBaseColor = child.material.color.clone();
      }
    });
  });
  let previousSystemsTime = 0;
  const rotorPhases = new Map<string, number>();
  const update = (frame: EngineFrame) => {
    const { simulation: state, powertrain } = frame;
    if (dead) return;
    const cs = evaluateEngine(state.angle),
      a = (state.angle * Math.PI) / 180;
    const mode = state.mode,
      solid = mode === 'solid',
      mech = mode === 'mechanism';
    if (visibleMode !== mode) {
      visibleMode = mode;
      setVisible('FrontShell', solid);
      setVisible('RearShell', !mech);
      setVisible('Body', solid);
      setVisible('Accessories', solid);
      setVisible('EngineDetail', solid);
      setVisible('Transmission', true);
      setVisible('TransmissionHousing', solid);
      setVisible('TransmissionFittings', solid);
      setVisible('TransmissionOutputs', solid);
      setVisible('TransmissionRearSection', mode === 'cutaway');
      setVisible('Timing', true);
    }
    setVisible('Cover', solid && state.cover);
    const pt = powertrain;
    for (const {
      spec,
      group,
      segments,
      material,
      haloMaterial,
    } of torquePaths) {
      const torque =
        pt?.selected[spec.clutch] === spec.gear
          ? pt.clutches[spec.clutch].torque
          : 0;
      group.visible = !solid && Math.abs(torque) > 1;
      material.opacity = 0.8 + 0.2 * Math.min(1, Math.abs(torque) / 500);
      haloMaterial.opacity = 0.12 + 0.14 * Math.min(1, Math.abs(torque) / 500);
      if (!group.visible) continue;
      const sign = torque >= 0 ? 1 : -1;
      for (const segment of segments) {
        segment.markers.forEach((marker, i) => {
          const fraction = mod(
            i / segment.markers.length +
              ((pt!.time * 350) / segment.length) * sign,
            1,
          );
          marker.position
            .copy(segment.start)
            .addScaledVector(
              segment.direction,
              8 + fraction * Math.max(0, segment.length - 16),
            );
          marker.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            segment.direction.clone().multiplyScalar(sign),
          );
        });
      }
    }
    model?.traverse((o) => {
      const motion = o.userData.ptMotion;
      if (!motion) return;
      const index = Number(o.userData.clutch ?? 0);
      const g = Number(o.userData.gear ?? 0) as Gear;
      const spec = gearInfo(g);
      if (motion === 'engine') o.rotation.x = a;
      if (motion === 'input') o.rotation.x = pt ? pt.inputAngle[index] : 0;
      if (motion === 'output')
        o.rotation.x = pt ? -pt.wheelAngle * Number(o.userData.final) : 0;
      if (motion === 'wheel') o.rotation.x = pt?.wheelAngle ?? 0;
      if (motion === 'gear' && spec)
        o.rotation.x = pt ? -pt.inputAngle[spec.clutch] / spec.ratio : 0;
      if (motion === 'sleeve' || motion === 'fork') {
        const gears = o.userData.gears as number[];
        const syncIndex = SYNC_GROUPS.findIndex(
          (pair) => pair[0] === gears[0] && pair[1] === gears[1],
        );
        o.position.x =
          Number(o.userData.baseX) + (pt?.selectorPositions[syncIndex] ?? 0);
        if (motion === 'sleeve')
          o.rotation.x = pt ? -pt.wheelAngle * Number(o.userData.final) : 0;
      }
      if (motion === 'clutch') {
        o.rotation.x = pt ? pt.inputAngle[index] : 0;
      }
      if (motion === 'plate') {
        // Steel discs follow the basket; friction discs follow the input hub.
        // Counter the hub parent rotation so open-clutch slip remains visible.
        o.rotation.x = o.userData.driving
          ? a - (pt?.inputAngle[index] ?? 0)
          : 0;
        o.position.x =
          Number(o.userData.baseX) *
          (1 - (pt?.clutches[index].engagement ?? 0) * 0.16);
      }
      if (motion === 'piston') {
        o.rotation.x = a;
        o.position.x =
          Number(o.userData.baseX) -
          (pt?.clutches[index].engagement ?? 0) * 2.2;
      }
      const active = pt
        ? GEARS.filter(
            (gear) =>
              pt.selected[gear.clutch] === gear.gear &&
              Math.abs(pt.clutches[gear.clutch].torque) > 1,
          )
        : [];
      const through = active.filter((gear) => {
        if (g) return gear.gear === g || (g === 2 && gear.gear === -1);
        if (motion === 'output') return gear.final === Number(o.userData.final);
        if (motion === 'wheel') return true;
        if (motion === 'sleeve' || motion === 'fork')
          return (o.userData.gears as number[]).includes(gear.gear);
        if (motion === 'engine' && o.name === 'DCTFlywheel') return true;
        return gear.clutch === index;
      });
      const carrying = through.length > 0;
      const pathColor = new T.Color(through[0]?.clutch ? 0x59bdff : 0xffad55);
      o.traverse((child) => {
        if (
          child instanceof T.Mesh &&
          child.material instanceof T.MeshStandardMaterial &&
          child.material.userData.ptTint
        ) {
          const focus = !!pt && !solid;
          const base = child.material.userData.ptBaseColor as T.Color;
          child.material.color.copy(focus && carrying ? pathColor : base);
          if (focus && !carrying) child.material.color.multiplyScalar(0.28);
          child.material.emissive.copy(pathColor);
          child.material.emissiveIntensity = focus && carrying ? 1.7 : 0;
        }
      });
    });
    rotate('Crankshaft', a);
    rotate('IntakeCam', a / 2);
    rotate('ExhaustCam', a / 2);
    rotate('CrankGear', a);
    rotate('IntermediateGear', a * 0.625);
    rotate('IntermediateUpperGear', a * 0.625);
    rotate('IntakeGear', a * 0.5);
    rotate('ExhaustGear', a * 0.5);
    rotate('CrankPulley', a);
    rotate('AlternatorPulley', (a * 53) / 30);
    rotate('AccessoryPulley', (a * 53) / 26);
    let pp = 0;
    for (const c of cs) {
      const piston = node('Piston_' + c.cylinder);
      if (piston) piston.position.y = c.pistonY;
      const rod = node('Rod_' + c.cylinder);
      if (rod) {
        rod.position.y = c.pinY;
        rod.position.z = c.pinZ;
        rod.rotation.x = c.rodAngle;
      }
      for (const side of ['Intake', 'Exhaust'])
        for (let j = 0; j < 2; j++) {
          const v = node(`${side}Valve_${c.cylinder}_${j}`);
          const lift = side === 'Intake' ? c.intakeLift : c.exhaustLift,
            sign = side === 'Intake' ? 1 : -1,
            tilt = Math.atan(0.38);
          if (v) {
            v.position.y = 231 - lift * Math.cos(tilt);
            v.position.z = sign * (25 - lift * Math.sin(tilt));
          }
          const spring = node(`${side}Spring_${c.cylinder}_${j}`);
          if (spring) spring.scale.y = (27 - lift) / 27;
        }
      const g = gas[c.cylinder - 1],
        height = Math.max(1, 228 - c.pistonY - 27);
      g.position.set(c.x, c.pistonY + 27 + height / 2, 0);
      g.scale.y = height;
      (g.material as T.MeshBasicMaterial).color.set(STAGES[c.stage].color);
      (g.material as T.MeshBasicMaterial).opacity = 0.2 + 0.42 * (frame.systems.cylinders[c.cylinder - 1]?.burnFraction ?? 0);
      g.visible = !solid && frame.layer === 'gas-combustion';
      const label = labels[c.cylinder - 1];
      label.visible = !solid;
      label.material.color.set(
        c.cylinder === state.selected ? 0xffffff : 0x9ba8b8,
      );
      label.scale.setScalar(c.cylinder === state.selected ? 39 : 32);
      for (let j = 0; j < 40; j++) {
        const index = pp * 3,
          t = mod(state.angle * 0.006 + j * 0.618, 1),
          spread = sinHash(j * 3 + 7) * 24;
        const inlet = c.stage === 2,
          exhaust = c.stage === 1;
        const active =
          (inlet || exhaust) &&
          frame.layer === 'gas-combustion' &&
          frame.systems.running &&
          window.innerWidth >= 720 &&
          state.flow &&
          !solid &&
          j < 12 + state.rpm / 250;
        positions[index] = c.x + spread;
        positions[index + 1] = active ? 228 - t * height : -9999;
        positions[index + 2] = sinHash(j * 7 + 2) * 24;
        if (exhaust) {
          positions[index + 1] = active ? c.pistonY + 28 + t * height : -9999;
          positions[index + 2] -= t * 12;
        }
        const color = new T.Color(inlet ? '#62b7f1' : '#a5b4c4');
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
        pp++;
      }
    }
    pg.attributes.position.needsUpdate = true;
    pg.attributes.color.needsUpdate = true;
    for (const c of chains) {
      c.mesh.visible = !solid;
      if (solid) continue;
      for (let i = 0; i < c.count; i++) {
        const u = mod(i / c.count + (a * c.rate) / c.length, 1);
        temp.position.copy(c.curve.getPointAt(u));
        temp.quaternion.setFromUnitVectors(
          up,
          c.curve.getTangentAt(u).normalize(),
        );
        temp.updateMatrix();
        c.mesh.setMatrixAt(i, temp.matrix);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
    if (model) {
      const vibration =
        state.vibration && (state.playing || !!powertrain) && solid
          ? Math.min(0.8, state.rpm / 9000)
          : 0;
      model.position.y = Math.sin(a) * vibration;
      model.rotation.z = Math.sin(a * 0.5) * vibration * 0.001;
    }
    for (const [name, layer] of [
      ['AirSystem', 'gas-combustion'],
      ['OilSystem', 'lubrication'],
      ['CoolantSystem', 'thermal-cooling'],
      ['HydraulicSystem', 'transmission-hydraulic'],
    ] as const)
      setVisible(name, frame.layer === layer);
    setVisible('SystemMotionAnchors', frame.layer !== 'mechanical');
    const rotorDt = Math.max(0, frame.systems.time - previousSystemsTime);
    previousSystemsTime = frame.systems.time;
    for (const [name, rpm, axis] of [
      ['SYSTurboRotor', frame.systems.turboRpmNormalized * 2400, 'z'],
      ['SYSOilPump', frame.systems.oilPumpRpm, 'x'],
      ['SYSWaterPump', frame.systems.waterPumpRpm, 'x'],
      ['SYSHydraulicPump', frame.hydraulic?.pumpRpm ?? 0, 'x'],
      ['SYSStarterRingGear', state.rpm, 'x'],
      ['SYSStarterRotor', frame.systems.running ? 0 : state.rpm * 8, 'x'],
    ] as const) {
      const o = node(name);
      if (o) {
        const phase =
          ((rotorPhases.get(name) ?? 0) + (rpm * rotorDt * Math.PI) / 30) %
          (Math.PI * 2);
        rotorPhases.set(name, phase);
        o.rotation[axis] = phase;
        o.visible = name.includes('Hydraulic')
          ? frame.layer === 'transmission-hydraulic'
          : name.includes('Water')
            ? frame.layer === 'thermal-cooling'
            : name.includes('Oil')
              ? frame.layer === 'lubrication'
              : frame.layer === 'gas-combustion';
      }
    }
    systemLayers.update(frame);
    controls.update();
    renderer.render(scene, camera);
  };
  return {
    update,
    camera: setCamera,
    cameraPosition: () => camera.position.toArray() as [number, number, number],
    metrics: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    dispose: () => {
      systemLayers.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      cleanup();
    },
  };
}
function sinHash(n: number) {
  return Math.sin(n * 127.1) * 0.8;
}
