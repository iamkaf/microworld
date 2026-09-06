/** Preset contents are part of generator version 1. Arrays replace, never append. */
export const PRESET_IDS = [
  "overworld",
  "chess",
  "rpg",
  "hell",
  "islands",
  "sky-islands",
  "ocean",
  "arena",
  "maze",
  "moon",
  "wetlands",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];
const descriptions: Record<PresetId, [string, string]> = {
  overworld: ["Overworld", "Continents, forests, deserts and mountain ranges."],
  chess: ["Infinite chess", "An alternating board ready for your own pieces."],
  rpg: ["RPG overworld", "Broad terrain with towns, ruins and woodland."],
  hell: ["Hell world", "Lava seas, ash wastes and basalt ridges."],
  islands: ["Islands", "Scattered islands and shallow sandy shores."],
  "sky-islands": ["Sky islands", "Floating meadows above an empty void."],
  ocean: ["Ocean world", "Deep water, reefs and rare islands."],
  arena: ["Arena", "Repeating 64-cell arenas with shared entrances."],
  maze: ["Maze", "Connected region mazes with matching border gates."],
  moon: ["Cratered moon", "Impact basins and mineral deposits."],
  wetlands: ["Mushroom wetlands", "Marshes, pools and fungal groves."],
};
const defaults = { scale: 80, seaLevel: 27000, roughness: 0.45, moisture: 0.55, temperature: 0.6 };
const tree = {
  id: "trees",
  object: "tree",
  pitch: 6,
  probability: 0.95,
  minSpacing: 0,
  biomes: ["forest"],
  template: "oak",
  rotations: [0, 90, 180, 270],
};
const scatteredTrees = {
  ...tree,
  id: "scattered-trees",
  pitch: 16,
  probability: 0.4,
  biomes: ["grassland"],
};
export function getPreset(id: string) {
  if (!PRESET_IDS.includes(id as PresetId)) return undefined;
  const preset = id as PresetId;
  const terrain = { ...defaults };
  const placements: Record<string, unknown>[] = [];
  switch (preset) {
    case "overworld":
      placements.push(tree, scatteredTrees);
      break;
    case "rpg":
      terrain.scale = 56;
      placements.push(
        { ...tree, template: "pine", pitch: 5 },
        { ...scatteredTrees, template: "pine" },
        {
          id: "towns",
          object: "house",
          priority: 10,
          pitch: 48,
          minSpacing: 8,
          biomes: ["grassland", "forest"],
          maxRelief: 8500,
          template: "hamlet",
          rotations: [0, 90, 180, 270],
        },
        {
          id: "ruins",
          object: "ruin",
          priority: 5,
          pitch: 40,
          probability: 0.3,
          template: "ruin",
          biomes: ["grassland", "forest", "desert"],
        },
      );
      break;
    case "hell":
      terrain.seaLevel = 31000;
      placements.push({
        id: "spires",
        object: "obsidian-spire",
        pitch: 16,
        probability: 0.4,
        biomes: ["basalt", "ash"],
      });
      break;
    case "islands":
      terrain.scale = 64;
      terrain.seaLevel = 32000;
      placements.push({
        ...tree,
        object: "palm",
        pitch: 9,
        probability: 0.6,
        template: "palm",
        biomes: ["beach", "grassland", "forest"],
      });
      break;
    case "sky-islands":
      terrain.scale = 64;
      terrain.seaLevel = 32000;
      placements.push({
        ...tree,
        object: "sky-tree",
        pitch: 9,
        probability: 0.6,
        biomes: ["sky-meadow"],
      });
      break;
    case "ocean":
      terrain.scale = 96;
      terrain.seaLevel = 42000;
      placements.push({
        id: "coral",
        object: "coral",
        pitch: 8,
        probability: 0.5,
        biomes: ["reef"],
      });
      break;
    case "moon":
      terrain.scale = 64;
      placements.push({ id: "minerals", object: "mineral", pitch: 16, probability: 0.2 });
      break;
    case "wetlands":
      terrain.scale = 64;
      terrain.seaLevel = 29000;
      terrain.moisture = 0.9;
      placements.push({
        id: "mushrooms",
        object: "giant-mushroom",
        pitch: 10,
        probability: 0.8,
        biomes: ["marsh", "fungal-grove"],
        minSpacing: 1,
        template: "mushroom",
      });
      break;
  }
  return {
    id: preset,
    name: descriptions[preset][0],
    description: descriptions[preset][1],
    generatorVersion: "1",
    configuration: { terrain, placements: structuredClone(placements), biomes: [], templates: {} },
  };
}
export function listPresets() {
  return PRESET_IDS.map((id) => {
    const p = getPreset(id)!;
    return { id, name: p.name, description: p.description };
  });
}
