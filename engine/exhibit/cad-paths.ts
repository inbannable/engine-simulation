import * as T from 'three';

export const CAD_PATHS = {
  air: [
    'air_intake',
    ...Array.from({ length: 5 }, (_, i) => `air_cylinder_${i + 1}`),
  ],
  exhaust: [
    'exhaust_turbo',
    ...Array.from({ length: 5 }, (_, i) => `exhaust_cylinder_${i + 1}`),
  ],
  oil: ['oil_main', 'oil_crank', 'oil_head', 'oil_turbo'],
  coolant: ['coolant_block', 'coolant_head', 'coolant_turbo'],
  hydraulic: [
    'hydraulic_k1',
    'hydraulic_k2',
    'hydraulic_fork_15',
    'hydraulic_fork_37',
    'hydraulic_fork_4r',
    'hydraulic_fork_26',
    'hydraulic_return',
  ],
} as const;

/** Validate exported extras before allocating overlays. No synthetic path fallback. */
export function readCadPaths(nodes: Iterable<T.Object3D>) {
  const all = [...nodes];
  const result = new Map<string, T.Vector3[]>();
  for (const [domain, paths] of Object.entries(CAD_PATHS))
    for (const path of paths) {
      const anchors = all
        .filter((n) => n.userData.role === 'anchor' && n.userData.path === path)
        .sort((a, b) => a.userData.order - b.userData.order);
      const routes = all.filter(
        (n) => n.userData.role === 'route' && n.userData.path === path,
      );
      if (anchors.length < 2 || routes.length !== 1)
        throw new Error(`CAD 路径缺失或重复：${path}`);
      result.set(
        path,
        anchors.map((n, i) => {
          if (
            n.userData.system !== domain ||
            n.userData.order !== i ||
            n.userData.direction !== 1
          )
            throw new Error(`CAD 路径顺序或方向非法：${path} / ${i}`);
          n.updateWorldMatrix(true, false);
          const p = n.getWorldPosition(new T.Vector3());
          if (!p.toArray().every(Number.isFinite))
            throw new Error(`CAD 路径坐标非法：${path}`);
          return p;
        }),
      );
    }
  return result;
}
