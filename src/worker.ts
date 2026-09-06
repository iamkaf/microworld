import { accepts, HttpError, json, readJson } from "./api/http.ts";
import { handleMcp, MCP_VERSION } from "./api/mcp.ts";
import { inputSchema, worldOutputSchema } from "./api/schemas.ts";
import {
  configuredLimits,
  presetDetails,
  presetList,
  publicError,
  world,
  type Env,
} from "./api/service.ts";
import { VERSION } from "./schema.ts";

export type { Env } from "./api/service.ts";
function corsHeaders(request: Request, env: Env, mcp: boolean): Headers {
  const headers = new Headers();
  if (mcp) {
    const origin = request.headers.get("Origin");
    if (origin !== null) {
      const allowed = env.MCP_ALLOWED_ORIGINS?.split(",").map((item) => item.trim()) ?? [
        new URL(request.url).origin,
        "https://microworld.kaf.sh",
      ];
      if (!allowed.includes(origin))
        throw new HttpError(
          403,
          "forbidden_origin",
          "This browser origin is not allowed to access MCP.",
        );
      headers.set("Access-Control-Allow-Origin", origin);
    }
    headers.set("Vary", "Origin");
  } else headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
  );
  headers.set(
    "Access-Control-Expose-Headers",
    "Allow, Accept-Query, Retry-After, MCP-Protocol-Version",
  );
  headers.set("Access-Control-Max-Age", "86400");
  if (mcp) headers.set("MCP-Protocol-Version", MCP_VERSION);
  else headers.set("Accept-Query", "application/json");
  return headers;
}

async function route(
  request: Request,
  env: Env,
  url: URL,
  mcp: boolean,
  headers: Headers,
): Promise<Response> {
  const methods = mcp
    ? "POST, OPTIONS"
    : url.pathname === "/api/world"
      ? "QUERY, OPTIONS"
      : "GET, OPTIONS";
  headers.set("Allow", methods);
  headers.set("Access-Control-Allow-Methods", methods);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!methods.split(", ").includes(request.method))
    throw new HttpError(405, "method_not_allowed", `Use ${methods}.`);
  if (env.RATE_LIMITER) {
    // Cloudflare supplies this header; do not use a caller-controlled forwarded IP.
    const key = request.headers.get("CF-Connecting-IP") ?? "local";
    if (!(await env.RATE_LIMITER.limit({ key })).success) {
      headers.set("Retry-After", "60");
      throw new HttpError(429, "rate_limited", "Request limit reached. Retry in 60 seconds.");
    }
  }
  if (mcp) return handleMcp(request, env);
  if (!accepts(request.headers.get("Accept"), "application/json"))
    throw new HttpError(406, "not_acceptable", "Accept must allow application/json.");
  const generatorVersion = url.searchParams.get("generatorVersion") ?? VERSION;
  if (url.pathname === "/api/world")
    return json(world(await readJson(request, configuredLimits(env).maxBodyBytes), env));
  if (url.pathname === "/api/presets") return json(presetList({ generatorVersion }));
  if (url.pathname.startsWith("/api/presets/")) {
    let id: string;
    try {
      id = decodeURIComponent(url.pathname.slice("/api/presets/".length));
    } catch {
      throw new HttpError(400, "invalid_path", "Invalid preset path encoding.");
    }
    return json(presetDetails({ id, generatorVersion }));
  }
  if (url.pathname === "/api/schema")
    return json({ generatorVersion: VERSION, input: inputSchema(), output: worldOutputSchema });
  if (url.pathname === "/api/capabilities")
    return json({
      generatorVersions: [VERSION],
      defaultGeneratorVersion: VERSION,
      chunkSize: 16,
      worldSize: Number.MAX_SAFE_INTEGER,
      coordinates: "nonnegative safe integers; half-open windows",
      limits: configuredLimits(env),
      mcpProtocolVersions: [MCP_VERSION],
      endpoints: {
        world: "/api/world",
        presets: "/api/presets",
        schema: "/api/schema",
        mcp: "/mcp",
      },
    });
  throw new HttpError(404, "not_found", "Endpoint not found.");
}

export async function handleRequest(request: Request, env: Env = {}): Promise<Response> {
  const url = new URL(request.url);
  const mcp = url.pathname === "/mcp";
  if (!mcp && !url.pathname.startsWith("/api/") && url.pathname !== "/api") {
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : json({ error: { code: "not_found", message: "Page not found." } }, 404);
  }
  let headers = new Headers();
  let response: Response;
  try {
    headers = corsHeaders(request, env, mcp);
    response = await route(request, env, url, mcp, headers);
  } catch (error) {
    const problem = publicError(error);
    response = json({ error: problem.error }, problem.status);
  }
  const responseHeaders = new Headers(response.headers);
  headers.forEach((value, name) => responseHeaders.set(name, value));
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export default { fetch: handleRequest };
