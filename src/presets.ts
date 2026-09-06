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
const defaults = { scale: 128, seaLevel: 28000, roughness: 0.35, moisture: 0.5, temperature: 0.5 };
const tree = {
  id: "trees",
  object: "tree",
  pitch: 12,
  probability: 0.7,
  minSpacing: 2,
  biomes: ["forest", "grassland"],
};
export function getPreset(id: string) {
  if (!PRESET_IDS.includes(id as PresetId)) return undefined;
  const preset = id as PresetId;
  const terrain = { ...defaults };
  const placements: Record<string, unknown>[] = [];
  switch (preset) {
    case "overworld":
      placements.push(tree);
      break;
    case "rpg":
      terrain.scale = 96;
      placements.push(
        tree,
        {
          id: "towns",
          object: "house",
          pitch: 48,
          minSpacing: 8,
          biomes: ["grassland"],
          maxRelief: 7000,
          template: "cottage",
          rotations: [0, 90, 180, 270],
        },
        {
          id: "ruins",
          object: "ruin",
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
      terrain.scale = 72;
      terrain.seaLevel = 35000;
      placements.push({ ...tree, object: "palm", biomes: ["beach", "grassland", "forest"] });
      break;
    case "sky-islands":
      terrain.scale = 64;
      terrain.seaLevel = 38000;
      placements.push({ ...tree, object: "sky-tree", biomes: ["sky-meadow"] });
      break;
    case "ocean":
      terrain.scale = 96;
      terrain.seaLevel = 47000;
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
      terrain.seaLevel = 32000;
      terrain.moisture = 0.9;
      placements.push({
        id: "mushrooms",
        object: "giant-mushroom",
        pitch: 10,
        probability: 0.8,
        biomes: ["marsh", "fungal-grove"],
        minSpacing: 2,
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
