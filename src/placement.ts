import { floorDiv, hashPosition, hashText } from "./random.ts";
import { WORLD_SIZE, type PlacementRule, type WorldRequest } from "./schema.ts";
import { rotateTemplate } from "./templates.ts";
import type { Cell } from "./terrain.ts";

interface Candidate {
  id: string;
  x: bigint;
  y: bigint;
  priority: number;
  rotation: number;
  rule: PlacementRule;
}
export interface PlacedObject {
  id: string;
  rule: string;
  object: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variantSeed: number;
  rotation: number;
  template?: (string | null)[][];
}
export function placeObjects(
  request: WorldRequest,
  terrain: (x: bigint, y: bigint) => Cell,
  charge: () => void,
): PlacedObject[] {
  const seed = hashText(request.seed);
  const cache = new Map<string, Candidate | null>();
  const rules = [...request.placements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  function candidate(rule: PlacementRule, gx: bigint, gy: bigint): Candidate | null {
    charge();
    const id = `${rule.id}:${gx}:${gy}`;
    if (cache.has(id)) return cache.get(id)!;
    cache.set(id, null);
    const salt = hashText(rule.id);
    if (hashPosition(seed, gx, gy, salt) / 4294967296 >= rule.probability) return null;
    const rotation = rule.rotations[hashPosition(seed, gx, gy, salt ^ 4) % rule.rotations.length];
    rule = {
      ...rule,
      width: rotation % 180 ? rule.height : rule.width,
      height: rotation % 180 ? rule.width : rule.height,
      template: rule.template ? rotateTemplate(rule.template, rotation) : undefined,
    };
    const x = gx * BigInt(rule.pitch) + BigInt(hashPosition(seed, gx, gy, salt ^ 1) % rule.pitch);
    const y = gy * BigInt(rule.pitch) + BigInt(hashPosition(seed, gx, gy, salt ^ 2) % rule.pitch);
    if (
      x < 0n ||
      y < 0n ||
      x + BigInt(rule.width) > WORLD_SIZE ||
      y + BigInt(rule.height) > WORLD_SIZE
    )
      return null;
    let low = 65535,
      high = 0;
    for (let dy = 0; dy < rule.height; dy++) {
      for (let dx = 0; dx < rule.width; dx++) {
        const cell = terrain(x + BigInt(dx), y + BigInt(dy));
        if (
          cell.elevation < rule.minElevation ||
          cell.elevation > rule.maxElevation ||
          (rule.biomes && !rule.biomes.includes(cell.biome))
        )
          return null;
        low = Math.min(low, cell.elevation);
        high = Math.max(high, cell.elevation);
      }
    }
    if (high - low > rule.maxRelief) return null;
    if (rule.nearWater !== undefined) {
      let found = false;
      for (let dy = -rule.nearWater; dy <= rule.nearWater && !found; dy++) {
        for (let dx = -rule.nearWater; dx <= rule.nearWater; dx++) {
          const px = x + BigInt(dx),
            py = y + BigInt(dy);
          if (
            px >= 0n &&
            py >= 0n &&
            px < WORLD_SIZE &&
            py < WORLD_SIZE &&
            terrain(px, py).water === true
          ) {
            found = true;
            break;
          }
        }
      }
      if (!found) return null;
    }
    const result = { id, x, y, rule, rotation, priority: hashPosition(seed, gx, gy, salt ^ 3) };
    cache.set(id, result);
    return result;
  }
  function* region(
    rule: PlacementRule,
    left: bigint,
    top: bigint,
    right: bigint,
    bottom: bigint,
  ): Generator<Candidate> {
    const pitch = BigInt(rule.pitch);
    for (let gy = floorDiv(top, pitch); gy <= floorDiv(bottom, pitch); gy++) {
      for (let gx = floorDiv(left, pitch); gx <= floorDiv(right, pitch); gx++) {
        const item = candidate(rule, gx, gy);
        if (item) yield item;
      }
    }
  }
  function conflicts(a: Candidate, b: Candidate): boolean {
    const gap = BigInt(Math.max(a.rule.minSpacing, b.rule.minSpacing));
    return (
      a.x < b.x + BigInt(b.rule.width) + gap &&
      b.x < a.x + BigInt(a.rule.width) + gap &&
      a.y < b.y + BigInt(b.rule.height) + gap &&
      b.y < a.y + BigInt(a.rule.height) + gap
    );
  }
  function wins(item: Candidate): boolean {
    for (const rule of rules) {
      const gap = BigInt(Math.max(item.rule.minSpacing, rule.minSpacing));
      for (const other of region(
        rule,
        item.x - BigInt(Math.max(rule.width, rule.height)) - gap,
        item.y - BigInt(Math.max(rule.width, rule.height)) - gap,
        item.x + BigInt(item.rule.width) + gap,
        item.y + BigInt(item.rule.height) + gap,
      )) {
        if (other.id === item.id) continue;
        const stronger =
          other.rule.priority > item.rule.priority ||
          (other.rule.priority === item.rule.priority &&
            (other.priority > item.priority ||
              (other.priority === item.priority && other.id < item.id)));
        if (stronger && conflicts(item, other)) return false;
      }
    }
    return true;
  }
  const { x, y, width, height } = request.window;
  const left = BigInt(x),
    top = BigInt(y),
    right = left + BigInt(width),
    bottom = top + BigInt(height);
  const output: PlacedObject[] = [];
  for (const rule of rules) {
    for (const item of region(
      rule,
      left - BigInt(Math.max(rule.width, rule.height)) + 1n,
      top - BigInt(Math.max(rule.width, rule.height)) + 1n,
      right - 1n,
      bottom - 1n,
    )) {
      if (
        item.x >= right ||
        item.y >= bottom ||
        item.x + BigInt(item.rule.width) <= left ||
        item.y + BigInt(item.rule.height) <= top ||
        !wins(item)
      )
        continue;
      output.push({
        id: item.id,
        rule: rule.id,
        object: rule.object,
        x: Number(item.x),
        y: Number(item.y),
        width: item.rule.width,
        height: item.rule.height,
        variantSeed: item.priority,
        rotation: item.rotation,
        ...(item.rule.template ? { template: item.rule.template } : {}),
      });
    }
  }
  return output.sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
