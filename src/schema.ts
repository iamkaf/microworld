import * as v from "valibot";

import { getPreset, PRESET_IDS } from "./presets.ts";
import { BUILTIN_TEMPLATES, type TileTemplate } from "./templates.ts";

function ownTemplate(templates: Record<string, TileTemplate> | undefined, id: string) {
  return templates && Object.hasOwn(templates, id) ? templates[id] : undefined;
}

export const VERSION = "1";
export const WORLD_SIZE = BigInt(Number.MAX_SAFE_INTEGER);
export const LIMITS = { maxCells: 65536, maxSide: 256, maxRules: 8, maxWork: 2_000_000 };
const integer = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));
const name = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_-]{0,63}$/));
const unit = v.pipe(v.number(), v.minValue(0), v.maxValue(1));
const template = v.pipe(
  v.array(v.pipe(v.array(v.nullable(name)), v.minLength(1), v.maxLength(16))),
  v.minLength(1),
  v.maxLength(16),
  v.check(
    (rows) => rows.every((row) => row.length === rows[0].length),
    "Template rows must have equal widths",
  ),
);
export const PlacementSchema = v.strictObject({
  id: name,
  object: name,
  pitch: integer(4, 64),
  probability: v.optional(unit, 1),
  priority: v.optional(integer(0, 100), 0),
  minSpacing: v.optional(integer(0, 32), 0),
  width: v.optional(integer(1, 16)),
  height: v.optional(integer(1, 16)),
  biomes: v.optional(v.pipe(v.array(name), v.minLength(1), v.maxLength(16))),
  minElevation: v.optional(integer(0, 65535), 0),
  maxElevation: v.optional(integer(0, 65535), 65535),
  maxRelief: v.optional(integer(0, 65535), 65535),
  nearWater: v.optional(integer(0, 16)),
  template: v.optional(v.union([name, template])),
  rotations: v.optional(
    v.pipe(v.array(v.picklist([0, 90, 180, 270])), v.minLength(1), v.maxLength(4)),
    [0],
  ),
});
const biomeDefinition = v.strictObject({
  id: name,
  minElevation: v.optional(integer(0, 65535), 0),
  maxElevation: v.optional(integer(0, 65535), 65535),
  minMoisture: v.optional(unit, 0),
  maxMoisture: v.optional(unit, 1),
  minTemperature: v.optional(unit, 0),
  maxTemperature: v.optional(unit, 1),
  water: v.optional(v.boolean(), false),
});
export const RequestSchema = v.pipe(
  v.strictObject({
    generatorVersion: v.optional(v.literal(VERSION), VERSION),
    seed: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
    preset: v.optional(v.picklist(PRESET_IDS), "overworld"),
    window: v.optional(
      v.strictObject({
        x: integer(0, Number.MAX_SAFE_INTEGER - 1),
        y: integer(0, Number.MAX_SAFE_INTEGER - 1),
        width: integer(1, LIMITS.maxSide),
        height: integer(1, LIMITS.maxSide),
      }),
      { x: 0, y: 0, width: 16, height: 16 },
    ),
    terrain: v.optional(
      v.strictObject({
        scale: v.optional(integer(4, 4096)),
        seaLevel: v.optional(integer(0, 65535)),
        roughness: v.optional(unit),
        moisture: v.optional(unit),
        temperature: v.optional(unit),
      }),
    ),
    biomes: v.optional(v.pipe(v.array(biomeDefinition), v.maxLength(32))),
    templates: v.optional(
      v.pipe(
        v.record(name, template),
        v.check((t) => Object.keys(t).length <= 32, "At most 32 templates"),
      ),
    ),
    placements: v.optional(v.pipe(v.array(PlacementSchema), v.maxLength(LIMITS.maxRules))),
  }),
  v.check(
    (r) =>
      [r.window.x, r.window.y, r.window.width, r.window.height].every(Number.isSafeInteger) &&
      BigInt(r.window.x) + BigInt(r.window.width) <= WORLD_SIZE &&
      BigInt(r.window.y) + BigInt(r.window.height) <= WORLD_SIZE,
    "Window exceeds world bounds",
  ),
  v.check((r) => r.window.width * r.window.height <= LIMITS.maxCells, "Window exceeds cell limit"),
  v.check(
    (r) => !r.placements || new Set(r.placements.map((p) => p.id)).size === r.placements.length,
    "Placement IDs must be unique",
  ),
  v.check(
    (r) =>
      !r.biomes ||
      (new Set(r.biomes.map((b) => b.id)).size === r.biomes.length &&
        r.biomes.every(
          (b) =>
            b.minElevation <= b.maxElevation &&
            b.minMoisture <= b.maxMoisture &&
            b.minTemperature <= b.maxTemperature,
        )),
    "Invalid or duplicate biome definitions",
  ),
  v.check(
    (r) =>
      !r.placements ||
      r.placements.every((p) => {
        const tiles =
          typeof p.template === "string"
            ? (ownTemplate(r.templates, p.template) ?? ownTemplate(BUILTIN_TEMPLATES, p.template))
            : p.template;
        return (
          p.minElevation <= p.maxElevation &&
          (!p.template || !!tiles) &&
          (!tiles ||
            ((!p.width || tiles[0].length === p.width) && (!p.height || tiles.length === p.height)))
        );
      }),
    "Invalid elevation range, unknown template, or template dimensions",
  ),
);
export type WorldInput = v.InferInput<typeof RequestSchema>;
export function parseRequest(input: unknown) {
  const raw = v.parse(RequestSchema, input);
  const preset = getPreset(raw.preset)!;
  const templates = { ...structuredClone(BUILTIN_TEMPLATES), ...raw.templates };
  const placements = (
    raw.placements ?? preset.configuration.placements.map((p) => v.parse(PlacementSchema, p))
  ).map((p) => {
    const tiles = typeof p.template === "string" ? ownTemplate(templates, p.template) : p.template;
    const { template: _reference, ...fields } = p;
    return {
      ...fields,
      width: p.width ?? tiles?.[0].length ?? 1,
      height: p.height ?? tiles?.length ?? 1,
      ...(tiles ? { template: tiles } : {}),
    };
  });
  return {
    ...raw,
    terrain: { ...preset.configuration.terrain, ...raw.terrain },
    biomes: raw.biomes ?? [],
    templates,
    placements,
  };
}
export type WorldRequest = ReturnType<typeof parseRequest>;
export type PlacementRule = WorldRequest["placements"][number];
