# Verification notes

These notes distinguish completed checks from the final production rerun. They describe generator v1 and deployment checks.

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

The compute-pool implementation passed 17 API tests. A local workerd instance returned a complete 256 × 256 world, with 65,536 cells, and a successful MCP discovery response.

The final full `pnpm check` and production build rerun are pending confirmation. CI is configured to install the locked dependencies, run checks, and build; configuration alone is not evidence of a completed GitHub Actions run.

## Browser checks

Against the earlier deployed Worker, the following checks passed:

- Changing the seed and generating through the public API displayed the exact new seed in the viewer.
- The landing page and documentation fit a 390 × 844 mobile viewport without horizontal overflow.
- The homepage, documentation, social preview image, capabilities endpoint, and preset listing returned HTTP 200.

The compute-pool change leaves the static site unchanged. A final production smoke check is pending.

## Production CPU finding

The initial deployment generated a correct 128 × 128 overworld response with 16,384 cells and returned successful MCP discovery data. Maximum-size testing passed its first three requests, then encountered Cloudflare error 1102 under the Free Worker's CPU limit. That run does not establish support for all maximum-size presets.

The repository now handles API and MCP requests directly in a Worker and requires Workers Paid. The Durable Object workaround has been removed. No paid-plan change or replacement Cloudflare deployment was performed as part of that removal.

Request limits and generator version `1` remain unchanged.
