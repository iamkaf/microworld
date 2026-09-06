import { mkdir, writeFile } from "node:fs/promises";
import { generateWorld } from "../src/generate.ts";
import { PRESET_IDS, getPreset } from "../src/presets.ts";
import { VERSION } from "../src/schema.ts";
import { biomeColor } from "../src/palette.ts";

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
      window: { x: offset, y: offset, width: 128, height: 128 },
    });
    const counts = new Map<string, number>();
    for (const biome of world.biome) counts.set(biome, (counts.get(biome) ?? 0) + 1);
    const entropy = [...counts.values()].reduce((sum, count) => {
      const fraction = count / world.biome.length;
      return sum - fraction * Math.log2(fraction);
    }, 0);
    if (entropy > best) {
      best = entropy;
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
  // Crop to a wide landscape window without changing the sampled data.
  for (let y = 0; y < 72; y++) {
    for (let x = 0; x < 128; x++) {
      const color = biomeColor(world.biome[y * 128 + x]);
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
