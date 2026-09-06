/** External envelope of circular sprockets; straight spans plus sampled wrap arcs. */
export function chainEnvelope(
  circles: { y: number; z: number; r: number }[],
  samples = 96,
) {
  const points = circles
    .flatMap((c) =>
      Array.from({ length: samples }, (_, i) => {
        const a = (i * 2 * Math.PI) / samples;
        return [c.y + c.r * Math.cos(a), c.z + c.r * Math.sin(a)] as [
          number,
          number,
        ];
      }),
    )
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [],
    upper: [number, number][] = [];
  for (const p of points) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of points.slice().reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
