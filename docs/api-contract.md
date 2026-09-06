# API contract

This reference describes the Worker implementation. The production domain is `microworld.kaf.sh`; use `http://localhost:8787` for a local Worker. Deployment status is independent of this contract.

## Routes

| Method    | Path                                   | Purpose                                            |
| --------- | -------------------------------------- | -------------------------------------------------- |
| `QUERY`   | `/api/world`                           | Generate a bounded world window from JSON          |
| `GET`     | `/api/presets`                         | List versioned presets                             |
| `GET`     | `/api/presets/{id}?generatorVersion=1` | Inspect defaults and supported overrides           |
| `GET`     | `/api/capabilities`                    | Discover versions, schema links, and hosted limits |
| `GET`     | `/api/schema`                          | Input and output JSON Schemas                      |
| `POST`    | `/mcp`                                 | MCP 2026-07-28 requests                            |
| `OPTIONS` | API and MCP routes                     | Browser preflight and method discovery             |

No account, API key, or cookie is required. The public API permits cross-origin requests. MCP uses `MCP_ALLOWED_ORIGINS`, a comma-separated allowlist for browser clients. Without an override it permits the request origin and `https://microworld.kaf.sh`. Clients without an Origin header are permitted. The site's direct `QUERY` examples remain usable from any browser origin.

## Generate a window

The seed-only quick start uses the default preset and a 16 × 16 window at the origin. Responses always identify the resolved generator version and configuration. Saved worlds must pin the returned version and configuration; unversioned calls intentionally follow the current default.

```http
QUERY /api/world HTTP/1.1
Host: microworld.kaf.sh
Content-Type: application/json
Accept: application/json

{
  "generatorVersion": "1",
  "seed": "a-small-adventure",
  "preset": "overworld",
  "window": { "x": 128, "y": 256, "width": 64, "height": 64 },
  "terrain": { "scale": 128, "seaLevel": 28000 },
  "placements": [
    {
      "id": "trees",
      "object": "oak",
      "pitch": 16,
      "probability": 0.5,
      "minSpacing": 3,
      "biomes": ["forest", "grassland"]
    }
  ]
}
```

The supported generator version is `"1"`. The earlier `prototype-1` contract is not supported.

Windows use half-open bounds. For chunk coordinates `cx` and `cy`, request `x = cx * 16`, `y = cy * 16`, `width = 16`, `height = 16`. Arbitrary cell-aligned windows are valid. The final chunks at the edge of the world may be partial, since the world dimension is not divisible by 16.

All coordinates are nonnegative safe JSON integers. `x + width` and `y + height` must not exceed `9007199254740991`. Seed strings are exact, case-sensitive UTF-16 sequences without Unicode normalization. Seeds contain 1 to 128 UTF-16 code units.

## Configuration and presets

Version 1 is under active development; its terrain and preset defaults can change until the maintainer freezes compatibility. Omitted configuration uses preset defaults. Terrain fields override defaults individually. A supplied placement array replaces preset placements; `[]` disables objects. Custom templates merge by name with built-ins and can override them.

Available presets are `overworld`, `chess`, `rpg`, `hell`, `islands`, `sky-islands`, `ocean`, `arena`, `maze`, `moon`, and `wetlands`. Discover names, descriptions, and defaults through the preset routes.

Terrain controls are `scale` from 4 to 4096, `seaLevel` from 0 to 65535, and `roughness`, `moisture`, and `temperature` from 0 to 1. Defaults vary by preset. Specialized presets such as chess and maze use their own geometry, so noise controls do not necessarily affect them.

`biomes` accepts up to 32 definitions. Each has an `id`, optional `minElevation`/`maxElevation`, `minMoisture`/`maxMoisture`, `minTemperature`/`maxTemperature`, and `water` boolean. The first matching definition overrides the preset biome. Unmatched cells retain their preset biome. Set `water: true` for custom biomes that should satisfy nearby-water placement rules. Unknown fields, duplicate IDs, invalid ranges, and unsupported versions fail validation.

## Placement fields

| Field                          | Meaning                                                       | Default or bound                         |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| `id`                           | Unique rule name, used in deterministic candidate identity    | Required                                 |
| `object`                       | Caller-visible semantic object type                           | Required                                 |
| `pitch`                        | Side length of a candidate lattice region                     | Required, 4–64 cells                     |
| `probability`                  | Chance a region offers a candidate                            | 1, range 0–1                             |
| `minSpacing`                   | Minimum square gap around conflicting footprints              | 0, at most 32                            |
| `width`, `height`              | Reserved rectangular footprint                                | Template size or 1 each; at most 16 each |
| `biomes`                       | Allowed biomes across the whole footprint                     | Any                                      |
| `minElevation`, `maxElevation` | Allowed height across the footprint                           | 0–65535                                  |
| `maxRelief`                    | Maximum difference between highest and lowest footprint cells | 65535                                    |
| `nearWater`                    | Square search radius from anchor for a water cell             | Omitted, at most 16                      |
| `template`                     | Template name or rectangular rows of tiles and `null` cells   | Optional; must match footprint           |
| `rotations`                    | Allowed clockwise rotations; one chosen deterministically     | `[0]`; values 0, 90, 180, 270            |

Example inline template:

```json
{
  "id": "huts",
  "object": "hut",
  "pitch": 32,
  "width": 3,
  "height": 2,
  "minSpacing": 8,
  "maxRelief": 1200,
  "template": [
    ["wall", "door", "wall"],
    ["floor", null, "floor"]
  ]
}
```

Built-in template names are `cottage`, `ruin`, `shrine`, `hamlet`, `oak`, `pine`, `palm`, and `mushroom`. Define additional named matrices in the top-level `templates` object, then reference a name through a rule's `template` field. At most 32 custom templates are allowed. Matrices must have equal row lengths and fit within 16 × 16 cells. Omit footprint dimensions to infer them from the template; explicit dimensions must match before rotation. A template adds a separate tile layer; it does not modify terrain elevation or biome values.

## Response

Responses contain `generatorVersion`, `seed`, `preset`, `window`, `chunkSize`, resolved `configuration`, and these data fields:

- `elevation`: flat row-major integer array, 0–65535. Index a local cell with `dy * width + dx`.
- `biome`: flat row-major array of semantic strings using the same indexing.
- `objects`: objects whose footprints intersect the window, including origins outside it. Each contains `id`, `rule`, `object`, absolute `x` and `y`, `width`, `height`, `rotation`, and a deterministic `variantSeed`. Resolved, rotated templates are included when supplied.
- `tiles`: expanded nontransparent template cells within the window, with absolute `x`, `y`, `tile`, and `objectId`.

Object IDs are unique within a fixed seed, generator version, and resolved configuration. They are not global identifiers across worlds. Clients must scope caches and deduplication accordingly. Template tiles reserve rectangular footprints even where cells are transparent.

The contract promises identical cell values and intersecting objects for overlapping requests with identical generation inputs. It does not promise equal bytes for requests with differently ordered equivalent configurations. A future content hash must canonicalize configuration first.

## Limits and errors

Default generator bounds are 256 cells per side, 65,536 cells total, eight placement rules, and two million work units per generation. Work units charge terrain evaluations and candidate visits. These are application limits, not estimates of Worker CPU time. The work counter bounds placement searches; it is not a substitute for a deployment CPU limit.

The HTTP adapter caps bodies while reading them, including requests without Content-Length. The default maximum is 256 KiB. Worker settings `MAX_CELLS`, `MAX_SIDE`, `MAX_RULES`, `MAX_WORK`, and `MAX_BODY_BYTES` can tighten limits. `/api/capabilities` reports active values. Work-limit failures return an error, never a partial successful world.

Errors contain a code and message, with validation issues where appropriate. The optional Cloudflare `RATE_LIMITER` binding throttles requests; the deployment configuration supplies its threshold.

| Status | Situation                                                                |
| ------ | ------------------------------------------------------------------------ |
| 400    | Malformed JSON or missing Content-Type                                   |
| 405    | Unsupported HTTP method; include Allow                                   |
| 406    | Caller excludes supported response media types                           |
| 413    | Request body exceeds configured byte limit                               |
| 415    | Unsupported request media type; advertise Accept-Query                   |
| 422    | Invalid generation input, unknown version/preset, or work limit exceeded |
| 429    | Service throttling, if enabled; include Retry-After                      |
| 500    | Unexpected internal failure without implementation details               |

`QUERY` requires a meaningful request Content-Type and is safe and idempotent. The adapter advertises `Accept-Query: application/json`. [RFC 10008](https://www.rfc-editor.org/rfc/rfc10008.html)

Cache keys must include version, seed, preset contents or resolved configuration, and window. Do not cache QUERY responses by URL alone. Add caching after verifying Cloudflare support for the method and any internal cache-key mapping. The implementation does not use a shared world-response cache.

## MCP

Use `POST /mcp` with Streamable HTTP and JSON responses. Every call is independent. The server exposes `server/discover`, `tools/list`, and `tools/call`. No session store or initialization handshake is required for the target revision. Advertise only implemented capabilities. [MCP versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)

| Tool             | Arguments                         | Result                                      |
| ---------------- | --------------------------------- | ------------------------------------------- |
| `list_presets`   | Optional `generatorVersion`       | Version and preset summaries                |
| `get_preset`     | `id`, optional `generatorVersion` | Versioned defaults and customization schema |
| `generate_world` | Same generation input as QUERY    | Same world object                           |

Tool definitions mark operations read-only, nondestructive, and idempotent. Input/output JSON Schemas are published at `/api/schema`. Tools return world data in `structuredContent`. Tools also return a serialized JSON text block. Tool validation failures are tool errors, while malformed protocol messages use JSON-RPC errors. [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

Example request envelope:

```http
POST /mcp HTTP/1.1
Host: microworld.kaf.sh
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: generate_world

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "generate_world",
    "arguments": { "generatorVersion": "1", "seed": "hello" },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "example", "version": "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Mirror method, name, and protocol version between headers and body, validating mismatches with the specified `-32020` error. Reject unsupported versions with `-32022` and the supported version list. Decode sentinel-encoded header values before comparison. These are requirements of the selected HTTP binding. [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

Successful result objects include `resultType: "complete"`. Every request carries its own metadata; no client state is inferred from a previous call. [MCP base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic)

The endpoint accepts independent JSON requests and returns JSON responses. Clients must advertise both `application/json` and `text/event-stream` in `Accept`, even though this server does not stream. `GET` and `DELETE` return 405. Each call requires protocol-version and client-capabilities metadata; client information is optional. Results include `_meta` server information. Older MCP revisions are not supported.

## Walking and placement priority

`walkable` is a row-major boolean array with one entry per cell, aligned with `biome` and `elevation`. It supplies default movement rules. Water, lava, void, mountain peaks, walls, and occupied object cells block walking. Template floors, doors, and roads are walkable; built-in foliage, trunks, walls, stone, pillars, and mushroom caps are solid. Null template cells retain their terrain behavior. Custom tile identifiers default to walkable; games can replace these rules with their own collision policy.

Placement rules accept `priority`, an integer from 0 to 100, defaulting to 0. Larger values win overlapping candidates before the seeded tie-break. RPG settlements use 10 and ruins use 5, so vegetation does not suppress structures.

The site’s Classic RPG tiles and Block map colors are renderers. They do not change the generated terrain or collision mask. The walking preview stays within the requested window; the API remains stateless and does not store character movement.
