# Contributing to Microworld

Microworld generates the initial data for a game world. Changes should preserve deterministic output, keep generation work bounded, and make the JSON API easy to use.

Discuss substantial new generation behavior in an issue before implementing it. Small fixes can go straight to a pull request. Report vulnerabilities through [SECURITY.md](SECURITY.md), rather than a public issue.

## Local setup

Install Node.js 24 or newer and the pnpm version in `package.json`'s `packageManager` field. Use the project's installed tools. Do not use transient package runners such as `npx` or `pnpm dlx`.

```sh
git clone https://github.com/iamkaf/microworld.git
cd microworld
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` runs the Astro site at `http://localhost:4321` and the local Worker at `http://localhost:8787`. The site proxies API and MCP requests to the Worker. The development script starts both servers and stops them together when you exit. No account or credential is needed to run this locally.

| Command         | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `pnpm dev`      | Start the site and Worker together                  |
| `pnpm dev:site` | Start Astro alone                                   |
| `pnpm example`  | Generate example JSON locally                       |
| `pnpm bench`    | Measure local generation workloads                  |
| `pnpm demos`    | Regenerate bundled demo worlds                      |
| `pnpm build`    | Regenerate demos and build the static site          |
| `pnpm preview`  | Serve the built site and API through local Wrangler |

For production-like local checks, run `pnpm build` followed by `pnpm preview`. Test `QUERY` against port 8787 to exercise the Worker directly.

## Deployment

The project deploys one Cloudflare Worker on the Workers Paid plan. Astro's `dist` directory supplies static assets directly. The Worker handles API and MCP requests itself, without storage or sessions. `wrangler.jsonc` sets a 30-second CPU limit.

The migration history includes removal of the former compute-only Durable Object class so existing deployments can upgrade. No Durable Object binding or runtime code remains.

Use the installed Wrangler CLI to authenticate with your Cloudflare account, then review `wrangler.jsonc`. The custom domain is `microworld.kaf.sh`; deployment requires access to its Cloudflare zone. A fork must change or remove that route and configure its own account.

```sh
pnpm exec wrangler login
pnpm deploy
```

`pnpm deploy` checks the project, builds the site, and publishes the Worker. It changes the live service. CI builds and tests pull requests but does not deploy them.

The Worker accepts `MAX_CELLS`, `MAX_SIDE`, `MAX_RULES`, `MAX_WORK`, and `MAX_BODY_BYTES` configuration values. `MCP_ALLOWED_ORIGINS` is a comma-separated browser-origin allowlist. The optional `RATE_LIMITER` binding controls public request throttling. Read `/api/capabilities` for the active limits. Review the API reference and Worker configuration before changing them.

Benchmark representative rules and windows on the deployed runtime before increasing limits. Local timing does not predict Worker CPU use. The initial direct-Worker deployment exceeded the Free Worker CPU allowance on large windows. Production requires Workers Paid; application limits still apply. See [verification notes](docs/verification.md) for measurements and deployment checks.

## Before sending a change

```sh
pnpm format
pnpm check
pnpm build
```

CI checks types, lint, formatting, tests, and the production build. `pnpm typecheck` runs TypeScript with the NodeNext configuration in `tsconfig.json`, then checks Astro pages and browser code with `tsconfig.astro.json`. Include the relevant checks and any known limitations in the pull request. For a visible change, include a screenshot of the affected page and check mobile layout, keyboard use, and reduced motion.

Prefer a small change with a concrete example of what improves. Update the API documentation when an input, response, default, or error changes. Commit `pnpm-lock.yaml` when changing dependencies. Keep generated builds, credentials, and local environment files out of commits.

## Deterministic generation

A world is identified by its generator version, seed, and resolved configuration. Requesting a different window must not change any shared cell or intersecting object. Keep this guarantee when changing terrain, placement, templates, and presets.

- Use seeded randomness and exact arithmetic for absolute coordinates. Never use `Math.random()`, wall-clock time, or request order in generation.
- Test overlapping windows, adjacent chunks, and coordinates close to `Number.MAX_SAFE_INTEGER`. A 32-bit coordinate coercion silently breaks the world model.
- Bound searches and account for expensive work. A placement rule must not depend on generating every preceding chunk.
- Add representative fixtures and boundary tests for new generation behavior. Check objects that begin outside a requested window and template cells clipped to its edges.

Published generator versions are compatibility contracts. Changing a preset default, hash, biome threshold, template, or placement decision can change saved worlds. Such changes require a new generator version while preserving the old implementation. Do not refresh golden expectations just to make a failing test pass. First identify the output difference and decide whether it violates an existing version's promise. Transport fixes that leave world data unchanged do not require a generator version change.

## Adding presets and templates

Start in `src/presets.ts` and `src/templates.ts`. Presets should demonstrate a useful kind of world and expose their defaults for inspection. Add terrain behavior only when existing controls cannot express the preset.

Test that the preset generates successfully, reproduces its output, and agrees across windows. For mazes or other connected terrain, test connectivity and matching region entrances explicitly. Include a bundled demo and a readable palette when adding a preset to the site.

Templates use rectangular rows of tile identifiers, with `null` for transparent cells. Test nonsquare templates under supported rotations. The whole footprint reserves space, including transparent cells, and generated tiles must remain inside the requested window.

## Code organization

Keep generation independent of HTTP and rendering. The API and MCP handlers should share validation and generation behavior. Browser code should handle interaction and presentation without duplicating the generator.

Use Valibot for request validation and keep published JSON Schemas consistent with runtime validation. Schema constraints that JSON Schema cannot express still need runtime checks and tests. Avoid adding a framework or dependency when a small function covers the requirement.

## License

Contributions are licensed under [Apache-2.0](LICENSE), the project's license. Include attribution and license information for any third-party material you add.
