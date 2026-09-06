import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ValiError } from "valibot";
import { generateWorld, WorkLimitError } from "../src/generate.ts";
import { hashPosition, hashText } from "../src/random.ts";
import { PRESET_IDS, getPreset } from "../src/presets.ts";
import { rotateTemplate } from "../src/templates.ts";
import { parseRequest } from "../src/schema.ts";

const placements = [
  {
    id: "houses",
    object: "house",
    pitch: 12,
    width: 3,
    height: 2,
    minSpacing: 3,
    template: [
      ["wall", "door", "wall"],
      ["floor", null, "floor"],
    ],
  },
  { id: "trees", object: "tree", pitch: 8, minSpacing: 2, probability: 0.6 },
];
type World = ReturnType<typeof generateWorld>;
function intersects(object: World["objects"][number], window: World["window"]) {
  return (
    object.x < window.x + window.width &&
    object.y < window.y + window.height &&
    object.x + object.width > window.x &&
    object.y + object.height > window.y
  );
}

test("defaults, repeatability, and serialization", () => {
  const world = generateWorld({ seed: "hello" });
  assert.equal(world.elevation.length, 256);
  assert.equal(world.biome.length, 256);
  assert.deepEqual(world, generateWorld({ seed: "hello" }));
  assert.deepEqual(world, JSON.parse(JSON.stringify(world)));
  assert.notDeepEqual(world.elevation, generateWorld({ seed: "different" }).elevation);
});

test("all windows agree with independently generated chunks, including large coordinates and world edges", () => {
  for (const origin of [0, 13, 2 ** 32, 2 ** 48, Number.MAX_SAFE_INTEGER - 48]) {
    const input = {
      seed: "seams",
      placements,
      window: { x: origin, y: origin, width: 48, height: 48 },
    };
    const whole = generateWorld(input);
    // Deliberately request in reverse order, with an unrelated request between them.
    for (const dy of [32, 16, 0])
      for (const dx of [32, 16, 0]) {
        generateWorld({ seed: "unrelated", preset: "chess" });
        const window = { x: origin + dx, y: origin + dy, width: 16, height: 16 };
        const chunk = generateWorld({ ...input, window });
        for (let row = 0; row < 16; row++) {
          assert.deepEqual(
            chunk.elevation.slice(row * 16, row * 16 + 16),
            whole.elevation.slice((dy + row) * 48 + dx, (dy + row) * 48 + dx + 16),
          );
          assert.deepEqual(
            chunk.biome.slice(row * 16, row * 16 + 16),
            whole.biome.slice((dy + row) * 48 + dx, (dy + row) * 48 + dx + 16),
          );
        }
        assert.deepEqual(
          chunk.objects,
          whole.objects.filter((object) => intersects(object, window)),
        );
        assert.deepEqual(
          chunk.tiles,
          whole.tiles.filter(
            (tile) =>
              tile.x >= window.x &&
              tile.y >= window.y &&
              tile.x - window.x < 16 &&
              tile.y - window.y < 16,
          ),
        );
      }
  }
});

test("placement order does not change selected objects; footprints and spacing hold", () => {
  const input = {
    seed: "spacing",
    preset: "chess",
    placements,
    window: { x: 0, y: 0, width: 128, height: 128 },
  };
  const world = generateWorld(input);
  assert.ok(world.objects.length > 20);
  assert.ok(world.tiles.length > 0);
  assert.deepEqual(
    world.objects,
    generateWorld({ ...input, placements: [...placements].reverse() }).objects,
  );
  for (let i = 0; i < world.objects.length; i++)
    for (let j = i + 1; j < world.objects.length; j++) {
      const a = world.objects[i],
        b = world.objects[j];
      const gap = Math.max(
        placements.find((p) => p.id === a.rule)!.minSpacing,
        placements.find((p) => p.id === b.rule)!.minSpacing,
      );
      assert.ok(
        a.x >= b.x + b.width + gap ||
          b.x >= a.x + a.width + gap ||
          a.y >= b.y + b.height + gap ||
          b.y >= a.y + a.height + gap,
      );
    }
});

test("templates crossing a chunk boundary are included with their original identity and clipped tiles", () => {
  const whole = generateWorld({
    seed: "crossing",
    placements,
    window: { x: 0, y: 0, width: 128, height: 128 },
  });
  const house = whole.objects.find((o) => o.width > 1 && (o.x % 16) + o.width > 16);
  assert.ok(house);
  const x = Math.floor(house.x / 16) * 16 + 16;
  const chunk = generateWorld({
    seed: "crossing",
    placements,
    window: { x, y: house.y, width: 16, height: 16 },
  });
  assert.deepEqual(
    chunk.objects.find((o) => o.id === house.id),
    house,
  );
  assert.ok(chunk.tiles.every((tile) => tile.x >= x));
});

test("terrain restrictions, probability, relief, and water proximity affect placement", () => {
  const window = { x: 0, y: 0, width: 64, height: 64 };
  const base = { id: "pieces", object: "piece", pitch: 4 };
  const run = (rule: object) =>
    generateWorld({ seed: "rules", preset: "chess", window, placements: [{ ...base, ...rule }] });
  assert.ok(run({ biomes: ["white"], maxRelief: 0 }).objects.length > 0);
  assert.ok(run({ biomes: ["white"] }).objects.every((o) => (o.x + o.y) % 2 === 0));
  for (const rule of [
    { probability: 0 },
    { biomes: ["ocean"] },
    { maxElevation: 100 },
    { minElevation: 40000 },
    { nearWater: 16 },
  ])
    assert.equal(run(rule).objects.length, 0);
  const wet = generateWorld({
    seed: "water",
    terrain: { seaLevel: 65535 },
    placements: [{ ...base, nearWater: 1 }],
  });
  assert.ok(wet.objects.length > 0);
  const flat = generateWorld({
    seed: "relief",
    window,
    placements: [{ ...base, width: 4, height: 4, maxRelief: 0 }],
  });
  // Terraced terrain has real flat building sites. Each accepted footprint must be flat.
  const unrestricted = generateWorld({
    seed: "relief",
    window,
    placements: [{ ...base, width: 4, height: 4 }],
  });
  assert.ok(flat.objects.length < unrestricted.objects.length);
  for (const object of flat.objects) {
    const footprint = generateWorld({
      seed: "relief",
      placements: [],
      window: { x: object.x, y: object.y, width: 4, height: 4 },
    });
    assert.equal(new Set(footprint.elevation).size, 1);
  }
});

test("last cell is addressable; chess alternates at the precision boundary", () => {
  const last = Number.MAX_SAFE_INTEGER - 1;
  const world = generateWorld({
    seed: "edge",
    preset: "chess",
    window: { x: last - 1, y: last, width: 2, height: 1 },
  });
  assert.deepEqual(world.biome, ["black", "white"]);
  assert.notEqual(
    hashPosition(hashText("seed"), 0n, 0n),
    hashPosition(hashText("seed"), 1n << 32n, 0n),
  );
  const nearEnd = generateWorld({
    seed: "precision",
    window: { x: last - 31, y: last - 31, width: 32, height: 32 },
  });
  assert.ok(new Set(nearEnd.elevation).size > 1);
  assert.notDeepEqual(
    nearEnd.elevation,
    generateWorld({ seed: "precision", window: { x: 0, y: 0, width: 32, height: 32 } }).elevation,
  );
});

test("rejects invalid and ambiguous input before generation", () => {
  for (const input of [
    { seed: "" },
    { seed: 1 },
    { seed: "a", unexpected: true },
    { seed: "a", generatorVersion: "v9" },
    { seed: "a", window: { x: -1, y: 0, width: 16, height: 16 } },
    { seed: "a", window: { x: 0.5, y: 0, width: 16, height: 16 } },
    { seed: "a", window: { x: Infinity, y: 0, width: 16, height: 16 } },
    { seed: "a", window: { x: Number.MAX_SAFE_INTEGER - 1, y: 0, width: 2, height: 1 } },
    { seed: "a", window: { x: 0, y: 0, width: 257, height: 1 } },
    { seed: "a", placements: [placements[0], placements[0]] },
    { seed: "a", placements: [{ ...placements[0], width: 2 }] },
    { seed: "a", placements: [{ ...placements[0], minElevation: 10, maxElevation: 5 }] },
  ])
    assert.throws(() => parseRequest(input), ValiError);
});

test("expensive placement requests terminate at a deterministic work limit", () => {
  assert.throws(
    () =>
      generateWorld({
        seed: "bounded",
        window: { x: 0, y: 0, width: 256, height: 256 },
        placements: [{ id: "water", object: "house", pitch: 4, nearWater: 16 }],
        preset: "chess",
      }),
    WorkLimitError,
  );
});

// Terrain and traversal refreshed within v1 at the maintainer's explicit request.
test("version 1 fixture", () => {
  const world = generateWorld({
    generatorVersion: "1",
    seed: "fixture",
    placements,
    window: { x: 1234, y: 5678, width: 32, height: 32 },
  });
  const digest = createHash("sha256").update(JSON.stringify(world)).digest("hex");
  assert.equal(digest, "4d9fe6cc45e01b1ad600a6b2f3340225bb6d5427c450a438ab8381f6b84e0692");
});

test("every preset fits the default work budget and reproduces from exported configuration", () => {
  for (const preset of PRESET_IDS) {
    const input = {
      seed: "a-small-adventure",
      preset,
      window: { x: 0, y: 0, width: 128, height: 128 },
    };
    const world = generateWorld(input);
    assert.equal(world.elevation.length, 16384);
    assert.ok(world.elevation.every((n) => Number.isInteger(n) && n >= 0 && n <= 65535));
    assert.deepEqual(generateWorld({ ...input, ...world.configuration }), world);
    const part = generateWorld({ ...input, window: { x: 27, y: 29, width: 16, height: 16 } });
    for (let row = 0; row < 16; row++)
      assert.deepEqual(
        part.biome.slice(row * 16, row * 16 + 16),
        world.biome.slice((29 + row) * 128 + 27, (29 + row) * 128 + 43),
      );
    assert.deepEqual(
      part.objects,
      world.objects.filter((o) => intersects(o, part.window)),
    );
  }
});

test("maze regions have connected interiors and matching gates across independently generated borders", () => {
  for (const origin of [0, 2 ** 48]) {
    const generate = (x: number, y: number) =>
      generateWorld({ seed: "labyrinth", preset: "maze", window: { x, y, width: 32, height: 32 } });
    const a = generate(origin, origin),
      right = generate(origin + 32, origin),
      bottom = generate(origin, origin + 32);
    for (let n = 0; n < 32; n++) {
      assert.equal(a.biome[n * 32 + 31], right.biome[n * 32]);
      assert.equal(a.biome[31 * 32 + n], bottom.biome[n]);
    }
    const seen = new Set<number>();
    const pending = [a.biome.indexOf("path")];
    while (pending.length) {
      const index = pending.pop()!;
      if (seen.has(index)) continue;
      seen.add(index);
      const x = index % 32,
        y = Math.floor(index / 32);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ])
        if (nx >= 0 && ny >= 0 && nx < 32 && ny < 32 && a.biome[ny * 32 + nx] === "path")
          pending.push(ny * 32 + nx);
    }
    assert.equal(seen.size, a.biome.filter((b) => b === "path").length);
  }
});

test("template references, quarter turns, and rotated boundary footprints are consistent", () => {
  assert.deepEqual(
    rotateTemplate(
      [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
      90,
    ),
    [
      ["d", "a"],
      ["e", "b"],
      ["f", "c"],
    ],
  );
  const input = {
    seed: "turns",
    preset: "chess",
    templates: {
      custom: [
        ["a", "b", "c"],
        ["d", null, "f"],
      ],
    },
    placements: [
      {
        id: "turns",
        object: "house",
        pitch: 8,
        template: "custom",
        rotations: [90],
        minSpacing: 2,
      },
    ],
    window: { x: 0, y: 0, width: 64, height: 64 },
  };
  const whole = generateWorld(input);
  assert.ok(whole.objects.length > 0);
  assert.ok(whole.objects.every((o) => o.rotation === 90 && o.width === 2 && o.height === 3));
  const window = { x: 13, y: 15, width: 16, height: 16 };
  assert.deepEqual(
    generateWorld({ ...input, window }).objects,
    whole.objects.filter((o) => intersects(o, window)),
  );
  assert.throws(
    () =>
      generateWorld({
        seed: "x",
        placements: [{ id: "bad", object: "bad", pitch: 8, template: "missing" }],
      }),
    ValiError,
  );
});

test("custom biomes override by first match and expose water to placement", () => {
  const world = generateWorld({
    seed: "custom",
    preset: "chess",
    biomes: [{ id: "pond", water: true }, { id: "unused" }],
    placements: [{ id: "boats", object: "boat", pitch: 4, nearWater: 0, biomes: ["pond"] }],
  });
  assert.ok(world.biome.every((b) => b === "pond"));
  assert.ok(world.objects.length > 0);
  assert.equal(generateWorld({ seed: "custom", placements: [] }).objects.length, 0);
  const details = getPreset("overworld")!;
  details.configuration.placements[0].object = "mutated";
  assert.equal(getPreset("overworld")!.configuration.placements[0].object, "tree");
});
