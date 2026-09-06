import { toJsonSchema } from "@valibot/to-json-schema";
import { RequestSchema, VERSION } from "../schema.ts";

/** Cross-field constraints (bounds, template dimensions) are also checked at runtime. */
export function inputSchema() {
  return toJsonSchema(RequestSchema, { errorMode: "ignore" });
}
const string = { type: "string" };
const integer = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const object = { type: "object" };
export const worldOutputSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: [
    "generatorVersion",
    "seed",
    "preset",
    "window",
    "chunkSize",
    "configuration",
    "elevation",
    "biome",
    "objects",
    "tiles",
  ],
  properties: {
    generatorVersion: { const: VERSION },
    seed: string,
    preset: string,
    window: {
      type: "object",
      required: ["x", "y", "width", "height"],
      properties: { x: integer, y: integer, width: integer, height: integer },
    },
    chunkSize: { const: 16 },
    configuration: object,
    elevation: { type: "array", items: { type: "integer", minimum: 0, maximum: 65535 } },
    biome: { type: "array", items: string },
    objects: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "rule", "object", "x", "y", "width", "height", "variantSeed"],
        properties: {
          id: string,
          rule: string,
          object: string,
          x: integer,
          y: integer,
          width: integer,
          height: integer,
        },
      },
    },
    tiles: {
      type: "array",
      items: {
        type: "object",
        required: ["x", "y", "tile", "objectId"],
        properties: { x: integer, y: integer, tile: string, objectId: string },
      },
    },
  },
};
const version = { type: "string", const: VERSION, default: VERSION };
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
export function toolDefinitions() {
  return [
    {
      name: "list_presets",
      title: "List world presets",
      description: "Discover deterministic world presets for the specified generator version.",
      inputSchema: {
        type: "object",
        properties: { generatorVersion: version },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        required: ["generatorVersion", "presets"],
        properties: { generatorVersion: version, presets: { type: "array", items: object } },
      },
      annotations,
    },
    {
      name: "get_preset",
      title: "Inspect a world preset",
      description:
        "Read a preset's resolved defaults and customization schema before generating a window.",
      inputSchema: {
        type: "object",
        properties: { id: string, generatorVersion: version },
        required: ["id"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        required: ["generatorVersion", "id", "configuration", "customizationSchema"],
        properties: {
          generatorVersion: version,
          id: string,
          configuration: object,
          customizationSchema: string,
        },
      },
      annotations,
    },
    {
      name: "generate_world",
      title: "Generate a world window",
      description:
        "Generate elevation, biomes, objects, and template tiles for a bounded window. Pin generatorVersion and save the resolved configuration for reproducibility. Coordinates are nonnegative safe integers; chunks are 16 by 16 cells. Identical inputs produce identical data without storing world state.",
      inputSchema: inputSchema(),
      outputSchema: worldOutputSchema,
      annotations,
    },
  ];
}
