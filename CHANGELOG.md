# Changelog

## [4.4.6] - 2026-11-21

### Fixed
- **UI Bootstrap runtime (Modal/Toast): use global runtime only** - `Modal.vue` and `Toast.vue` in all three engines (template and `packages/create-nexwire` scaffolder) now use the global Bootstrap runtime (`window.bootstrap.Modal` / `window.bootstrap.Toast`) instead of runtime or type imports from `bootstrap` / `bootstrap/js/dist/*`. The UI entry (`src/resources/src/main.ts`) now imports Bootstrap as an ESM module and assigns it to `window.bootstrap` (`import * as bootstrap from "bootstrap"; window.bootstrap = bootstrap`) so the global is reliably available. This avoids loading/mixing a second Bootstrap runtime (which can duplicate data-API listeners and break components such as dropdowns/collapse). Removed the now-unused `declare module "bootstrap/js/dist/modal.js"` and `"bootstrap/js/dist/toast.js"` shims from `src/types/global.d.ts` (all engines, template and scaffolder). `Modal.vue` and `Toast.vue` wrappers are now consistent (no bootstrap package imports).

## [4.4.5] ΓÇö 2026-11-18

### Added

- **Template (Hono, Express, Fastify)**: `authMiddleware` now accepts an `Authorization: Bearer <token>` access token, so a non-browser client ΓÇö a desktop app, a CLI, a mobile app ΓÇö authenticates against the same protected routes as the browser SPA. The header is read **first** and the access cookie stays the fallback, so a request with neither credential is still `401` and the browser flow is unchanged. The rest of the flow already existed: `POST /api/auth/login` and `POST /api/auth/register` return `{ access_token, refresh_token, token_type: "Bearer" }` in the response body, and `POST /api/auth/refresh-token` already validates a refresh token sent in the body ΓÇö the guard was the only missing piece, so no other server code changed. A bearer client refreshes explicitly by posting its `refresh_token` to `/api/auth/refresh-token` when a protected request comes back `401`, and stores the rotated pair. The middleware file is engine-native (Express reads `req.headers.authorization`, Fastify `request.headers.authorization`, Hono `c.req.header("Authorization")`), so the three engines differ only by that accessor, as before; each template copy is byte-identical to its scaffolder copy (`express` SHA-256 `9698A3B6D6582CD71ACA303E3D84B6B6CD7FF934B31B71B15396054237A684C2`, `fastify` `35D33B1EFA1E1F0516E60E5376502EB2CE094DC27BD552B7002C6253B17F9CDE`, `hono` `556CE1F4BC25E49C5CDCA9D973C5205E9A67C2FDA193D37C18C903455FD8E309`). `guide/auth.md` gains a "Bearer tokens (non-browser clients)" section and its middleware flow diagram now shows the header.

## [4.4.4] ΓÇö 2026-11-15

### Added

- **Template (Hono, Express, Fastify)**: the built-in `DataTable` now preserves the URL query across its own controls and can own the fetch. The built-in search, page-size select and pagination route through a single `navigate()` that rebuilds `{ ...route.query, page, size, search, ...filters }` ΓÇö it overrides only the three built-ins and merges the new `:filters` prop last, so a filter already in the URL (`?source=vat`) survives a search, a page-size change or a page click instead of being wiped. The other new prop, `:fetcher`, points the controls at a store action (`:fetcher="store.index"`): they call it through `gum.getWith({ fetcher })` and still push the URL, so links stay shareable. In URL mode (the default, no `:fetcher`) they keep calling `gum.get(..., { skipFetch: true })` and rely on the page's `watch(() => route.query, ...)` to re-fetch ΓÇö pass `:search` down so the footer reuses the term. `Pagination.vue` and `SelectOpption.vue` are now dumb: they receive a `navigate` function as a prop and no longer import `gum`, `useRoute` or the row data. Docs (`guide/resources/components.md`, `guide/resources/gum.md`) and `AGENTS.md` ┬º10 document both modes and the "do not combine `:fetcher` with `watch(route.query)`" rule, and ┬º10 now presents **fetcher mode as the preferred path** ΓÇö `:fetcher="store.index"` with a single `onMounted` load and no `watch(route.query)` ΓÇö with URL mode as the fallback when the page has no store action. All six copies of each of the three files are byte-identical (`index.vue` SHA-256 `51C07032F709984564FB3A17EEC6FB760D283FC7A5CEA94B5DD93892AB0C6763`, `Pagination.vue` `1F6FDF56DC788C5E4A35CB27CFA0B3EE9F8EA085EB2B3936A98E805AA2F06ECD`, `SelectOpption.vue` `7A014E6D03A2D2A6F7CAB5EA417276B6516A9393F5F96F7C6FBF330BC24B6B88`).

### Fixed

- **Template (Hono, Express, Fastify)**: paginating a built-in `DataTable` no longer drops the reader at the top of the page. A listing that swaps its rows for a shorter loading skeleton while the next page loads made the document shrink (e.g. 1007px ΓåÆ 593px), so the browser clamped `window.scrollY` (637 ΓåÆ 239) and gum's `restoreScroll` ran once ΓÇö before the async fetch resolved ΓÇö leaving the page at the clamped position once the real rows came back. `restoreScroll` now re-applies the saved position on a `requestAnimationFrame` loop until it is reached, the user scrolls (`wheel`/`touchstart` cancel) or an 800ms deadline passes, and it skips the no-op `y <= 0` case; the router's `scrollBehavior` also returns `false` for a same-path navigation (a query-only change such as `?page=`/`?size=`/`?search=`), so it no longer competes with `restoreScroll` by scrolling to the top. Both files stay byte-identical across the three engines and their scaffolder copies (`gum.ts` SHA-256 `50972663241F89A826D5A21BA46501596851EC1A224F6F6F90330E8C0C3AF315`, `router/index.ts` `68A31F5C31966A948767C676AB30E4B4E88CB2B0051F559F38D1C8FB1CFC6C4C`). `guide/resources/router.md` documents the same-path rule and `guide/resources/gum.md` / `components.md` the scroll-preservation behaviour.
- **Template (Hono, Express, Fastify) + docs**: the `AGENTS.md` ┬º10 contract example for `DataTable` now passes all three props the built-in search/page-size needs. The example `CircleTable` previously passed only `:data` + `:search`, so a project generated from the contract shipped a table whose search box and "Show N entries" select silently did nothing ΓÇö they rewrite the URL (`?page=&size=&search=`) with `gum.get(..., { skipFetch: true })` and expect the page's `watch(() => route.query, ...)` to re-fetch. The example now passes `:option="[10, 25, 50]"`, types `data` as the paginator object (`Record<string, any> | null`, not `| any[]`) ΓÇö the component reads `data.path`, `data.current_page` and `data.per_page` ΓÇö and the child renders `<DataTable :data :search :option @remove>`. The ┬º10 rule text now states the three props and the URL-based behaviour. `guide/resources/components.md` documents the same three-prop requirement and the URL-based search/page-size/pagination caveat, and `guide/resources/gum.md`'s simplified example now passes `:search` and `:option`. Shared sections stay byte-identical across the three engines; only the header block and `┬º5` differ, and every templateΓåöscaffolder `AGENTS.md` pair is byte-identical (`hono` SHA-256 `E27865C0C2D8F9E304B0B85DA65EC3BABA2BD698B3EB5A44AE2BC07121FB27D4`, `express` `29AE104DCE556964AF2316AF145481AB607E46280433E4A77C424469ABC788DF`, `fastify` `53B45124EC3DA80AC8DDCCD739903197BF8AD04A491ED3A3DB9FE5B6F242E4F2`).

## [4.4.3] ΓÇö 2026-11-15

### Changed

- **Template (Hono, Express, Fastify)**: the shipped `AGENTS.md` is rewritten from prose into a strict, rule-based contract an agent can follow without interpretation. It is now thirteen numbered sections ΓÇö `┬º0 Non-negotiables`, project layout, module anatomy, schemasΓåÆtypes, services, controllers and routes, facades, realtime/jobs/schedules/notifications, frontend pages, frontend stores, frontend data flow, the `@/` alias, commands, and a closing "before you say done" checklist ΓÇö each with explicit **Do** / **Never** lists instead of narrative. New hard rules include: route every list endpoint through a paginator and return its `PaginatedResult` (`paginateModel` / `paginate` / `paginateTable` / `paginateQuery`, never a hand-written `LIMIT`/`OFFSET`); every controller answers with `HttpStatusCodes.<NAME>` and the `{ message, data }` envelope, and no service builds the HTTP response (`c.json` / `res.status(...).json(...)` / `reply.send(...)` belong to the controller ΓÇö a service may return a result object carrying an `HttpStatusCodes` value, but never shapes the response); realtime goes through `pulse` (`pulse.channel(name).listen(...)`, cleaned up in `onUnmounted`), never a raw `WebSocket` / `EventSource` / polling loop; jobs live in `jobs/`, schedules in `console/` or `schedules/`, and every `dispatchEvent(..., { queue })` name has a matching `shouldQueue`; pages never call axios (they submit to a store action through `useGum` + `form.postWith` / `putWith` / `patchWith` / `deleteWith` or `gum.postWith` / `getWith`); dumb child components receive data and typed handler props and never import a store, axios or `dialog`/`toast`/`pulse`; request types use `z.input` (not `z.infer`); and the UI reuses `@/components/**` instead of hand-rolling inputs, tables or modals. `maker` discovery is now a rule ΓÇö run `npm run maker -- --help` and `npm run maker -- <command> --help` rather than guess a command or flag. The shared sections are byte-identical across the three engines; only the header block and the engine-specific `┬º5 Controllers and routes` differ.
- **Template (Hono, Express, Fastify)**: the `AGENTS.md` contract now separates **input** from **output**. Input is the trust boundary and stays strict ΓÇö `body`, `params` and `query` are always a schema. A **response schema is optional and never required**; it documents a shape, it is not a security control. The engine-specific `┬º5 Controllers and routes` states the trade-off: on Hono and Express a response schema (`responses` / `jsonContent(...)`) feeds the OpenAPI document only and nothing validates or filters the outgoing body, so it can be omitted freely; on Fastify a declared response schema is a runtime serializer (undeclared fields are stripped, and a payload that does not match returns `500`), so the section now shows a request-only route and says to declare `response` only when that filtering or a documented contract is wanted. `┬º3 Schemas ΓåÆ types` drops "Response types may use `z.infer`" and instead says a response schema is optional (derive its type with `z.infer` when you do declare one), and the "register a route without a schema" rule now applies to **requests** only. `guide/ai-agents.md` restates the same policy. The shared sections remain byte-identical across the three engines; only the header block and `┬º5` differ, and every templateΓåöscaffolder pair is byte-identical (`hono` SHA-256 `23fec3bb914ea7daΓÇª`, `express` `8ec303e323e6a32eΓÇª`, `fastify` `69ad52598671db96ΓÇª`). Two wording fixes: the Hono and Express route examples now use `group()` (which is `createRouter()` with group middleware pre-applied, and is what `maker` scaffolds) instead of mixing `createRouter()` and `group()`, and `┬º4` now says `paginate` / `paginateModel` read the request, so the service that calls them takes the request context as its first argument (`c` / `req` / `request`) ΓÇö `paginateTable` and `paginateQuery` need no request.

### Fixed

- **Maker (`module:make`)**: the generated service stubs declared their CRUD methods as arrow-function object properties (`list: async () => { ΓÇª }`, `findOne: async (id) => { ΓÇª }`), which lexically binds `this` to the module scope ΓÇö so a method could not call a sibling through `this.*` (`this.findOne(...)` was `undefined`) and every method had to be written above the ones it used. Both service stubs (`stubs/service/name.ts.stub` and `stubs/service/name.plain.ts.stub`) now use object **method shorthand** (`async list() { ΓÇª }`, `async findOne(id: number) { ΓÇª }`), which binds `this` to the service object at call time, so `this.*` cross-calls work and declaration order no longer matters. The method bodies are unchanged, so generated services stay identical apart from the declaration form. Byte-identical across the three engines and the three scaffolder copies (`name.ts.stub` SHA-256 `916EEB445284A750F7C9942DEAFAF545F02D0DEE34E3394635022398AF73A52D`, `name.plain.ts.stub` SHA-256 `EE9B7AC571E01C337A24621A5CDC8575883DE40BAEA2B73A46C171FC8FA19116`).
- **Template (all engines)**: the shipped `modules/auth/services/*.ts` now declare their methods with object method shorthand (`async login(c, body) { ΓÇª }`, `async me(userId) { ΓÇª }`) instead of arrow-function properties, the same fix as the stubs above ΓÇö so a service method can call a sibling through `this.*` regardless of where it is declared. All nine services per engine are converted (`login`, `logout`, `logoutAllDevices`, `me`, `refreshToken`, `register`, `resetPassword`, `verifyEmail`, `forgotPassword`), and the derived union-type members are re-indented to match. Applied identically to Hono, Express and Fastify (engine-shared files such as `me.ts` stay byte-identical across the three; engine-specific files such as `login.ts` keep their native shape).

## [4.4.2] ΓÇö 2026-11-13

### Added

- **Template (Hono, Express, Fastify)**: every project created with `create-nexwire` now ships an `AGENTS.md` at its root ΓÇö the contract a coding agent reads before writing code. It names the project layout, the shared module conventions (directory-based discovery, the `@/` alias, schema-derived types, facades, "scaffold with `maker`"), the frontend conventions (`@/` is `src/resources/src/` in the UI, reuse `@/components/**`, register the route, keep state and requests in a Pinia store, and submit forms with `useGum` + the `*With` helpers ΓÇö `form.postWith({ fetcher: (body) => store.action(body) })` ΓÇö instead of calling axios in a page, and route realtime through `@/plugins/pulse` instead of a raw WebSocket), the engine's HTTP idioms, and the commands to scaffold and verify ΓÇö with an explicit note that `maker` has a wide surface, so an agent should run `npm run maker -- --help` to find a command rather than guess ΓÇö and links to the online docs and the new `llms.txt`. It is the one file that intentionally differs across the three engines, because each engine has a native way of doing the same thing ΓÇö a Hono controller is a `Handler` returning `c.json(...)`, an Express controller is `(req, res, next)` returning `res.status(...).json(...)`, a Fastify controller receives a typed `request` and a `reply`; the shared rules are byte-identical.
- **Template (Hono, Express, Fastify)**: every source file now names its own location on the first line ΓÇö `// ./src/modules/auth/controllers/auth.ts`, and `<!-- ./src/resources/src/pages/auth/login.vue -->` for Vue SFCs. Module folders repeat filenames on purpose (`controllers/auth.ts`, `helpers/auth.ts`, `services/auth.ts`), and a file pasted into a chat, a diff or a stack trace loses its path; the header restores it. The path is engine-relative, so identical files across the three engines keep identical first lines; one blank line separates the header from the code. The single shebang file (`framework/maker-cli/index.mjs`) keeps `#!` on line 1 and the header on line 2. Skipped by design: `package.json` / `.env` (no comment syntax ΓÇö a `//` line breaks npm and the dotenv parser) and `maker-cli/stubs/**` (templates ΓÇö a hard-coded path would leak into generated files; the generator injects the real path at write time instead). 636 files in `template/*/src`.

### Changed

- **Template (Hono, Express, Fastify)**: request bodies now derive from their Zod schema instead of being hand-written. Every request schema in `modules/auth/schemas/auth.ts` exports its type on the next line (`export type RegisterType = z.input<typeof RegisterSchema>;`, and the same for `Login`, `ForgotPassword`, `ResetPassword`, `RefreshToken`, `VerifyEmail`). Controllers and services import the `*Type` from the schema file, so there is one source of truth and no second interface to keep in sync; `modules/auth/types/auth.ts` is removed. `types/` is now reserved for custom, non-request shapes (`maker module:make-type` still generates it). Generated schema stubs (`module:make`, `module:make-schema`) emit `Create<Name>Type`, `Update<Name>Type` and `<Name>IdParamsType` the same way.

### Fixed

- **Maker (`module:make` / `module:make-schema`)**: the generated schema stubs derived their request types with `z.infer` (the post-parse shape) instead of `z.input`, contradicting the 4.4.2 change above that promised `Create<Name>Type` / `Update<Name>Type` / `<Name>IdParamsType` "the same way" as the hand-written auth schemas and `guide/conventions.md`. A freshly generated module therefore disagreed with the convention it was meant to teach. Both stubs (`stubs/schema/name.ts.stub` and `stubs/schema/name.plain.ts.stub`) now emit `z.input<typeof ΓÇªSchema>`, byte-identical across the three engines.
- **Maker (every file generator)**: generated files now open with their own location header ΓÇö `// ./src/modules/blog/controllers/post.ts` ΓÇö and a blank line, the same line 1 the hand-written template files carry (ground rule 3). `module:make` (facade, controller, schema, service, route, model, seeder), every `module:make-*`, `module:make-notification`, `middleware:make`, `provider:make` and the aggregated `src/database/schema.ts` were all written without it, so a freshly scaffolded module disagreed with the convention it was meant to teach. The destination path is only known at write time, so `utils/file-ops.mjs` now injects the header (`withLocationHeader`, `writeSourceFiles`) from the real output path instead of hard-coding it in a stub ΓÇö which would leak one module's path into every generated file. The injection is idempotent, so re-running a generator with `--force` never doubles the header. Byte-identical across Hono, Express and Fastify.
- **Template (all engines)**: the hand-written `RegisterInput` / `ResetPasswordInput` types had drifted from their schemas ΓÇö both omitted the required `password_confirmation`, and `RegisterInput` advertised a `remember` flag that `RegisterSchema` never accepted (Zod strips unknown keys, so registration always ignored it). Deriving the types exposed the drift: `RegisterSchema` now accepts `remember` (`z.boolean().optional().default(false)`), and the auth tests send complete bodies.

### Documentation

- `guide/conventions.md` gains **Schemas are the source of truth** (`<X>Schema` value + `<X>Type` derived with `z.input`, `types/` custom-only) and **Every file names its own location** (the first-line path header, engine-relative paths, the `.vue` HTML-comment form, the files that cannot carry one, and a note that `maker` injects the header into every file it generates), `guide/modules.md` and `cli/module.md` document the derived aliases in generated schemas and that generated files carry the header, and `guide/fastify.md` documents why `request.body` is `unknown` and why the per-handler `Body<T>` cast is the intended Fastify idiom.
- The docs site now publishes an agent-readable index: `llms.txt` (every page with a one-line description) and `llms-full.txt` (every page concatenated), generated from `packages/docs` at build time so they cannot drift from the published pages. The new `guide/ai-agents.md` page explains the `AGENTS.md` contract and points agents at both files. The page links them root-relative (`/llms.txt`) rather than to an absolute host, so the same link resolves on the published site and on the local dev server, and `npm run dev` now generates the files first (`predev`), exactly as the build does.

## [4.4.1] ΓÇö 2026-11-11

### Fixed

- **Realtime (Hono, Express, Fastify)**: `authFromSocketHandshake()` now falls back to the bare access JWT in `socket.handshake.auth.token` when the request carries no access cookie. Desktop, native and other cookie-less clients previously joined only the `guest` room even after signing in, so `broadcast({ auth: true })`, `roles` and `users` never reached them. Cookie tokens are still signature-verified (`signedCookie` on Express, `unsign` on Fastify, HMAC strip on Hono); a handshake token goes to `jwt.verifyToken()` unchanged because it never had a cookie signature.
- **Template (all engines)**: the `pulse` client exposes `pulse.setToken(token | null | (() => string | null))` and sends the resolved token through the Socket.IO handshake `auth` callback, which runs on every (re)connect. Calling `setToken()` while connected re-handshakes and re-joins every tracked room, and the getter form always sends the freshest token. `PulseToken` is exported, and the `SOCKET=false` no-op client implements `setToken()` so callers need no guard.
- **Realtime rooms (Hono, Express, Fastify ΓÇö security)**: client-emitted `join` is now authorized by `canJoinRoom()` (`src/framework/realtime/rooms.ts`). Guests can no longer subscribe to `auth`, `role:*`, `user:*` or `private:*`; an authenticated user can only join their own `user:<id>` and `private:user:<id>`, plus any `role:<name>` present in their verified token, while `private:<group>` requires authentication; `auth` and `guest` are never client-assignable. Previously any socket could emit `join("user:victim")` or `join("role:admin")` and receive those broadcasts ΓÇö `pulse.private()` had no server-side enforcement at all. A refused join is answered with `join:error` (`{ room, reason: "forbidden" }`) and logged at debug level.
- **Pulse client (all engines)**: `pulse.leave(name)` now also emits `leave` to the server, so the socket actually unsubscribes from the room; before, it only removed local listeners and the socket kept receiving that room's events. Room names are trimmed consistently in `channel()`/`leave()`.

### Documentation

- `guide/realtime.md` and `guide/resources/pulse.md` document handshake-token authentication, the cookie-first precedence, the `pulse.setToken()` API, room-join authorization (own `user:<id>`, authenticated `private:*`, self-only `private:user:<id>`), and the `join:error` reply.

### Tests

- Added `socket-cookie.test.ts` per engine (6 cases each): handshake-only JWT, no signature stripping, cookie verification, cookie precedence, invalid-cookie rejection, and unauthenticated access. Framework tests stay out of the published scaffolder.
- Added `rooms.test.ts` per engine (7 cases each): guest denial for identity rooms, public channels, own-only `user:`/`private:user:` joins, role/auth refusals, `join:error`, and `leave` propagation.

Byte identity: `pulse.ts` is identical across `template/{hono,express,fastify}` and the three `packages/create-nexwire/*` copies (SHA-256 `730EF1F9219869428FD7BC2C886640CF8821F3F05BB8787312817644EC9979CC`), and so is `rooms.ts` (`86F2BC91F52F6F8E42F9F9F7BC44614B455853FFF95CB407D37F652F65DA7B8C`). `socket-cookie.ts` is intentionally engine-specific (cookie verification differs: `hono` `931678CAΓÇª`, `express` `521E2BEFΓÇª`, `fastify` `F2067283ΓÇª`), and `socket.ts` carries engine-specific bootstrap code; every templateΓåöscaffolder pair is byte-identical.

## [4.4.0] ΓÇö 2026-11-09

> 4.3.1 was tagged on `main` but never published to npm; its changes ship in 4.4.0.

### Added

- **Template (new Fastify engine)**: `create-nexwire --engine=fastify` now scaffolds a genuinely native Fastify 5 application instead of a Hono/Express-shaped shim. Route files export `FastifyPluginAsyncZod` plugins, controllers use `(request, reply)`, and services take `(request, reply, body)`. Route groups map to scoped `app.addHook("preHandler", ΓÇª)` or per-route `preHandler`, one-off limits use `config.rateLimit`, and schemas go straight into `app.route({ schema })`. The engine ships `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/static`, `@fastify/multipart`, `@fastify/swagger`, `fastify-type-provider-zod` and `@scalar/fastify-api-reference`; `@bull-board/fastify` serves the queue dashboard. Validation failures return `422` with `{ success: false, error: { name: "ZodError", issues } }`, declared through `ValidationErrorSchema` so Fastify's response serializer never throws. Request state is reachable as `request.auth` / `request.sessionId` / `request.upload` / `request.uploads`, typed in `src/framework/http/fastify.d.ts`. Fastify is **Node-only**; the template omits Bun support.
- **Maker CLI (Fastify)**: every web-shaped generator stub is rewritten for Fastify ΓÇö `module:make` and `module:make-route` (OpenAPI and plain), `module:make-controller`, `middleware:make`, `module:make-middleware`, and `module:make-notification`. Generated route plugins register native `app.route({ method, url, schema, preHandler, handler })` calls, generated controllers use `FastifyRequest` / `FastifyReply` and `HttpStatusCodes`, and generated middleware are async `(request, reply)` hooks that return nothing to continue or return a reply to stop. The `middleware:make` hint now says `app.addHook("preHandler", ΓÇª)` instead of `group(ΓÇª)`.
- **Scaffolder (`create-nexwire`)**: Fastify is a first-class backend in the interactive picker, `--engine=fastify`, help text and the missing-engine message. `scripts/sync-template.mjs` and the package `files` list publish `packages/create-nexwire/fastify`.
- **Docs**: new [Fastify Engine](/guide/fastify) guide covering native plugins, hooks, route schemas, request state, the validation contract, SPA fallback, uploads, the Bull Board adapter and the Fastify-specific maker output. `guide/routing.md`, `guide/middleware.md`, `guide/openapi.md`, `guide/rate-limiter.md`, `guide/support/upload.md`, `guide/quick-start.md`, `guide/introduction.md` and the home page are updated to document all three engines.
- **Template (both engines)**: `gum.ts` now exposes one `useGum(defaults?)` composable that returns the visit API and, when defaults are passed, a fully typed `form` object. `useGum()` without defaults has no `form` (typed `undefined`), so visit-only pages cannot reach form state by accident. Two forms on one page are two `useGum(defaults)` calls; `gum.processing` stays shared while `gum.form.processing` is per form. Overloads keep `gum.form` non-optional when defaults are present.
- **Template (both engines)**: every visit and form method has a URL-less `*With` twin ΓÇö `getWith`, `postWith`, `putWith`, `patchWith`, `deleteWith`, `reloadWith` and the form equivalents ΓÇö that requires a `fetcher` and delegates the network call to it (for example a store method). `visit({ fetcher, ... })` accepts the same object form.
- **Template (both engines)**: `fetcher` may return an `AxiosResponse` **or any plain value** (`string`, domain object, `void`). Plain values are wrapped into `{ data, status: 200, statusText: "OK", headers: {}, config: {} }` before `onSuccess` receives them, so existing store methods work without wrappers. An object is treated as a response only when it has `data` and a numeric `status`.
- **Template (both engines)**: lifecycle hooks (`onBefore`, `onStart`, `onProgress`, `onSuccess`, `onError`, `onFinish`) are shared by visits and forms. `normalizeValidationErrors()` and `clearRememberForPath()` are exported, and `GumPlugin` accepts `rememberPrefix` and `recentlySuccessfulDuration`.

### Changed

- **Template (all engines)**: application-layer code imports `loginLimiter` and `resolveAuthProvider` from `@/framework/facade.js` instead of reaching into `@/framework/http/ratelimiter.js` and `@/framework/providers/adapter.js`. Both are facade exports on Hono, Express and Fastify, so `src/modules/**` and `src/middlewares/**` use one public surface ΓÇö the auth routes and `auth-middleware.ts` are now identical in shape across the three engines. The guides use the same facade import.
- **Template (both engines)**: `gum.visit` in object form now forwards `data`, `query`, `routePath`, `replace`, `preserveState`, `preserveScroll` and `skipFetch` instead of only `method` and `fetcher`.
- **Template (both engines)**: `query` is sent as axios `params` on **every** method again, not only GET. `gum.delete(url, { data })` and `gum.form.delete(...)` keep sending the DELETE body.
- **Template (both engines)**: form errors now follow a single throw policy ΓÇö with `onError` the error is swallowed and `onFinish` still runs; without `onError` it re-throws *after* `onFinish`. `validate` returning `{}` no longer aborts the submit (only a non-empty error map does), and `onStart` runs inside the `try` block so a throw still clears processing state.
- **Template (both engines)**: scroll position is read with a plain `window.scrollY` instead of a per-instance `useWindowScroll` listener, avoiding extra listeners when a page mounts several `useGum()` instances.
- **Template (both engines)**: the auth pages now submit through the auth store with `gum.form.postWith` / `gum.postWith` (`auth.login`, `auth.register`, `auth.forgotPassword`, `auth.resetPassword`, `auth.verifyEmail`) instead of duplicating `/api/auth/*` URLs. Login and register no longer need the extra `auth.bootstrap()` round-trip because the store already syncs the user. `stores/auth.ts` exports its payload types and rethrows the original `AxiosError` with the API message attached, so Gum still normalizes field errors while the pages keep showing the server message.

### Fixed

- **Template (Fastify)**: request ids are now `crypto.randomUUID()` values, matching Hono and Express, instead of Fastify's built-in `req-1`, `req-2` counter. The id is used in the `X-Request-ID` header and the structured access-log line, so the same request can be correlated across engines and log sinks.
- **Template (all engines)**: health, readiness and liveness probes (`/health`, `/ready`, `/live`) are no longer written to the HTTP access log. Previously this depended on route registration order ΓÇö the OpenAPI mode registered `/health` before the logger and skipped it, while `OPEN_API=false` registered it after and logged it ΓÇö so the same app logged probes differently depending on OpenAPI mode, and Fastify logged the dev CLI's startup health poll. The skip is now explicit in the logger for Hono, Express and Fastify.

### Deprecated

- **Template (both engines)**: `useGumForm(defaults)` is kept as a thin alias and still returns the same form object. Migrate to `useGum(defaults).form`; the alias will be removed in a future major.

### Documentation

- **Docs**: `guide/resources/gum.md` is rewritten for the unified API ΓÇö mental model, full method matrix, visit/form options, recipes for every case (`get`/listing/DataTable, mutations, fetcher delegation, reload, `skipFetch`, preserve state/scroll, cancel, throw policy, uploads, validation, reset, dirty, success timing, two forms, mixed calls), lifecycle order, error contract, fetcher contract, both complete examples (URL-based and store-owned `*With`, including the built-in `DataTable` caveat) and migration from `useGumForm`. The `components`, `dialog`, `validation`, `pulse` and `composables` guides now use `useGum(...).form` instead of `useGumForm`.
- **Byte identity**: the new `gum.ts` is identical across `template/hono`, `template/express` and both `packages/create-nexwire` copies (SHA-256 `A6527075703AC2FA4AD44BB63F6F153D9B8FF07DDD87129B0F784726E5A0D51A`). The rewritten auth store and auth pages are identical across all four copies as well.

## [4.3.0] ΓÇö 2026-11-05

### Added

- **Template (both engines)**: notifications now deliver through a channel registry instead of two hard-coded paths. `notify()` stores the record through the notification provider, then sends the same target, record and options to every registered `NotificationChannel` in parallel (`Promise.allSettled`). A channel returns `false` when it has nothing to do and `true` when it delivered. `NotificationChannel`, `NotificationOptions`, `mailChannel`, `broadcastChannel` and `registerChannel()` are exported from `@/framework/facade.js`, and `src/providers/notification.ts` registers the two built-ins at boot. Registration is last-wins by `channel.name`, so an application can replace `mail` or `broadcast`, or add `sms`, push, webhook, chat and so on. `NotificationOptions` gains `sms` and `push` placeholders, but the built-ins ignore them; only a custom channel consumes them. A failing channel is logged and never rejects `notify()` ΓÇö the record is already stored ΓÇö and existing behavior is unchanged: mail is sent only when `options.mail` is set and broadcast only when `options.broadcast` is set. The lower-level `getChannels()` / `clearChannels()` helpers stay in `@/framework/notification/registry.js`, not the facade, and are mainly for tests.
- **Template (both engines)**: circuit breakers are created with `createCircuitBreaker({ name, failureThreshold, resetTimeout, successThreshold })` and identified with `isCircuitBreakerError()` / `createCircuitBreakerError()`. The old `new CircuitBreaker()` class is gone, and the factory closes a hole in the half-open state: exactly one probe request is allowed through, while concurrent callers get the breaker error instead of every caller probing at once. The factory is used by the Redis client, cache, sessions, SMTP mail, S3 storage, the realtime Redis relay used by workers without Socket.IO, the Socket.IO Redis adapter and the scheduler's Redis lock. `CircuitBreaker` is a type alias for the returned object (`ReturnType<typeof createCircuitBreaker>`), and the module is internal to the framework template rather than a facade export.
- **Tests (both engines)**: `circuit-breaker/__tests__/cb.test.ts` covers the factory: threshold trips the breaker, an open breaker rejects with the identifiable error, the reset timeout moves to half-open, only one half-open probe runs, success closes the breaker and a failed probe re-opens it. `notification/__tests__/notification.test.ts` is rewritten to stub provider discovery (`vi.mock("@/framework/providers/loader.js")`) instead of importing the DB/Redis/S3/BullMQ graph, and pins normalization, selective mail/broadcast delivery, parallel channel dispatch and failure containment. Queue, scheduler lock, provider and storage lifecycle tests now mock the factory API and the new Redis/worker semantics. Both suites pass: Hono 367/367 across 29 files, Express 361/361 across 28 files; both `tsc --noEmit` clean.
- **Scaffolder (`create-nexwire`)**: the backend is now chosen in an interactive list instead of silently defaulting to Hono. When `--engine` is not passed and stdin is a terminal, the CLI renders a picker ΓÇö arrow keys move the highlight, `1`/`2` jumps, Enter confirms, Hono stays the default. `--engine` and a non-interactive terminal behave as before (CI still defaults to Hono), and `-y` / `--yes` skips every prompt and accepts the defaults (a project name is still required). The picker is dependency-free and is a data-driven list, so a future frontend adds its own options alongside the two backends. README, the quick-start and the routing guides document the prompt.

### Changed

- **Template (both engines)**: `databaseConfig` became provider-agnostic. It exposes `pool` (`max: 10`, `idleTimeout: 20000`, `connectTimeout: 10000`, `keepAlive: true`), `prepare: true` and `ssl: false`; `database/connection.ts` applies them to mysql2 (`connectionLimit`, `connectTimeout`, `enableKeepAlive`, optional `ssl: {}`), postgres (`max`, `idle_timeout`, `connect_timeout`, `prepare`, optional `ssl: "require"`) and keeps SQLite on libsql. `DATABASE_URL` now accepts the documented `sqlite:./file.db` form by normalizing it to `file:./file.db`, and `:memory:` / absolute `file:` URLs are no longer mangled by `path.resolve`. `detectDialectFrom()` and `databaseDialect` are exported from `@/config/index.js`. `db.execute()` throws when the active driver has no raw `execute` instead of silently calling `.all()` with a different result shape, and `closeDatabase()` logs a close failure but always clears the cached pool and instance.
- **Template (both engines)**: BullMQ now owns its connections. `Queue`, `Worker`, `QueueEvents` and `DurableWorker` receive `connection: { url: REDIS_URL }` instead of sharing the framework's ioredis client, so a busy or dropped shared client no longer takes the queue runtime with it. `redisConfig.enabled` is the single on/off switch: with Redis disabled, `getQueue()` returns `null`, auto-prune and `clearQueue()` no-op, and `startQueueWorker()` throws `"Redis is required for queue workers"`. A shared client that has not finished connecting no longer blocks worker startup; BullMQ connects for itself. `queueJob()` catches `queue.add()` failures, logs them and returns `null`, and queue progress/completion/failure lines go through the framework logger instead of `console.log`.
- **Template (both engines)**: realtime and Redis failures are contained. `broadcast()` is now async and `dispatchEvent()` awaits it; the Redis relay and the Socket.IO adapter attachment run through circuit breakers and log instead of throwing, so a worker without Socket.IO or an unreachable Redis no longer rejects an event dispatch. `dispatchEvent()` also catches `queueJob()` failures and logs them. `initRedis()` wraps connect/ping in a breaker and records the real error, while `redisClientIfReady()` returns any connected client without hiding it when the breaker is open ΓÇö each caller guards its own operation. Redis config validation now requires a `redis://` or `rediss://` protocol and a hostname, and accepts a missing port because ioredis defaults to 6379.
- **Template (both engines)**: Socket.IO and Redis lifecycle lines (`Redis disabled`, `Redis connected`, `Socket.IO disabled`, `Socket.IO enabled`, adapter attached) now log at `debug` instead of `info`, so a disabled subsystem does not print noise on every boot; the startup banner already reports realtime and Redis status. The `Redis disabled` banner now says `configured in .env`, where the switch actually lives, instead of `src/config/redis.ts`. The realtime socket test mock now records `debug` lines so the disabled-path assertion still sees the message. Both suites pass: Hono 367/367 across 29 files, Express 361/361 across 28 files; both `tsc --noEmit` clean.
- **Template (both engines)**: `runWithLock()` runs its Redis lock through a breaker and falls back to the database lock table when the breaker is open or the Redis `SET NX` fails, logging which path was taken. `session.set()` reads the raw Redis client inside its `exec()` instead of calling `session.all()`, which previously deadlocked the half-open probe (the inner breaker-wrapped call saw the outer probe in flight and rejected). `cache.remember()` calls `this.set()`; the previous `this.put()` did not exist.
- **Template (both engines)**: the default auth provider no longer relies on `this` binding. `getUserContact()` calls a standalone `getUserById` function, so recipient lookup still works when the provider method is destructured or invoked through the facade instead of as `provider.getUserContact()`.
- **Template (both engines) / Scaffolder**: `maildev` stays on the stable `^2.2.1` line in `template/{hono,express}/package.json` and in `create-nexwire`'s optional peer range. MailDev 3.0.0 has a problem that makes it unsuitable here, so the 4.2.5 note that moved it to `^3.0.0` is superseded. The `@maildev/*` overrides remain in `package.json` but are inert on 2.2.1; MailDev 2.2.1 is dev-only and still brings its own `nodemailer` 6, `jsdom` 24 and `dompurify` 3 chain, which the 4.2.5 overrides (written for MailDev 3's split packages) do not reach.
- **Template (Express)**: the HTTP access log uses `req.originalUrl` (Express routers rewrite `req.url` inside route handlers) and skips `/queues`, `/favicon.ico`, the OpenAPI spec path and the `/api-docs` page. `/health` is logged again, as on the Hono engine.
- **Template (both engines)**: the startup banner is rebuilt. `API Docs` prints only when `OPEN_API=true`, API-only mode prints `UI: .env -> UI=false (API-only mode)`, the Drizzle Studio line always prints, the queue-dashboard and Redis UI lines print only when Redis (and the dashboard) is enabled and the dev view was requested, the MailDev line is gated on the SOCKET/realtime server being enabled and the `maildev` dev view, the Redis-disabled banner reads `.env -> REDIS=false`, and the realtime line prints the WebSocket URL, prefixed by `https://admin.socket.io` when the Socket.IO admin UI is on.
- **Template (Express)**: `/health` is registered exactly once. With `OPEN_API=true` it is registered inside the OpenAPI block (typed route + handler), otherwise as a plain route at the end; previously the handler was registered unconditionally in addition to the OpenAPI route. The OpenAPI configuration, the request logger and the rate limiter are wired before `/ready`, so `/ready` and `/metrics` are now rate-limited and logged like other routes.
- **Docs**: `guide/notification.md` and `api/notify.md` document the channel contract, the built-in `mail`/`broadcast` channels, last-wins registration, `sms`/`push` options, parallel dispatch, failure containment, and where `getChannels()` / `clearChannels()` actually come from. `guide/architecture.md` corrects the circuit-breaker location and API and lists the guarded subsystems. `guide/configuration.md` documents the database pool/SSL fields and the relaxed Redis URL validation. `guide/env.md` keeps `SOCKET` at its real default (`false`). `guide/events-queue.md`, `api/queue.md` and `api/queueJob.md` describe BullMQ's own connection and the Redis-off worker guard. `guide/realtime.md` covers the async broadcast path, `WS_PATH` and the adapter fallback. `guide/providers.md`, `api/registerProvider.md` and `guide/resources/vite-config.md` are updated to match the channel delivery and Vite defaults.

### Fixed

- **Template (both engines) / UI**: the Vite config resolves the project root from its own location (`fileURLToPath(import.meta.url)`) and reads `.env` from there with `loadEnv(mode, projectRoot, "")`, so a different process cwd can no longer point Vite at the wrong `.env`. The `/socket.io` proxy is only added when `SOCKET` is exactly `"true"`, and an unset `SOCKET` is off, matching the backend schema. Pulse now reads `import.meta.env.VITE_SOCKET_ENABLED`, which Vite inlines into the plugin in dev and in the production bundle, instead of the `__SOCKET_ENABLED__` global that Vite 8 installs once on `window` from `vite/env`; a dev server started while `SOCKET=true`, or a browser-cached `vite/env` module, could keep that global `true` after the proxy was removed, so the UI kept opening Socket.IO polling requests that the API answered with `404`. `__SOCKET_ENABLED__` is still emitted for compatibility, but Pulse no longer depends on it. Restart the dev stack and hard-refresh the tab after changing `SOCKET`.
- **Template (both engines)**: event dispatch no longer fails the caller when the broadcast relay or the queue is unavailable. Before, an unhandled `redis.publish()` rejection or a BullMQ `add()` error could bubble out of `dispatchEvent()` and from there out of `notify()`; both are now logged, while the notification record that was already stored stays valid.
- **Scaffolder**: `scripts/sync-template.mjs` now pins `SOCKET=false` next to `REDIS=false` in the tracked `.env` it publishes. The template `.env` is gitignored and developer-local, so a local `SOCKET=true` was copied into `packages/create-nexwire/express/.env` and would have shipped as the default; a fresh project's UI then opened `/socket.io` even though the documented default is off. Both engine `.env` files now ship `SOCKET=false` and `REDIS=false`, matching `.env.example`.
- **Scaffolder**: the sync also strips working-tree build artifacts from the published package. `vite build` writes the built frontend into `public/` (the template's `build.outDir` is `../../public`), `maker deploy:init` writes `deploy/`, and `tsc` writes `dist/`; `*.log` and root-level `deploy/` were filtered at copy time, but `public/` contents would have shipped. The sync now resets `public/` to `.gitkeep`-only, resets `src/storage/logs/` to empty `app.log` and `fatal.log` (request data from local runs is never published), and removes the engine-root `deploy/` and `dist/`, then refuses to publish if anything else remains there. The scaffolded project looks like a clean checkout.

## [4.2.5] ΓÇö 2026-11-02

### Fixed

- **Template (both engines) / Scaffolder**: the UI head instance sets the title template through `createHead({ init: [...] })` again. 4.2.4 passed `titleTemplate` directly to `createHead`, which `@unhead/vue@3` no longer reads from its options: it type-errors in the editor (`'titleTemplate' does not exist in type 'CreateClientHeadOptions'`, plus an implicit-`any` for the callback) and is silently ignored at runtime, so every page rendered its bare title (`Login`) without the `| nexwire` suffix. The documented v3 form, `init`, restores both: titles render as `Login | nexwire` again and the two editor errors are gone. The `entry-point` guide is updated with the same snippet.
- **Template (both engines) / Scaffolder**: the UI Vite config resolves `root` from the config file itself (`fileURLToPath(new URL(".", import.meta.url))`) instead of the relative `"src/resources"`. The relative value depended on the process working directory, so Vite+ reported a Vitest error when it loaded the config from another directory. Dev, build and the UI typecheck now resolve the same project wherever the tool is launched.

### Added

- **Template (both engines) / Scaffolder**: `npm run typecheck:ui` (`vue-tsc --noEmit -p src/resources/tsconfig.json`) and `vue-tsc ^3.3.13` as a dev dependency. The root `tsc --noEmit` excludes `src/resources`, and the Vite build strips types without checking them, so the 4.2.4 head regression shipped even though the backend typecheck was green. `build:ui` now runs the UI typecheck first, so a red squiggle in `src/resources` fails the build instead of reaching npm.
- **Template (both engines) / Scaffolder**: `src/resources/src/helpers/assets.ts` adds a default `asset()` helper that resolves an image path to the URL Vite emits, so paths computed at runtime work in both dev and production. It accepts `@/...`, `/...`, `../...` and full `http(s)`/`data:` URLs: `@/` and `/` normalize to `/src/...`, `../` is matched against the glob keys by suffix, and an unknown path warns and returns the input unchanged. The helper eagerly globs `png`, `jpg`, `jpeg`, `svg`, `webp` and `gif` under `/src`, so every matching image is hashed and copied by the build. It is UI-only (`import.meta.glob`) and documented in `guide/resources/helpers.md`; the resources index lists it.

### Changed

- **Docs**: the guides are restructured so auth, middleware, roles, providers and notifications can be implemented from the documentation alone, without reading the template source. `guide/middleware.md` is new and canonical ΓÇö where middleware lives, `group()` vs per-route arrays, ordering and short-circuiting, the `next()` rules, `c.set`/`res.locals`, the verified global and route-level stacks, and how to test one ΓÇö and `routing.md` keeps a short pointer to it instead of duplicating the API. `guide/auth.md` is reordered task-first (protect a route, then what the middleware does) and fixes the 401-vs-degraded contradiction: with a provider, an unauthenticated request is always `401`; with **no** provider the middleware logs a warning and passes the request through unauthenticated, so handlers must check for a missing `auth`. It also documents the seeded `admin`/`user` roles and demo password, the `401`/`403` split, the "role must be a string" caveat that breaks `requireRole` when a provider returns `{ id, name }`, `hasRole(auth, ["admin"])` with its real array signature, the auth module map, and that registering a provider replaces rather than extends the built-in one. `guide/providers.md` gains "One file, a folder, or a module?" with the loader's actual rules ΓÇö every file in `src/providers/**` is imported at boot, while a module's `drivers/` folder stays cold because only `providers.ts` and `providers/*.ts` are imported ΓÇö plus the SMS-vs-OTP capability/domain split and the note that `provider:make` only writes a flat file. `guide/notification.md` documents `type` as a free-form category, corrects mail delivery to "queued when Redis is available, direct otherwise", and adds the delivery matrix (broadcast and mail are the only built-in paths; SMS, push and webhook are your own code) plus a complete custom `NotificationProvider` example with the `200`/`404`/`503` state matrix. Eight pages that showed `routes/api.ts` now show the file the generator actually writes, `routes/index.ts`.

## [4.2.4] ΓÇö 2026-10-25

### Added

- **Template (both engines) / Scaffolder**: the notification module is now **opt-in**. A new project has no `src/modules/notification/`, no `notifications` table and no `/api/notification/*` routes; `notify()` warns once and returns `null` until the module is generated. Run `module:make-notification notification` to write the full backend ΓÇö model, default storage provider, controller, schemas, routes and mail job ΓÇö then `module:migrate notification` to create the table. The generator prints that migration command when it writes the store; a second, panel-scoped module only adds an HTTP surface over the same store, so it needs no migration. This keeps a permanent table out of projects that never use notifications.
- **Template (both engines) / Scaffolder**: the generated module is standalone. There is no foreign key to `users`, no import of `@/modules/auth`, and no users-model fallback anywhere in the path, so deleting or replacing auth has **zero** effect on notifications. The table is the module's own: `id` is a `TEXT` primary key holding a UUID generated by the default provider, the owner is a polymorphic `(notifiable_type, notifiable_id)` pair stored as text, and two indexes cover the read paths ΓÇö `(notifiable_type, notifiable_id, read_at)` and `(notifiable_type, notifiable_id, created_at)`.
- **Template (both engines) / Scaffolder**: a `NotificationProvider` contract, so storage is replaceable without touching the runtime. It has `create`, `list`, `unreadCount`, `markRead`, `markAllRead` and `remove`, plus an optional `deleteForTarget` for bulk cleanup. `registerNotificationProvider`, `getNotificationProvider`, `hasNotificationProvider` and `clearNotificationProvider` are exported from `@/framework/facade.js`. `resolveNotificationProvider()` loads provider files and returns the registered implementation or `null`; there is no built-in fallback import, so the framework never hard-codes the module. Mail and realtime stay in the framework runtime: a custom provider only replaces storage, so `notify({ broadcast, mail })` keeps working. With no provider, `notify()` warns once (naming both maker commands) and returns `null` instead of throwing, and the generated HTTP handlers answer `503`; a missing auth context answers `401`.
- **Template (both engines) / Scaffolder**: numeric and UUID auth ids are both first-class. `notify(userId, ΓÇª)` accepts `number | string`, and an explicit `{ type, id }` target works too; the provider always receives the id as text, so the same call works whether auth uses auto-increment integers or UUIDs. Every id in the auth contract ΓÇö `AuthProviderUser.id`, `AuthProviderRefreshToken.id`, `AuthUserContext.id`, the `getUserById` / `getUserContact` arguments and the refresh-token operations ΓÇö is now `number | string`.
- **Tests (both engines)**: `notification/__tests__/notification.test.ts` pins the two guarantees `notify()` makes regardless of provider: a numeric id and a string id both become a stable `{ type, id }` target (so replacing auth never changes notification code), and a missing provider is warned about once and skipped. The provider suite covers `registerNotificationProvider` / `getNotificationProvider` / `hasNotificationProvider` / `clearNotificationProvider`, and the generator suite covers the notification module (full store on first run, store reuse by a panel module, `--notifiable` plus rejection of an unsafe value). `maker-cli/__tests__/db-dialect.test.ts` is new and pins SQLite-vs-MySQL migration detection. Hono 352/352 across 28 files, Express 346/346 across 27 files; both `tsc --noEmit` clean.

### Changed

- **Template (both engines) / Scaffolder**: new projects no longer ship the notification module or its table. Both `template/{hono,express}/src/modules/notification/` directories are gone, `src/database/schema.ts` exports only the auth models, and the regenerated `0000_init` migration plus both prebuilt SQLite databases contain five tables (roles, users and the three auth token tables) with no `notifications`. Projects that want notifications generate the module and table with the two commands above.
- **Template (both engines) / Scaffolder**: `module:migrate <module>` now regenerates `src/database/schema.ts` from every module model, then generates and runs a migration from that full schema. It used to generate from a temporary schema containing only the requested module's models; because Drizzle diffs against the last snapshot, that emitted `DROP TABLE` for every other module ΓÇö auth included ΓÇö so installing notifications with `module:migrate notification` could have dropped the rest of the database. The `--keep-temp` flag is gone with the temporary schema. The command still verifies that the module exists and owns at least one model before touching migrations.
- **Template (both engines) / Scaffolder**: email recipients are resolved by `mail.to` first, then the **auth provider's** `getUserContact(id)`, then skipped. The previous third step ΓÇö reading the default `users` model directly ΓÇö is gone, because it was the one place the notification path still depended on the auth module existing. A notification whose recipient cannot be resolved still stores and broadcasts; only the email is skipped.
- **Docs**: the notification guide now describes installation as `module:make-notification` + `module:migrate`, the generated file set, the store singleton, the table schema, the opt-in lifecycle, the `401`/`503` paths and string notification ids in the UI snippets. The upgrade section for 4.2.3-and-earlier projects replaces the old in-place table rewrite with a drop, backup and copy sequence that matches Drizzle's snapshot flow. The providers guide, the modules guide, the CLI module page and the `notify` / `getProvider` / `registerProvider` API pages no longer claim that notifications ship by default, and `module:migrate` is documented as a full-schema migration.
- **Template (both engines) / Scaffolder**: runtime dependency floors now point at the patched releases: `hono` 4.13.14 (static-file middleware bypass), `express` 5.3.0 (the `qs`, `body-parser` and `proxy-addr` fixes), `@hono/node-server` 2.1.5, `zod` 4.6.7 (memory exhaustion through oversized constrained collections), `vite` 8.3.5 (launch-editor command injection on Windows), `multer` 2.5.0 (async `fileFilter` denial of service), `express-rate-limit` 8.7.1, `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `socket.io` / `socket.io-client` 4.8.4, `@vitejs/plugin-vue` 6.0.10, `@asteasolutions/zod-to-openapi` 8.5.0 and `@bull-board/*` 9.10.5 (express). `@hono/zod-openapi` stays on `~1.5.3`: 1.6.x pulls `@asteasolutions/zod-to-openapi@9`, whose peer range conflicts with `stoker@2.0.1` (`^8`), and the bump carries no security fix. The Hono `@bull-board` packages stay on 8.6.1 and Hono stays on 4.x for the same reason ΓÇö `hono@5` is still a release candidate and `@bull-board/hono@9` belongs to that migration. No source changes were needed; every bump is a patch or a same-major minor.
- **Template (both engines) / Scaffolder**: `nodemailer` moves to `^10.2.1`, the only line that fixes the SMTP command/cross-domain injection advisory, and `maildev` moves to `^3.0.0`, whose split `@maildev/*` packages replace the vulnerable `dompurify` 3.4 chain. MailDev 3.0.0 still asks for `nodemailer ^9` inside `@maildev/smtp` and `zod ^3` inside `@maildev/mcp`, so the new `overrides` block pins both to the top-level fixed releases (`nodemailer ^10.2.1`, `zod ^4.6.7`); the MCP package does not import zod at runtime and `@modelcontextprotocol/sdk` accepts `zod ^4`, so the alias is safe. The framework transport only calls `createTransport` and `sendMail`, and MailDev 3 keeps the `--smtp` / `--web` flags `maildev:view` passes, so both upgrades are drop-in. Smoke-tested on both engines: MailDev 3 starts, serves its web UI with `200`, accepts a message sent through nodemailer 10, and lists it from `/api/email`. The scaffolder's optional peers now say `nodemailer ^10` and `maildev ^3`, and its `sass-embedded` peer is replaced by `sass`, matching what the templates have shipped since 4.1.2.
- **Dependency note for existing projects**: lockfiles are gitignored and never published, so a fresh scaffold already resolved these fixes from the old caret ranges; an existing project keeps whatever its own lockfile pins. To pick the fixes up, copy the changed ranges, the `overrides` block and the `allowScripts` block from the new `package.json` and run `npm install`. This applies to projects created with 4.2.4 before this refresh, and to 4.2.3 and earlier. The `overrides` block is the npm/bun field: pnpm 11 reads overrides only from `pnpm-workspace.yaml` and Yarn reads `resolutions`, so mirror the same entries there if you install with pnpm or Yarn ΓÇö the direct ranges apply everywhere, but without the mirror the nested `@maildev/smtp > nodemailer` / `jsdom`, `@esbuild-kit/core-utils > esbuild` and `redis-commander` pins are skipped.
- **Template (both engines) / Scaffolder**: the engine manifest now declares `"node": ">=22.12.0"` instead of `>=22`, matching the floor the four README copies, the quick-start guide and `create-nexwire`'s own `engines` already stated. With the floor correctly declared, the two Node-gated majors land: `vitest` and `@vitest/coverage-v8` move to `^5.0.5` (Vitest 5 requires `^22.12.0 || ^24 || >=26` and peers Vite 8), and `commander` moves to `^15.0.0` (Commander 15 is ESM-only and relies on `require(esm)`, available from 22.12). The maker CLI and both CLI test files already import `commander` as ESM and the tests run through Vitest's ESM loader, so the ESM-only switch is transparent; MailDev's own nested Commander 12 is untouched because the overrides only cover its `nodemailer` and zod dependencies. Verified on Vitest 5: `tsc --noEmit` clean, Hono 352/352 and Express 346/346, both coverage runs complete with the v8 provider, and `maker --help` renders on both engines.
- **Template (both engines) / Scaffolder**: the UI's head manager moves from `@vueuse/head@2.0.0` ΓÇö last published in 2023 ΓÇö to `@unhead/vue@3.4.3`, the library it wraps. `createHead` now comes from `@unhead/vue/client` and `useHead` from `@unhead/vue`; the `titleTemplate` and the six static page titles are unchanged. This removes all three `unhead` advisories (the `useHeadSafe` XSS bypasses) at the source instead of accepting them as residual, and the production UI build still transforms the same 194 modules. The `entry-point`, `pulse` and `notification` docs and the scaffolder's optional peer list now reference `@unhead/vue`.
- **Template (both engines) / Scaffolder**: `package.json` now ships an `allowScripts` map, because npm 11.19 blocks dependency lifecycle scripts by default and ends every install with a list of packages whose scripts it skipped. The five name-only entries (`@parcel/watcher`, `esbuild`, `msgpackr-extract`, `redis-commander`, `vue-demi`) cover the installed tree, including both esbuild lines currently resolved, so a fresh `npm install` has nothing left to review; `redis-commander`'s postinstall is only an informational `echo`. Name-only entries survive version bumps, unlike npm's default pinned form. The quick-start's package-manager section documents the equivalent pnpm `allowBuilds` and Yarn `dependenciesMeta` lists, and now includes `vue-demi` in both.
- **Template (both engines) / Scaffolder**: two more `overrides` remove the remaining audit findings and one deprecated dependency. `@esbuild-kit/core-utils > esbuild` is pinned to `^0.25.12`: that loader is a vestigial `drizzle-kit` dependency, it calls only the stable `transform` / `transformSync` API, and the pin dedupes it with drizzle-kit's own esbuild. `@maildev/smtp > jsdom` is pinned to `^27.4.0`, the first jsdom line that both supports the Node 22.12 floor and uses `@exodus/bytes` instead of the deprecated `whatwg-encoding`. Result on both engines: `npm audit` (dev included) reports **0** findings, `npm install-scripts ls` is empty, and `drizzle-kit check` plus the MailDev HTTP/SMTP smoke pass. Four deprecation warnings remain and are upstream-blocked: `@esbuild-kit/esm-loader` and `@esbuild-kit/core-utils` (drizzle-kit 0.31; 1.0 is still RC), `cron-parser@4` (bullmq 5; bullmq 6 is blocked by `bullmq-durable`'s `^5` peer) and `lodash.isequal` (redis-commander 0.9.0).

### Fixed

- **Template (both engines) / Scaffolder**: SQLite migrations were misread as MySQL. `detectMigrationDialectFromSql()` tested the MySQL backtick hint before the SQLite hints, and Drizzle quotes SQLite identifiers with backticks too, so every SQLite history was classified as a dialect change and **wiped** on the next `db:generate` or `module:migrate` ΓÇö then recreated as a new `0000_init` against tables that already existed. The distinctive SQLite hints (`autoincrement`, `pragma`) are now checked first. Regression tests cover SQLite, MySQL and Postgres input.
- **Template (both engines) / Scaffolder**: `notify()` no longer depends on the default auth module. It resolves storage through the provider contract and the recipient through the auth provider, so replacing or deleting `src/modules/auth/` leaves the notification module untouched instead of breaking the insert path or cascading rows away with the old foreign key. Verified by a test that registers only a fake notification provider and never imports auth.
- **Template (both engines)**: `redis:view` no longer pulls the native `bcrypt` ΓåÆ `@mapbox/node-pre-gyp` ΓåÆ `tar@6.2.1` chain that `npm audit` reports as critical. A `redis-commander`-scoped `overrides` block pins its bundled Express and body-parser to the patched 4.x releases and aliases its optional native `bcrypt` to pure-JS `bcryptjs` 3, which also removes the node-gyp build that needs a compiler on Windows. Redis Commander only calls `hashSync`/`compareSync`, both present in bcryptjs. Smoke-tested on both engines: the commander starts on a live Redis, serves its UI with `200`, and `require("bcrypt")` resolves to `bcryptjs@3.0.3`.


## [4.2.3] ΓÇö 2026-10-22

### Added

- **Template (both engines) / Scaffolder**: a provider registry ΓÇö the framework's public extension point. Files in `src/providers/` (app-wide) and `src/modules/<module>/providers.ts` (module-scoped) are imported automatically at boot, so an implementation is registered simply by dropping a file in place: no edit to `app.ts`, no import of framework internals. `registerProvider`, `getProvider`, `hasProvider`, `clearProvider` and `listProviders` are exported from `@/framework/facade.js`, together with the typed `registerAuthProvider`, `getAuthProvider`, `hasAuthProvider` and `clearAuthProvider`. The facade is the framework's public API; `@/framework/...` internals are no longer part of the documented surface.
- **Template (both engines) / Scaffolder**: provider-agnostic auth. The auth middleware and the notification mailer ask an auth provider for the user instead of importing `@/modules/auth/*`, so the default auth module can be deleted or replaced. A provider may return any user shape ΓÇö extra fields (`tenantId`, `plan`, `status`, ...) are passed through to `c.get("auth")` / `res.locals.auth` ΓÇö and `getAuthContext()` overrides that context entirely when a project needs a different shape.
- **Template (both engines) / Scaffolder**: a module can offer more than one implementation. `src/modules/<module>/providers/*.ts` is imported at boot alongside `src/modules/<module>/providers.ts`, so a module with several providers keeps them in their own folder instead of piling them into one file ΓÇö the same shape the other module folders already have.
- **Template (both engines) / Scaffolder**: every scaffolded module now gets a `providers.ts` next to its `facade.ts`. It is the place where a module plugs its own implementations into the application, and it is imported automatically at boot, so the module never has to be wired into the app by hand.
- **Template (both engines) / Scaffolder**: `provider:make <name>` generates an app-wide provider in `src/providers/`, and `module:make-provider <module> [name]` generates one inside a module's `providers/` folder. Both generated files register themselves when they are imported. The two commands are filed in separate help sections on purpose, the way `middleware:make` and `module:make-middleware` are: they look interchangeable and are not ΓÇö one writes for the whole app, the other for a single module.

### Changed

- **Template (both engines) / Scaffolder**: `notify()` resolves the email recipient through the auth provider (`getUserContact()`), falls back to the default `users` model, and accepts an explicit `mail.to`. When no recipient can be resolved the email is skipped instead of failing the notification, so notifications keep working without the default auth module.

### Fixed

- **Template (both engines) / Scaffolder**: the framework boots safely when optional app modules are missing or replaced. The auth middleware warns and lets the request through when no auth provider is available at all, `@/framework/notification` becomes a no-op when the notification model is gone, and the seeder skips missing or invalid seeders with `[seed:skip]` instead of aborting `db:migrate --seed`.
- **Template (both engines) / Scaffolder**: the framework no longer imports the generated schema barrel (`src/database/schema.ts`). It builds the Drizzle schema from the modules that actually exist, so deleting or replacing a module ΓÇö the auth module included ΓÇö no longer breaks startup with a missing-import error. The barrel stays the source for drizzle-kit and is regenerated by the CLI before every migration.

## [4.2.2] ΓÇö 2026-10-08

### Added

- **Template (both engines)**: the maker CLI now loads `maker/commands.ts` as well as `maker/commands.mjs`, so a project's own commands can be written in TypeScript and import project modules through `@/` ΓÇö replacing the wrapper pattern the scaffold itself used to recommend: a thin `.mjs` file whose only job was to `spawn("npx", ["tsx", ...])` the real logic back out to a child process, which loses exit codes, doubles startup, and leaves the wrapper and the script it wraps free to drift apart. When the resolved project file ends in `.ts`, the loader registers tsx's ESM hooks in-process via `tsx/esm/api` before importing it, with no options so tsx discovers the project's `tsconfig.json` from the cwd ΓÇö which is where the `paths` mapping lives ΓÇö guarded by a `globalThis.__nexwireMakerTsxRegistered` flag because registration is process-wide: two overlapping `register()` calls corrupt the loader (proven with a probe; a module-level flag is not enough for a test runner that re-evaluates the module inside one process), and the registration is deliberately never undone because a command's action can `await import("@/ΓÇª")` after dispatch, when the hooks must still be alive. The `.mjs` path never imports tsx at all ΓÇö byte-identical to what shipped before ΓÇö so projects that use plain JavaScript pay nothing for this and production installs without devDependencies are unaffected, tsx being a devDependency. If both files exist, `maker/commands.mjs` wins: it is the incumbent and an existing project must not break, and the CLI prints a warning naming the ignored `.ts` file rather than leaving it silently dead ΓÇö the same "ignored, and you are told" rule the framework applies to file collisions elsewhere. Verified in two real scaffolded projects, not only the template suite: **game-ho**'s `maker/commands.mjs` ΓÇö a `runTsx` wrapper whose only job was to re-launch `npx tsx` on the real CLI in a child process ΓÇö became a `maker/commands.ts` that imports `runSimulation` and `runCertification` from `src/` through `@/` and calls them directly, so the wrapper is gone: `maker simulate dice --spins 1000` and `maker certify` both dispatch in-process and print their full reports, the CLI scripts still run standalone through an invoked-directly guard, and `tsc` (root and maker configs), biome and the project's 134/134 tests are all clean; **game-ex**, which had no project commands at all, gained a `maker/commands.ts` whose action dispatched through `@/` (134/134, `tsc` clean), and the both-files rule was observed live there ΓÇö `maker/commands.ts is ignored because maker/commands.mjs exists. Keep one - delete the file you are not using.`, the `.mjs` command ran, the `.ts` one was absent, and deleting the `.mjs` restored the `.ts`. The template suites cover the same contract: 6 new tests per engine, each proven red before it went green ΓÇö the five loader tests against the old loader (missing export, `loaded:false` for a throwing `.ts`, no warning for both files) and the sixth by removing `maker/tsconfig.json` ΓÇö and green after: hono 326/326, express 320/320, both `tsc`-clean. A real project is what made the last piece necessary: a file no tsconfig claims falls into TypeScript's inferred project, and `maker/commands.ts` showed phantom errors for `node:child_process` and every `@/` import ΓÇö the editor equivalent of the feature simply not being there. `maker/` must stay outside the root `include`, because adding it changes the common source directory and would relocate every emitted file under `dist/`, so the scaffold ships `maker/tsconfig.json` instead: extends the root config, `noEmit`, `rootDir: ".."`, include `maker/**/*.ts`. The editor picks that config up for anything under `maker/` and the reds disappear (`tsc -p maker/tsconfig.json` exits 0 on both real projects), while `build:backend`'s `tsc -p tsconfig.json` never reads it and `dist/` is untouched.

### Changed

- **Template (both engines)**: the `maker/commands.mjs` template written by `maker:init` told developers to keep "thin .mjs files" that import project code by relative path ΓÇö advice that was already wrong for any TypeScript source, and the reason projects grew spawn wrappers like game-ho's. The comment now says the file is plain JavaScript under plain Node, cannot import TypeScript source or a tsconfig path alias, and that a command needing either should name the file `maker/commands.ts` instead ΓÇö nexwire loads that through tsx with the project's tsconfig applied. `maker:init` itself still creates the `.mjs`, so nothing about an existing workflow changes.

## [4.2.1] ΓÇö 2026-10-08

### Fixed

- **Template (both engines)**: `group(middleware)` ran for routes it was never declared on. It registered the middleware as a catch-all on the router ΓÇö `use("*", ...)` on hono, `use(...)` on express ΓÇö which is a route entry rather than a property of the routes being grouped, and route entries are what a mount copies. A module that exports a public group and a protected group under the same prefix, which is the documented pattern, therefore shared middleware across them: **a request to a protected route also ran the public group's rate limiter**, because the limiter was registered first and matched everything entering the parent. Measured directly rather than inferred ΓÇö a probe against the old code recorded `["limiter:/mod/private","auth:/mod/private"]` for a route that only ever declared `auth`. The same catch-all reached beyond the group altogether: add any route to the parent after mounting the group and the group's middleware ran for it too, so a login rate limiter could start throttling an unrelated endpoint. `group()` now records its middlewares on the router and merges them into each `api()` call, so they travel with the routes they were declared on and reach nothing else. Ordering within a route keeps its one guarantee ΓÇö group middleware still runs before the middlewares passed to `api()` ΓÇö but its position relative to validation is now identical on both engines, and that **is a change on express**: a router-level `use()` sits ahead of every route in the stack, so express previously ran group middleware *before* the route's validation middleware, whereas hono has always validated first because validation happens before the wrapped handler runs. express now validates first too, so a body or query that fails validation is rejected before group middleware runs. That matters for anything rate-limiting or authenticating declared with `group()`: it now counts only requests that passed validation on express, which is what hono has always done. The one narrowing is deliberate and matches what the documentation already said: group middleware applies to the `.api()` routes on the router it was declared on, not to a `app.get(...)` added to the parent or to a sub-router mounted underneath it.
- **Template (both engines)**: the same catch-all could make a route answer with *another route file's* rejection. Route files in one module are all mounted at the same `/api/<module>` prefix, and `discoverModuleFiles` mounts them in sorted order, so a `group(authMiddleware)` declared in `admin.ts` was registered as `ALL /api/<module>/*` before `runtime.ts`'s routes existed. A request to a runtime route was therefore answered by that module's cookie auth with `{"message":"Unauthorized"}` 401 ΓÇö a middleware the route never declared ΓÇö and the route's own group never ran. Seen in a real project: `game-suite/routes/admin.ts` and `game-suite/routes/runtime.ts` are both mounted at `/api/game-suite`, so `POST /api/game-suite/v1/spin` could not reach `group(hmacAuth)`. Verified on a running app after the fix: `GET /api/game-suite/games` still returns `{"message":"Unauthorized"}` (its own group), while `POST /api/game-suite/v1/spin` now reaches `hmacAuth` and returns `{"error":"INVALID_API_KEY"}` for a bad signature.
- **Template (hono)**: `.api(route, undefined)` did not throw. hono took the two-argument branch and handed the missing handler straight to `openapi()`, so the mistake was accepted at registration time instead of failing where it was made; express already threw `api(route, middlewares, handler) requires a handler function`. hono now throws the same message, so the two engines fail identically on the same typo.
- **Template (both engines)**: the published `vitest.config.ts` claimed the coverage floor "is applied by CI" ΓÇö but that workflow was removed in 4.2.0, so every scaffolded project shipped a comment pointing at a workflow that does not exist. It also named the floor as `14%`, which is no longer the floor. The comment now says the floor is passed on the command line when the framework's own suite is run and is never read from that file, and it drops the number rather than carrying one that has to be updated every time the floor moves. Verified byte-identical across engines (`vitest.config.ts` hashes equal on hono and express).
- **Docs**: the Testing guide still said the floor is kept "in its own CI", quoted the retired `14%`, and described `test:coverage` as reporting "with a floor" in a table whose section explains there is no threshold; the CLI reference said `test:watch` "does not finish in CI and is not wired into the test workflow". All three now describe local, command-line thresholds, and `test:run` is labelled "no watch mode" rather than "CI mode".

### Changed

- **Template (both engines)**: both seeder shapes now build their completion log line with a template literal instead of string concatenation. The words and the printed output are unchanged ΓÇö only the generated source differs, and hono and express stay byte-identical to each other and to the copies in the scaffolder.

### Added

- **Tests (both engines)**: `http/__tests__/router-group.test.ts` pins the scoping contract behind the `group()` fix, and was written before it: 10 tests on hono, 9 on express (express's `createRouter()` already rejected a missing handler, so that one assertion was never red on express). Every scoping test was run against the old implementation first and left failing until the fix landed ΓÇö on the pre-fix code **4 of 10 fail on hono and 3 of 9 on express**, including the case that produced a real bug report: a sibling group's *rejecting* middleware blocking a route it was never declared on. They cover the leak itself (a request to the protected group must not run the public group's limiter, at any mount depth), the same leak onto a route added to the parent after the mount, a rejecting sibling group, group-before-route ordering, repeated `.group()` calls accumulating, a middleware that does not call `next()` short-circuiting the handler, and the `group()` shorthand. The hono test drives real requests through `app.request(...)` and the express test through a listening server, so both assert on what a client would actually observe rather than on internal registration order. Both engines stay above the floor with the new tests: 33.46% / 25% / 29.72% / 34.14% (hono) and 32.10% / 24.73% / 29.9% / 32.61% (express).

## [4.2.0] - 2026-10-06

### Fixed

- **Template (both engines)**: A multi-word module, model or controller name produced code that does not compile. The generators wrote the name into identifier positions exactly as typed, so `module:make game-suite` emitted `export const game-suites = sqliteTable("game-suites", {` and `import { game-suites }`. JavaScript reads `game-suites` as subtraction, so `module:make-model`, `module:make-seeder`, `module:make-service`, `module:make-controller` and `module:make-helper` each produced files that fail to compile ΓÇö while single-word names worked, which is why this went unnoticed. Names are now normalised to one canonical kebab form and the four shapes each placeholder needs are derived from it: kebab-case for file names and import paths, camelCase for the service and table identifiers (`gameSuiteService`, `gameSuites`), snake_case for the SQL table (`game_suites`) and PascalCase for class and schema names (`GameConfigSeeder`). The regression is covered by a test that generates every module generator into a temp directory and parses the output with the TypeScript compiler, so a leak fails the build rather than producing a broken file.
- **Template (both engines)**: Names are normalised before they are validated, so every casing a developer might type converges on one file: `game-config`, `game_config`, `gameSuite`, `GameConfig` and `GAME-SUITE` all produce `game-config.ts`. Previously `gameConfig` and `GameConfig` were lowercased to `gameconfig` before any word boundary could be read from them, so the boundary was destroyed. A word written without a separator carries no boundary to recover, so `gamesuite` is kept as one word rather than guessing where `game` ends; a capital inside a word is a boundary, so `gamE-SUITE-Engine` becomes `gam-e-suite-engine`. Any casing of the same words resolves back to the module that was already created.
- **Template (both engines)**: `module:make-helper` named its exported function after the raw input (`export function game-configHelper<T>`), which did not compile. It now uses the PascalCase form, matching `module:make-type` and `module:make-middleware`.
- **Template (both engines)**: A module folder scaffolded before this release under a different separator (`game_config` rather than `game-config`) is no longer reachable, because the name is now canonicalised before the folder is resolved. `assertModuleExists` falls back to a separator-insensitive lookup, so existing modules keep working and are never renamed.
- **Template (both engines)**: `queueJob` silently discarded work when Redis was not available. It returned `null` with no output, so a caller such as `await dispatchEvent("orders.exported", data, { queue: true })` lost the job and had no way to learn it had been lost - and because a freshly scaffolded project ships with `REDIS=false`, this was the default path rather than an edge case. It now warns once per queue and job name, naming the job, its queue, a scheduled delay if one was given, and both ways forward: enable `REDIS` in `.env`, or call `dispatchCommand(name, payload)` without `{ async: true }` to run the work in-process. The return value is still `null` - there is genuinely nowhere to put the job - but the loss is now reported, and it is reported once per job so a request hot path cannot flood the log. `startQueueWorker` continues to throw, since a worker without Redis has nothing to poll.
- **Template (both engines)**: A queue worker leaked one Redis connection on every restart. `stopQueueRuntime` set its cached `RedisStateStore` to `null` without ever calling `close()` on it ΓÇö and that store opens a Redis client *of its own* the first time a durable job runs, because bullmq-durable does this deliberately so that merely constructing a store costs no connection. The framework's own comment on that function claimed the store reused the shared client "without opening extra connections", which is why the leak survived review. Nothing ever quit those connections, and because the module-level reference was nulled rather than the store closed, the next boot built a *new* store and opened another. A worker restarted ten times by its supervisor left ten orphaned connections behind, and the failure surfaces on an unrelated service first: `OOM command not allowed`, or connection-refused from the web tier minutes after a routine queue restart, with nothing pointing at a leaked socket. `stopQueueRuntime` now closes the store before dropping it, and ten boot/work/stop cycles leave behind exactly as much as one.
- **Template (both engines)**: Starting the queue runtime twice for the same queue opened two BullMQ workers for it. Only the event streams were de-duplicated, not the workers, and each `Worker` holds its own blocking Redis connection ΓÇö so a second boot silently doubled that connection and doubled every per-job log line while processing nothing extra, because BullMQ hands each job to exactly one of them. The likely trigger is a supervisor retry or a dev server that boots the worker on reload. `stopQueueRuntime` clears the guard, so a later boot in the same process still works.
- **Template (both engines)**: `maker test` started Vitest in watch mode and so never exited. It ran `vitest --coverage`, and without the `run` subcommand that is watch mode: the command hung until interrupted and reported nothing. A script a developer or a CI job reaches for to get an answer instead handed back a terminal to Ctrl-C. `test` and `test:coverage` now pass `run`; `test:watch` still watches, which is its entire purpose.
- **Docs**: The Testing section of the CLI reference documented `npm run maker test -- -- --filter=posts` as the way to run part of the suite. Two things were wrong with it. Vitest has no `--filter` option, so it stopped with `CACError: Unknown option \`--filter\``; and the second `--` arrives at Vitest as its own argument separator, which it reads as a filter matching nothing ΓÇö so the command appeared to succeed while quietly running the whole suite. Filtering is positional (`maker test posts`), and the reference now says so in a tip, explains why, and shows the npm form that needs one separator rather than two.

### Changed

- **Template (both engines)**: `controller/openapi.with-model.ts.stub` has been removed. It was byte-identical to `controller/openapi.ts.stub` and both were added in the same commit, so the `openapiWithModel` entry in the stub map was a duplicate with no distinct content. `module:make` now selects `openapi.ts.stub`, and the never-read `openapiWithModel` entry is gone from the deploy stub map too. Generated output is unchanged - verified by hashing the controller that `module:make` writes for both route styles, before and after, on both engines. Note that `--with-model` is unaffected: it selects the Drizzle-backed *service* stub, which is a genuinely different file.
- **Scaffolder packaging**: The maker-cli's own tests (`src/framework/maker-cli/__tests__/`) are no longer published. They cover the generators, not the application, and a developer writing their own tests inside their modules would otherwise find two unexplained files in a directory they never opted into ΓÇö which reads as something they are expected to look after. The tests are kept in the repository so the generators stay covered, and `scripts/sync-template.mjs` skips `__tests__` under `src/framework` when copying a template into the published package. Tests inside modules (`src/modules/*/__tests__/`) still ship, since those belong to the module being used and show the pattern for it. Nothing else about a new project changes except that its test count is 64 lower.

### Added

- **CI**: The engine test suites used to run on every push and pull request (`.github/workflows/test.yml`, a matrix over hono and express on Node 22). That workflow has been removed: it kept failing on an npm 11 `"edgesOut"` cache bug that did not affect tests themselves, and GitHub Actions runners began emitting Node-20 deprecation warnings for every step. Local test discipline is now the source of truth ΓÇö the entry below explains the coverage floor and the command to run locally. No change to what tests do; every suite is still green.

- **Tests (both engines)**: A coverage floor, passed on the command line rather than written into `vitest.config.ts` so that the published file does not impose it on every scaffolded project. It is a floor and not a target, set just under the current measurement, and verified to bite by raising it and watching the run fail. The starting point was measured for the first time: **9.86% of 2,190 statements, with 58 of 91 files at literally nothing**. That number is unflattering and is the reason this entry exists - the suite was a map of the bugs already hit, because tests were written at the moment a bug was found rather than as a strategy, so everything nobody had tripped over yet was at zero. The floor is set by whichever engine measures lower (express at 30.26% against hono's 32.08%, because it carries engine-specific files hono does not); setting it from hono would set express red, which is exactly the day-one breakage the floor exists to prevent. Run `npm run test:run -- --coverage --coverage.thresholds.statements=30 --coverage.thresholds.branches=23 --coverage.thresholds.functions=27 --coverage.thresholds.lines=30` locally ΓÇö the same threshold the old CI step enforces.
- **Template (both engines)**: `bun.lockb` is now gitignored alongside `bun.lock`, `package-lock.json`, `pnpm-lock.yaml` and `yarn.lock`. It was the one lockfile format that was not ignored, so a developer working with bun before 1.2 would see an untracked binary lockfile appear in their working tree and have to decide what to do with it. That is not a decision a developer's package manager should be silently asking them to make on every upgrade, and the templates already take the position that each package manager regenerates its own lockfile.
- **Tests (both engines)**: The first tranche of resource-lifecycle tests, covering the failure class a coverage number cannot see. `redis/client.ts` went from 0% to 73% and `scheduler/lock.ts` from 0% to 80%, taking framework coverage from 9.86% to 14.74% and the suite from 180 to 214 tests. These count what coverage cannot: `initRedis()` called ten times must open **one** connection carrying **one** error listener, because `client.ts` is a module-level singleton and nothing in a type signature stops server, worker and scheduler bootstrap from each opening a socket; `closeRedis()` must actually release it, must fall back to a hard disconnect when `quit()` fails (which is precisely when you are usually shutting down), and must be safe to call twice or with no connection at all; and a failed handshake must close the half-open socket rather than only dropping the reference, since that happens on every retry. The scheduler lock is the same shape with a worse failure: a lock not released when the handler throws means the job silently stops running forever while still reporting success and logging nothing. Both backends are pinned for that, and all three SQL dialects, because a lock only ever exercised against SQLite - which is all a developer running the suite locally will do - can leave the Postgres and MySQL branches broken until deployment. Redis log output is checked for password redaction, since those lines end up pasted into issues.
- **Template (both engines)**: `maker --help` now opens with an ASCII `nexwire` wordmark, the way developer tools commonly brand their own help. The art is a fixed literal in `utils/help.mjs`; figlet was used offline to design it and is deliberately **not** a dependency, because the maker CLI runs from source inside the user's project and a runtime figlet would mean every scaffolded project installs it - font data and all - purely to print five fixed lines. Nothing is computed at runtime. Three rules keep the banner from getting in a developer's way, since decoration that interrupts is worse than no decoration: a terminal narrower than 41 columns gets plain `nexwire maker` text, because art that overflows wraps into an unreadable mess; piped or redirected output gets plain text, so `maker --help > help.txt` produces a readable file rather than one that opens with ASCII art; and per-command help gets no wordmark at all, because `maker module:make --help` is for checking a flag, not for branding. Verified at simulated terminal widths 30, 41, 45 and 100, and against genuinely piped output.
- **Template (both engines)**: `maker --help` is now grouped by intent instead of listing all 57 commands in one flat alphabetical wall, where finding `queue:work` meant scrolling past forty unrelated names. The sections are Getting started, Generators - global, Generators - modules, Modules - manage, Database, Queue and scheduler, Deploy, Testing, and Your commands. Group membership is an explicit list rather than a prefix pattern, because a `module:make-*` pattern would also have swallowed `module:migrate` and `module:make-notification`, and a command filed under the wrong heading is worse than an extra line of configuration. `middleware:make` is deliberately in its own section from `module:make-middleware`: the first writes `src/middlewares` for the whole app, the second writes inside one module, and listing them together implies they are interchangeable. The listing shows names and descriptions only - commander's default added `[options] <module> <name>` markers that pushed the description column to 47 characters and left almost no room to say what anything did; options and arguments remain one command away via `maker <command> --help`, which is unchanged and still uses commander's own layout. Any command not named in the group map falls into an `Other commands` section rather than disappearing, and `__tests__/help.test.ts` builds the real program from the five real registrars and fails if any command is unclassified - so adding a command without deciding where it belongs is a test failure rather than an invisible omission. That test caught a genuine regression while this was being written: commander adds its `help [command]` lazily, after the formatter has run, so the command stopped appearing in the listing. It still works, and both spellings are now named in the footer rather than a working command being quietly dropped.
- **Docs and wording**: every reference to another PHP framework has been removed from the repository - the docs, the changelog, the CLI help text, the source comments and the tests. This is a TypeScript framework with its own conventions, and borrowing another project's vocabulary invited exactly the wrong comparison. Reworded rather than simply deleted wherever the sentence needed to say *why*: pagination is now described as paginating Drizzle relational queries, Drizzle Kit is described as not supporting rollback or refresh operations, and a seeder is described as a function that inserts rows with the developer choosing what it writes.
- **Docs**: The Testing guide documents coverage thresholds - why a new project ships without one (its number is mostly framework code the developer did not write, so a floor calibrated for this repository would fail a fresh install with every one of its tests passing), how to add one that is worth having, that raising it belongs in the same change as the tests that earned it, and that lowering it is the one edit that quietly removes the protection. It also says plainly what a coverage number cannot find, because that is the more useful half: a leaked resource where every line is covered, state that survives a request, and a wrong answer on an unusual input are all invisible to a percentage. The guide's `vitest.config.ts` sample was stale and now matches the shipped file.
- **Template (both engines)**: A project can now add its own maker commands. `maker maker:init` creates `maker/commands.mjs` with a working example, and whatever that file exports is registered on the CLI alongside the built-ins. It receives the same commander `program` object the built-in registrars get, so `.command()`, `.description()`, `.option()` and `.action()` behave identically. The file sits in the project root rather than under `src/` because everything under `src/framework/` is copied into the published package - a developer edit there would be overwritten by the next framework update - and `src/modules/` is swept by the route, job and seeder globs. It is resolved from `process.cwd()`, not `import.meta.dirname`, which points inside `node_modules` when the package is installed. Absent is silent and free, since most projects will not have the file. Broken is loud and never swallowed: an unparseable file, one that throws while loading, and one exporting the wrong shape each stop the CLI with an error naming `maker/commands.mjs` and a non-zero exit, because a developer's commands silently not existing sends them debugging their own command instead of the loader. Framework names win - commander refuses a duplicate, so a project cannot shadow a built-in - and the resulting error names both the file and the taken command. Custom generator stubs are deliberately not supported: `module:make-*` reads from the framework-owned stub directory, and having a custom command write its own file is the honest trade.
- **Template (both engines)**: `module:make-seeder` no longer refuses to generate anything when no model matches the requested name. It used to throw `Model not found for seeder: ...`, which made three ordinary requests impossible: seeding a table owned by another module, seeding rows assembled from several models, and seeding a table whose model does not exist yet. A missing model now yields a *standalone* seeder that imports no model and inserts nothing until you fill it in, and the CLI prints what it found and what to do next ΓÇö including which models the module does have. When a matching model does exist the seeder is unchanged in behaviour: the model is imported, `table` is exported and the insert loop is pre-filled. Its completion log now reports the row count (`GameConfig: 3 row(s) prepared`) instead of a bare `GameConfig seeder completed`, so both seeder shapes report the same way and an empty seeder is visibly empty. A seeder never needed a model to begin with: it is a function that inserts rows, and what it inserts is the developer's choice - and every other generator in this framework already degrades to a no-dependency shape when its dependency is missing - a controller without a service, a service without a model. Seeder was the only one that refused. The file lives in the module you named, so `module:seed <module>` still runs it.
- **Tests**: `template/*/src/framework/maker-cli/__tests__/naming.test.ts` pins the naming contract ΓÇö normalisation, idempotency (re-running never churns an existing name), the SQL/pluralisation rules, and every real identifier a project already uses. `generators.test.ts` drives all ten module generators for four input casings and asserts the output parses and contains no kebab in code, and pins the seeder's bound and standalone shapes.
- **Docs**: Added a Naming section to the Module Commands reference with the four derived forms, a normalisation table, the pluralisation rules, and the regeneration steps for projects generated before this release. The `module:make-seeder` entry now documents both seeder shapes and when each is chosen.

- **Tests (both engines)**: The second tranche of resource-lifecycle tests, taking framework coverage from 14.74% to 22.16% (hono) and 14.25% to 21.24% (express), and the suite from 214 to 258 tests. `queue/queue.ts` went from 0% to 91% and `realtime/socket.ts` to 84% (hono) / 95% (express). These found two more leaks of the same shape as the first tranche, which is the argument for writing them at all. **The durable state store was never closed**: `stopQueueRuntime` nulled its cached `RedisStateStore` without calling `close()`, and that store owns a Redis client of its own, so a worker restart leaked a connection permanently ΓÇö see the Fixed entry. **A second worker was opened for a queue already being worked**, doubling a blocking Redis connection because only the event streams were de-duplicated. The socket tests found the same adapter-connection lifecycle on the realtime side and pinned it too: `initRealtime` called three times must return one server, `closeRealtime` must release the connection `attachRedisAdapter` duplicated *and* fall back to a hard disconnect when `quit()` fails, and ten boot/serve/shutdown cycles must leave behind exactly as much as one. Beyond leaks, the queue tests pin the things that lose work quietly rather than loudly: a worker that refuses to start without Redis must not leave a half-built worker behind, a job arriving with no handler must be rejected naming the queue and job (`No handler registered for default:mystery.job`) rather than failing with something generic, handlers are keyed `queue:job` so a same-named job on another queue cannot borrow the wrong handler, and a `failed` event with a null job must not throw inside the listener and take the emitter down with it. The prune tests pin the destructive path, because `maker queue:work` deletes queues: a configured queue is never touched, a queue the worker was launched with is never touched, a stale queue still holding a live job is left alone, `AUTO_PRUNE_QUEUES=false` does not even look, and a Redis that refuses the scan leaves workers starting. `clearQueue` is pinned the same way ΓÇö it wipes the queue and durable key spaces and *nothing else*, because widening the pattern would take the cache, sessions and rate-limit counters with it and log every user out.
- **Tests (both engines)**: The coverage floor moves from 14/11/9/14 to **30/23/27/30** (statements/branches/functions/lines). It is no longer enforced by GitHub Actions (that workflow has been removed); run `npm run test:run -- --coverage --coverage.thresholds.statements=30 --coverage.thresholds.branches=23 --coverage.thresholds.functions=27 --coverage.thresholds.lines=30` locally. Set from express again, since it still measures lower than hono ΓÇö 30.26% against 32.08% statements ΓÇö because it carries engine-specific files hono does not; setting the floor from hono fails express, which is the day-one breakage the floor exists to prevent.
- **Tests (both engines)**: The third tranche, taking framework coverage from 22.16% to 32.08% (hono) and the suite from 258 to 310 tests (hono / 305 express). Tier 2: `http/ratelimiter.ts` (5 tests, hono-only) confirms the Redis failover store preserves per-key isolation ΓÇö a user whose Redis call fails must not see another user's rate-limit bucket, and the 30-second cooldown must expire before Redis is re-attempted. `session.ts` (8 tests) pins that each session id gets its own document, one id's `set` does not affect another, `destroy` removes only the target, and all operations degrade gracefully when Redis is unavailable. Tier 3: `paginate.ts` (13 tests) pins the page math with a fake query fixture ΓÇö first/middle/last page offsets, page clamping past `lastPage`, zero-page clamping, `perPage` capping at `maxPerPage`, zero-total nulls, and the URL assembly rules (path with existing query string appends `&page=` not `?page=`). `storage.ts` stream lifecycle tests pin that `put` on local driver completes mkdir then writeFile, mkdir failure leaves no file on disk, S3 `send` rejects cleanly, `PassThrough` error handler is registered on every S3 upload, and `consumeGenerated` is atomic (read fails ΓåÆ delete must not run). `queue/ui.ts` poll-interval tests pin that one interval is created on setup, `stopQueueDashboard` clears it, and double-setup does not double the interval.

## [4.1.2] ΓÇö 2026-10-05

### Fixed

- **Template (both engines)**: The UI failed to start on a fresh scaffold with `[sass] spawn UNKNOWN`. Vite resolves its Sass compiler by trying `sass-embedded` first, and the template depended on it explicitly, which downloads a native `dart-sass` executable into `node_modules`. That binary is blocked by Windows Application Control / AppLocker and some antivirus setups, so `npm run dev` died before the UI could compile. The template now depends on the pure-JS `sass` package instead; `sass-embedded` is an optional peer dependency of Vite, so once it is absent Vite falls back to `sass` and no executable is needed. Verified by removing `sass-embedded` from `node_modules` and running `build:ui` on both engines - the UI compiles.
- **Release tooling**: `sync:hono` / `sync:express` now pin `REDIS=false` on every synced env file, so the flag can no longer be flipped by a local, gitignored `template/*/.env`. `REDIS=true` shipped in 4.1.0 (requiring the 4.1.1 patch) because the template `.env` is developer-local and unreviewed while the synced `packages/create-nexwire/*/.env` copy is tracked and published.
- **Release tooling**: The sync now reports any key where the synced `.env` disagrees with the tracked `.env.example` (`[hono] .env differs from .env.example ΓÇö this ships: SOCKET: false -> true`), so unreviewed drift is visible at sync time instead of after publishing. No default is changed by this; it only surfaces the difference.

### Added

- **Docs**: Added a Sass section to the Vite configuration guide explaining why the project uses pure-JS `sass`, and how to fix `spawn UNKNOWN` on an existing project.

## [4.1.1] ΓÇö 2026-10-04

### Fixed

- **Template (both engines)**: the published `.env` shipped `REDIS=true`, which made scaffolded projects expect a Redis server on first run. Changed to `REDIS=false` ΓÇö the same value the tracked `.env.example` and the `REDIS` schema default already used. 4.1.1 differs from 4.1.0 only in `hono/.env`, `express/.env`, and the version.

## [4.1.0] ΓÇö 2026-10-04

### Added

- **Maker CLI**: Added module:make-schema, module:make-service, module:make-helper, module:make-middleware, module:make-type subcommands.
- **Maker CLI**: module:make supports variadic names and --path for panels. here panel is a separator for api.
- **Maker CLI**: module:make-notification/module:delete-notification accept --path.
- **Framework**: cache.set() and session.set() with put() as deprecated aliases.

### Changed

- **Maker CLI**: Stricter name validation (lowercase start, no leading digits) with suggestions.
- **Maker CLI**: Batch continues on failures, exits nonzero; existing-module guard with --force.
- **Maker CLI**: writeFiles guards against overwriting without --force.
- **Framework**: Express session uses Express APIs.
- **Docs**: Rewrote the Modules guide for the 4.1.0 module layout ΓÇö the new `schemas/`, `services/`, `helpers/`, `middlewares/` and `types/` folders, the `facade.ts` public API, panels (`--path`), and the full `module:make-*` command set. Corrected the documented `OPEN_API` default (it is `true`, not `false`) and the plain-controller import paths (now `@/modules/<m>/schemas/<name>.js`, not a relative `./<name>.schema.js`).
- **Docs**: Corrected the Module Commands reference to match the code ΓÇö `module:make` now lists the `facade.ts` and `services/` outputs with current paths (no more `.controller.ts`/`.schema.ts` suffixes or `routes/api.ts`), `module:make-controller` no longer claims to generate a schema file, and the missing `module:make-service`, `module:make-helper`, `module:make-middleware` and `module:make-type` sections were added. Removed the leftover `module:example` paragraph (command was deleted in 4.1.0).
- **Docs**: Added a Panels section (`--path=<panel>`) and a Removed Commands note to the Module Commands reference; fixed the CLI reference command-category count (20 module commands, was 16).
- **Docs**: Corrected the module layout tree in all six README copies (root, create-nexwire, and the four template/scaffolded copies) ΓÇö added `__tests__/`, `helpers/`, `middlewares/`, `schemas/`, `services/`, `types/` and `facade.ts`, and fixed `__test__/` ΓåÆ `__tests__/`.

### Removed

- **Maker CLI**: Removed module:example command and stubs.

### Fixed

- **Maker CLI**: Panel-aware operations, seeder fallback, and migration temp names corrected.

## [4.0.0] ΓÇö 2026-09-28

> Successor to `create-nexgen@3.2.1`. The old package **stays published and must be deprecated ΓÇö do not delete it**, because existing installs would hard-fail. Deprecate it with:
> `npm deprecate create-nexgen "Renamed to nexwire. Use: npm create nexwire@latest my-app"`

### Breaking

- **Project renamed to `nexwire`** ΓÇö the unscoped npm name `nexgen` is owned by an unrelated package (`samwalshnz`, "Get the current song on a radio station", 2022), which made the framework effectively undiscoverable: searching "nexgen" surfaced that package, and `npx nexgen@latest` executed _its_ binary rather than the scaffolder. The new name is uncontested ΓÇö `nexwire`, `create-nexwire` and the `@nexwire` scope all return 0 registry hits. 697 brand references across 206 files: root package `nexwire-monorepo`, scaffolder `create-nexwire`, directory `packages/create-nexgen/` ΓåÆ `packages/create-nexwire/`, templates `nexwire-express` / `nexwire-hono`, and the `NexgenRouter` type ΓåÆ `NexwireRouter`. Install command is now `npm create nexwire@latest my-app`; the published bin also exposes the bare `nexwire` command.

- **`NEXGEN_*` environment variables renamed to `NEXWIRE_*`** ΓÇö 29 tokens across templates, scaffolder, `.env` files and docs (e.g. `NEXGEN_FRONTEND_URL` ΓåÆ `NEXWIRE_FRONTEND_URL`). **This breaks any existing deployment** ΓÇö update your `.env` and deploy environment. Projects scaffolded from `create-nexgen@3.2.1` still use the `NEXGEN_` prefix and are unaffected, since the framework is copied into the project at scaffold time rather than installed as a dependency.

- **GitHub URLs updated to `/nexwire`** (the repository rename itself is still pending and must be performed for these links to resolve) ΓÇö all `github.com/niyamulahsan/nexgen` URLs now point to `/nexwire`.

### Added

- **Demo recordings in the showcase READMEs** ΓÇö the READMEs asserted that the framework works (wiring, dashboards, deploys) but contained no visual proof, only tables and tree diagrams. Two real screen recordings now ship in `packages/docs/public/screenshots/` and are embedded in the two showcase READMEs (root `README.md` and `packages/create-nexwire/README.md`) under a new `## Demo` section ΓÇö screen recordings rather than stills, because the claim being made is about a _sequence_ (one command bringing a stack up, then the same project surviving a real deploy), which a screenshot cannot carry. `dev-mode.gif` is a freshly scaffolded project with its dev stack booting; `real-deploy.gif` is a real application ΓÇö not a demo ΓÇö deployed to a live server with HTTPS, process supervision and zero-downtime restarts. The two clips deliberately show different applications, because they are proving different things: the first that a generated project runs, the second that the framework is not a toy. Both are genuine captures of a running app: no mockups, no design tool, no fabricated states. The files live in the VitePress public directory rather than a new top-level `assets/` folder, so the docs site serves them at `/screenshots/*.gif` as well, and the READMEs reference them by absolute `raw.githubusercontent.com` URLs (the same pattern the logo badge already uses) so they resolve as soon as the files reach `main`, without waiting on a Pages deploy, and one committed copy serves both the GitHub page and the npm page. The scaffolded project READMEs are deliberately left unwired, since those files ship neither the recordings nor the docs site.

  Encoding: `dev-mode.gif` is built from a 64.47s 1918x1144 30fps capture, downscaled to 959x572 (`scale=959:-1:flags=lanczos`) at 15fps rather than dropped further, because terminal text blurs if the width goes below native ΓÇö frame _rate_ is the cheaper axis to spend on a screen recording than resolution ΓÇö then a 256-colour `palettegen`/`paletteuse` pass (`dither=sierra2_4a`, `diff_mode=rectangle`) and `gifsicle -O3 --lossy=100` (6.69 MB; the lossy pass is what actually shrinks a GIF, `-O2`/`-O3` alone barely move the number). Both files loop infinitely. Duration, resolution and frame content were verified after encoding rather than assumed, and six frames sampled across `dev-mode.gif` were confirmed to carry real screen content (74ΓÇô157 KB per extracted PNG, against ~3 KB for a blank 959x572 frame).

  Note for anyone re-cutting these: an earlier `dev-mode.gif` was built from a superseded 27.93s recording, and an even earlier one had been recorded against a project using `postgres://localhost:5432/statistic` instead of the shipped SQLite ΓÇö which directly contradicted the README's zero-setup claim. The clip is only honest if the terminal it records shows the SQLite default that actually ships.

- **Changelog published as a docs page** ΓÇö the docs site documented every subsystem except the one that answers "what changed between releases", and the release history lived only in the repository, which is invisible to anyone reading the docs. A new `packages/docs/changelog.md` renders at `/changelog`, linked from both the top nav and the sidebar, so the history is readable without leaving the site. The page uses VitePress `@include` to pull in the repository's `CHANGELOG.md` rather than holding a copy, so the public changelog and the repository changelog cannot drift apart ΓÇö one file to edit per release, which is the only way a published changelog survives contact with a busy release.

### Fixed

- **The scaffolder's template sync never ran at publish time** ΓÇö `create-nexwire` declared its sync as `prepublish`, a lifecycle hook modern npm (>=7) no longer runs for `npm publish`, so `scripts/sync-template.mjs` silently never executed and the published `hono/` + `express/` copies were whatever happened to be on disk. Renamed to `prepublishOnly`, the hook that npm actually fires on publish. Verified with a probe package: `npm publish --dry-run` runs `prepublishOnly` and not `prepublish`.

- **`create-nexwire@latest .` could delete the directory it was run in** ΓÇö on a failed template download the error path ran `rmSync(targetDir, { recursive: true, force: true })`, but with the `.` argument `targetDir` _is_ `process.cwd()`, so the cleanup removed the user's own project (including `.git`). Cleanup is now skipped when scaffolding into the current directory, and the failure message says so. Windows masked this by throwing `EPERM` on the open cwd handle; POSIX platforms would have deleted the tree.

- **`create-nexwire@latest .` overwrote an existing project without warning** ΓÇö `resolveTargetDir` returned early for `.` and skipped the "already exists" check applied to named targets, so running the command in a populated directory silently overwrote it. `.` now requires an empty directory and refuses with a clear message, matching the behaviour of `<project-name>`.

- **Docs still told users to copy `.env.example` to `.env`** ΓÇö the scaffolder writes a working `.env` (SQLite, pre-migrated and pre-seeded) and now reports `.env ready - no copy needed`, but `guide/quick-start.md` (all four package-manager blocks) and `guide/env.md` still instructed a manual `cp .env.example .env` before `install`. Besides being unnecessary, that command does not exist in Windows cmd or PowerShell, so the documented first step failed for Windows users ΓÇö the same class of failure the scaffolder's own printed instruction had. The copy step is removed from the Setup blocks; a tip now states there is nothing to copy and, for anyone recreating the file by hand, gives the platform-correct command. `guide/env.md` also drops its bare `cp` block in favour of the same note.

- **`guide/database.md` quoted a CLI error that no longer exists** ΓÇö the page reproduced the "database already contains tables" message as `Use 'npm run|pnpm|yarn|bun maker db:fresh --seed' to rebuild locally.`, which is wrong three ways: `npm run|pnpm|yarn|bun` is pseudo-syntax that appears nowhere in the code, the npm form is missing the `--` separator (so npm swallows `--seed` ΓÇö the exact defect already fixed in the code), and the trailing "restore migration files" clause had been dropped. The quoted block now matches the string the CLI actually prints (`framework/maker-cli/db/index.mjs`), byte for byte.

- **Scaffolded README advertised the wrong engine** ΓÇö the Features table said "Hono HTTP server", so a project scaffolded with `--engine=express` shipped a README claiming Hono. Now "Hono/Express HTTP server" across all six copies (root `README.md`, `template/{express,hono}/README.md`, `packages/create-nexwire/README.md`, `packages/create-nexwire/{express,hono}/README.md`). The four scaffolded copies are byte-identical and the table column alignment is preserved.

- **`npm run maker db:migrate --seed` silently dropped the `--seed` flag** -- npm consumes `--seed` as its own unknown CLI config instead of forwarding it to the script, so the command ran as a plain `db:migrate` and no seeders executed. The npm warning `Unknown cli config "--seed"` was the only clue. npm requires a `--` separator: `npm run maker db:migrate -- --seed` (bun's `bun maker db:migrate --seed` works unchanged). Corrected in the four scaffolded `README.md` copies (byte-identical), root `README.md`, `packages/create-nexwire/README.md`, `packages/docs/guide/database.md` and `packages/docs/cli/database.md`. The maker CLI no longer prints the bun-only form: the `--seed` option descriptions and the two `db:fresh` recovery messages now show the npm form alongside the bun form.

- **`db:migrate --seed` crashed on any freshly generated module** -- `module:make` writes a fully commented-out seeder stub (intentionally, so it compiles and inserts no fake rows), but `seed.ts` threw `Seeder file ... has no default export function` on any seeder without a default export. So the documented quick-start order -- generate a module, then `db:migrate --seed` -- always aborted with exit code 1. `seed.ts` now skips seeder files containing no `export` statements and reports `Skipped unfilled seeder <file> (no exports yet)`; a seeder that _does_ export something but lacks a default function still throws, so genuine mistakes remain loud. Byte-identical across both engines (sha256 34a7f82b1ff2a0669d4332bc6e8a8fcdb210843cae1813f34eca30806c3a4dab).

- **Redis Commander view left port 1369 dead when Redis was unavailable** -- `npm run maker dev -- --with-redis-view` (or `redis:view`) with `REDIS=false` in `.env` skipped launching the commander entirely, so the documented URL `http://localhost:1369` was a closed port and the browser only said "unable to connect". With `REDIS=true` but no Redis actually listening, the commander started and rendered its own raw connection error instead of the framework's diagnostic. `redis:view` now probes `REDIS_URL` with a short TCP connect and, when nothing answers or `REDIS` is disabled, serves a **Redis Commander Unavailable** page (naming the Redis URL) that identifies Redis Commander and the Redis key browser and points at `/queues` for BullMQ state -- deliberately _not_ the `framework/queue/ui.ts` "Queue Dashboard Unavailable" page, which describes the bull-board route and would mislabel a key browser as a queue dashboard; otherwise it launches Redis Commander exactly as before. The dev-stack gate no longer suppresses the view when `--with-redis-view` was explicitly requested with Redis disabled, so the advertised port stays live. The CLI runtime (`maker-cli/runtime/core.mjs`) is plain `.mjs` with no `tsconfig allowJs`, so the page markup is built locally rather than imported from `ui.ts`; the new functions are byte-identical across both engines (sha256 664f4a072755c0200aea2f72502b18af1077f4de4d57e9638bba7aedfd4e4e8e).

- **Stale runtime log files shipped inside the npm tarball** -- `template/{express,hono}/src/storage/logs/app.log` and `fatal.log` (up to 41 KB, 1118 lines) were untracked dev artifacts that `npm pack` still included, leaking local stack traces and absolute paths into every generated project. Present in published `create-nexgen@3.2.1` and carried into the 4.0.0 candidate. Deleting them was not enough: they are regenerated every time the app runs from `template/hono` or `template/express` (your own local run recreates them), and because `package.json` declares a `files: ["src","hono","express"]` whitelist, a root `.npmignore` is never consulted -- so npm packed them anyway. `scripts/sync-template.mjs` (the prepublish hook) now excludes `*.log` from the engine copies, which is the only place the rule is actually enforced. Verified by re-packing with the log files still present on disk: 490 -> 486 files, zero `.log` in the payload. `.gitkeep` still ships, so the runtime log directory exists.

- **First run could not survive a SQLite `DATABASE_URL`** -- the three core auth models (`modules/auth/database/models/{role,user,notifications}.ts`) were hardcoded to `drizzle-orm/mysql-core` (`mysqlTable`, `int().autoincrement()`, `onUpdateNow()`), so the documented "SQLite, MySQL, or PostgreSQL. Auto-detected from `DATABASE_URL`" was false for a fresh project: pointing `DATABASE_URL` at SQLite made `db:migrate` generate **zero tables** (and report success), after which every query failed -- login and register were broken out of the box, and SQLite is exactly what a first-time developer is most likely to choose because it needs no server. The three model files are now native `drizzle-orm/sqlite-core` (`integer("id").primaryKey({ autoIncrement: true })`, `text`, `integer({ mode: "timestamp" })`, `integer({ mode: "boolean" })`); MySQL's `onUpdateNow()` was dropped because SQLite has no equivalent, so the core schema is SQLite-only by default. In the same change the framework now ships the migration and its data: `src/database/migrations/sqlite/` (generated `0000_init.sql` + meta) and a **pre-migrated, pre-seeded** `src/storage/database/nexwire.sqlite` (roles `admin`/`user`, users `admin@example.com` / `user1@example.com`, bcrypt-hashed `Password@123`) so a fresh `create-nexwire` project works with zero setup -- the scaffolder writes the `.env` for you, then `npm run dev` and the seeded admin can log in immediately; the shipped migration makes subsequent `db:migrate` a no-op and future schema changes generate `0001_*`. Template `.env` / `.env.example` default changed from `mysql://...` to `sqlite:./src/storage/database/nexwire.sqlite`. The three model files and the SQLite database file are byte-identical across **express** and **hono** (DB sha256 afce2f88755d40650bdcfbd6b55d2ca87df46561a6926c5eb40300245697c61b).

- **Register / notify crashed with 500 on a SQLite database** -- `auth.controller.ts` (`register`) and `framework/notification/index.ts` (`notify`) resolved the inserted row id from `insertResult.insertId`, a mysql2-only field. libsql/sqlite awaits return `lastInsertRowid` instead, so on the new SQLite default every registration inserted the row (making the retry return 422 "Email already exists") then threw `Failed to resolve inserted user id` before issuing tokens. Both helpers now fall back through `[0]?.insertId ?? insertId ?? lastInsertRowid`, working on MySQL and SQLite. The models layer is byte-identical across engines, but `auth.controller.ts` is engine-native by design (Hono `c.req.valid`/`c.json` vs Express `req.body`/`res.status().json()`), so the fix was applied to the Hono handler and the Express handler separately; the Express handler's original `express` idiom is preserved. Byte-identical across **express** and **hono** for the shared `framework/notification/index.ts` (sha256 bb5e35c9b48f7caa506bd432fd5c39dbdaa488a5658744145eb44ae7943ca279).

## [3.2.1] ΓÇö 2026-09-24

### Fixed

- **Scaffolder maker-cli runtime injects the dev UI origin into the spawned API** -- `create-nexgen`'s maker-cli runtime (`express`/`hono` `framework/maker-cli/runtime/core.mjs` and `core.mts`, line 214) sets `NEXGEN_FRONTEND_URL: "http://localhost:5173"` on the API child process it spawns when the UI is enabled but the built SPA is absent (Vite dev server still running) -- this is the dev-without-build branch the URL resolver consumes. Byte-identical across both engines; shipped via `create-nexgen@latest` / `nexgen@latest`.

- **`useGumForm` dropped the Axios response from the `onSuccess` callback** ΓÇö `form.post/put/patch/delete` (`submit()`) called `onSuccess` with no argument, so the callback's `e` was `undefined` (no `e.response`, no `e.data`). The `visit()` path passed `response!` correctly; now `submit()` does too ΓÇö `onSuccess` in **both** paths receives the full **AxiosResponse** (`e.data` / `e.status` / `e.headers`). Arrays (`onStart`, `onSuccess`) no longer trigger the "Expected 0 arguments, but got 1" TS error. **`FormSubmitOptions` now mirrors `GumVisitOptions`** with the full hook surface ΓÇö `onBefore`, `onStart`, `onProgress(event)`, `onSuccess(response)`, `onError`, `onFinish`. Fixed a stray `await` in the non-async `onUploadProgress` handler (`onProgress?.(event)` is called synchronously, matching `visit()`). Byte-identical across **express** and **hono** engines.

- **Dev reset/verify links pointed at the API origin instead of the Vite dev server** ΓÇö `urls.url()` in dev with UI enabled but **no UI build yet** (Vite dev server still running) resolved to `APP_URL` (port 3000) instead of the SPA dev origin (port 5173). The resolver now consumes the `NEXGEN_FRONTEND_URL` that maker-cli injects when the built SPA is absent, so reset/verify email links point at the **Vite dev server** (e.g., `http://localhost:5173/reset-password`) in dev-without-build, and at the **app origin** (single port, e.g., `http://localhost:3000/reset-password`) when the framework serves the built SPA ΓÇö matching browser behavior in production and dev-with-build. Byte-identical across **express** and **hono** engines.

- **`forgetPassword.vue` `onSuccess` now consumes the submitted response** ΓÇö the callback takes the AxiosResponse (`res`) and displays `res.data.message` from the API instead of a hardcoded "reset link has been sent" text, so the UI reflects the server's actual reply. Byte-identical across **express** and **hono** engines.

- **`resetPassword.vue` `onSuccess` now consumes the submitted response** ΓÇö the callback takes the AxiosResponse (`res`) and displays `res.data.message` from the API before redirecting to login. Byte-identical across **express** and **hono** engines.

- **`/api-docs` served no favicon on the API origin** ΓÇö the Scalar docs page ships without a `<link rel="icon">`, so browsers requested `/favicon.ico` from the API server. The **express** engine had no `/favicon.ico` route (404, empty tab icon) and **hono** returned Stoker's rocket-emoji SVG instead of the real icon. Both engines now serve `src/resources/src/assets/images/favicon/favicon.ico` at `/favicon.ico` (`image/x-icon`), matching the SPA favicon; the route is configured from `src/config/openapi.ts` (`scalar.favicon`) and served by `configureOpenApi` on `OPEN_API=true`, so `app.ts` stays untouched; hono's `serveEmojiFavicon` middleware was removed. Byte-identical across **express** and **hono** engines.

- **`src/config/security.ts` exported no `SecurityConfig` type** ΓÇö `config/index.ts` imported `type SecurityConfig` from `./security.js`, but the template file never exported it (TS2724 on the scaffolded app). Added `export type SecurityConfig = typeof securityConfig;` and fixed a stray `data: data: blob:` duplicated source in the dev CSP `img-src` on the express template. Both templates were also re-synced into `packages/create-nexgen` (which still had the pre-CSP skeleton), so all four copies are byte-identical. Byte-identical across **express** and **hono** engines.

- **Guide intro claimed cache "falls back to the database" when Redis is down** ΓÇö it does not: the cache is Redis-only. When Redis is unavailable, `cache.get` returns `null`, `put`/`forget` become no-ops, and `remember` recomputes the fresh value on every call. Corrected `guide/introduction.md` to say caching disables itself gracefully instead of suggesting a database cache layer.

- **Guide intro auth examples used the wrong token expiries** ΓÇö the `jwt.generateToken` snippets passed `3600` for access and `604800` (7 days) for refresh, contradicting the actual config (`900` = 15 min access, `3600` = 1 hour refresh, `2592000` = 30 days "remember me"). Fixed the examples to use the defaults and show the remember-me tier. The expiry logic in `auth.helpers.ts`/`jwt.ts`/`cookie.ts` was verified correct and engine-consistent.

- **Guide intro "Self Deploy to VPS" showed only npm commands** ΓÇö converted both deploy command blocks (init/remote and promote/import) into `::: code-group` tabs for **npm**, **pnpm**, **yarn**, and **bun**, matching the other guides. `--file=` flag syntax per package manager (`npm run maker` uses `-- --file=ΓÇª`; direct `maker` calls use `--file=ΓÇª`).

### Changed

- **Node floor lowered from `>=24` to `>=22.12.0`** ΓÇö the manifests (`create-nexwire`, both engine templates, and the two mirrored copies) declared `"node": ">=24"`, which made the scaffolder look like it demanded a bleeding-edge runtime and locked out the still-supported Node 22 line. Node 24 ("Krypton") has been **Active LTS** since 2025-10-28, but the floor was never a technical requirement: nothing in the framework uses a Node 24-only API ΓÇö TypeScript is executed through the `tsx` package (not native type-stripping), the only `import.meta.dirname` use needs 20.11+, and `glob` is the npm package rather than `fs/promises.glob`. The real floor is imposed by the frontend build: Vite 8.3.1 declares `node: ^20.19.0 || >=22.12.0`, so `>=22.12.0` is the lowest honest bound. That keeps **both** security-supported LTS lines working ΓÇö Node 22 (Jod, Maintenance LTS to 2027-04-30) and Node 24 (Krypton, Active LTS to 2028-04-30) ΓÇö and deliberately excludes Node 20, which reached end-of-life on 2026-04-30. Docs updated in lockstep: the "Requires **Node.js >= 22.12**" line and the Runtime table in all four engine README copies plus the two showcase READMEs, and the requirement bullet in `packages/docs/guide/quick-start.md`. The two lockfiles' root `engines` entries were updated to match; the `>=24.0.0` strings remaining in them belong to `@types/node`'s own peer range and are third-party, not ours. Engine README copies remain byte-identical across **express** and **hono** (4 copies, sha256 d8e1600a4e74).
- **`homepage` now points at the GitHub Pages docs instead of a dead domain** ΓÇö `create-nexwire` declared `"homepage": "https://nexwire.dev"`, a domain the maintainer does not own. npm renders `homepage` as the **Website** link in the package page sidebar, so it shipped a link that goes nowhere (the same defect is visible on the already-published `create-nexgen@3.2.1`, whose `homepage` is `https://nexgen.dev`; a published version's manifest is immutable and 3.2.1 is past npm's 72-hour unpublish window, so it can only be steered with `npm deprecate`, never corrected). `homepage` is repointed to `https://niyamulahsan.github.io/nexwire` ΓÇö the VitePress docs in `packages/docs`, deployed to GitHub Pages by `.github/workflows/deploy-docs.yml` on every push to `main` that touches `packages/docs/**`. Note the URL only resolves once the `nexwire` repository is public **and** that workflow has run on `main`; before that the path 404s. The two showcase READMEs (root `README.md` and `packages/create-nexwire/README.md`, the GitHub landing page and the npm package page) carried the same dead domain in two more places: the centred logo `<a href="https://nexwire.dev">` now links to the GitHub repo, and the docs badge label / footer text no longer advertise `nexwire.dev` as if it were a live site. The scaffolded project READMEs under `template/{hono,express}` are intentionally left at their previous wording, since they are a per-project starting point rather than a showcase surface; they remain byte-identical across **express** and **hono** (4 copies, same sha256).
- **The two showcase READMEs now open with the value proposition, not an ingredient list** ΓÇö the previous opening read "a batteries-included TypeScript framework that combines modular backends (Hono, Express) with Drizzle ORM, BullMQ, Socket.IO, Redis, and a Vue 3 SPA frontend", which restated the dependency list and answered nothing about what it saves you; a reader's takeaway was "Hono + Drizzle + BullMQ + Socket.IO + Vue, which I can install myself". The tagline is now a claim ("Stop wiring the stack together. Ship the app."), followed by the problem (the same ten capabilities are a week of glue code whose failures are silent ΓÇö a job that never runs, a socket that never joins a room), then five concrete differentiators: runnable the second it is created (pre-migrated, pre-seeded SQLite, credentials in the text), nothing to register (`maker module:make blog` plus auto-discovery), one import per subsystem (`@/framework/facade.js`, Redis-free in-memory fallback), optional infrastructure (Redis/mail/S3 circuit breakers with real fallbacks), and one-command VPS deploy over SSH. Quick Start was made consistent with the claim it now makes: `npm run maker db:migrate -- --seed` is dropped from both the Hono and Express blocks (the shipped SQLite database is already migrated and seeded, and both seeders are idempotent ΓÇö they `findFirst` before inserting) and replaced by a note saying the step is only needed after pointing `DATABASE_URL` at MySQL/PostgreSQL. The `Features` table's database row was corrected at the same time: it claimed "SQLite, MySQL, or PostgreSQL. Auto-detected from `DATABASE_URL`", which no longer describes the shipped core tables (see the SQLite bullet above ΓÇö the auth/notifications models are now `sqlite-core`); it now reads "SQLite by default, shipped pre-migrated and seeded; MySQL/PostgreSQL also supported, dialect auto-detected". Scope is deliberately limited to the GitHub landing page and the npm package page; the scaffolded READMEs are untouched and stay byte-identical across **express** and **hono**.
- **URL origin resolution is now three-knob and byte-identical across engines** ΓÇö the origin decision in `framework/support/url.ts` (both engines) is: `frontendUrl` (explicit SPA origin ΓÇö wins) ΓåÆ `uiEnabled` + built SPA (`hasUiBuild()`) (framework serves it ΓÇö same/`APP_URL` origin) ΓåÆ `uiEnabled` + no build (dev Vite dev server still running ΓÇö `process.env.NEXGEN_FRONTEND_URL`, injected by maker-cli, falls back to `APP_URL`) ΓåÆ API-only (`APP_URL`). Comment docs updated to document all three branches.

## [3.2.0] ΓÇö 2026-09-22

### Added

- **`express` engine** ΓÇö `create-nexgen` can now scaffold a project on **Express** instead of only Hono. Pick the engine at scaffold time with `--engine=express` (Hono stays the default; pass `--engine=hono` explicitly).

### Changed

- **Both engines ship the same facade surface** ΓÇö the identical set of app-facing verbs (`storage`, `cache`, `db`/`database` + `paginate*`, `command`/`dispatchCommand`, `dispatchEvent`, `shouldQueue`/`queue`, `defineSchedule`, `session`, `notify`, `broadcast`, plus support helpers), each **implemented natively** in its own engine's idiom. Hono's facade relies on `@hono/zod-openapi` (`createRoute`, `group`, `createRouter`); Express's uses its native router conventions. The files are **not byte-identical by design** ΓÇö what's identical is the _surface_ (same verbs, same signatures). Switching engines requires **no module, facade, or route changes** (the facade surface is the contract, not the implementation bytes).
- **Orchestration endpoints identical** ΓÇö `/ready`, `/live`, `/metrics`, and `/health` are auto-wired by both engines' HTTP layer (`http/app.ts`) with byte-identical K8s probe semantics.
- **App settings identical** ΓÇö security, validation, rate limiting, circuit breaker, and metrics counters are config-driven app settings in both engines, wired by the framework at boot, and never part of the facade.

### Security

- **Security disclosure added to both READMEs** ΓÇö a `## Security Vulnerabilities` section asks researchers to email the maintainer directly rather than opening a public issue, matching the common coordinated-disclosure convention.

---

## [3.1.0] ΓÇö 2026-09-09

### Added

- **API docs split into per-function pages** ΓÇö the deskapp-style API reference now has one page for every facade export (32 functions) with a Function | Purpose | Guide overview table, replacing the bundled pages (`http`, `events`, `queue`, `paginate`, `support`, `realtime`ΓåÆ`broadcast`, `scheduler`ΓåÆ`defineSchedule`).
- **Documentation site header** ΓÇö deskapp-style top nav (`Home`, `Quick Start`, `Guide`, `API`, `CLI`, `Deploy`) with inline SVG icons on every nav and sidebar entry.

### Changed

- **`FRONTEND` env renamed to `UI`** ΓÇö `frontendEnabled` config key renamed to `uiEnabled` (`template/src/config/app.ts`). No change in behavior; the old `FRONTEND` value is no longer read.
- **Documentation site header** ΓÇö deskapp-style top nav with inline SVG icons on every nav and sidebar entry.
- **maker-cli restructured** ΓÇö flattened `src/levels/` layout into `db/`, `deploy/`, `module/`, `runtime/`, `utils/` directories with `index.mjs` at the root. Command surface unchanged (52 commands).

### Fixed

- **`db:module:seed <module>`** ΓÇö seeds now target the given module argument (`secondArg || firstArg`) instead of the first argument.
- **`deploy:workflow:remote --dry-run`** ΓÇö dry-run no longer proceeds with the remote workflow half-run.
- **`deploy:db:import:remote --dry-run`** ΓÇö removed dry-run guard so remote DB import correctly skips execution.
- **`--force` / `--dry-run` on module make commands** ΓÇö flag parsing refactored across all 7 module make commands (`rawArgs.slice(name ? 3 : 2)`).
- **`SOCKET` env in deploy generation** ΓÇö deploy env templates fall back to `"false"` when `SOCKET` is not set.

### Documentation

- **sarra removed from API docs** ΓÇö project-specific examples replaced with generic framework guidance.

---

## [3.0.8] ΓÇö 2026-08-21

### Added

- **`broadcast` exported from facade** ΓÇö `broadcast()` can now be imported directly from `@/framework/facade.js` for direct Socket.IO emission without `dispatchEvent()`.
- **OpenAPI config file** (`src/config/openapi.ts`) ΓÇö new editable config for Scalar theme/layout/docsPath/specUrl/title/version/description.

### Changed

- **`openapi.ts` reads from config** ΓÇö Scalar and OpenAPI settings now come from `src/config/openapi.ts` instead of being hardcoded.
- **`config/index.ts`** ΓÇö `openApiConfig` import/export added; `config.openAggregated` includes OpenAPI settings.

### Documentation

- **24 discrepancies fixed** across 16 docs files ΓÇö wrong imports, wrong defaults, fake env vars, missing options, syntax errors.
- **Realtime docs** ΓÇö added `broadcast()` direct usage alongside `dispatchEvent()`.
- **Scheduler docs** ΓÇö added `queue`, `job`, `data`, `immediately` options.
- **New: `guide/openapi.md`** ΓÇö full OpenAPI setup page (Scalar, metadata, auth, custom theme).
- **API reference "Real world" sections** ΓÇö authentic examples from the sarra app (auth router, event/queue flows, pagination, storage exports, cookie/jwt/password) added across the API pages.

---

## [3.0.7] ΓÇö 2026-08-21

### Fixed

- **`--with` flag parsing** ΓÇö `parseWithOptions` now splits on `/[,\s]+/` so commas and spaces both work, fixing yarn's `--with=redis,maildev,studio` being treated as a single argument.
- **`@hono/zod-openapi` pinned to `~1.5.3`** ΓÇö `^1.5.2` resolved to 1.6.1 which pulls `@asteasolutions/zod-to-openapi@^9`, breaking `stoker`'s peer dependency on `^8`. Tilde keeps it on 1.5.x.
- **`redis-commander` bumped to `^0.9.0`** ΓÇö old `^0.4.5` uses `express@3` + `ejs@0.8` which crash with pnpm's newer EJS resolution. `0.9.0` uses `express@4` + `ejs@3`.

### Documentation

- **Quick Start ΓÇö Package Manager Setup** ΓÇö new section explaining extra files needed for pnpm (`pnpm-workspace.yaml` with `allowBuilds`) and yarn (`.yarnrc.yml` with `nodeLinker: node-modules` + `dependenciesMeta` in `package.json`).

---

## [3.0.3] ΓÇö 2026-08-20

### Fixed

- **create-nexgen yarn PnP crash** ΓÇö scaffolder always downloads the tarball from the npm registry instead of using a local copy, fixing `cpSync` ENOENT errors under Yarn PnP (zip-mounted `node_modules`).
- **create-nexgen leaked `index.js`** ΓÇö tar extraction now only includes `package/template/*` paths, preventing the CLI source file from appearing in the scaffolded project.
- **create-nexgen peerDependencies synced** ΓÇö replaced Winston with Pino, bumped `@bull-board/*` to ^8, `nodemailer` to ^9, `redis-commander` to ^0.4, added `@libsql/client`, `@socket.io/bun-engine`, `bullmq-durable`, `croner`, `postgres`; engines updated to `node >=24`, `bun >=1.3.0`, `pnpm >=10`, `yarn >=4`.
- **create-nexgen template dependencies synced** ΓÇö root `template/package.json` updated to match all framework dependencies.

---

## [3.0.0] ΓÇö 2026-08-19

### Overview

Unified environment and configuration handling across backend and frontend, added runtime feature toggles (`OPEN_API`, `REDIS`, `FRONTEND`, `SOCKET`) to the Zod schema, consolidated deploy env templates, switched logger from Winston to Pino, added keyboard shortcuts to Dialog, rewrote the entire documentation site with VitePress, and professionalized the GitHub/npm READMEs.

### Features

#### Environment & Config

- **`REDIS`, `OPEN_API`, `FRONTEND`, `SOCKET` in Zod schema** ΓÇö all four feature toggles now live in `env.ts` with boolean transforms (`!== "false" && !== "0"`), making them the single source of truth. Config files (`app.ts`, `redis.ts`, `realtime.ts`) read from the schema instead of hardcoding.
- **`SOCKET` env toggle** ΓÇö `config/realtime.ts` reads `env.SOCKET` instead of hardcoding `enabled: true`. The ViteFrontend config also reads `process.env.SOCKET` to control the Pulse client build.
- **`queueUiAllowedEmails` moved** ΓÇö moved from `redis.ts` to `queue.ts` as `allowedEmails: ""` since it's queue-specific.

#### Deploy

- **Deploy env templates rewritten** ΓÇö all three stubs (`mysql.server.stub`, `postgres.server.stub`, `sqlite.stub`) now include `OPEN_API`, `SOCKET`, `FRONTEND`, `REDIS`, `REDIS_PREFIX`, `FRONTEND_URL`, `JWT_*`, `COOKIE_SECRET`, `STORAGE_*`, `MAIL_*` with proper comments distinguishing config-file settings from env-var secrets.
- **Deploy core.mjs** ΓÇö `OPEN_API` and `SOCKET` values now read from the root `.env` and injected into generated templates.
- **`deploy:init` auto-creates `.env`** ΓÇö workflow copies `.env.example` ΓåÆ `.env` automatically; users only edit `.example` files.
- **`deploy:workflow` env sync** ΓÇö `ensureEnvFile()` ensures both `deploy/.env` and `deploy/server/.env` exist before starting containers.

#### CLI

- **`module:make-test` added** ΓÇö new command for generating test scaffolding for modules.
- **`db:fresh` alias** ΓÇö `db:migrate:fresh` now works as an alias.
- **`db:reset` aliases** ΓÇö `db:migrate:reset` and `db:wipe` now work as aliases.
- **`serve --src` flag** ΓÇö allows specifying a custom source directory.
- **`queue:work` comma-separated queues** ΓÇö `--queue=default,mail,maintenance` now properly parses comma-separated values.
- **`deploy:init --pm` supports `bun`** ΓÇö package manager flag now accepts `bun` in addition to `npm|pnpm|yarn`.

#### Frontend

- **Dialog keyboard shortcuts** ΓÇö `bindKeys` with Enter (OK) and Escape (Cancel), guarded by `shell.isConnected`. `stopPropagation` added to prevent event bubbling.
- **Auth pages use logo** ΓÇö all five auth pages (`login`, `register`, `forgotPassword`, `resetPassword`, `verifyEmail`) display `logo.png` from the Sidebar component.
- **Pulse timing fix** ΓÇö `pulse.channel()` moved to `onMounted` with null guard to prevent race conditions.
- **Theme dark primary** ΓÇö template dark theme primary changed from `$warning` (yellow) to `#3b8eed` (VitePress blue).

#### Logger

- **Winston ΓåÆ Pino** ΓÇö `support/logger.ts` rewritten to use Pino with `fatal`, `trace`, and `child()` methods. `config/logging.ts` now uses Pino-style config (`level: "info"`, `httpRequests: true`).

### Fixes

- **Boolean parsing unified** ΓÇö all maker-cli scripts use `!== "false" && !== "0"` for boolean env parsing, matching the Zod schema logic.
- **Plain/OpenAPI stubs** ΓÇö example and notification modules now have plain and OpenAPI variants based on `OPEN_API` flag.
- **Sync-template basename check** ΓÇö `skipDirs` filter in `sync-template.mjs` now correctly checks basename instead of full path.
- **Notification module refactor** ΓÇö removed 4 injection functions and Vue file generation; backend-only.
- **DataTable sort removed** ΓÇö documentation corrected to reflect that DataTable does not handle sort internally.
- **`useGumForm` `onProgress` removed** ΓÇö documentation corrected; `form.progress` is updated internally, not via options.
- **`useAuth` composable** ΓÇö documentation rewritten to reflect actual API: `user`, `isAuthenticated`, `setUser`, `clearUser`, `hasRole()`.

### Documentation

- **Full VitePress redesign** ΓÇö docs site rebuilt with VitePress, blue brand color (`#3b8eed`), identical layout structure to Vue.js docs.
- **Sidebar restructured** ΓÇö new sections: Getting Started, Essentials, Services, Frontend, Support, Others.
- **Logo & favicon** ΓÇö integrated into docs `public/`, template assets, Sidebar.vue, and all auth pages.
- **Deploy docs rewritten** ΓÇö `overview.md`, `local.md`, `remote.md` rewritten to match actual source code: corrected Dockerfile examples, file trees, env variable tables, workflow step order, and added `rsyncSshPath`/`rsyncSshOptions` config fields.
- **CLI docs fixed** ΓÇö command counts corrected (Module 16, Database 14, Runtime 14, Deploy 6), missing `module:make-test` added, `--view` options corrected (no `bullmq`), `serve --src` documented.
- **Components docs rewritten** ΓÇö DataTable (props/slots/events/PaginatedData interface), Datepicker (4 modes), Select (FetchPack/cascade/resetKey), FeatureButton.
- **Composables docs rewritten** ΓÇö `useAuth()` actual API, `hasRole()`, `authUser`.
- **Helpers docs rewritten** ΓÇö `formatCompactNumber`, `inArray`, `empty`, `downloadFile`, `downloadExcel`, `formatTaxPeriod`, `formatDate`.
- **Support docs fixed** ΓÇö cookie name (`nexgen`), JWT expiries (900/3600/2592000), logger (Pino not Winston), mail settings moved to config file section.
- **Env docs updated** ΓÇö `SOCKET` added to Application table, `FRONTEND` description updated, config entries removed.
- **Modules docs** ΓÇö default column swapped to `OPEN_API=false`.
- **READMEs rewritten** ΓÇö GitHub README with donate button (Support Kori + GitHub Sponsors), runtime/package manager tables; npm README with professional text.

### Dependencies

- **Logger**: Winston replaced by Pino
- **Docs**: VitePress added as dev dependency

### Upgrade Notes

**This is a major release with breaking changes.** Upgrading from v2.x requires manual steps.

1. **Folder structure changed** ΓÇö review the new architecture and adjust imports if you moved files outside the standard structure.
2. **Update `config/realtime.ts`** ΓÇö now reads `env.SOCKET` instead of hardcoding `enabled: true`. Ensure `SOCKET` is set in your `.env`.
3. **Update `config/queue.ts`** ΓÇö `queueUiAllowedEmails` moved from `redis.ts`. If you customized it, move the value.
4. **Update `.env`** ΓÇö add `OPEN_API=false`, `REDIS=false`, `FRONTEND=true`, `SOCKET=true` if not present.
5. **Re-run `deploy:init --force`** ΓÇö deploy env templates changed significantly; regenerate all deploy files.
6. **Logger** ΓÇö Winston replaced by Pino. If you imported `winston` directly, switch to `pino`. Run `npm install` to pick up the new dependency.
7. **Notification module** ΓÇö Vue file generation removed. If you relied on `NotificationBell.vue` or `index.vue` stubs, they no longer exist.
8. **Boolean env parsing** ΓÇö unified to `!== "false" && !== "0"`. Values like `"no"` or `"off"` are now treated as `true`. Use `"false"` or `"0"` to disable.
9. **CLI command changes** ΓÇö `deploy:local` and `deploy:remote` removed; use `deploy:workflow` and `deploy:workflow:remote`. `--view=bullmq` removed from `dev` command.

---

## [2.3.0] ΓÇö 2026-08-12

### Overview

Consolidated the 16 deploy CLI commands into a single 6-command surface (`deploy:init`, `deploy:workflow`, `deploy:workflow:remote`, `deploy:workflow:promote`, `deploy:db:import`, `deploy:db:import:remote`) and added nginx-proxy reverse proxy support to the generated compose files. Also shipped a batch of bug fixes across the scheduler, mail, database import, and frontend components, plus a new `Datepicker` component and a Public Sans UI font.

### Features

#### Deploy CLI

- **Deploy commands consolidated from 16 ΓåÆ 6** ΓÇö the many `deploy:create:*`, `deploy:server`, `deploy:app`, `deploy:workflow:*` variants collapsed into:
  - `deploy:init` ΓÇö generate app + server scaffolding and both workflow configs (`--app-only`, `--server-only`, `--dev`, `--force`, `--runtime`, `--pm`)
  - `deploy:workflow` ΓÇö local pipeline from a config file or flags (`--server-only`, `--app-only`, `--refresh`, `--dry-run`)
  - `deploy:workflow:remote` ΓÇö upload via `rsync`/`scp` and deploy on a remote host
  - `deploy:workflow:promote` ΓÇö run local workflow, then remote workflow
  - `deploy:db:import` / `deploy:db:import:remote` ΓÇö SQL dump import with auto-detected MySQL or PostgreSQL
  - Legacy names (`deploy:create`, `deploy:server`, `deploy:app`, `deploy:db:import`) still work inside workflow config files
- **`deploy:init` generates workflow configs** ΓÇö `deploy/workflow.local.json` and `deploy/workflow.remote.json` are created automatically, so no separate init step is needed. The local workflow uses `deploy:workflow --server-only` / `--app-only` steps.
- **Reverse proxy (nginx-proxy) support** ΓÇö generated app compose attaches to the external `nginx-proxy` network and reads `VIRTUAL_HOST`, `VIRTUAL_PORT`, `LETSENCRYPT_HOST`, `LETSENCRYPT_EMAIL` from `deploy/.env` for domain routing and auto-SSL.
- **`APP_URL` env variable** ΓÇö added to deploy env templates (used for links, redirects, CORS). Also wired into the app compose `APP_URL` default.
- **PostgreSQL dump import** ΓÇö `deploy:db:import` now auto-detects the dialect (MySQL or PostgreSQL) and restores PostgreSQL into a fresh database by default (`DROP DATABASE ... WITH (FORCE)` + recreate); pass `--no-drop` to keep the existing database.
- **`preDeployCommands`** ΓÇö remote workflow config gained an array of commands run on the remote host before the app starts (e.g. `docker rm -f old-app`).
- **pgAdmin servers.json mount** ΓÇö server compose mounts `./pgadmin/servers.json` into the pgAdmin container as read-only.
- **Bun Dockerfile copies `.env`** ΓÇö `deploy/.env` is copied into the image before schema generation so `db:schema` runs with the right `DATABASE_URL`.

#### Mail

- **`MAIL_ENCRYPTION` env variable** ΓÇö new `ssl` | `tls` | `none` option (default `none`). `ssl` enables implicit TLS (port 465), `tls` enables STARTTLS (port 587). The mail transport now sets `secure` from this value instead of hardcoding `false`.

#### Scheduler

- **Run-on-init + console output** ΓÇö `runOnInit` schedules now run sequentially after all cron jobs are registered, under a "Running Scheduled Commands" header. Every run logs the task name with its elapsed time (or `FAIL` on error). `startScheduler()` returns the number of registered schedules (logged as `Scheduler started [N schedule(s)]`).

#### Frontend

- **`Datepicker.vue` component** ΓÇö new date/datetime/month/year picker wrapping `@vuepic/vue-datepicker` (added as a dependency), with a native `input[type=month]` fallback for month mode on Firefox.
- **Public Sans font** ΓÇö self-hosted WOFF2 (latin + latin-ext) wired into `body`, `--bs-body-font-family`, and `--bs-font-sans-serif`.
- **Skeleton theme variables** ΓÇö `--app-skeleton` / `--app-skeleton-hi` added to both light and dark themes; `DataTableSkeleton` uses the theme-aware `skeleton card border` classes instead of hard-coded white.
- **`FeatureButton` render slot** ΓÇö supports a default slot for compound header controls (dropdowns etc.); header renders the slot inside a wrapper with the same order/class as a normal button. `attrs` prop renamed to `buttonClass`.
- **`Input` `echallan-number` category** ΓÇö new formatting category that uppercases and forces `V` + 9 digits.
- **`Select` search pinning** ΓÇö after clearing a search, the last search results are pinned on top of the refetched full list so you don't lose your place.
- **`TextArea` default rows** ΓÇö added `rows="3"` default.
- **`Header.vue`** ΓÇö "My Profile" is now a real `<router-link to="/profile">` instead of a dead `href="#"`; ordering classes and `title` attributes cleaned up.
- **`Pagebar`** ΓÇö simplified title logic (`title` shown only when there's no default slot).
- **`Pagination`** ΓÇö adds a `pagination-${variant}` class.
- **Dialog theming** ΓÇö overlay uses `var(--app-backdrop)` / `var(--app-text)` and the card header/footer no longer hard-code `bg-white`, so dialogs follow light/dark mode automatically.
- **Helpers** ΓÇö added `formatTaxPeriod()` (`yyyy-MM` ΓåÆ `MMM yyyy`) and `formatDate()` (ISO ΓåÆ `dd MMM yyyy`).
- **`.fs-7`** ΓÇö 12px font-size helper class.

### Fixes

- **Deploy DB dialect detection** ΓÇö `detectMigrationDialectFromSql` now checks PostgreSQL hints first (`GENERATED ALWAYS AS IDENTITY`, `bigserial`, `serial`, `timestamp with time zone`, `public.`), uses MySQL-only hints (`auto_increment`, `engine=`, backticks), and no longer misdetects `varchar(` as MySQL.
- **Migration hooks under Bun** ΓÇö `runMigrationHooks()` runs `bun` directly when running under Bun instead of `tsx dist/cli.mjs`, fixing `db:migrate` under the Bun runtime.
- **`auto-migrate.sh` hardening** ΓÇö normalizes `AUTO_MIGRATE` (trims, lowercases, strips Windows `\r`) and documents the flow; `set -eu` retained.
- **Queue worker queues** ΓÇö `maker dev` worker now also processes the `maintenance` queue (`--queue=default,mail,maintenance`).
- **`Button.vue`** ΓÇö removed leftover `d-flex justify-content-center align-items-center custom-btn` classes.
- **Scheduler error handling** ΓÇö a failing schedule run logs `FAIL` instead of crashing the scheduler process.
- **`RATE_LIMIT_LOGIN_MAX` default** ΓÇö raised from `10` to `60` so legitimate login attempts aren't rate-limited during password reset workflows.

### Documentation

- **Deploy guide rewritten** ΓÇö `cli/deploy.md`, `deploy/overview.md`, `deploy/local.md`, `deploy/remote.md` updated for the 6-command surface, including a removed-commands migration table and the new remote config (`upload`, `preDeployCommands`) and nginx-proxy SSL section.
- **Environment guide** ΓÇö documented `MAIL_ENCRYPTION` and the new `RATE_LIMIT_LOGIN_MAX` default (also updated in the Rate Limiter guide).
- **Mail guide** ΓÇö documented the `ssl` / `tls` / `none` encryption modes.
- **Scheduler guide** ΓÇö documented the new console output and run-on-init behavior.
- **Components guide** ΓÇö added `Datepicker` and `FeatureButton` sections, Input formatting categories, Select search pinning, and updated the component list.
- **Assets guide** ΓÇö documented the Public Sans font and the theme CSS variables.
- **Helpers guide** ΓÇö documented `formatTaxPeriod()` and `formatDate()`.
- **Runtime guide** ΓÇö updated the `maker dev` worker queues.

### Dependencies

- **Added** `@vuepic/vue-datepicker@^14` (root + template)

---

## [2.2.5] ΓÇö 2026-06-27

### Changed

- **Modal.vue refactored** ΓÇö removed Bootstrap `Modal` JS dependency. The component now uses a native `data-bs-dismiss` button reference (`closeButton`) for closing, eliminating the need for `import Modal from "bootstrap/js/dist/modal.js"`, manual instance management, and backdrop cleanup logic. The `open()` method was removed as the parent caller manages visibility via the Bootstrap data API. Template attributes were also collapsed to single lines.

### Removed

- **Bootstrap Modal JS import** ΓÇö removed `modal.js` import and `Modal` instance lifecycle (`getOrCreateModal`, `onMounted`, `onBeforeUnmount`, `dispose`). The modal is now fully Bootstrap data-API-driven.

---

## [2.2.4] ΓÇö 2026-06-22

### Changed

- **Auto-create `public/` at boot** ΓÇö `createKernel()` now calls `ensurePublicDir()` during startup (when `FRONTEND=true`), creating the `public/` directory if missing. The frontend static middlewares (`frontendStaticMiddleware`, `frontendIndexMiddleware`) are also lazily initialized via wrapper functions.

### Removed

- **`create-nexgen` template directory** ΓÇö deleted all files under `packages/create-nexgen/template/` (`.dockerignore`, `.env`, `.env.example`, `README.md`, `biome.json`, `drizzle.config.ts`, `gitignore-stub`, `package.json`, database migrations, `src/env.ts`, framework internals, frontend resources, router, stores, plugins, types, and config files). These files are no longer bundled with the `create-nexgen` package.
- **Bumped `create-nexgen` version** ΓÇö `packages/create-nexgen/package.json` updated from `2.2.3` to `2.2.4`.

---

## [2.2.3] ΓÇö 2026-06-19

### Changed

- **Consolidated type declarations** ΓÇö moved all `declare module` blocks from scattered `.d.ts` files (`src/resources/src/env.d.ts`, `src/resources/src/types/luxon.d.ts`, `src/framework/database/optional-db-drivers.d.ts`) into a single `src/types/global.d.ts`. Updated both root and resources `tsconfig.json` to include the central file. This gives both the backend and frontend projects access to module declarations (luxon, nodemailer, pg, vue-select, bootstrap JS, `*.vue`, better-sqlite3) without duplication.

---

## [2.2.2] ΓÇö 2026-06-19

### Fixed

- **Queue worker database initialization** ΓÇö `worker.ts` now calls `initDatabase()` before starting the queue worker and `closeDatabase()` on shutdown. Previously, job handlers that used the database threw "Database is not initialized" when running in a separate worker process.

### Changed

- **BullBoard dynamic queue discovery** ΓÇö `ui.ts` now scans Redis for all queue `:meta` keys at boot and registers them automatically, eliminating the need to hardcode queue names in `ensureQueues()`. In development mode, a 15s poll timer rescans Redis and dynamically adds newly discovered queues to BullBoard via `addQueue()`. Polling is skipped in production where all queues are known upfront.
- **`setupBullBoard()` is now async** ΓÇö `kernel.ts` uses `await setupBullBoard()` to support the Redis scan on boot.
- **Graceful shutdown** ΓÇö `server.ts` imports and calls `stopBullBoardPoll()` to clear the dev poll timer on shutdown.

---

## [2.2.1] ΓÇö 2026-06-17

### Fixed

- **Biome import fixup** ΓÇö `organizeImports` stripped component imports used only in Vue `<template>` blocks. Restored 150+ missing imports across stats project, nexgen template, and create-nexgen template. Also reverted unsafe `noUnusedVariables` renames (`_logout`, `_themeIconClass`, `_startYear`/`_currentYear`) that broke template bindings. Added missing `vSelect` import (vue-select) and fixed `Object.hasOwn` ΓåÆ `in` operator for ES2020 compat.

---

## [2.2.0] ΓÇö 2026-06-17

### Overview

Replaced ESLint + Prettier with Biome, unifying linting and formatting under a single tool with consistent code style applied across the entire codebase. Added `paginateModel()` for relational query pagination, `skipFetch` option in Gum for client-side navigation, and `FeatureButton` for extensible nav bar buttons. Fixed paginate count query and removed dead `Refresh.vue` component.

### Features

#### Tooling

- **ESLint + Prettier removed** ΓÇö replaced with Biome v2.5.0 (`preset: "recommended"`)
- **Biome config** ΓÇö 8 rule overrides matching previous ESLint behavior: `noUnusedVariables`, `useExhaustiveDependencies`, `noConsole`, `noSwitchDeclarations`, `useOptionalChain`, `useDefaultSwitchClause`, `noParamAssign`, `useVueMultiWordComponentNames`
- **package.json scripts** ΓÇö `lint`, `lint:fix`, `format`, `format:check` now use Biome
- **Removed 8 devDependencies** ΓÇö `eslint`, `@eslint/js`, `eslint-plugin-vue`, `typescript-eslint`, `prettier`, `eslint-config-prettier`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`
- **Deleted config files** ΓÇö `eslint.config.js`, `.prettierrc`, `.prettierignore`
- **`.gitignore`** ΓÇö added `coverage/` and `src/storage/trash/`

#### Database

- **`paginateModel()`** ΓÇö new paginator for Drizzle relational queries (`db.query.table.findMany`) with support for `where`, `with`, `columns`, `extras`, `orderBy`, and custom `total`/`data` callbacks
- **`resolvePath()`** ΓÇö extracted URL resolution helper used by `paginate()` and `paginateModel()`
- **Fixed paginate count query** ΓÇö replaced broken `.as("paginate_rows")` with proper inner select for accurate total row counting

#### Frontend

- **`FeatureButton.vue`** ΓÇö new component for registering extensible nav bar buttons via `inject("featureButtons")`
- **Header.vue** ΓÇö replaced commented-out refresh button with `featureButtons` slot; removed dead `Refresh.vue`
- **`skipFetch` option** ΓÇö `gum.visit()` / `useGum()` now supports `skipFetch: true` for client-side route transitions without a server roundtrip

#### Documentation

- **Rate Limiter** ΓÇö new guide page covering per-IP and per-session rate limiter configuration
- **Database** ΓÇö updated migration and seeding docs
- **Environment** ΓÇö documented new `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_LOGIN_MAX` variables
- **Events & Queue** ΓÇö minor corrections
- **Components** ΓÇö expanded API reference
- **Gum** ΓÇö documented `skipFetch` option

### Fixes

- **Paginate count query** ΓÇö count subquery now uses `db.select({ val: sql\`1\` }).from(query.as("\_inner"))`instead of broken`.as("paginate_rows")` pattern
- **Subcriteria dropdown** ΓÇö `subcriteriaDD` returns `null` when no criteria is selected, preventing unnecessary API requests
- **FloatButton** ΓÇö simplified template; renamed unused `floatStyle` to `_floatStyle` for Biome compliance
- **env.d.ts** ΓÇö added blank line separators between `declare module` blocks for Biome formatting

### Dependencies

- **Runtime**: Node.js >= 24 or Bun >= 1.3 (unchanged)
- **Database**: SQLite (default), MySQL, or PostgreSQL (unchanged)
- **Optional**: Redis (unchanged)
- **Dev**: ESLint + Prettier removed, Biome v2.5.0 added

### Upgrade Notes

Run `npm install` to pick up new devDependencies. Run `npx biome check --write .` to reformat any open feature branches. The `paginate()` function's internal count query changed ΓÇö if you were relying on the old `.as("paginate_rows")` pattern, no migration needed as it was internal.

---

## [2.1.1] ΓÇö 2026-06-05

### Overview

First stable release of **nexgen** ΓÇö a full-stack TypeScript framework built on Hono, Vue 3, and Drizzle ORM. This release covers the complete feature set: modular architecture, Redis-backed services, real-time broadcasting, authentication, OpenAPI docs, frontend SPA, maker CLI, and Docker deployment.

### Features

#### Core Framework

- **Hono HTTP server** with Zod-validated middleware stack (session, CORS, logger, rate limiter)
- **Modular monolith** ΓÇö self-contained modules under `src/modules/` with auto-discovered routes, jobs, models, and seeders
- **OpenAPI / Scalar** ΓÇö auto-generated API documentation at `/api-docs` with JSON spec at `/doc`
- **Health endpoint** at `GET /health`
- **File storage** ΓÇö local disk or S3-compatible storage with signed URLs
- **Dual database** ΓÇö SQLite, MySQL, or PostgreSQL via Drizzle ORM

#### Authentication & Security

- **JWT auth** ΓÇö access + refresh token rotation with signed httpOnly cookies
- **Email verification** ΓÇö optional `AUTH_REQUIRE_EMAIL_VERIFICATION` flow
- **Password reset** ΓÇö token-based forgot/reset with queue-emailed links
- **Role middleware** ΓÇö `requireRole("admin")` guard for admin routes
- **Rate limiting** ΓÇö per-IP rate limiter middleware

#### Redis-Backed Services (optional)

- **Cache** ΓÇö TTL-based key-value cache with `cache.get/put/forget/remember`
- **Session** ΓÇö server-side session store with httpOnly cookie, auto-refresh
- **Queue** ΓÇö BullMQ job processing with `shouldQueue` decorator, retries, backoff
- **Realtime** ΓÇö Socket.IO with Redis adapter for multi-instance broadcasting
- **Scheduler** ΓÇö cron-based `defineSchedule` with distributed Redis lock
- **BullBoard** ΓÇö live queue dashboard at `/bullmq`
- **Redis Commander** ΓÇö GUI at configurable port (1369)

#### Events & Realtime

- **String-based event dispatcher** ΓÇö `dispatchEvent(name, payload, options)` with broadcast and queue support
- **Socket.IO server** ΓÇö automatic room joining by auth, user ID, and role
- **Frontend Pulse plugin** ΓÇö `pulse.channel(name).listen(event, callback)` API
- **Notifications system** ΓÇö `notify()` persists to database and optionally broadcasts + emails
- **Mail queue** ΓÇö dedicated `mail` queue for async email delivery (nodemailer + SMTP)

#### Maker CLI

- `maker dev` ΓÇö starts API server, frontend HMR, queue worker together
- `maker module:make` ΓÇö scaffolds controllers, routes, models, seeders, jobs, schedules
- `maker db:migrate --seed` ΓÇö generates schema, runs migrations, seeds
- `maker serve --prod` ΓÇö production mode with compiled `dist/`
- `maker queue:work` ΓÇö BullMQ worker process
- `maker schedule:work` ΓÇö cron scheduler worker
- `maker deploy` ΓÇö Docker-based deployment with nginx-proxy and SSL

#### Frontend (Vue 3 SPA)

- **Gum plugin** ΓÇö Inertia-style page visits, form handling with validation errors, scroll preservation, `useGumRemember()` for local UI state
- **Pulse plugin** ΓÇö Socket.IO realtime channels with room-based event listening
- **Dialog plugin** ΓÇö programmatic `alert()`, `confirm()`, `prompt()` modals
- **Auth pages** ΓÇö login, register, forgot/reset password, email verification
- **UI components** ΓÇö DataTable (server-side pagination), Select (API-fetched with infinite scroll), Modal, Toast, Button, Input, Switch, and 12 more
- **DataTable** ΓÇö full server-side pagination, search, bulk delete, skeleton loading, slot-based customization
- **Theme system** ΓÇö light/dark/auto with SCSS variable overrides
- **Route progress bar** ΓÇö animated navigation indicator
- **Pinia stores** ΓÇö auth store with session bootstrap, admin-ui store with sidebar + theme state
- **Axios interceptor** ΓÇö 401 auto-redirect to `/login`

#### Documentation

- Comprehensive VitePress docs with full API reference for every plugin, component, and subsystem
- Dedicated pages for Gum, Pulse, Dialog, Router, Stores, Composables, Components, Validation, Assets, Axios
- Architecture guide with boot sequence diagram and middleware stack
- Complete env variable reference with feature interaction map
- Module development guide with OpenAPI stub variants

#### Deployment

- **Docker Compose** ΓÇö two-layer deploy: app server + nginx-proxy with auto-SSL
- **Local deploy** ΓÇö `maker deploy:local` with containerized MySQL and Redis
- **Remote deploy** ΓÇö `maker deploy:remote` with SSH and Docker context
- **CI/CD** ΓÇö GitHub Actions workflow for docs deployment

### Fixes

- Signed cookie auth with separate frontend/app URL support
- Raw SQL query support in migrations (indexes, alter table)
- Seeder execution sequence ordering
- OpenAPI route tag placeholder handling
- Modal and toast component edge cases
- Zod async `safeParse` for async validation schemas
- Template sync for publish workflow

### Dependencies

- **Runtime**: Node.js >= 24 or Bun >= 1.3
- **Database**: SQLite (default), MySQL, or PostgreSQL
- **Optional**: Redis (for cache, session, queue, realtime, scheduler)
---
