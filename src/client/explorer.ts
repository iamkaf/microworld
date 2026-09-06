import type { World } from "./world.ts";

/** Start inside the largest reachable area, never on an isolated decoration or island pixel. */
export function findSpawn(
  world: Pick<World, "window" | "walkable"> & { tiles?: World["tiles"] },
): number | null {
  const { width, height } = world.window;
  const seen = new Uint8Array(width * height);
  let largest: number[] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !world.walkable[i]) continue;
    const cells = [i];
    seen[i] = 1;
    for (let head = 0; head < cells.length; head++) {
      const cell = cells[head],
        x = cell % width,
        y = Math.floor(cell / width);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!seen[next] && world.walkable[next]) {
          seen[next] = 1;
          cells.push(next);
        }
      }
    }
    if (cells.length > largest.length) largest = cells;
  }
  if (!largest.length) return null;
  const roads = new Set(
    (world.tiles ?? [])
      .filter((tile) => tile.tile === "road")
      .map((tile) => (tile.y - world.window.y) * width + tile.x - world.window.x),
  );
  const nearSettlement = largest.filter((i) => roads.has(i));
  return (nearSettlement.length ? nearSettlement : largest).reduce((best, i) => {
    const distance = (cell: number) =>
      Math.abs((cell % width) - width / 2) + Math.abs(Math.floor(cell / width) - height / 2);
    return distance(i) < distance(best) ? i : best;
  });
}

export function step(
  world: Pick<World, "window" | "walkable">,
  position: number,
  dx: number,
  dy: number,
): number {
  const { width, height } = world.window;
  const x = (position % width) + dx,
    y = Math.floor(position / width) + dy;
  if (Math.abs(dx) + Math.abs(dy) !== 1 || x < 0 || y < 0 || x >= width || y >= height)
    return position;
  return world.walkable[y * width + x] ? y * width + x : position;
}
