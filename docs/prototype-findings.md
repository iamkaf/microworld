# Prototype findings

Historical record of the first prototype milestone. For the current v1 implementation, see the [generation model](implementation-brief.md) and [API reference](api-contract.md). The remaining-work list below describes that earlier milestone.

Measured September 6, 2026, on local Linux x64 with Node v24.18.0. This milestone tests the generation model. It does not validate Cloudflare deployment, browser transport compatibility, MCP conformance, or the visual quality of the full preset library.

## Correctness

Nine automated tests cover repeatability and seed variation, overlapping windows and independently requested chunks, placement order independence, footprint spacing, cross-boundary tile structures, terrain restrictions, coordinates near the world limit, invalid inputs, bounded work, and a saved output digest.

The chunk test requests windows in reverse order with unrelated generation calls between them. It compares cells, objects, and clipped tile layers against one larger result at five origins, including `2^32`, `2^48`, and the final 48 cells of each world axis.

The current implementation can address the last cell without losing integer precision. It hashes both coordinate halves and interpolates using local offsets. It does not allocate anything proportional to the size of the world.

The placement algorithm meets spacing and overlap invariants without shared state. Its tradeoff is lower density: a candidate can be suppressed by another eligible candidate that is itself suppressed elsewhere. This avoids recursive searches. Exact counts and maximal packing are outside the prototype contract.

The version fixture detects accidental output changes in subsequent edits. Cross-runtime fixtures and a final v1 compatibility policy still need verification before release.

## Local benchmark

`pnpm bench` runs five warmups and 20 timed samples per case. Each sample includes validation, generation, and JSON serialization. The seed is `benchmark`; each window starts at `2^40` on both axes. Placement cases use one tree rule with pitch 16, probability 0.5, and minimum spacing 3.

| Window    | Placements | Median ms | p95 ms | JSON bytes |
| --------- | ---------- | --------: | -----: | ---------: |
| 16 × 16   | None       |      0.32 |   0.72 |      4,888 |
| 16 × 16   | Trees      |      0.27 |   0.42 |      5,039 |
| 64 × 64   | None       |      4.16 |   6.71 |     73,630 |
| 64 × 64   | Trees      |      4.30 |   5.00 |     74,843 |
| 128 × 128 | None       |     17.35 |  19.36 |    279,930 |
| 128 × 128 | Trees      |     16.89 |  17.78 |    284,022 |
| 256 × 256 | None       |     66.97 |  71.84 |  1,056,888 |
| 256 × 256 | Trees      |     66.96 |  69.46 |  1,074,943 |

These are individual local measurements. Small differences between placement and terrain-only cases reflect timing variation; placement is additional work. The prototype spends most time sampling terrain in this light placement workload. Dense structures and proximity searches need separate Worker benchmarks.

## Decisions supported by the prototype

- Keep 16 × 16 as a chunk convention and the seed-only default. Use 64 × 64 for the initial multi-chunk request example.
- Permit arbitrary bounded windows; correctness does not require chunk alignment.
- Keep exact coordinate handling. There is no need to shrink the world to a 32-bit coordinate space.
- Start with readable row-major arrays. Large responses warrant measuring compression and optional palette encoding before adding formats.
- Bound generation work independently of window area. A small window with expensive placement conditions can cost more than terrain alone.
- Keep templates as a separate layer. Cross-boundary clipping works without modifying underlying terrain.

## Remaining work

The prototype has only overworld and chess terrain. It has inline templates, without rotation or a reusable template registry. It does not yet include custom biome tables, preset resolution, connected mazes, roads, the HTTP service, MCP handlers, the site, or deployment configuration.

Benchmark the final workload in a Worker before choosing production limits or confirming that the free plan is suitable. The 10 ms ceiling is not being used as a product design constraint. The deployed plan still has to support actual execution costs.

The next milestone should implement shared service functions and the QUERY/MCP adapters, with transport tests, before expanding the preset library.
