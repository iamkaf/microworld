import { biomeColor, tileColor } from "../palette.ts";
import type { World } from "./world.ts";

const SIZE = 8;
const water = new Set(["ocean", "deep-ocean", "shallow-water", "reef", "water", "river"]);
const atlas = new Map<string, HTMLCanvasElement>();
const patterns: Record<string, string[]> = {
  mountain: [
    "...a....",
    "..aba...",
    "..abb...",
    ".abccb..",
    ".bccddb.",
    "abccdddb",
    "bccddddb",
    "ccdddddd",
  ],
  forest: [
    "........",
    "........",
    "........",
    "..a.....",
    ".aaa....",
    "........",
    "........",
    "........",
  ],
  canopy: [
    "..a.a...",
    ".abbbba.",
    "abbcbbba",
    "abbcbbaa",
    ".bbbbaaa",
    "abbaaada",
    ".aaadda.",
    "..adda..",
  ],
  grassland: [
    "........",
    "........",
    "..a.....",
    ".aaa....",
    "........",
    "......a.",
    ".....aaa",
    "........",
  ],
  water: [
    "........",
    "..aa....",
    "....a...",
    "........",
    "........",
    "......aa",
    "a.......",
    "........",
  ],
  desert: [
    "........",
    "..aaa...",
    ".a......",
    "........",
    "........",
    ".....aaa",
    "....a...",
    "........",
  ],
  stone: [
    "..aa....",
    ".abba...",
    "abbbca..",
    "abbcca..",
    ".acca...",
    "........",
    ".....aa.",
    "....acca",
  ],
};
function stamp(
  context: CanvasRenderingContext2D,
  pattern: string[],
  palette: Record<string, string>,
) {
  pattern.forEach((row, y) =>
    [...row].slice(0, SIZE).forEach((c, x) => {
      if (!palette[c]) return;
      context.fillStyle = palette[c];
      context.fillRect(x, y, 1, 1);
    }),
  );
}
function tile(id: string, edges = 0): HTMLCanvasElement {
  const key = `${id}:${edges}`;
  const cached = atlas.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext("2d")!;
  c.fillStyle = biomeColor(id);
  c.fillRect(0, 0, SIZE, SIZE);
  if (water.has(id) || id === "lava") {
    stamp(c, patterns.water, {
      a: id === "lava" ? "#f6a646" : id === "deep-ocean" ? "#4066a4" : "#799ec9",
    });
    c.fillStyle = id === "lava" ? "#7e4837" : "#b9d3d1";
    if (edges & 1) c.fillRect(0, 0, SIZE, 1);
    if (edges & 2) c.fillRect(SIZE - 1, 0, 1, SIZE);
    if (edges & 4) c.fillRect(0, SIZE - 1, SIZE, 1);
    if (edges & 8) c.fillRect(0, 0, 1, SIZE);
  } else if (["mountain", "snow", "sky-stone"].includes(id)) {
    c.fillStyle = id === "snow" ? "#d8ddd2" : "#6c8551";
    c.fillRect(0, 0, SIZE, SIZE);
    stamp(c, patterns.mountain, { a: "#e1d9bd", b: "#a49a81", c: "#796f62", d: "#514f48" });
  } else if (id === "forest") {
    stamp(c, patterns.forest, { a: "#4e7b35" });
  } else if (
    ["grassland", "marsh", "sky-meadow", "foothills", "fungal-grove", "tundra"].includes(id)
  ) {
    stamp(c, patterns.forest, { a: id === "fungal-grove" ? "#796589" : "#709c43" });
  } else if (id === "beach" || id === "desert") {
    stamp(c, patterns.desert, { a: "#b8a570" });
  } else if (["regolith", "crater", "crater-rim", "basalt", "ash"].includes(id)) {
    stamp(c, patterns.stone, { a: "#72727a", b: "#9b9a9d", c: "#5c5c68" });
  } else if (id.startsWith("tile:")) {
    const name = id.slice(5);
    c.fillStyle = tileColor(name);
    c.fillRect(0, 0, SIZE, SIZE);
    if (name.startsWith("oak-") || name.startsWith("palm-")) {
      stamp(c, patterns.canopy, { a: "#355b29", b: "#4f7d35", c: "#668f40", d: "#294b26" });
    } else if (name === "wall") {
      c.fillStyle = "#d2c4a3";
      c.fillRect(0, 0, 8, 2);
      c.fillStyle = "#514a3d";
      c.fillRect(0, 7, 8, 1);
      c.fillRect(3, 3, 2, 3);
    } else if (name === "floor" || name === "road") {
      c.fillStyle = name === "floor" ? "#a18453" : "#b49a6a";
      c.fillRect(0, 3, 8, 1);
      c.fillRect(4, 0, 1, 3);
      c.fillRect(2, 4, 1, 4);
    } else if (name === "door") {
      c.fillStyle = "#2e302b";
      c.fillRect(1, 1, 6, 7);
    }
  }
  atlas.set(key, canvas);
  return canvas;
}

export function paintRpg(target: HTMLCanvasElement, data: World) {
  const { width, height } = data.window;
  target.width = width * SIZE;
  target.height = height * SIZE;
  const c = target.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const biome = data.biome[y * width + x];
      let edges = 0;
      if (water.has(biome)) {
        if (y > 0 && !water.has(data.biome[(y - 1) * width + x])) edges |= 1;
        if (x < width - 1 && !water.has(data.biome[y * width + x + 1])) edges |= 2;
        if (y < height - 1 && !water.has(data.biome[(y + 1) * width + x])) edges |= 4;
        if (x > 0 && !water.has(data.biome[y * width + x - 1])) edges |= 8;
      }
      c.drawImage(tile(biome, edges), x * SIZE, y * SIZE);
    }
  const trees = data.objects.filter((object) =>
    object.template?.some((row) =>
      row.some((t) => t?.startsWith("oak-") || t?.startsWith("palm-")),
    ),
  );
  const canopyIds = new Set(trees.map((object) => object.id));
  for (const t of data.tiles) {
    if (!canopyIds.has(t.objectId))
      c.drawImage(
        tile(`tile:${t.tile}`),
        (t.x - data.window.x) * SIZE,
        (t.y - data.window.y) * SIZE,
      );
  }
  for (const object of trees) {
    c.drawImage(
      treeSprite(),
      (object.x - data.window.x) * SIZE,
      (object.y - data.window.y) * SIZE,
      object.width * SIZE,
      object.height * SIZE,
    );
  }
  for (const object of data.objects) {
    if (object.template) continue;
    c.fillStyle = "#51483c";
    c.fillRect((object.x - data.window.x) * SIZE + 2, (object.y - data.window.y) * SIZE + 2, 4, 4);
  }
}
function treeSprite() {
  const cached = atlas.get("tree-sprite");
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const c = canvas.getContext("2d")!;
  stamp(
    c,
    [
      "...aa...",
      "..abba..",
      ".abcbba.",
      "abccbbba",
      "abbbbbaa",
      ".abbaaa.",
      "..adda..",
      "...dd...",
    ],
    { a: "#294d25", b: "#46782f", c: "#68963d", d: "#765637" },
  );
  atlas.set("tree-sprite", canvas);
  return canvas;
}

/** Original small explorer sprite for checking movement against exported collision data. */
export function drawExplorer(c: CanvasRenderingContext2D, x: number, y: number, cell: number) {
  const sprite = [
    "...hhhh...",
    "..hhhhhh..",
    "..hffffh..",
    "..ffefff..",
    "...ffff...",
    "..bccccb..",
    ".bbccccbb.",
    ".fbccccbf.",
    "..bbccbb..",
    "...b..b...",
    "..ss..ss..",
  ];
  const palette: Record<string, string> = {
    h: "#55402d",
    f: "#e9b783",
    e: "#302b2a",
    b: "#294b80",
    c: "#587eac",
    s: "#44372b",
  };
  const pixel = cell / 9;
  c.fillStyle = "#18282155";
  c.fillRect(x + cell * 0.1, y + cell * 0.8, cell * 0.8, cell * 0.2);
  sprite.forEach((row, sy) =>
    [...row].forEach((color, sx) => {
      if (!palette[color]) return;
      c.fillStyle = palette[color];
      c.fillRect(x + sx * pixel, y + (sy - 3) * pixel, Math.ceil(pixel), Math.ceil(pixel));
    }),
  );
}
