import assert from "node:assert/strict";
import test from "node:test";
import { ValiError } from "valibot";
import { generateWorld } from "../src/generate.ts";

test("inherited template names are validation errors, never runtime exceptions", () => {
  for (const templates of [undefined, { constructor: [["tile"]] }]) {
    assert.throws(
      () =>
        generateWorld({
          seed: "template-name",
          templates,
          placements: [{ id: "object", object: "object", pitch: 8, template: "constructor" }],
        }),
      ValiError,
    );
  }
});

test("mixed rotations and competing rules agree across single-cell windows at both world edges", () => {
  const placements = [
    {
      id: "wide",
      object: "house",
      pitch: 8,
      minSpacing: 2,
      rotations: [0, 90, 180, 270],
      template: [
        ["a", null, "c"],
        ["d", "e", "f"],
      ],
    },
    {
      id: "tall",
      object: "tower",
      pitch: 4,
      width: 1,
      height: 5,
      rotations: [90, 270],
      minSpacing: 1,
    },
  ];
  let examinedObjects = 0;
  for (const origin of [0, Number.MAX_SAFE_INTEGER - 32]) {
    const input = { seed: "edges-and-turns", preset: "chess", placements };
    const whole = generateWorld({
      ...input,
      window: { x: origin, y: origin, width: 32, height: 32 },
    });
    examinedObjects += whole.objects.length;
    for (let dy = 0; dy < 32; dy += 3) {
      for (let dx = 0; dx < 32; dx += 3) {
        const x = origin + dx,
          y = origin + dy;
        const part = generateWorld({ ...input, window: { x, y, width: 1, height: 1 } });
        assert.equal(part.biome[0], whole.biome[dy * 32 + dx]);
        assert.deepEqual(
          part.objects,
          whole.objects.filter(
            (o) => o.x <= x && o.y <= y && x - o.x < o.width && y - o.y < o.height,
          ),
        );
        assert.deepEqual(
          part.tiles,
          whole.tiles.filter((t) => t.x === x && t.y === y),
        );
      }
    }
  }
  assert.ok(examinedObjects > 10);
});

test("maze passages form one connected network across a square of nine regions", () => {
  for (const origin of [0, 2 ** 48]) {
    const size = 96;
    const { biome } = generateWorld({
      seed: "nine-regions",
      preset: "maze",
      window: { x: origin, y: origin, width: size, height: size },
    });
    const queue = [biome.indexOf("path")];
    const seen = new Set<number>(queue);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      const x = current % size,
        y = Math.floor(current / size);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        const next = ny * size + nx;
        if (
          nx >= 0 &&
          nx < size &&
          ny >= 0 &&
          ny < size &&
          biome[next] === "path" &&
          !seen.has(next)
        ) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    assert.equal(seen.size, biome.filter((b) => b === "path").length);
  }
});
