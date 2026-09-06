export type TileTemplate = (string | null)[][];
const hamletTiles: Record<string, string> = {
  "#": "wall",
  f: "floor",
  d: "door",
  r: "road",
  s: "stone",
};
const hamlet = [
  ".#####...#####.",
  ".#fff#...#fff#.",
  ".#fff#...#fff#.",
  ".##d##...##d##.",
  "...r.......r...",
  "...rrrrrrrrr...",
  ".......r.......",
  "....ss.r.ss....",
  "....sf.r.fs....",
  ".......r.......",
  ".......r.......",
].map((row) => [...row].map((cell) => hamletTiles[cell] ?? null));
export const BUILTIN_TEMPLATES: Record<string, TileTemplate> = {
  hamlet,
  pine: [
    [null, "oak-crown", null],
    ["oak-leaves", "oak-crown", "oak-shadow"],
    ["oak-leaves", "oak-leaves", "oak-shadow"],
    [null, "tree-trunk", null],
  ],
  oak: [
    [null, "oak-leaves", "oak-leaves", "oak-leaves", null],
    ["oak-leaves", "oak-crown", "oak-crown", "oak-crown", "oak-leaves"],
    ["oak-leaves", "oak-crown", "oak-crown", "oak-leaves", "oak-shadow"],
    ["oak-leaves", "oak-leaves", "oak-leaves", "oak-shadow", "oak-shadow"],
    [null, "oak-shadow", "oak-shadow", "oak-shadow", null],
  ],
  palm: [
    ["palm-leaf", null, "palm-leaf", null, "palm-leaf"],
    [null, "palm-leaf", "palm-leaf", "palm-leaf", null],
    ["palm-leaf", "palm-leaf", "palm-crown", "palm-leaf", "palm-leaf"],
    [null, "palm-leaf", "palm-leaf", "palm-leaf", null],
    ["palm-leaf", null, "palm-leaf", null, "palm-leaf"],
  ],
  mushroom: [
    [null, "mushroom-cap", "mushroom-cap", null],
    ["mushroom-cap", "mushroom-spot", "mushroom-cap", "mushroom-cap"],
    ["mushroom-cap", "mushroom-cap", "mushroom-spot", "mushroom-cap"],
    [null, "mushroom-cap", "mushroom-cap", null],
  ],
  cottage: [
    ["wall", "wall", "wall", "wall", "wall"],
    ["wall", "floor", "floor", "floor", "wall"],
    ["wall", "floor", "floor", "floor", "wall"],
    ["wall", "wall", "door", "wall", "wall"],
  ],
  ruin: [
    ["stone", null, "stone"],
    [null, "floor", null],
    ["stone", null, "stone"],
  ],
  shrine: [
    [null, "pillar", null],
    ["pillar", "altar", "pillar"],
    [null, "steps", null],
  ],
};
export function rotateTemplate(template: TileTemplate, rotation: number): TileTemplate {
  let rows = template.map((row) => [...row]);
  for (let turn = 0; turn < rotation / 90; turn++)
    rows = rows[0].map((_, x) => rows.map((row) => row[x]).reverse());
  return rows;
}
