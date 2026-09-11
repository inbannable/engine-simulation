import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import {
  fitTransmissionCutaway,
  CASING_CLEARANCE,
} from '../engine/transmission-clearance';

void test('actual GLB cutaway clears rotating transmission assemblies with a thick shell', () => {
  const bytes = readFileSync(
    new URL('../public/models/rs3-ea855-evo.glb', import.meta.url),
  );
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binary = bytes.subarray(28 + jsonLength);
  const objects: T.Object3D[] = gltf.nodes.map(
    (node: {
      name: string;
      translation?: number[];
      rotation?: number[];
      scale?: number[];
      matrix?: number[];
      mesh?: number;
      children?: number[];
    }) => {
      const object = new T.Group();
      object.name = node.name;
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
      if (node.matrix) {
        object.matrix.fromArray(node.matrix);
        object.matrix.decompose(
          object.position,
          object.quaternion,
          object.scale,
        );
      }
      if (node.mesh !== undefined)
        for (const primitive of gltf.meshes[node.mesh].primitives) {
          const accessor = gltf.accessors[primitive.attributes.POSITION];
          const view = gltf.bufferViews[accessor.bufferView];
          const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
          const values = new Float32Array(accessor.count * 3);
          for (let i = 0; i < accessor.count; i++)
            for (let j = 0; j < 3; j++)
              values[i * 3 + j] = binary.readFloatLE(
                offset + i * (view.byteStride ?? 12) + j * 4,
              );
          const geometry = new T.BufferGeometry();
          geometry.setAttribute('position', new T.BufferAttribute(values, 3));
          object.add(new T.Mesh(geometry));
        }
      return object;
    },
  );
  gltf.nodes.forEach(
    (
      node: {
        name: string;
        translation?: number[];
        rotation?: number[];
        scale?: number[];
        matrix?: number[];
        mesh?: number;
        children?: number[];
      },
      i: number,
    ) =>
      node.children?.forEach((child: number) => objects[i].add(objects[child])),
  );
  const model = new T.Group();
  objects
    .filter((object) => !object.parent)
    .forEach((object) => model.add(object));
  // Match the loader: exported mesh nodes are Mesh objects, not wrappers.
  const rear = model.getObjectByName('TransmissionRearSection')!;
  const wrapper = rear.children[0];
  const mesh = wrapper.children[0] as T.Mesh;
  wrapper.remove(mesh);
  rear.remove(wrapper);
  rear.add(mesh);
  fitTransmissionCutaway(model);
  assert.ok(rear.userData.sweptRadius > 90);
  assert.equal(
    rear.userData.innerRadius - rear.userData.sweptRadius,
    CASING_CLEARANCE,
  );
  const positions = mesh.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    assert.ok(
      Math.hypot(positions.getY(i), positions.getZ(i)) >=
        rear.userData.sweptRadius + CASING_CLEARANCE - 0.001,
    );
  }
  assert.ok(
    mesh.geometry.index!.count > 1000,
    'shell includes inner and outer walls and cut edges',
  );
});
