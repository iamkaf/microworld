import { accepts, isRecord, json, readJson, HttpError } from "./http.ts";
import {
  configuredLimits,
  presetDetails,
  presetList,
  publicError,
  world,
  type Env,
} from "./service.ts";
import { toolDefinitions } from "./schemas.ts";

export const MCP_VERSION = "2026-07-28";
const serverInfo = {
  name: "microworld",
  version: "1.0.0",
  websiteUrl: "https://microworld.kaf.sh",
};
const protocolKey = "io.modelcontextprotocol/protocolVersion";
const capabilitiesKey = "io.modelcontextprotocol/clientCapabilities";
type RpcId = string | number;
function failure(
  id: RpcId | undefined,
  code: number,
  message: string,
  status = 400,
  data?: unknown,
) {
  return json(
    {
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      error: { code, message, ...(data === undefined ? {} : { data }) },
    },
    status,
  );
}
function complete(id: RpcId, result: Record<string, unknown>) {
  return json({
    jsonrpc: "2.0",
    id,
    result: {
      ...result,
      resultType: "complete",
      _meta: { "io.modelcontextprotocol/serverInfo": serverInfo },
    },
  });
}
function decodeName(header: string | null): string | null {
  if (header === null) return null;
  if (/[^\x20-\x7e\t]/.test(header)) throw new Error("Malformed header");
  if (header.startsWith("=?base64?") && header.endsWith("?=")) {
    const encoded = header.slice(9, -2);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw new Error("Malformed base64");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
  }
  return header;
}

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (
    !request.headers.has("Accept") ||
    !accepts(request.headers.get("Accept"), "application/json") ||
    !accepts(request.headers.get("Accept"), "text/event-stream")
  )
    return failure(
      undefined,
      -32600,
      "Accept must allow application/json and text/event-stream.",
      406,
    );
  let body: unknown;
  try {
    body = await readJson(request, configuredLimits(env).maxBodyBytes);
  } catch (error) {
    const problem = publicError(error);
    return failure(
      undefined,
      error instanceof HttpError && error.code === "invalid_json" ? -32700 : -32600,
      problem.error.message,
      problem.status,
    );
  }
  if (
    !isRecord(body) ||
    body.jsonrpc !== "2.0" ||
    typeof body.method !== "string" ||
    !(typeof body.id === "string" || (typeof body.id === "number" && Number.isSafeInteger(body.id)))
  )
    return failure(
      undefined,
      -32600,
      "Expected a single JSON-RPC request with a string or integer id. Notifications are not supported.",
    );
  const id = body.id;
  const params = body.params;
  if (!isRecord(params) || !isRecord(params._meta))
    return failure(id, -32602, "params._meta is required on every request.");
  const meta = params._meta;
  if (typeof meta[protocolKey] !== "string" || !isRecord(meta[capabilitiesKey]))
    return failure(
      id,
      -32602,
      "Protocol version and client capabilities are required in params._meta.",
    );
  const info = meta["io.modelcontextprotocol/clientInfo"];
  if (
    info !== undefined &&
    (!isRecord(info) || typeof info.name !== "string" || typeof info.version !== "string")
  )
    return failure(id, -32602, "clientInfo must contain name and version strings.");
  try {
    if (
      request.headers.get("MCP-Protocol-Version") !== meta[protocolKey] ||
      request.headers.get("Mcp-Method") !== body.method
    )
      return failure(
        id,
        -32020,
        "Required protocol version or method header is missing or does not match the body.",
      );
    if (["tools/call", "prompts/get", "resources/read"].includes(body.method)) {
      const expected = body.method === "resources/read" ? params.uri : params.name;
      if (typeof expected !== "string" || decodeName(request.headers.get("Mcp-Name")) !== expected)
        return failure(id, -32020, "Mcp-Name is missing or does not match the body.");
    }
  } catch {
    return failure(id, -32020, "Malformed Mcp-Name header.");
  }
  if (meta[protocolKey] !== MCP_VERSION)
    return failure(id, -32022, "Unsupported protocol version.", 400, {
      supported: [MCP_VERSION],
      requested: meta[protocolKey],
    });
  if (body.method === "server/discover")
    return complete(id, {
      ttlMs: 0,
      cacheScope: "public",
      supportedVersions: [MCP_VERSION],
      capabilities: { tools: {} },
      instructions:
        "Microworld generates initial world data, not mutable game state. Inspect presets, then generate bounded windows. Preserve generatorVersion and resolved configuration when saving a world. No account or API key is needed.",
    });
  if (body.method === "tools/list") {
    if (params.cursor !== undefined)
      return failure(id, -32602, "This tool list is not paginated; omit cursor.");
    return complete(id, { tools: toolDefinitions(), ttlMs: 0, cacheScope: "public" });
  }
  if (body.method !== "tools/call") return failure(id, -32601, "Method not found.", 404);
  if (params.arguments !== undefined && !isRecord(params.arguments))
    return failure(id, -32602, "Tool arguments must be an object.");
  if (!["list_presets", "get_preset", "generate_world"].includes(String(params.name)))
    return failure(id, -32602, "Unknown tool.");
  try {
    const args = params.arguments ?? {};
    const output =
      params.name === "list_presets"
        ? presetList(args)
        : params.name === "get_preset"
          ? presetDetails(args)
          : world(args, env);
    return complete(id, {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    });
  } catch (error) {
    const problem = publicError(error);
    if (problem.status === 500) return failure(id, -32603, problem.error.message, 500);
    return complete(id, {
      isError: true,
      content: [{ type: "text", text: JSON.stringify(problem.error) }],
    });
  }
}
