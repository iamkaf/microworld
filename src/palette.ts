/** Display colors only. They have no effect on deterministic generation. */
export const BIOME_COLORS: Record<string, string> = {
  "shallow-water": "#557dbe",
  river: "#4879c2",
  foothills: "#738957",
  snow: "#e5e7df",
  ocean: "#365fb0",
  "deep-ocean": "#294885",
  reef: "#57b3bb",
  beach: "#ded09b",
  grassland: "#79a548",
  forest: "#568339",
  desert: "#d6c38a",
  mountain: "#a5aaa2",
  tundra: "#c5d3ce",
  white: "#e2dfd6",
  black: "#404943",
  lava: "#dc7048",
  ash: "#71615e",
  basalt: "#393b42",
  void: "#222833",
  "sky-meadow": "#88b86b",
  "sky-stone": "#d9dfd9",
  water: "#486e91",
  marsh: "#7f9450",
  "fungal-grove": "#997f9c",
  regolith: "#96969c",
  crater: "#81818b",
  "crater-rim": "#a6a5ac",
  path: "#d8cbae",
  wall: "#454b45",
  "arena-floor": "#b9b19e",
  "arena-center": "#d8c9a5",
};

export function biomeColor(biome: string): string {
  return BIOME_COLORS[biome] ?? "#89938b";
}

const TILE_COLORS: Record<string, string> = {
  "tree-trunk": "#725438",
  road: "#c0a574",
  "oak-leaves": "#42752e",
  "oak-crown": "#588c37",
  "oak-shadow": "#315b27",
  "palm-leaf": "#488632",
  "palm-crown": "#67a343",
  "mushroom-cap": "#ba4940",
  "mushroom-spot": "#eee2c9",
  wall: "#77593e",
  floor: "#b79b66",
  door: "#4a382a",
  stone: "#8b8c81",
  pillar: "#bcbba7",
  altar: "#977a9a",
  steps: "#a39d86",
};
export function tileColor(tile: string): string {
  return TILE_COLORS[tile] ?? "#b79b66";
}
