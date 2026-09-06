# Verification notes

These notes record completed checks for generator v1 and the Vercel deployment.

## Generation compatibility and performance

After optimizing generation, 33 full-output comparisons matched the previous repository revision. The comparisons covered all 11 presets at the origin, near `2^48`, and near the final world coordinates. The optimization preserves generator version `1` output.

Warm local generation measurements for 256 × 256 windows:

| Preset    | Before   | After   |
| --------- | -------- | ------- |
| Overworld | 103.6 ms | 15.6 ms |
| RPG       | 113.1 ms | 13.7 ms |
| Chess     | 7.0 ms   | 2.5 ms  |
| Moon      | 260.7 ms | 22.1 ms |

These are local elapsed-time measurements, not Cloudflare CPU measurements or service latency guarantees. They demonstrate the effect of the optimization on the measured workloads.

## Local checks

`pnpm check` passed all 30 tests, TypeScript and Astro checks, lint, and formatting after removing the Durable Object implementation. The direct Worker build passed locally. Vercel also completed the production build successfully.

## Browser checks

Against the earlier deployed Worker, the following checks passed:

- Changing the seed and generating through the public API displayed the exact new seed in the viewer.
- The landing page and documentation fit a 390 × 844 mobile viewport without horizontal overflow.
- The homepage, documentation, social preview image, capabilities endpoint, and preset listing returned HTTP 200.

The hosting migration leaves the static site unchanged. Vercel HTTP smoke checks are recorded below.

## Production CPU finding

The initial deployment generated a correct 128 × 128 overworld response with 16,384 cells and returned successful MCP discovery data. Maximum-size testing passed its first three requests, then encountered Cloudflare error 1102 under the Free Worker's CPU limit. That run does not establish support for all maximum-size presets.

The repository now handles API and MCP requests directly in a Worker and requires Workers Paid. The Durable Object workaround has been removed. No paid-plan change or replacement Cloudflare deployment was performed as part of that removal.

Request limits and generator version `1` remain unchanged.

## Vercel production checks

On September 6, 2026, `https://microworld-five.vercel.app` passed:

- HTTP 200 for the homepage, documentation, capabilities, schema, and preset listing.
- Complete 256 × 256 generation through `QUERY` for all 11 presets using seed `vercel-smoke`.
- MCP `server/discover` and `tools/call` requests using protocol `2026-07-28`.
- Exact equality between MCP structured output and the corresponding `QUERY` world.
- Browser preflight with `QUERY` in the allowed methods.

The project tracks the `vercel` branch for production deployments. The custom domain `microworld.kaf.sh` still points to the earlier Cloudflare deployment.

Vercel compiles TypeScript functions to JavaScript. `rewriteRelativeImportExtensions` is required so the emitted imports resolve correctly. The first deployment exposed a missing-module error; the setting fixed it, and all production checks above passed afterward.
