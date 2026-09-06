/** Display colors only. They have no effect on deterministic generation. */
export const BIOME_COLORS: Record<string, string> = {
  ocean: "#365a73",
  "deep-ocean": "#243c52",
  reef: "#548c91",
  beach: "#d8c59b",
  grassland: "#8f9f72",
  forest: "#506f58",
  desert: "#c6ac79",
  mountain: "#a5aaa2",
  tundra: "#c5d3ce",
  white: "#e2dfd6",
  black: "#404943",
  lava: "#dc7048",
  ash: "#71615e",
  basalt: "#393b42",
  void: "#222833",
  "sky-meadow": "#a0bcb2",
  "sky-stone": "#d9dfd9",
  water: "#557b79",
  marsh: "#a6aa76",
  "fungal-grove": "#997f9c",
  regolith: "#96969c",
  crater: "#616573",
  "crater-rim": "#bfc0ba",
  path: "#d8cbae",
  wall: "#454b45",
  "arena-floor": "#b9b19e",
  "arena-center": "#d8c9a5",
};

export function biomeColor(biome: string): string {
  return BIOME_COLORS[biome] ?? "#89938b";
}
