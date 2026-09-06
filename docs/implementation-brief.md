# Architecture and generation model

## Product

Microworld generates initial world data for games. A caller requests a rectangular window in a seeded 2D world and receives JSON elevation, biomes, placed objects, and optional structure tiles. Callers store edits, inventories, moved pieces, and other game state.

The service is public, with no accounts or API keys. The project is open source under Apache-2.0. The target domain is `microworld.kaf.sh`.

The site combines an explanation, documentation, copyable requests, and interactive world demos. See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup, validation, and deployment.

## Agreed scope

- A headless generator written from scratch, with 2D elevation and biome data.
- A huge coordinate space exposed through bounded windows. Requests never generate the entire world.
- A 16 × 16 cell chunk convention. Windows can contain several chunks or start between chunk boundaries.
- Versioned deterministic output, independent of request order, window shape, and neighboring requests.
- JSON placement rules for terrain restrictions, rarity, spacing, footprints, and nearby water.
- Object placement plus optional reusable tile templates. Procedural building interiors are deferred.
- A substantial preset library whose configuration callers can inspect and customize.
- A JSON `QUERY` API and stateless MCP 2026-07-28 endpoint sharing generation code and validation.
- Interactive demos with bundled initial data and explicit live generation controls.
- pnpm, TypeScript, Astro, Tailwind, Cloudflare Workers, Valibot, oxlint, and oxfmt.
- No public package engineering in v1. The internal generator remains independent of HTTP.

Generation is bounded by configurable cell and work limits, without a 10 ms design target. Measure actual Worker usage before choosing production limits and a hosting plan. Application settings do not change the platform's enforced limits.

## Architecture

The repository is one private pnpm project, with no database or session store. Private here means the project is not published as an npm package; the source is open.

The generator owns coordinates, randomness, terrain, placement, and templates. Service functions resolve presets and validate requests. Thin Worker handlers expose those functions over `QUERY` and MCP. Astro emits static pages and assets; small browser modules run the interactive demo viewers. Browser interaction uses the same public generation endpoint as external callers.

Preset definitions are versioned repository data. Valibot validates requests. The API publishes JSON Schemas, with additional cross-field constraints checked at runtime. The MCP implementation handles the requested protocol revision directly, without an SDK or HTTP framework.

Tests use Node's installed test runner for generation and transport behavior. Astro builds the static site, and browser modules handle the canvas viewer without a client UI framework.

## World model

Each axis contains `Number.MAX_SAFE_INTEGER` cells, numbered `0` through `9007199254740990`. Coordinates identify cells, not meters. `x` increases right and `y` increases down. Negative coordinates are invalid.

JSON coordinates are safe integers. Internally, use exact integer arithmetic for coordinate splitting, hashing, and placement neighborhoods. Convert only small local offsets to floating point for interpolation. Hash the high coordinate bits as well as the low bits. A generator that coerces absolute coordinates to 32-bit integers would repeat far too soon.

Elevation is an unsigned relative height from 0 to 65535. Biomes are semantic identifiers. Rendering palettes, tile art, and physical scale belong to the caller. Sky islands use a `void` biome to represent absent terrain in 2D.

## Generation and placement

Terrain uses seeded interpolated value noise with multiple elevation scales and climate fields. Presets adjust defaults and terrain formulas. Chess, arena, and maze use discrete geometry. Custom biome definitions match inclusive elevation, moisture, and temperature ranges in array order, falling back to preset biomes when no definition matches.

Placement produces one seeded candidate per rule lattice region, then checks its terrain conditions. A candidate survives only if no conflicting eligible candidate has a higher deterministic priority. Rule ID and lattice coordinates break priority ties. Suppression compares eligible candidates directly, without recursively asking whether each neighbor survives.

This gives bounded local work and request-independent selection. It can leave gaps because a suppressed candidate can suppress another candidate. It does not promise maximal packing, an exact object count, or a successful village in every region. Probability is candidate probability, not final world coverage.

Rectangular footprints reserve their whole area, including transparent template cells. Minimum spacing is a square exclusion distance around footprints, applied across all placement rules using the larger of the two requested spacings. Terrain conditions cover the full footprint. Water proximity is measured from the top-left anchor using a square neighborhood. Custom biome definitions can mark cells as water; lava and void do not count as water.

Inspect candidates outside the requested window when resolving conflicts. Return complete object metadata for every footprint that intersects the window; clip expanded tile cells to the window. A caller can deduplicate objects by stable ID within the same world configuration. Structures cannot extend outside the world itself.

Rules support named and inline templates and deterministic rotations. The built-in templates are `cottage`, `ruin`, and `shrine`. A resolved response includes the full configuration needed to reproduce generation. The rule language is declarative and finite; it does not accept executable code, recursive object dependencies, or unbounded searches.

## Preset library

| Preset            | Distinct behavior                                       | Status      |
| ----------------- | ------------------------------------------------------- | ----------- |
| Overworld         | Oceans, beaches, grassland, forests, deserts, mountains | Implemented |
| Chess             | Alternating cells; optional piece placement             | Implemented |
| RPG overworld     | Broad readable terrain, towns, ruins, forests           | Implemented |
| Hell world        | Lava, ash, basalt, hostile terrain                      | Implemented |
| Islands           | Separated land masses with coastal detail               | Implemented |
| Sky islands       | Floating land silhouettes surrounded by void            | Implemented |
| Ocean world       | Sparse land, reefs, depth bands                         | Implemented |
| Arena             | Repeated bounded arenas with predictable entrances      | Implemented |
| Maze              | Region mazes with deterministic shared border gates     | Implemented |
| Cratered moon     | Overlapping craters and sparse resources                | Implemented |
| Mushroom wetlands | Wet terrain, fungal groves, small structures            | Implemented |

Maze generation uses 32 × 32 regions with a 15 × 15 spanning-tree interior and deterministic shared border gates. The resulting maze is connected but is not globally perfect; larger routes can contain loops. RPG settlements use placement rules. The generator does not connect them with roads.

## Website

Use monochrome typography and framing, soft corners, and restrained borders. Give maps room to carry color. Motion should explain interactions through map transitions, selection feedback, and short entrances; respect reduced-motion preferences.

The landing page starts with an explorable world and its matching request. Include preset selection, pan and zoom, elevation and biome layers, seed input, and a Generate button. Load a bundled example immediately. Editing fields does not send requests; clicking Generate does. Cancel stale requests and preserve the last successful map on errors.

Provide a quick start, API and MCP documentation, preset inspection, placement examples, reproducibility guidance, limits, and source link. Seed and configuration exports should make demos reproducible. A demo preview may explore bundled data beyond the displayed area; live panning needs explicit bounded loading and caching.

## Version compatibility

Version `1` identifies the generation algorithm and preset contents. Tests pin representative output with SHA-256 expectations in `test/generate.test.ts`. Changing terrain or placement output under an existing version breaks saved worlds. Introduce a new version for such changes and preserve the old implementation.

The original prototype findings remain in [prototype-findings.md](prototype-findings.md) as historical measurements. They do not describe production performance or the full v1 preset library. Production limits should follow measurements of the current generator on the deployed Worker.

## Deliberate limits

Microworld does not store player edits, serve a public npm package, generate procedural building interiors, or maintain MCP sessions. It returns bounded windows of initial world data. Sparse placements do not guarantee an exact count or maximal packing. The website can explore a loaded window locally; it does not imply unlimited automatic world streaming.
