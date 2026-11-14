# AI Agents

Every project created with `create-nexwire` ships an **`AGENTS.md`** at its root.
It is the contract a coding agent reads before it writes a line of code: the
project layout, the module conventions, the engine's HTTP idioms, and the
commands to scaffold and verify. This page explains what is in that file and how
the rest of the documentation is exposed to an agent.

## What ships in your project

| File        | Purpose                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `AGENTS.md` | The rules. Engine-aware — Hono, Express and Fastify each get their own. |

The file is generated per engine because each engine has a native way of doing
the same thing: a Hono controller is a `Handler` and returns `c.json(...)`, an
Express controller is `(req, res, next)` and returns `res.status(...).json(...)`,
and a Fastify controller receives a typed `request` and a `reply`. The shared
rules — directory-based discovery, the `@/` alias, schema-derived types, facades,
pagination, the response envelope, jobs and realtime — are identical in all
three.

The file is written as a strict contract, not a tutorial: thirteen numbered
sections (`§0 Non-negotiables` through `§13 Before you say "done"`), each a
**Do** / **Never** list so an agent can follow it without interpreting prose.
`§0` overrides everything else, and the closing checklist restates what must be
true before a change is called done.

::: tip Agents read it automatically
Most coding agents (OpenCode, Cursor, Codex, Claude Code, …) look for
`AGENTS.md` in the project root on their own. You do not have to paste it into
the prompt.
:::

## Documentation for agents

The full documentation stays online — nothing is copied into your project.

- **[`llms.txt`](/llms.txt)** — an index of every page with a one-line
  description. Point an agent here first.
- **[`llms-full.txt`](/llms-full.txt)** — every page concatenated into a single
  file, for an agent that would rather read the whole set in one request.

Both are generated from this site at build time, so they never drift from the
published pages. They live at the site root, so the links above resolve to the
same file on the published site and on your local dev server — nothing to
configure, no MCP server.

## The rules the agent follows

These are the conventions described in [Conventions](/guide/conventions) and
[Modules](/guide/modules), restated as the short list an agent needs:

1. **Never edit `src/framework/**`.** It is the framework, not your application.
2. **Directory = meaning.** Files are discovered by folder, not by filename. A
   file in a folder the framework does not scan is invisible.
3. **Name your location.** The first line of every source file is a comment with
   its engine-relative path, followed by one blank line. `maker` writes it for
   you.
4. **Import through `@/`.** Never `../` across folders; a same-folder sibling
   import is fine. In the UI, `@/` is `src/resources/src/`.
5. **Import the framework only from `@/framework/facade.js`** — never from a
   deep `@/framework/<deep>/…` path.
6. **Schemas are the source of truth for input.** Declare each request shape once
   in `schemas/` and derive its type (`z.input<typeof XSchema>`) on the next line.
   A response schema is optional.
7. **Modules talk through facades.** Another module's public API is its
   `facade.ts` — nothing else. A module never imports its own facade, and a
   facade never imports another facade.
8. **Scaffold with `maker`.** Use `npm run maker module:*` so files land in the
   right place. `maker` has a wide surface (modules, database, runtime, testing,
   deploy) — run `npm run maker -- --help` to find the right command instead of
   guessing, and `npm run maker -- <command> --help` for its options. The `--`
   lets npm forward the flag. See the [CLI reference](/cli/reference).
9. **helper = computes, service = does.** Pure logic in `helpers/`, everything
   that touches the database, files or network in `services/`.

## Backend rules

Beyond the conventions above, the contract pins the shape of an endpoint and
where side effects live:

- **Every list endpoint returns a paginator's `PaginatedResult`.** Use
  `paginateModel` / `paginate` / `paginateTable` / `paginateQuery` — never a
  hand-written `LIMIT`/`OFFSET`. `paginate` and `paginateModel` read the page
  params from the request, so the service that calls them takes the request
  context as its first argument (`c` on Hono, `req` on Express, `request` on
  Fastify). See [Pagination](/guide/database#pagination).
- **Every controller answers with `HttpStatusCodes.<NAME>` and the
  `{ message, data }` envelope.** No service builds the HTTP response — a
  service may return a result object carrying an `HttpStatusCodes` value, but the
  controller is the only place that calls `c.json(...)`,
  `res.status(...).json(...)` or `reply.send(...)`.
- **Realtime is `dispatchEvent` / `broadcast` on the server and `pulse` on the
  client** — never a raw `WebSocket`, `EventSource` or polling loop. See
  [Realtime](/guide/realtime).
- **Jobs live in `jobs/` and schedules in `console/` or `schedules/`.** Every
  `dispatchEvent(..., { queue })` name must have a matching `shouldQueue`. See
  [Events & Queue](/guide/events-queue) and [Scheduler](/guide/scheduler).
- **Input is strict; output is flexible.** `body`, `params` and `query` are always
  a schema — that is the trust boundary. A **response schema is optional and never
  required**: it documents the shape, it is not a security control. On Hono and
  Express it feeds the OpenAPI document only; on Fastify, declaring one opts into
  serialization (undeclared fields are stripped, and a mismatch is a `500`), so
  omit it unless you want that filtering.

## Frontend rules

The UI (`src/resources/`) has its own conventions, and this is where improvised
code drifts most:

- **`@/` means `src/resources/src/` in the UI** — a different root from backend
  code, where `@/` is `src/`. Import components, stores and plugins with the
  alias; never `../`.
- **Reuse the shipped components** (`@/components/**`) — `Button`, `Input`,
  `Select`, `Datepicker`, `DataTable`, `Modal`, `Toast`, `Pagebar` — instead of
  hand-rolling inputs, tables or modals. See
  [Components](/guide/resources/components).
- **Register the route.** A page lives at `pages/<feature>/index.vue` and is a
  lazy child of the `dashlayout` route in `router/index.ts` with
  `meta: { requiresAuth: true }`.
- **State and requests live in a Pinia store** (`stores/<name>.ts`), not
  scattered across pages; `stores/example.ts` is the shape to copy, and each
  action calls the API through `@/plugins/axios` (base URL, credentials and the
  401 redirect are already configured).
- **Pages submit through the store, not axios.** Hold a form with
  `useGum(defaults)` and call the matching `*With` helper — `form.postWith`,
  `putWith`, `patchWith`, `deleteWith` (or `gum.postWith` / `getWith` / … for a
  visit with no form), passing `fetcher: (body) => store.action(body)` plus
  `transform`, `onSuccess` and `onError`. See [Gum](/guide/resources/gum).
- **Realtime goes through `@/plugins/pulse`** — `pulse.channel(name).listen(event, fn)`
  paired with the backend's `dispatchEvent(...)`, cleaned up in `onUnmounted`;
  never a raw `WebSocket`, `EventSource` or polling loop. See
  [Pulse](/guide/resources/pulse).
- **Pass data and handlers down as props.** A page owns state and the network
  calls; child components (forms, tables, modals) are dumb — they receive data
  (`:data="rows"`) and typed handler functions (`:edit="edit"`) as props, and
  never import a store, axios, or `dialog`/`toast`/`pulse`.
- **Pure functions go in `helpers/`**, shared reactive state in `composables/`.

The project's `AGENTS.md` spells all of this out; the
[UI guide](/guide/resources/) is the reference.

## Verifying the agent's work

The `AGENTS.md` asks an agent to finish with the same gates you would run
yourself:

```bash
npx tsc -p tsconfig.json --noEmit   # types
npm run typecheck:ui                # the Vue UI
npm run lint                        # biome
npm run test:run                    # vitest
```

See [Unit Testing](/guide/testing) for the module test pattern.
