import { hashPosition } from "./random.ts";

/** A spanning tree inside each 32-cell region, joined through shared edge gates. */
export function createMaze(seed: number, charge: () => void) {
  const regions = new Map<string, Uint8Array>();
  function region(rx: bigint, ry: bigint) {
    const key = `${rx}:${ry}`;
    const existing = regions.get(key);
    if (existing) return existing;
    const cells = new Uint8Array(32 * 32);
    const visited = new Uint8Array(225);
    const stack = [0];
    visited[0] = 1;
    let step = 0;
    while (stack.length) {
      charge();
      const current = stack[stack.length - 1];
      const x = current % 15,
        y = Math.floor(current / 15);
      cells[(y * 2 + 1) * 32 + x * 2 + 1] = 1;
      const options = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < 15 && ny < 15 && !visited[ny * 15 + nx]);
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [nx, ny] = options[hashPosition(seed, rx, ry, step++) % options.length];
      cells[(y + ny + 1) * 32 + x + nx + 1] = 1;
      visited[ny * 15 + nx] = 1;
      stack.push(ny * 15 + nx);
    }
    const gate = (x: bigint, y: bigint, salt: number) =>
      1 + 2 * (hashPosition(seed, x, y, salt) % 15);
    const left = gate(rx, ry, 810),
      right = gate(rx + 1n, ry, 810);
    const top = gate(rx, ry, 811),
      bottom = gate(rx, ry + 1n, 811);
    cells[left * 32] = 1;
    cells[right * 32 + 30] = cells[right * 32 + 31] = 1;
    cells[top] = 1;
    cells[30 * 32 + bottom] = cells[31 * 32 + bottom] = 1;
    regions.set(key, cells);
    return cells;
  }
  return (x: bigint, y: bigint) =>
    region(x / 32n, y / 32n)[Number(y % 32n) * 32 + Number(x % 32n)] === 1;
}
