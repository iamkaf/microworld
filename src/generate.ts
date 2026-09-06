import { LIMITS, parseRequest } from "./schema.ts";
import { createTerrain } from "./terrain.ts";
import { placeObjects } from "./placement.ts";

export class WorkLimitError extends Error {
  constructor() {
    super("Generation work limit exceeded. Reduce the window or placement complexity.");
  }
}
export function generateWorld(input: unknown, limits: Partial<typeof LIMITS> = {}) {
  const request = parseRequest(input);
  const bounds = { ...LIMITS, ...limits };
  if (
    request.window.width > bounds.maxSide ||
    request.window.height > bounds.maxSide ||
    request.window.width * request.window.height > bounds.maxCells ||
    request.placements.length > bounds.maxRules
  )
    throw new WorkLimitError();
  let work = 0;
  const charge = () => {
    if (++work > bounds.maxWork) throw new WorkLimitError();
  };
  const terrain = createTerrain(request, charge);
  const elevation: number[] = [],
    biome: string[] = [];
  const { x, y, width, height } = request.window;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const cell = terrain(BigInt(x) + BigInt(dx), BigInt(y) + BigInt(dy));
      elevation.push(cell.elevation);
      biome.push(cell.biome);
    }
  }
  const objects = placeObjects(request, terrain, charge);
  const tiles: { x: number; y: number; tile: string; objectId: string }[] = [];
  for (const object of objects) {
    object.template?.forEach((row, dy) =>
      row.forEach((tile, dx) => {
        const px = object.x + dx,
          py = object.y + dy;
        if (tile !== null && px >= x && py >= y && px - x < width && py - y < height)
          tiles.push({ x: px, y: py, tile, objectId: object.id });
      }),
    );
  }
  return {
    generatorVersion: request.generatorVersion,
    seed: request.seed,
    preset: request.preset,
    window: request.window,
    chunkSize: 16,
    configuration: {
      terrain: request.terrain,
      placements: request.placements,
      biomes: request.biomes,
      templates: request.templates,
    },
    elevation,
    biome,
    objects,
    tiles,
  };
}
