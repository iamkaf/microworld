import assert from "node:assert/strict";
import test from "node:test";
import { generateWorld } from "../src/generate.ts";
import { PRESET_IDS } from "../src/presets.ts";
import { findSpawn, step } from "../src/client/explorer.ts";

test("landforms, drainage and collision masks agree across windows at ordinary and extreme coordinates", () => {
  for (const preset of PRESET_IDS)
    for (const origin of [0, 2 ** 48, Number.MAX_SAFE_INTEGER - 64]) {
      const input = {
        seed: "terrain-seams",
        preset,
        window: { x: origin, y: origin, width: 64, height: 64 },
      };
      const whole = generateWorld(input);
      const part = generateWorld({
        ...input,
        window: { x: origin + 13, y: origin + 17, width: 32, height: 32 },
      });
      for (const field of ["elevation", "biome", "walkable"] as const)
        for (let row = 0; row < 32; row++) {
          assert.deepEqual(
            part[field].slice(row * 32, row * 32 + 32),
            whole[field].slice((row + 17) * 64 + 13, (row + 17) * 64 + 45),
            `${preset}: ${field} at ${origin}`,
          );
        }
    }
});

test("maximum windows retain preset identity and fit the work budget across several seeds", () => {
  for (const seed of ["little-adventure", "brave-new-world", "north-star"]) {
    for (const preset of PRESET_IDS) {
      const world = generateWorld({
        seed,
        preset,
        window: { x: 128, y: 128, width: 256, height: 256 },
      });
      assert.equal(world.generatorVersion, "1");
      assert.equal(world.walkable.length, 65536);
      assert.ok(world.walkable.every((value) => typeof value === "boolean"));
      if (preset === "moon") {
        for (const biome of ["crater", "crater-rim", "regolith"])
          assert.ok(world.biome.includes(biome));
      }
      if (preset === "islands") {
        assert.ok(world.biome.includes("deep-ocean"));
        assert.ok(world.biome.includes("beach"));
        assert.ok(world.objects.some((object) => object.object === "palm"));
      }
      if (preset === "wetlands") {
        assert.ok(world.biome.includes("water"));
        assert.ok(world.tiles.some((tile) => tile.tile === "mushroom-cap"));
      }
    }
  }
});

test("settlement priority preserves buildings when vegetation competes for space", () => {
  const building = {
    id: "buildings",
    object: "house",
    pitch: 16,
    width: 6,
    height: 6,
    priority: 10,
  };
  const input = {
    seed: "priority",
    preset: "chess",
    window: { x: 0, y: 0, width: 64, height: 64 },
  };
  const alone = generateWorld({ ...input, placements: [building] });
  const mixed = generateWorld({
    ...input,
    placements: [building, { id: "trees", object: "tree", pitch: 4, width: 3, height: 3 }],
  });
  assert.ok(alone.objects.length > 0);
  assert.deepEqual(
    mixed.objects.filter((o) => o.object === "house"),
    alone.objects,
  );
});

test("template floors and doors are walkable, walls block, and explicit bridge tiles cross water", () => {
  const world = generateWorld({
    seed: "navigation",
    terrain: { seaLevel: 65535 },
    window: { x: 0, y: 0, width: 32, height: 32 },
    placements: [
      {
        id: "bridge",
        object: "bridge",
        pitch: 16,
        template: [
          ["wall", "door", "wall"],
          ["floor", "road", "floor"],
        ],
      },
    ],
  });
  assert.ok(world.tiles.length > 0);
  const tiles = new Map(
    world.tiles.map((tile) => [
      (tile.y - world.window.y) * 32 + tile.x - world.window.x,
      tile.tile,
    ]),
  );
  world.walkable.forEach((walkable, index) =>
    assert.equal(walkable, tiles.has(index) && tiles.get(index) !== "wall"),
  );
});

test("walking stays inside the largest reachable area and cannot cross walls or wrap rows", () => {
  const world = {
    window: { x: 0, y: 0, width: 5, height: 3 },
    walkable: [
      true,
      false,
      true,
      true,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
      false,
      true,
      true,
      true,
    ],
  };
  const spawn = findSpawn(world)!;
  assert.ok(spawn >= 2);
  assert.equal(step(world, 4, 1, 0), 4);
  assert.equal(step(world, 7, 1, 0), 7);
  assert.equal(step(world, 7, 0, -1), 2);
  assert.equal(step(world, 7, 1, 1), 7);
  assert.equal(findSpawn({ ...world, walkable: world.walkable.map(() => false) }), null);
});
