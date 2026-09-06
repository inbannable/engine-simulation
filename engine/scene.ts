import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chainEnvelope } from './chain';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { evaluateEngine, STAGES, mod, type SimulationState } from './physics';
export const CAMERAS: Record<string, number[]> = {
  iso: [-700, 530, 820],
  intake: [0, 320, 1050],
  exhaust: [0, 350, -1100],
  timing: [1000, 300, 180],
  top: [0, 1180, 1],
  section: [-150, 270, 1000],
};
export interface SceneHandle {
  update: (state: SimulationState) => void;
  camera: (name: string) => void;
  dispose: () => void;
  metrics: () => { calls: number; triangles: number };
}
function mergeStaticChildren(parent: T.Object3D) {
  for (const child of parent.children)
    if (!(child instanceof T.Mesh)) mergeStaticChildren(child);
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const child of parent.children)
    if (
      child instanceof T.Mesh &&
      !Array.isArray(child.material) &&
      !child.name.includes('Spring_')
    ) {
      const batch = batches.get(child.material) || [];
      batch.push(child);
      batches.set(child.material, batch);
    }
  for (const [material, meshes] of batches) {
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
): Promise<SceneHandle> {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.93;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    '可旋转的 Audi RS3 发动机三维模型',
  );
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 1, 1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 135, 0);
  controls.enableDamping = true;
  controls.minDistance = 450;
  controls.maxDistance = 2800;
  controls.maxPolarAngle = Math.PI * 0.91;
  let activeCamera = 'iso';
  const setCamera = (name: string) => {
    activeCamera = name;
    const p = CAMERAS[name] || CAMERAS.iso;
    controls.target.set(0, 135, 0);
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
  floor.position.y = -100;
  scene.add(floor);
  // Faint engineering datum under the assembly.
  const grid = new T.GridHelper(950, 19, 0x404851, 0x2b333d);
  grid.position.y = -99;
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
  model.traverse((o) => nodes.set(o.name, o));
  const node = (name: string) => nodes.get(name);
  const setVisible = (name: string, value: boolean) => {
    const o = node(name);
    if (o) o.visible = value;
  };
  const rotate = (name: string, angle: number) => {
    const o = node(name);
    if (o) o.rotation.x = angle;
  };
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
  const update = (state: SimulationState) => {
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
      setVisible('Timing', true);
    }
    setVisible('Cover', solid && state.cover);
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
      (g.material as T.MeshBasicMaterial).opacity = c.firing ? 0.62 : 0.2;
      g.visible = !solid;
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
        state.vibration && state.playing && solid
          ? Math.min(0.8, state.rpm / 9000)
          : 0;
      model.position.y = Math.sin(a) * vibration;
      model.rotation.z = Math.sin(a * 0.5) * vibration * 0.001;
    }
    controls.update();
    renderer.render(scene, camera);
  };
  return {
    update,
    camera: setCamera,
    metrics: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    dispose: () => {
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      cleanup();
    },
  };
}
function sinHash(n: number) {
  return Math.sin(n * 127.1) * 0.8;
}
