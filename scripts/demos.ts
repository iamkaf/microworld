import { mkdir, writeFile } from "node:fs/promises";
import { generateWorld } from "../src/generate.ts";
import { PRESET_IDS, getPreset } from "../src/presets.ts";
import { VERSION } from "../src/schema.ts";
import { tileColor } from "../src/palette.ts";
import { terrainColor } from "../src/map-colors.ts";

type World = ReturnType<typeof generateWorld>;
await mkdir("public/demos", { recursive: true });
const worlds = new Map<string, World>();

// Choose useful, reproducible examples with visible terrain variation.
// This runs at build time; the initial page does not spend API requests.
for (const preset of PRESET_IDS) {
  let selected: World | undefined;
  let best = -Infinity;
  for (const offset of [0, 128, 256, 512]) {
    const world = generateWorld({
      generatorVersion: VERSION,
      seed: "little-adventure",
      preset,
      window: { x: offset, y: offset, width: 256, height: 256 },
    });
    const counts = new Map<string, number>();
    for (const biome of world.biome) counts.set(biome, (counts.get(biome) ?? 0) + 1);
    const entropy = [...counts.values()].reduce((sum, count) => {
      const fraction = count / world.biome.length;
      return sum - fraction * Math.log2(fraction);
    }, 0);
    const woodland = (counts.get("forest") ?? 0) / world.biome.length;
    const water =
      ["ocean", "deep-ocean", "shallow-water", "river"].reduce(
        (n, b) => n + (counts.get(b) ?? 0),
        0,
      ) / world.biome.length;
    const score =
      (preset === "rpg"
        ? Math.min(4, world.objects.filter((object) => object.object === "house").length) * 0.4
        : 0) +
      entropy +
      (["overworld", "rpg"].includes(preset)
        ? Math.min(woodland, 0.3) * 4 - Math.abs(water - 0.2) * 3
        : 0);
    if (score > best) {
      best = score;
      selected = world;
    }
  }
  worlds.set(preset, selected!);
  await writeFile(`public/demos/${preset}.json`, JSON.stringify(selected));
  console.log(
    `Bundled ${preset}: ${selected!.window.width} × ${selected!.window.height}, ${selected!.objects.length} objects`,
  );
}

// A visualization of real response data, kept as SVG so GitHub can display it.
const panels = ["overworld", "islands", "hell", "maze", "sky-islands", "wetlands"];
const pieces = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640" role="img" aria-labelledby="title desc">',
  '<title id="title">Microworld: six worlds, one API</title><desc id="desc">Actual generated overworld, islands, hell, maze, sky islands, and mushroom wetlands maps.</desc>',
  '<rect width="1200" height="640" rx="20" fill="#151716"/>',
  '<text x="40" y="63" fill="#f0f0e9" font-family="system-ui,sans-serif" font-size="32" font-weight="650">Microworld</text>',
  '<text x="40" y="94" fill="#a7ada6" font-family="system-ui,sans-serif" font-size="17">A seed. A window. A world to build on.</text>',
];
panels.forEach((preset, index) => {
  const world = worlds.get(preset)!;
  const ox = 40 + (index % 3) * 380,
    oy = 122 + Math.floor(index / 3) * 250;
  const paths = new Map<string, string[]>();
  const tiles = new Map(
    world.tiles.map((tile) => [
      (tile.y - world.window.y) * world.window.width + tile.x - world.window.x,
      tileColor(tile.tile),
    ]),
  );
  // Crop to a wide landscape window without changing the sampled data.
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 128; x++) {
      const i = (y * 2 + 56) * 256 + x * 2;
      const color = tiles.get(i) ?? terrainColor(world, i);
      const rows = paths.get(color) ?? [];
      rows.push(`M${x} ${y}h1v1h-1z`);
      paths.set(color, rows);
    }
  }
  pieces.push(
    `<svg x="${ox}" y="${oy}" width="360" height="202.5" viewBox="0 0 128 72" shape-rendering="crispEdges">`,
  );
  for (const [color, pathsForColor] of paths)
    pieces.push(`<path fill="${color}" d="${pathsForColor.join("")}"/>`);
  pieces.push("</svg>");
  pieces.push(
    `<text x="${ox}" y="${oy + 226}" fill="#d5d8d1" font-family="system-ui,sans-serif" font-size="15">${getPreset(preset)!.name}</text>`,
  );
});
pieces.push("</svg>");
await writeFile("public/readme-worlds.svg", pieces.join("\n"));
