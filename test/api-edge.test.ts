import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../src/worker.ts";
import { MCP_VERSION } from "../src/api/mcp.ts";

function rpc(method: string, params: Record<string, unknown> = {}, id: string | number = 1) {
  return handleRequest(
    new Request("https://microworld.kaf.sh/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MCP_VERSION,
        "Mcp-Method": method,
        ...(typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": MCP_VERSION,
            "io.modelcontextprotocol/clientCapabilities": {},
          },
          ...params,
        },
      }),
    }),
  );
}

// Required by DiscoverResult and ListToolsResult in the 2026-07-28 schema.
for (const method of ["server/discover", "tools/list"]) {
  test(`${method} includes required MCP cache metadata`, async () => {
    const response = await rpc(method);
    assert.equal(response.status, 200);
    const { result } = await response.json();
    assert.equal(typeof result.ttlMs, "number");
    assert.ok(Number.isFinite(result.ttlMs) && result.ttlMs >= 0);
    assert.ok(["public", "private"].includes(result.cacheScope));
  });
}

test("MCP direct requests do not inherit prior client metadata", async () => {
  assert.equal((await rpc("server/discover")).status, 200);
  const response = await rpc("tools/list", { _meta: {} });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32602);
});

test("MCP rejects invalid custom placement templates as recoverable tool errors", async () => {
  for (const template of ["constructor", "missing", [["wall"], ["wall", "wall"]]]) {
    const response = await rpc("tools/call", {
      name: "generate_world",
      arguments: {
        seed: "edge",
        placements: [{ id: "house", object: "house", pitch: 16, template }],
      },
    });
    assert.equal(response.status, 200);
    const { result } = await response.json();
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).code, "invalid_input");
  }
});
