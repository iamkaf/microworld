import { floorDiv, hashPosition } from "./random.ts";

interface Node {
  gx: number;
  gy: number;
  x: number;
  y: number;
  height: number;
  downstream?: Node | null;
  flow: Map<number, number>;
}
interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  width: number;
}

/** A bounded drainage graph. Every edge descends; local catchments merge at shared nodes.
 * Twelve upstream steps keep sampling finite and independent of the requested window.
 */
export function createDrainage(
  seed: number,
  originX: bigint,
  originY: bigint,
  sea: number,
  elevation: (x: number, y: number) => number,
  charge: () => void,
) {
  const spacing = 16;
  const baseX = floorDiv(originX, 16n),
    baseY = floorDiv(originY, 16n);
  const rx = Number(originX - baseX * 16n),
    ry = Number(originY - baseY * 16n);
  const nodes = new Map<string, Node>();
  const tiles = new Map<string, Segment[]>();
  function node(gx: number, gy: number): Node {
    const key = `${gx}:${gy}`;
    let value = nodes.get(key);
    if (!value) {
      charge();
      const ax = baseX + BigInt(gx),
        ay = baseY + BigInt(gy);
      const x = gx * spacing - rx + 4 + (hashPosition(seed, ax, ay, 190) % 8);
      const y = gy * spacing - ry + 4 + (hashPosition(seed, ax, ay, 191) % 8);
      value = { gx, gy, x, y, height: elevation(x, y), flow: new Map() };
      nodes.set(key, value);
    }
    return value;
  }
  function downstream(n: Node): Node | null {
    if (n.downstream !== undefined) return n.downstream;
    n.downstream = null;
    if (n.height < sea) return null;
    let slope = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const other = node(n.gx + dx, n.gy + dy);
        const candidate = (n.height - other.height) / Math.hypot(n.x - other.x, n.y - other.y);
        if (candidate > slope) {
          slope = candidate;
          n.downstream = other;
        }
      }
    return n.downstream;
  }
  function flow(n: Node, depth: number): number {
    if (depth === 0) return 1;
    let result = n.flow.get(depth);
    if (result !== undefined) return result;
    charge();
    result = 1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const other = node(n.gx + dx, n.gy + dy);
        if (downstream(other) === n) result += flow(other, depth - 1);
      }
    n.flow.set(depth, result);
    return result;
  }
  return (x: number, y: number) => {
    const gx = Math.floor((x + rx) / spacing),
      gy = Math.floor((y + ry) / spacing);
    const key = `${gx}:${gy}`;
    let segments = tiles.get(key);
    if (!segments) {
      segments = [];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const start = node(gx + dx, gy + dy);
          if (start.height < sea) continue;
          const volume = flow(start, 12);
          if (volume < 7) continue;
          const end = downstream(start);
          const width = Math.min(3.5, 0.5 + Math.sqrt(volume) * 0.3);
          if (!end) {
            // Closed depressions collect a small lake rather than a river climbing out.
            segments.push({
              ax: start.x,
              ay: start.y,
              bx: start.x,
              by: start.y,
              width: width * 1.8,
            });
            continue;
          }
          const bend =
            (hashPosition(seed, baseX + BigInt(start.gx), baseY + BigInt(start.gy), 192) /
              4294967296 -
              0.5) *
            0.3;
          const cx = (start.x + end.x) / 2 - (end.y - start.y) * bend;
          const cy = (start.y + end.y) / 2 + (end.x - start.x) * bend;
          let px = start.x,
            py = start.y;
          for (let step = 1; step <= 4; step++) {
            const t = step / 4,
              u = 1 - t;
            const nx = u * u * start.x + 2 * u * t * cx + t * t * end.x;
            const ny = u * u * start.y + 2 * u * t * cy + t * t * end.y;
            segments.push({ ax: px, ay: py, bx: nx, by: ny, width });
            px = nx;
            py = ny;
          }
        }
      tiles.set(key, segments);
    }
    let bank = Infinity;
    for (const segment of segments) {
      const dx = segment.bx - segment.ax,
        dy = segment.by - segment.ay;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(1, ((x - segment.ax) * dx + (y - segment.ay) * dy) / lengthSquared),
            );
      bank = Math.min(
        bank,
        Math.hypot(x - segment.ax - dx * t, y - segment.ay - dy * t) - segment.width,
      );
    }
    return bank;
  };
}
