import * as v from "valibot";
import { generateWorld, WorkLimitError } from "../generate.ts";
import { getPreset, listPresets } from "../presets.ts";
import { VERSION, LIMITS } from "../schema.ts";
import { HttpError } from "./http.ts";

export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  MCP_ALLOWED_ORIGINS?: string;
  MAX_BODY_BYTES?: string;
  MAX_CELLS?: string;
  MAX_SIDE?: string;
  MAX_RULES?: string;
  MAX_WORK?: string;
}
export function configuredLimits(env: Env) {
  function positive(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1)
      throw new Error("Invalid deployment limit configuration");
    return number;
  }
  return {
    maxCells: Math.min(positive(env.MAX_CELLS, LIMITS.maxCells), LIMITS.maxCells),
    maxSide: Math.min(positive(env.MAX_SIDE, LIMITS.maxSide), LIMITS.maxSide),
    maxRules: Math.min(positive(env.MAX_RULES, LIMITS.maxRules), LIMITS.maxRules),
    maxWork: positive(env.MAX_WORK, LIMITS.maxWork),
    maxBodyBytes: positive(env.MAX_BODY_BYTES, 256 * 1024),
  };
}
const versionSchema = v.strictObject({ generatorVersion: v.optional(v.literal(VERSION), VERSION) });
const presetSchema = v.strictObject({
  id: v.string(),
  generatorVersion: v.optional(v.literal(VERSION), VERSION),
});
export function presetList(input: unknown = {}) {
  const { generatorVersion } = v.parse(versionSchema, input);
  return { generatorVersion, presets: listPresets() };
}
export function presetDetails(input: unknown) {
  const { id, generatorVersion } = v.parse(presetSchema, input);
  const preset = getPreset(id);
  if (!preset)
    throw new HttpError(
      422,
      "unknown_preset",
      "Unknown preset. Use /api/presets to list available presets.",
    );
  return { ...preset, generatorVersion, customizationSchema: "/api/schema" };
}
export function world(input: unknown, env: Env) {
  return generateWorld(input, configuredLimits(env));
}
export function publicError(error: unknown): {
  status: number;
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
} {
  if (v.isValiError(error))
    return {
      status: 422,
      error: {
        code: "invalid_input",
        message: "Generation input is invalid.",
        issues: error.issues.map((issue) => ({
          path: issue.path?.map((item) => String(item.key)).join(".") ?? "",
          message: issue.message,
        })),
      },
    };
  if (error instanceof WorkLimitError)
    return { status: 422, error: { code: "work_limit_exceeded", message: error.message } };
  if (error instanceof HttpError)
    return { status: error.status, error: { code: error.code, message: error.message } };
  return {
    status: 500,
    error: { code: "internal_error", message: "The request could not be completed." },
  };
}
