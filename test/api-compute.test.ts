import assert from "node:assert/strict";
import test from "node:test";
import worker, { handleRequest, WorldGenerator, type Env } from "../src/worker.ts";

const origin = "https://microworld.kaf.sh";

test("entry Worker forwards API methods, headers and streaming bytes without parsing", async () => {
  for (const path of [
    "/api/world?example=1",
    "/mcp",
    "/api/presets",
    "/api",
    "/api/capabilities",
  ]) {
    const bytes = new Uint8Array([0, 255, 123, 10, 34]);
    const request = new Request(`${origin}${path}`, {
      method: path === "/mcp" ? "POST" : "QUERY",
      headers: {
        "Content-Type": "application/json",
        "Mcp-Method": "tools/call",
        "CF-Connecting-IP": "192.0.2.7",
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    const downstream = new Response("unmodified downstream response", {
      status: 418,
      headers: { "X-Compute": "yes" },
    });
    const env: Env = {
      RATE_LIMITER: {
        async limit() {
          assert.fail("Outer Worker must not rate limit or parse");
        },
      },
      WORLD_GENERATOR: {
        getByName(name) {
          assert.match(name, /^compute-global-(?:[0-9]|[12][0-9]|3[01])$/);
          return {
            async fetch(forwarded) {
              assert.strictEqual(forwarded, request);
              assert.equal(forwarded.bodyUsed, false);
              assert.equal(forwarded.url, `${origin}${path}`);
              assert.equal(forwarded.headers.get("Mcp-Method"), "tools/call");
              assert.deepEqual(new Uint8Array(await forwarded.arrayBuffer()), bytes);
              return downstream;
            },
          };
        },
      },
    };
    assert.strictEqual(await worker.fetch(request, env), downstream);
  }
});

test("static assets bypass the compute pool", async () => {
  const request = new Request(`${origin}/docs`);
  const response = await worker.fetch(request, {
    WORLD_GENERATOR: {
      getByName() {
        assert.fail("Static assets do not need compute");
      },
    },
    ASSETS: {
      async fetch(forwarded) {
        assert.strictEqual(forwarded, request);
        return new Response("docs");
      },
    },
  });
  assert.equal(await response.text(), "docs");
});

test("compute instances produce identical results independently with one rate check", async () => {
  let rateChecks = 0;
  const env: Env = {
    RATE_LIMITER: {
      async limit() {
        rateChecks++;
        return { success: true };
      },
    },
  };
  const context = new Proxy(
    {},
    {
      get() {
        assert.fail("Compute must not access Durable Object state or storage");
      },
    },
  );
  const first = new WorldGenerator(context, env);
  const second = new WorldGenerator(context, env);
  env.WORLD_GENERATOR = {
    getByName() {
      return first;
    },
  };
  const request = () =>
    new Request(`${origin}/api/world`, {
      method: "QUERY",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed: "same-world",
        preset: "islands",
        window: { x: 9, y: 7, width: 16, height: 16 },
      }),
    });
  const throughWorker = await worker.fetch(request(), env);
  assert.equal(rateChecks, 1);
  const direct = await handleRequest(request(), {});
  const otherInstance = await second.fetch(request());
  assert.equal(rateChecks, 2);
  assert.deepEqual(await throughWorker.json(), await direct.json());
  assert.deepEqual(await otherInstance.json(), await (await handleRequest(request(), {})).json());
  assert.deepEqual(Object.keys(first), ["env"]);
});

test("compute pool region uses trusted edge metadata, never request headers", async () => {
  for (const colo of ["GRU", "invalid", undefined]) {
    const request = new Request(`${origin}/api/presets`, { headers: { "CF-Colo": "attacker" } });
    Object.defineProperty(request, "cf", { value: { colo } });
    await worker.fetch(request, {
      WORLD_GENERATOR: {
        getByName(name) {
          assert.ok(name.startsWith(colo === "GRU" ? "compute-GRU-" : "compute-global-"));
          return {
            async fetch() {
              return new Response("ok");
            },
          };
        },
      },
    });
  }
});
