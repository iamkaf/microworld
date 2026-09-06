import type { WorldRequest } from "./schema.ts";
import { createMaze } from "./maze.ts";
import { createNoiseSampler, hashText } from "./random.ts";
import { createDrainage } from "./drainage.ts";
import { createFeatures } from "./landforms.ts";

export interface Cell {
  elevation: number;
  biome: string;
  water?: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (low: number, high: number, n: number) => {
  const t = clamp((n - low) / (high - low));
  return t * t * (3 - 2 * t);
};

export function createTerrain(request: WorldRequest, charge: () => void) {
  const seed = hashText(request.seed);
  const maze = createMaze(seed, charge);
  const ox = BigInt(request.window.x),
    oy = BigInt(request.window.y);
  const { scale, roughness, seaLevel } = request.terrain;
  const sea = seaLevel / 65535;
  const sampler = (size: number, salt: number) =>
    createNoiseSampler(seed, ox, oy, Math.max(2, Math.round(size)), salt);
  const continent = sampler(scale * 2, 100);
  const broad = sampler(scale, 101);
  const hills = sampler(scale / 2, 102);
  const detail = sampler(scale / 4, 103);
  const fine = sampler(scale / 8, 104);
  const grain = sampler(2, 105);
  const warpX = sampler(scale, 106),
    warpY = sampler(scale, 107);
  const ranges = sampler(scale, 108),
    ridges = sampler(scale / 3, 109);
  const humidity = sampler(scale, 110),
    climate = sampler(scale * 3, 111);
  const islands = createFeatures(
    seed,
    ox,
    oy,
    Math.max(24, Math.round(scale * 1.6)),
    130,
    charge,
    2,
  );
  const largeCraters = createFeatures(seed, ox, oy, 96, 140, charge);
  const smallCraters = createFeatures(seed, ox, oy, 24, 150, charge);
  const tinyCraters = createFeatures(seed, ox, oy, 8, 160, charge);
  const volcanoes = createFeatures(seed, ox, oy, 128, 170, charge);

  function field(x: number, y: number) {
    // Binary fractions preserve identical displacement at every window origin.
    const wx = x + Math.round((warpX(x, y) - 0.5) * scale * 0.7 * 256) / 256;
    const wy = y + Math.round((warpY(x, y) - 0.5) * scale * 0.7 * 256) / 256;
    const small = detail(wx, wy),
      tiny = fine(wx, wy);
    const texture = grain(x, y);
    const land = 0.5 * continent(wx, wy) + 0.32 * broad(wx, wy) + 0.18 * hills(wx, wy);
    const ridge = 1 - Math.abs(2 * ridges(wx, wy) - 1);
    const massif = smooth(0.4, 0.76, ranges(wx, wy));
    let height =
      0.18 + land * 0.56 + (small - 0.5) * roughness * 0.18 + (tiny - 0.5) * roughness * 0.08;
    height += massif * (0.04 + 0.18 * ridge ** 3) * smooth(sea - 0.02, sea + 0.16, height);
    return { wx, wy, small, tiny, texture, land, massif, height };
  }
  const drainage = createDrainage(seed, ox, oy, sea, (x, y) => field(x, y).height, charge);
  return (ax: bigint, ay: bigint): Cell => {
    charge();
    const x = Number(ax - ox),
      y = Number(ay - oy);
    const structured = ["chess", "maze", "arena"].includes(request.preset);
    const {
      wx,
      wy,
      small,
      tiny,
      texture,
      land,
      massif,
      height: initialHeight,
    } = structured
      ? { wx: x, wy: y, small: 0.5, tiny: 0.5, texture: 0.5, land: 0.5, massif: 0, height: 0.5 }
      : field(x, y);
    let height = initialHeight;
    let moisture = structured ? 0.5 : clamp(humidity(wx, wy) + request.terrain.moisture - 0.5);
    let temperature = structured
      ? 0.5
      : clamp(
          climate(wx, wy) + request.terrain.temperature - 0.5 - Math.max(0, height - 0.6) * 0.8,
        );
    let biome = "grassland",
      water = false;

    switch (request.preset) {
      case "chess":
        biome = (ax + ay) % 2n === 0n ? "white" : "black";
        height = 32768 / 65535;
        moisture = temperature = 0.5;
        break;
      case "maze":
        biome = maze(ax, ay) ? "path" : "wall";
        height = (biome === "wall" ? 50000 : 15000) / 65535;
        moisture = temperature = 0.5;
        break;
      case "islands":
      case "sky-islands":
      case "ocean": {
        height = 0.23 + land * 0.12;
        for (const island of islands(wx, wy)) {
          const angle = island.variant * Math.PI * 2;
          const px = wx - island.x,
            py = wy - island.y;
          const dx = (px * Math.cos(angle) - py * Math.sin(angle)) / island.radius;
          const dy =
            (px * Math.sin(angle) + py * Math.cos(angle)) /
            (island.radius * (0.55 + island.variant));
          const bearing = Math.atan2(dy, dx);
          const lobes =
            1 + 0.18 * Math.sin(bearing * 3 + angle) + 0.1 * Math.cos(bearing * 5 - angle);
          const distance = Math.hypot(dx, dy) / lobes;
          if (distance > 1.5) continue;
          const coast = (small - 0.5) * 0.2 + (tiny - 0.5) * 0.08;
          const shape = clamp(1 - distance * distance + coast);
          let peak = 0.23 + land * 0.12 + shape * (0.42 + island.variant * 0.16);
          if (request.preset === "ocean" && island.variant > 0.25) {
            // Reef rims surround a submerged lagoon; small saddles break the ring.
            const ring = Math.max(0, 1 - Math.abs(distance - 0.8) / 0.3);
            peak = 0.23 + land * 0.12 + ring * (0.3 + small * 0.18) + coast * 0.2 * ring;
          }
          height = Math.max(height, peak);
        }
        if (request.preset === "sky-islands") {
          biome = height < sea ? "void" : height > 0.72 ? "sky-stone" : "sky-meadow";
          break;
        }
        water = height < sea;
        biome = water
          ? height < sea - 0.15
            ? "deep-ocean"
            : height < sea - 0.05
              ? "ocean"
              : "reef"
          : height < sea + 0.025
            ? "beach"
            : height > 0.72
              ? "mountain"
              : moisture > 0.42
                ? "forest"
                : "grassland";
        break;
      }
      case "moon": {
        height = 0.48 + land * 0.14 + (texture - 0.5) * 0.015;
        let bowl = false,
          rim = false;
        for (const [features, depth] of [
          [largeCraters(x, y), 0.2],
          [smallCraters(x, y), 0.1],
          [tinyCraters(x, y), 0.035],
        ] as const) {
          for (const crater of features) {
            if (crater.variant < 0.22) continue;
            const d = Math.hypot(x - crater.x, y - crater.y) / crater.radius;
            if (d > 1.5) continue;
            if (d < 1) {
              height -= depth * (1 - d * d);
              bowl = true;
              if (crater.radius > 22) height += depth * 0.3 * Math.max(0, 1 - d / 0.2);
            }
            height += depth * 0.3 * Math.exp(-(((d - 1.04) / 0.12) ** 2));
            if (d > 0.88 && d < 1.18) rim = true;
          }
        }
        biome = rim ? "crater-rim" : bowl ? "crater" : "regolith";
        break;
      }
      case "hell": {
        const fissure = Math.abs(ridges(wx, wy) - 0.5);
        height = 0.32 + land * 0.36 + (tiny - 0.5) * 0.06;
        let caldera = false;
        for (const volcano of volcanoes(x, y)) {
          if (volcano.variant < 0.35) continue;
          const d = Math.hypot(x - volcano.x, y - volcano.y) / volcano.radius;
          if (d < 1) height = Math.max(height, 0.48 + (1 - d) * 0.4);
          if (d < 0.18) {
            height -= 0.2 * (1 - d / 0.18);
            caldera = true;
          }
        }
        biome =
          caldera || height < sea || (fissure < 0.035 && height < 0.65)
            ? "lava"
            : height > 0.65
              ? "basalt"
              : "ash";
        break;
      }
      case "wetlands": {
        const period = Math.max(16, Math.round(scale));
        const channel = Math.abs(
          Math.sin(
            ((Number(ax % BigInt(period)) + (warpX(x, y) - 0.5) * period * 2) / period) * Math.PI,
          ),
        );
        const tributary = Math.abs(hills(wx, wy) - 0.5);
        const flooded = Math.max(clamp((0.2 - channel) / 0.2), clamp((0.045 - tributary) / 0.045));
        height = 0.48 + (land - 0.5) * 0.14 - flooded * 0.13 + (tiny - 0.5) * 0.025;
        water = height < sea;
        moisture = clamp(0.7 + flooded * 0.3 + (small - 0.5) * 0.3);
        biome = water
          ? "water"
          : height < sea + 0.028
            ? "marsh"
            : small > 0.58
              ? "fungal-grove"
              : "grassland";
        break;
      }
      case "arena": {
        const lx = Number(ax % 64n) - 31.5,
          ly = Number(ay % 64n) - 31.5;
        const radius = Math.hypot(lx, ly);
        const gate = Math.abs(lx) < 3 || Math.abs(ly) < 3;
        biome =
          radius > 29
            ? "grassland"
            : radius > 24 && !gate
              ? "wall"
              : radius > 21
                ? "path"
                : radius < 6
                  ? "arena-center"
                  : "arena-floor";
        if (Math.abs(lx) > 9 && Math.abs(lx) < 12 && Math.abs(ly) > 9 && Math.abs(ly) < 12)
          biome = "wall";
        height = biome === "wall" ? 0.7 : 0.35;
        break;
      }
      default: {
        water = height < sea;
        biome = water
          ? height < sea - 0.1
            ? "deep-ocean"
            : height < sea - 0.03
              ? "ocean"
              : "shallow-water"
          : height < sea + 0.018
            ? "beach"
            : height > 0.8
              ? "snow"
              : height > 0.67
                ? "mountain"
                : height > 0.59 && massif > 0.45
                  ? "foothills"
                  : temperature < 0.2
                    ? "tundra"
                    : moisture < 0.28
                      ? "desert"
                      : moisture > 0.52 + (small - 0.5) * 0.18
                        ? "forest"
                        : "grassland";
        if (!water) {
          const bank = drainage(x, y);
          if (bank < 0) {
            height -= 0.025;
            biome = "river";
            water = true;
          } else if (bank < 2.5) {
            height -= 0.015 * (1 - bank / 2.5);
            if (biome === "desert" || biome === "grassland") biome = "grassland";
          }
        }
      }
    }
    const elevation = structured
      ? Math.round(clamp(height) * 65535)
      : Math.min(65535, Math.round(clamp(height) * 128) * 512);
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
