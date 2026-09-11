import * as T from 'three';

// Millimetres, in the transmission's local coordinate system.
export const CASING_CLEARANCE = 8;
export const CASING_THICKNESS = 3;

export function fitTransmissionCutaway(model: T.Object3D) {
  const internals = model.getObjectByName('TransmissionInternals');
  const rear = model.getObjectByName('TransmissionRearSection');
  if (!internals || !rear) return;
  model.updateMatrixWorld(true);
  const inverse = internals.matrixWorld.clone().invert();
  const point = new T.Vector3();
  let envelope = 0;
  // Each assembly rotates about its own X axis. Include its entire swept
  // radius, not just its current pose (especially the offset output shafts).
  for (const assembly of internals.children) {
    const origin = assembly
      .getWorldPosition(new T.Vector3())
      .applyMatrix4(inverse);
    let radius = 0;
    assembly.traverse((child) => {
      if (!(child instanceof T.Mesh)) return;
      const transform = inverse.clone().multiply(child.matrixWorld);
      const positions = child.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(transform);
        radius = Math.max(
          radius,
          Math.hypot(point.y - origin.y, point.z - origin.z),
        );
      }
    });
    envelope = Math.max(envelope, Math.hypot(origin.y, origin.z) + radius);
  }
  const inner = envelope + CASING_CLEARANCE;
  const outer = inner + CASING_THICKNESS;
  const segments = 96;
  const vertices: number[] = [];
  const indices: number[] = [];
  // Preserve the authored shell's axial span and observer-facing opening.
  for (const x of [383, 578]) {
    for (const radius of [inner, outer]) {
      for (let i = 0; i <= segments; i++) {
        const angle = Math.PI + (Math.PI * i) / segments;
        vertices.push(x, radius * Math.cos(angle), radius * Math.sin(angle));
      }
    }
  }
  const stride = segments + 1;
  const quad = (a: number, b: number, c: number, d: number) =>
    indices.push(a, b, c, a, c, d);
  for (let i = 0; i < segments; i++) {
    quad(i, i + 1, 2 * stride + i + 1, 2 * stride + i);
    quad(stride + i, 3 * stride + i, 3 * stride + i + 1, stride + i + 1);
    quad(i, stride + i, stride + i + 1, i + 1);
    quad(
      2 * stride + i,
      2 * stride + i + 1,
      3 * stride + i + 1,
      3 * stride + i,
    );
  }
  for (const i of [0, segments])
    quad(i, 2 * stride + i, 3 * stride + i, stride + i);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Generated vertices are in the internal assembly frame, even if a future
  // exported casing has a non-identity transform.
  geometry.applyMatrix4(
    rear.matrixWorld.clone().invert().multiply(internals.matrixWorld),
  );
  const shell = rear.children.find(
    (child): child is T.Mesh => child instanceof T.Mesh,
  );
  if (!shell) {
    geometry.dispose();
    return;
  }
  shell.geometry.dispose();
  shell.geometry = geometry;
  shell.position.set(0, 0, 0);
  shell.rotation.set(0, 0, 0);
  shell.scale.set(1, 1, 1);
  rear.userData.innerRadius = inner;
  rear.userData.sweptRadius = envelope;
}
