// Hash both halves of each coordinate. Truncating to 32 bits would repeat worlds.
function mix(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
export function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return mix(hash);
}
export function hashPosition(seed: number, x: bigint, y: bigint, salt = 0): number {
  let hash = mix(seed ^ salt);
  for (const coordinate of [x, y]) {
    hash = mix(hash ^ Number(BigInt.asUintN(32, coordinate)));
    hash = mix(hash ^ Number(BigInt.asUintN(32, coordinate >> 32n)));
  }
  return hash;
}
export function floorDiv(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  return value % divisor < 0n ? quotient - 1n : quotient;
}
export function noise(seed: number, x: bigint, y: bigint, scale: number, salt = 0): number {
  const size = BigInt(scale);
  const gx = floorDiv(x, size),
    gy = floorDiv(y, size);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const tx = smooth(Number(x - gx * size) / scale);
  const ty = smooth(Number(y - gy * size) / scale);
  const sample = (dx: bigint, dy: bigint) =>
    hashPosition(seed, gx + dx, gy + dy, salt) / 4294967296;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(
    lerp(sample(0n, 0n), sample(1n, 0n), tx),
    lerp(sample(0n, 1n), sample(1n, 1n), tx),
    ty,
  );
}

/** A request-local sampler: only new lattice cells need exact-coordinate hashing.
 * Offsets stay small even when the world origin is near the safe integer limit.
 * The interpolation order matches noise(), which defines the version 1 output.
 */
export function createNoiseSampler(
  seed: number,
  originX: bigint,
  originY: bigint,
  scale: number,
  salt = 0,
) {
  const size = BigInt(scale);
  const baseX = floorDiv(originX, size),
    baseY = floorDiv(originY, size);
  const remainderX = Number(originX - baseX * size),
    remainderY = Number(originY - baseY * size);
  const rows = new Map<number, Map<number, readonly [number, number, number, number]>>();
  return (offsetX: number, offsetY: number) => {
    const x = remainderX + offsetX,
      y = remainderY + offsetY;
    const gx = Math.floor(x / scale),
      gy = Math.floor(y / scale);
    let row = rows.get(gy);
    if (!row) {
      row = new Map();
      rows.set(gy, row);
    }
    let corners = row.get(gx);
    if (!corners) {
      const px = baseX + BigInt(gx),
        py = baseY + BigInt(gy);
      corners = [
        hashPosition(seed, px, py, salt) / 4294967296,
        hashPosition(seed, px + 1n, py, salt) / 4294967296,
        hashPosition(seed, px, py + 1n, salt) / 4294967296,
        hashPosition(seed, px + 1n, py + 1n, salt) / 4294967296,
      ];
      row.set(gx, corners);
    }
    const fx = (x - gx * scale) / scale,
      fy = (y - gy * scale) / scale;
    const tx = fx * fx * (3 - 2 * fx),
      ty = fy * fy * (3 - 2 * fy);
    const upper = corners[0] + (corners[1] - corners[0]) * tx;
    const lower = corners[2] + (corners[3] - corners[2]) * tx;
    return upper + (lower - upper) * ty;
  };
}
