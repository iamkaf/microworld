import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, type Env } from "../src/worker.ts";
import { MCP_VERSION } from "../src/api/mcp.ts";
import { accepts } from "../src/api/http.ts";

const origin = "https://microworld.kaf.sh";
function api(path: string, init?: RequestInit, env?: Env) {
  return handleRequest(new Request(`${origin}${path}`, init), env);
}
function query(input: unknown, env?: Env, headers?: HeadersInit) {
  return api(
    "/api/world",
    {
      method: "QUERY",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(input),
    },
    env,
  );
}
function envelope(
  method = "server/discover",
  params: Record<string, unknown> = {},
  version = MCP_VERSION,
): { jsonrpc: string; id: number; method: string; params: Record<string, unknown> } {
  return {
    jsonrpc: "2.0",
    id: 7,
    method,
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": version,
        "io.modelcontextprotocol/clientCapabilities": {},
      },
      ...params,
    },
  };
}
function mcp(body = envelope(), headers: Record<string, string> = {}, env?: Env) {
  return api(
    "/mcp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MCP_VERSION,
        "Mcp-Method": body.method,
        ...(typeof body.params.name === "string" ? { "Mcp-Name": body.params.name } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

test("QUERY and MCP generate exactly the same world with stateless direct calls", async () => {
  const input = {
    generatorVersion: "1",
    seed: "transport-fixture",
    preset: "rpg",
    window: { x: 27, y: 19, width: 24, height: 24 },
  };
  const direct = await query(input);
  const rpc = await mcp(envelope("tools/call", { name: "generate_world", arguments: input }));
  assert.equal(direct.status, 200);
  assert.equal(rpc.status, 200);
  const result = (await rpc.json()).result;
  assert.equal(result.resultType, "complete");
  assert.deepEqual(result.structuredContent, await direct.json());
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.equal(rpc.headers.get("Mcp-Session-Id"), null);
});

test("discovery and schemas expose only implemented capabilities", async () => {
  const discovered = (await (await mcp()).json()).result;
  assert.deepEqual(discovered.supportedVersions, [MCP_VERSION]);
  assert.deepEqual(discovered.capabilities, { tools: {} });
  assert.equal(discovered._meta["io.modelcontextprotocol/serverInfo"].name, "microworld");
  const listed = (await (await mcp(envelope("tools/list"))).json()).result;
  assert.deepEqual(
    listed.tools.map((t: { name: string }) => t.name),
    ["list_presets", "get_preset", "generate_world"],
  );
  const generation = listed.tools[2];
  assert.equal(generation.inputSchema.type, "object");
  assert.ok(generation.inputSchema.properties.placements);
  assert.ok(generation.inputSchema.properties.terrain);
  assert.equal(generation.annotations.readOnlyHint, true);
  const schema = await (await api("/api/schema")).json();
  assert.deepEqual(schema.input, generation.inputSchema);
  assert.deepEqual(schema.output, generation.outputSchema);
});

test("versioned preset list and details match MCP tools", async () => {
  const listing = await (await api("/api/presets")).json();
  assert.ok(listing.presets.length >= 11);
  const listTool = await (await mcp(envelope("tools/call", { name: "list_presets" }))).json();
  assert.deepEqual(listTool.result.structuredContent, listing);
  for (const { id } of listing.presets) {
    const preset = await (await api(`/api/presets/${id}`)).json();
    const tool = await (
      await mcp(envelope("tools/call", { name: "get_preset", arguments: { id } }))
    ).json();
    assert.deepEqual(tool.result.structuredContent, preset);
    assert.ok(preset.configuration);
  }
  assert.equal((await api("/api/presets/unknown")).status, 422);
  assert.equal((await api("/api/presets?generatorVersion=unknown")).status, 422);
});

test("MCP requires self-contained metadata and rejects header mismatches", async () => {
  const missingMeta = envelope();
  missingMeta.params._meta = {};
  assert.equal((await (await mcp(missingMeta)).json()).error.code, -32602);
  const wrongMethod = await mcp(envelope(), { "Mcp-Method": "tools/list" });
  assert.equal(wrongMethod.status, 400);
  assert.equal((await wrongMethod.json()).error.code, -32020);
  for (const headers of [{ "MCP-Protocol-Version": "" }, { "Mcp-Method": "" }] as Record<
    string,
    string
  >[]) {
    assert.equal((await (await mcp(envelope(), headers)).json()).error.code, -32020);
  }
  const body = envelope("tools/call", { name: "list_presets" });
  assert.equal((await (await mcp(body, { "Mcp-Name": "get_preset" })).json()).error.code, -32020);
  assert.equal((await (await mcp(body, { "Mcp-Name": "" })).json()).error.code, -32020);
  const encoded = `=?base64?${btoa("list_presets")}?=`;
  assert.equal((await mcp(body, { "Mcp-Name": encoded })).status, 200);
  assert.equal(
    (await (await mcp(body, { "Mcp-Name": "=?base64?!!!?=" })).json()).error.code,
    -32020,
  );
  const version = "2025-11-25";
  const unsupported = await mcp(envelope("server/discover", {}, version), {
    "MCP-Protocol-Version": version,
  });
  assert.equal(unsupported.status, 400);
  assert.deepEqual((await unsupported.json()).error, {
    code: -32022,
    message: "Unsupported protocol version.",
    data: { supported: [MCP_VERSION], requested: version },
  });
});

test("MCP distinguishes malformed protocol from tool input errors", async () => {
  const unknown = await mcp(envelope("initialize"));
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, -32601);
  const badTool = await mcp(envelope("tools/call", { name: "unknown" }));
  assert.equal((await badTool.json()).error.code, -32602);
  const invalid = await mcp(
    envelope("tools/call", { name: "generate_world", arguments: { seed: "", typo: true } }),
  );
  assert.equal(invalid.status, 200);
  assert.equal((await invalid.json()).result.isError, true);
  const malformedArgs = await mcp(
    envelope("tools/call", { name: "generate_world", arguments: [] }),
  );
  assert.equal((await malformedArgs.json()).error.code, -32602);
  const batch = await api("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: "[]",
  });
  assert.equal((await batch.json()).error.code, -32600);
});

test("HTTP methods, content negotiation, validation, and malformed JSON", async () => {
  assert.equal((await api("/api/world", { method: "POST" })).status, 405);
  assert.equal((await api("/api/world", { method: "GET" })).headers.get("Allow"), "QUERY, OPTIONS");
  for (const method of ["GET", "DELETE"]) assert.equal((await api("/mcp", { method })).status, 405);
  assert.equal((await query({ seed: "x" }, {}, { Accept: "text/html" })).status, 406);
  assert.equal(
    (await query({ seed: "x" }, {}, { Accept: "application/json;q=0, */*" })).status,
    406,
  );
  assert.equal((await mcp(envelope(), { Accept: "application/json" })).status, 406);
  assert.equal((await api("/api/world", { method: "QUERY", body: "{}" })).status, 415);
  assert.equal((await api("/api/world", { method: "QUERY" })).status, 400);
  assert.equal(
    (
      await api("/api/world", {
        method: "QUERY",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    ).status,
    400,
  );
  const invalid = await query({ seed: "x", unexpected: true });
  assert.equal(invalid.status, 422);
  assert.ok((await invalid.json()).error.issues.length);
  assert.equal(
    (await query({ seed: "x", window: { x: Number.MAX_SAFE_INTEGER, y: 0, width: 1, height: 1 } }))
      .status,
    422,
  );
  assert.equal((await query({ seed: "x" }, { MAX_WORK: "1" })).status, 422);
  assert.equal((await query({ seed: "x" }, { MAX_CELLS: "4" })).status, 422);
  const caps = await (await api("/api/capabilities", {}, { MAX_CELLS: "1024" })).json();
  assert.equal(caps.limits.maxCells, 1024);
  assert.equal((await api("/api/nope")).status, 404);
  assert.equal(accepts("*/*;q=1, application/json;q=0", "application/json"), false);
});

test("streaming body limits apply without or despite a misleading Content-Length", async () => {
  for (const headers of [{}, { "Content-Length": "1" }]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(100).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(`${origin}/api/world`, {
      method: "QUERY",
      headers: { "Content-Type": "application/json", ...headers },
      body: stream,
      duplex: "half",
    } as RequestInit);
    const response = await handleRequest(request, { MAX_BODY_BYTES: "128" });
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
  }
  assert.equal((await query({ seed: "too large" }, { MAX_BODY_BYTES: "2" })).status, 413);
  const rpc = await mcp(envelope(), {}, { MAX_BODY_BYTES: "2" });
  assert.equal(rpc.status, 413);
  assert.equal((await rpc.json()).error.code, -32600);
});

test("API CORS is public; MCP validates origins including preflight", async () => {
  const preflight = await api("/api/world", {
    method: "OPTIONS",
    headers: { Origin: "https://any-game.test" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(preflight.headers.get("Accept-Query"), "application/json");
  const rejected = await api("/mcp", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.test" },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), null);
  const allowed = await mcp(
    envelope(),
    { Origin: "https://client.test" },
    { MCP_ALLOWED_ORIGINS: "https://client.test" },
  );
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "https://client.test");
  assert.equal(allowed.headers.get("Vary"), "Origin");
  assert.equal((await mcp(envelope(), { Origin: "null" })).status, 403);
});

test("rate limit binding applies to generation and MCP without caching by URL", async () => {
  const keys: string[] = [];
  const env = {
    RATE_LIMITER: {
      async limit({ key }: { key: string }) {
        keys.push(key);
        return { success: false };
      },
    },
  };
  for (const path of ["/api/world", "/mcp"]) {
    const response = await api(
      path,
      { method: path === "/mcp" ? "POST" : "QUERY", headers: { "CF-Connecting-IP": "192.0.2.1" } },
      env,
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
  }
  assert.deepEqual(keys, ["192.0.2.1", "192.0.2.1"]);
  assert.equal((await query({ seed: "x" })).headers.get("Cache-Control"), "no-store");
  const page = await api(
    "/docs",
    {},
    {
      ASSETS: {
        async fetch() {
          return new Response("static docs");
        },
      },
    },
  );
  assert.equal(await page.text(), "static docs");
});
