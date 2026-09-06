import type { WorldRequest } from "./schema.ts";
import { hashPosition, hashText, createNoiseSampler } from "./random.ts";
import { createMaze } from "./maze.ts";

export interface Cell {
  elevation: number;
  biome: string;
  water?: boolean;
}
export function createTerrain(request: WorldRequest, charge: () => void) {
  const seed = hashText(request.seed);
  const maze = createMaze(seed, charge);
  const { scale, seaLevel, roughness, moisture: wetness, temperature: warmth } = request.terrain;
  const originX = BigInt(request.window.x),
    originY = BigInt(request.window.y);
  const coarse = createNoiseSampler(seed, originX, originY, scale);
  const detail = createNoiseSampler(seed, originX, originY, Math.max(2, Math.floor(scale / 4)), 1);
  const fine = createNoiseSampler(seed, originX, originY, Math.max(2, Math.floor(scale / 12)), 7);
  const humidity = createNoiseSampler(seed, originX, originY, scale * 2, 2);
  const climate = createNoiseSampler(seed, originX, originY, scale * 2, 3);
  const craterRegions = new Map<number, Map<number, { x: number; y: number; radius: number }[]>>();
  function craters(x: bigint, y: bigint) {
    const gx = Math.floor(Number(x) / 32),
      gy = Math.floor(Number(y) / 32);
    let row = craterRegions.get(gy);
    if (!row) {
      row = new Map();
      craterRegions.set(gy, row);
    }
    let values = row.get(gx);
    if (!values) {
      values = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = BigInt(gx) + BigInt(dx),
            cy = BigInt(gy) + BigInt(dy);
          values.push({
            x: dx * 32 + (hashPosition(seed, cx, cy, 21) % 32),
            y: dy * 32 + (hashPosition(seed, cx, cy, 22) % 32),
            radius: 5 + (hashPosition(seed, cx, cy, 23) % 12),
          });
        }
      row.set(gx, values);
    }
    return values;
  }
  return (x: bigint, y: bigint): Cell => {
    charge();
    let elevation = 32768,
      biome = "grassland",
      water = false;
    let moisture = 0.5,
      temperature = 0.5;
    if (request.preset === "chess") biome = (x + y) % 2n === 0n ? "white" : "black";
    else if (request.preset === "maze") {
      biome = maze(x, y) ? "path" : "wall";
      elevation = biome === "wall" ? 50000 : 15000;
    } else if (request.preset === "arena") {
      const lx = Number(x % 64n),
        ly = Number(y % 64n);
      const border = lx === 0 || lx === 63 || ly === 0 || ly === 63;
      const gate =
        (lx >= 29 && lx <= 34 && (ly === 0 || ly === 63)) ||
        (ly >= 29 && ly <= 34 && (lx === 0 || lx === 63));
      biome =
        border && !gate
          ? "wall"
          : lx >= 26 && lx <= 37 && ly >= 26 && ly <= 37
            ? "arena-center"
            : "arena-floor";
      elevation = biome === "wall" ? 50000 : 20000;
    } else {
      const offsetX = Number(x) - request.window.x,
        offsetY = Number(y) - request.window.y;
      let height =
        (1 - roughness) * coarse(offsetX, offsetY) +
        roughness * (0.7 * detail(offsetX, offsetY) + 0.3 * fine(offsetX, offsetY));
      moisture = Math.max(0, Math.min(1, humidity(offsetX, offsetY) + wetness - 0.5));
      temperature = Math.max(0, Math.min(1, climate(offsetX, offsetY) + warmth - 0.5));
      if (request.preset === "islands" || request.preset === "sky-islands")
        height = Math.max(0, Math.min(1, (height - 0.45) * 1.65 + 0.45));
      if (request.preset === "wetlands") height = 0.5 + (height - 0.5) * 0.4;
      if (request.preset === "moon") {
        height = 0.52 + (height - 0.5) * 0.22;
        const localX = Number(x) % 32,
          localY = Number(y) % 32;
        for (const crater of craters(x, y)) {
          const px = crater.x - localX,
            py = crater.y - localY;
          const distance = Math.sqrt(px * px + py * py) / crater.radius;
          if (distance < 1) height -= 0.22 * (1 - distance * distance);
          else if (distance < 1.2) height += 0.07 * (1 - (distance - 1) / 0.2);
        }
      }
      elevation = Math.round(65535 * Math.max(0, Math.min(1, height)));
      water = elevation < seaLevel;
      biome = water
        ? "ocean"
        : elevation < seaLevel + 1500
          ? "beach"
          : elevation > 49000
            ? "mountain"
            : temperature < 0.24
              ? "tundra"
              : moisture < 0.3
                ? "desert"
                : moisture > 0.6
                  ? "forest"
                  : "grassland";
      switch (request.preset) {
        case "hell":
          biome = water ? "lava" : elevation > 42000 ? "basalt" : "ash";
          water = false;
          break;
        case "sky-islands":
          biome = water ? "void" : elevation > 49000 ? "sky-stone" : "sky-meadow";
          water = false;
          break;
        case "ocean":
          biome =
            elevation < seaLevel - 12000
              ? "deep-ocean"
              : elevation < seaLevel - 3000
                ? "ocean"
                : water
                  ? "reef"
                  : biome;
          break;
        case "moon":
          biome = elevation < 27000 ? "crater" : elevation > 35500 ? "crater-rim" : "regolith";
          water = false;
          break;
        case "wetlands":
          biome = water ? "water" : moisture > 0.8 ? "fungal-grove" : "marsh";
          break;
      }
    }
    const custom = request.biomes.find(
      (b) =>
        elevation >= b.minElevation &&
        elevation <= b.maxElevation &&
        moisture >= b.minMoisture &&
        moisture <= b.maxMoisture &&
        temperature >= b.minTemperature &&
        temperature <= b.maxTemperature,
    );
    if (custom) {
      biome = custom.id;
      water = custom.water;
    }
    return { elevation, biome, water };
  };
}
