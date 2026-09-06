/** Default walking rules for the bundled game preview and exported collision mask. */
const barriers = new Set(["mountain", "snow", "sky-stone", "wall", "void", "lava"]);
const solidTiles = new Set([
  "tree-trunk",
  "wall",
  "stone",
  "pillar",
  "oak-leaves",
  "oak-crown",
  "oak-shadow",
  "palm-leaf",
  "palm-crown",
  "mushroom-cap",
  "mushroom-spot",
]);
export function canWalk(biome: string, water: boolean | undefined): boolean {
  return !water && !barriers.has(biome);
}
export function canWalkOnTile(tile: string): boolean {
  return !solidTiles.has(tile);
}
