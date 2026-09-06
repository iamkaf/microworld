import { floorDiv, hashPosition } from "./random.ts";

/** Features are owned by absolute grid cells, including outside the requested window. */
export function createFeatures(
  seed: number,
  originX: bigint,
  originY: bigint,
  spacing: number,
  salt: number,
  charge: () => void,
  neighborhood = 1,
) {
  const size = BigInt(spacing);
  const bx = floorDiv(originX, size),
    by = floorDiv(originY, size);
  const rx = Number(originX - bx * size),
    ry = Number(originY - by * size);
  type Feature = { x: number; y: number; radius: number; variant: number };
  const cache = new Map<string, Feature[]>();
  return (x: number, y: number) => {
    const gx = Math.floor((rx + x) / spacing),
      gy = Math.floor((ry + y) / spacing);
    const key = `${gx}:${gy}`;
    let features = cache.get(key);
    if (!features) {
      features = [];
      for (let dy = -neighborhood; dy <= neighborhood; dy++)
        for (let dx = -neighborhood; dx <= neighborhood; dx++) {
          charge();
          const ax = bx + BigInt(gx + dx),
            ay = by + BigInt(gy + dy);
          features.push({
            x: (gx + dx) * spacing - rx + (hashPosition(seed, ax, ay, salt) % spacing),
            y: (gy + dy) * spacing - ry + (hashPosition(seed, ax, ay, salt + 1) % spacing),
            radius: spacing * (0.18 + (hashPosition(seed, ax, ay, salt + 2) / 4294967296) * 0.28),
            variant: hashPosition(seed, ax, ay, salt + 3) / 4294967296,
          });
        }
      cache.set(key, features);
    }
    return features;
  };
}
