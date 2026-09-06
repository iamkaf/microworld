import { biomeColor } from "./palette.ts";
interface MapData {
  window: { x: number; y: number; width: number; height: number };
  elevation: number[];
  biome: string[];
}
const colors = new Map<string, number[]>();

/** Relief comes from the returned elevation, not invented display-only terrain. */
export function terrainColor(data: MapData, i: number): string {
  const biome = data.biome[i];
  let rgb = colors.get(biome);
  if (!rgb) {
    rgb = biomeColor(biome)
      .slice(1)
      .match(/../g)!
      .map((c) => Number.parseInt(c, 16));
    colors.set(biome, rgb);
  }
  if (["white", "black", "void", "wall", "path", "arena-center", "arena-floor"].includes(biome))
    return biomeColor(biome);
  const { width, height } = data.window;
  const x = i % width,
    y = Math.floor(i / width);
  const dx =
    data.elevation[y * width + Math.min(width - 1, x + 1)] -
    data.elevation[y * width + Math.max(0, x - 1)];
  const dy =
    data.elevation[Math.min(height - 1, y + 1) * width + x] -
    data.elevation[Math.max(0, y - 1) * width + x];
  const isWater = [
    "ocean",
    "deep-ocean",
    "shallow-water",
    "reef",
    "water",
    "river",
    "lava",
  ].includes(biome);
  // A few discrete map shades keep block-height steps legible at a glance.
  const slope = isWater ? 0 : dx + dy > 512 ? -0.12 : dx + dy < -512 ? 0.08 : 0;
  const light = 1 + slope;
  return `#${rgb
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c * light)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
