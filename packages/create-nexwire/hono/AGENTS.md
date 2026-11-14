# AGENTS.md — nexwire (Hono)

You are working in a **nexwire** application: a full-stack TypeScript framework
(**Hono** HTTP layer + Vue 3 SPA + Drizzle ORM). This file is the contract. Read
it before writing any code and follow it exactly. **A change that breaks a rule is
wrong even if it compiles and every test passes.**

- Docs: https://niyamulahsan.github.io/nexwire/
- AI index (one file, every page): https://niyamulahsan.github.io/nexwire/llms.txt
- Full docs (single file): https://niyamulahsan.github.io/nexwire/llms-full.txt
- Conventions: https://niyamulahsan.github.io/nexwire/guide/conventions

If a rule here conflicts with something you "know" from another framework, this
file wins. If a rule conflicts with the linked docs, the docs win — report the
discrepancy, do not silently pick one.

## 0. Non-negotiables

These override every other habit. A change that breaks one of them is wrong even
if it compiles and every test passes.

1. **Never edit `src/framework/**`.** It is the framework, not your application.
   Your code lives in `src/modules/**`, `src/middlewares/**`, `src/providers/**`,
   `src/config/**` and `src/resources/**`.
2. **Directory = meaning.** The framework discovers files by folder, never by
   filename. The only valid folders are `controllers/`, `services/`, `helpers/`,
   `routes/`, `schemas/`, `database/models/`, `database/seeders/`,
   `middlewares/`, `jobs/`, `console/`, `schedules/`, `__tests__/`, `types/`,
   plus the module-root file `facade.ts`. A file anywhere else is invisible.
3. **Every source file opens with its location, on line 1, then one blank line:**
   ```ts
   // ./src/modules/blog/controllers/post.ts

   import { postService } from "@/modules/blog/services/post.js";
   ```
   A Vue SFC uses the HTML form on line 1:
   `<!-- ./src/resources/src/pages/Home.vue -->`. `maker` writes this header for
   you — never add it by hand, and never add it twice.
4. **Import only through `@/`.** Backend: `@/` is `src/`. UI (`src/resources/**`):
   `@/` is `src/resources/src/`. Never cross folders with `../`; a same-folder
   sibling import (`./post.js`) is allowed.
5. **Import the framework only from `@/framework/facade.js`.** Never from
   `@/framework/<deep>/…`. A function that is not on the facade is not public API.
6. **Scaffold with `maker`; never hand-create a file in a discovered folder.**
   Run `npm run maker -- --help` and `npm run maker -- <command> --help` first.
   Guessing a command name or a flag is a violation, not a shortcut.
7. **Schemas are the source of truth for input.** Every request shape lives in
   `schemas/`. A response schema is optional. `types/` holds only shapes that do
   not come from a schema.
8. **Modules talk only through `facade.ts`.** A module never imports its own
   facade; a facade never imports another facade. Models are the one cross-module
   exception, and only for Drizzle `relations()`.
9. **helper = computes, service = does.** A function goes in `helpers/` only when
   it is called from two or more files, or is pure logic a unit test must exercise
   in isolation, **and** it does not touch the database, files or network. When in
   doubt, inline it — extracting later is trivial; deleting a dead helper across
   five imports is not. Anything that touches the database, the filesystem or the
   network goes in `services/`.

## 1. Project layout

```
src/
├── config/        configuration (env.ts, app.ts, database.ts, auth.ts, …)
├── database/      schema barrel + migrations
├── framework/     the framework — never edit
├── middlewares/   app-wide middleware (auth-middleware.ts, role-middleware.ts)
├── modules/       your features — one folder per module
├── providers/     app-wide capability providers
├── resources/     Vue 3 SPA (resources/src/**)
├── storage/       runtime files (logs, uploads, sqlite)
└── types/         global type declarations
```

## 2. Module anatomy

Everything for one feature lives under `src/modules/<module>/`:

| Kind       | Folder              | Example              |
| ---------- | ------------------- | -------------------- |
| controller | `controllers/`      | `post.ts`            |
| service    | `services/`         | `post.ts`            |
| helper     | `helpers/`          | `post.ts`            |
| route      | `routes/`           | `index.ts`           |
| schema     | `schemas/`          | `post.ts`            |
| model      | `database/models/`  | `post.ts`            |
| seeder     | `database/seeders/` | `post.ts`            |
| middleware | `middlewares/`      | `post.ts`            |
| job        | `jobs/`             | `post.ts`            |
| console    | `console/`          | `cleanup.ts`         |
| schedule   | `schedules/`        | `cleanup.ts`         |
| test       | `__tests__/`        | `post.test.ts`       |
| type       | `types/`            | `post.ts`            |
| **facade** | `facade.ts` (root)  | public API of module |

Nest a module under a panel with `--path=<panel>`:
`module:make blog --path=admin` → `src/modules/admin/blog`.

## 3. Schemas → types

Every request shape is a Zod schema in `schemas/<name>.ts`; its type is derived on
the next line with `z.input`.

```ts
// ./src/modules/payment/schemas/payment.ts

import { z } from "@/framework/facade.js";

export const SubmitDepositSchema = z.object({
  amountTaka: z.number().positive("Number > 0"),
  method: z.string().trim().min(1),
  trxId: z.string().trim().min(4, "Min 4 char"),
  source: z.string().min(1).optional().default("automation")
});
export type SubmitDepositType = z.input<typeof SubmitDepositSchema>;

export const DepositIdParamsSchema = z.object({ id: z.uuid() });
export type DepositIdParamsType = z.input<typeof DepositIdParamsSchema>;

export const DepositListQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  per_page: z.coerce.number().int().positive().max(100).optional()
});
export type DepositListQueryType = z.input<typeof DepositListQuerySchema>;
```

- Name the pair `<X>Schema` / `<X>Type`. Nothing else.
- **Request types use `z.input`** — the shape the caller sends, where a
  `.default()` field is still optional.
- **A response schema is optional, and never required.** Input is the trust
  boundary and is always strict; a response is produced by the server, so
  documenting it is a convenience, not a rule. When you do declare one, derive its
  type with `z.infer`. See §5 for the engine-specific trade-off.
- Import `z` from `@/framework/facade.js`, never from `"zod"`.
- Never re-declare a request body, params or query by hand — not in a controller,
  not in `types/`. Import the `*Type` from the schema file.

## 4. Services

A service owns every `db.*` call and every `dispatchEvent`. A controller never
touches the database.

Do:

- Route every list endpoint through a paginator. Pick the one that fits; all four
  return the same `PaginatedResult` (`{ data, current_page, per_page, total, path, … }`):
  - `paginateModel(c, { table, query: db.query.<table>, where, with, orderBy })`
    — when the response needs eager-loaded relations (`with`).
  - `paginate(c, query, perPage)` — a plain `db.select().from(...)` with no relations.
  - `paginateTable(db, table, { where, orderBy, page, perPage })` — one table, no
    request object.
  - `paginateQuery({ total, data, page, perPage })` — full manual control.
  `paginate` and `paginateModel` read the page params from the request, so the
  service that calls them takes the request context as its first argument
  (`c` on Hono, `req` on Express, `request` on Fastify). `paginateTable` and
  `paginateQuery` need no request.
- Project relation columns explicitly when the UI table shows them —
  `with: { author: { columns: { id: true, name: true } } }` — never `SELECT *` on a relation.
- Fire realtime events with `dispatchEvent(name, payload, { broadcast })` **after**
  the write commits.
- Fire side-effect jobs with `dispatchEvent(name, payload, { queue })` or
  `queueJob(name, payload, { queue, delay })`, also after the write commits.
- Return domain data, or a result object the controller maps to a response. Using
  `HttpStatusCodes` inside a service is allowed when the service returns such a
  result object:
  ```ts
  // service — allowed
  return { status: HttpStatusCodes.NOT_FOUND, message: "User not found" };
  ```
  The service is naming a domain outcome with the shared constants; it is not
  shaping the HTTP response.

Never:

- Write a `SELECT … LIMIT … OFFSET` by hand for a list endpoint. Use a paginator.
- Return a bare array from an index service. Return the paginator's `PaginatedResult`.
- Emit `dispatchEvent` inside a `db.transaction(...)` callback. Emit after it resolves.
- Build the HTTP response in a service. `c.json(...)`, `res.status(...).json(...)`
  and `reply.send(...)` belong to the controller.
- Build a `where` by string concatenation. Compose with `and(...clauses)` and `or(...)`.

## 5. Controllers and routes (Hono)

A route file is a Hono router registered by the framework and mounted at
`/api/<module>`. Two shapes exist; match the project's `OPEN_API` setting.

With OpenAPI (`OPEN_API=true`) — `createRoute` + `group().api(...)`:

```ts
// ./src/modules/blog/routes/index.ts

import { createRoute, group, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { index, store } from "@/modules/blog/controllers/post.js";
import { CreatePostSchema, PostSchema } from "@/modules/blog/schemas/post.js";

const indexRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Blog"],
  responses: { [HttpStatusCodes.OK]: jsonContent(z.array(PostSchema), "posts") }
});

const storeRoute = createRoute({
  path: "/",
  method: "post",
  tags: ["Blog"],
  request: { body: jsonContent(CreatePostSchema, "new post") },
  responses: { [HttpStatusCodes.CREATED]: jsonContent(PostSchema, "created") }
});

export default group()
  .api(indexRoute, index)
  .api(storeRoute, store);
```

`group(...middlewares)` is `createRouter()` with group middleware pre-applied;
both are exported from the facade. `maker` scaffolds route files with `group()`.

`responses` / `jsonContent(...)` feed the **OpenAPI document only** — Hono never
validates or filters the outgoing body, so a response schema is optional and never
required. Declare one when you want it documented; skip it freely. The **request**
(`request.body`, query, params) is the trust boundary and is always strict.

Without OpenAPI (`OPEN_API=false`) — plain verb methods on `group()`:

```ts
export default group()
  .get("/", index)
  .post("/", store)
  .put("/:id", update)
  .delete("/:id", destroy);
```

A controller is a Hono `Handler`. Read the validated input from
`c.req.valid("json" | "query" | "param")` and the user from `c.get("auth")`:

```ts
// ./src/modules/blog/controllers/post.ts

import type { Handler } from "hono";
import { HttpStatusCodes } from "@/framework/facade.js";
import type { CreatePostType } from "@/modules/blog/schemas/post.js";
import { postService } from "@/modules/blog/services/post.js";

export const store: Handler = async (c: any) => {
  const body = c.req.valid("json") as CreatePostType;
  const data = await postService.create(body);
  return c.json({ message: "Post created", data }, HttpStatusCodes.CREATED);
};
```

Protected routes — chain `group(authMiddleware)`:

```ts
export default group(authMiddleware).api(meRoute, me);
```

Per-route role middleware (auth runs first):

```ts
.api(indexRoute, [requireRole("admin")], index)
```

Never:

- Write `import type { XSchema }` when the same name is used at runtime in
  `request.body` / `validator(...)` — that erases the value and the request is not
  validated. Use `import { XSchema }`.
- Mix `createRoute` and `.get/.post` in one router when `OPEN_API=true`.
- Register a route without a **request** schema (body, query, params) when a
  schema file exists — response schemas are optional, request schemas are not.
- Return `c.json(result)` without the `{ message, data }` envelope.
- Use a status literal (`200`). Always `HttpStatusCodes.<NAME>`.
- Query the database in a controller when a service exists for that aggregate.

## 6. Facades

`facade.ts` is a module's public API — the one door other modules knock on.

> **Rule 1 — modules talk to each other only through facades.**
> **Rule 2 — facades never import other facades.**
> **Rule 3 — a module never imports its own facade.**

Do:

- Export services and types from `facade.ts`, and models only when another module
  needs them for `relations()`.
- Import a cross-module service through its facade:
  `import { walletService } from "@/modules/wallet/facade.js";`.

Never:

- Reach past a facade: `import { collectionService } from "@/modules/collection/services/collection.js"` from another module.
- Re-export a controller, route, job or scheduler from a facade.

## 7. Realtime, jobs, schedules, notifications

**Realtime — `broadcast()` vs `dispatchEvent()`**

|              | `broadcast()`       | `dispatchEvent()`                |
| ------------ | ------------------- | -------------------------------- |
| Socket emit  | yes                 | yes (via the `broadcast` option) |
| Queues a job | no                  | yes (via the `queue` option)     |
| Use for      | fire-and-forget UI  | a side effect and a UI refresh in one call |

```ts
import { broadcast, dispatchEvent } from "@/framework/facade.js";

// Socket only.
broadcast("collection.changed", { id }, { auth: true });

// Socket + one queued job.
await dispatchEvent("collection.changed", { id }, {
  broadcast: { auth: true },
  queue: "collection"
});
```

Audiences are combinable: `all`, `auth`, `users: [id]`, `roles: ["admin"]`,
`rooms: ["room:chat:general"]`. A room name must match the UI's
`pulse.channel(name)` string verbatim.

**Jobs — `shouldQueue(name, queue, handler)`**

A job lives in `src/modules/<module>/jobs/<name>.ts`. The event name passed to
`dispatchEvent(..., { queue })` must equal the `shouldQueue` name, and the queue
must match too.

```ts
// ./src/modules/auth/jobs/registeruser.ts

import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, userId } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Account Creation",
    html: `<p>Hello ${name},</p><p>Your account was created successfully.</p>`
  });

  await dispatchEvent("user.changed", { id: userId }, { broadcast: { auth: true } });

  return { ok: true, userId };
});
```

Producer side: `await dispatchEvent("user:signup", { email, name, userId }, { queue: "mail" });`

Never:

- Register a job name that no `dispatchEvent(..., { queue })` emits — the queue
  silently drops.
- Put a job in `services/`, `controllers/` or `console/`. Jobs go in `jobs/`.
- Pass a password or secret in `job.data`. Pass an id and re-fetch.
- Swallow an error. Let it throw so the queue can retry.

**Schedules — `defineSchedule(...)`**

A schedule lives in `src/modules/<module>/console/*.ts` or
`src/modules/<module>/schedules/*.ts` — both are discovered by `schedule:work`.
Every run is wrapped in a distributed lock (Redis first, DB fallback; `ttlMs`
default 120000). Two modes:

```ts
// Handler mode — do the work inline, chunked with a keyset cursor.
defineSchedule({
  name: "collection:status-update",
  expression: "0 0 0 * * *",
  handler: async () => {
    let lastId = 0;
    while (true) {
      const rows = await db
        .select({ id: collectionbinds.id })
        .from(collectionbinds)
        .where(and(eq(collectionbinds.last, 1), lt(collectionbinds.endDate, now), lastId > 0 ? gt(collectionbinds.id, lastId) : undefined))
        .orderBy(collectionbinds.id)
        .limit(1000);
      if (!rows.length) break;
      // …process…
      lastId = rows[rows.length - 1].id;
    }
    await dispatchEvent("collection.statusUpdate", { binds }, { queue: "collection" });
  }
});

// Queue mode — enqueue one job per tick.
defineSchedule({
  name: "reminder",
  expression: "0 9 * * *",
  queue: "mail",
  job: "send.reminders",
  data: { template: "daily" },
  immediately: true
});
```

Never:

- Put a schedule in `jobs/` or `services/`. It goes in `console/` or `schedules/`.
- Run an unbounded `db.select().from(table)` in a scheduler. Chunk with a keyset
  cursor (`id > lastId`, `LIMIT 1000`).
- Do downstream work inline. Enqueue a job and let it process.
- Assume a schedule runs once. Assume overlap and make every write idempotent.
- Read `expression: "* * * * *"` as "every second" — it is once per minute. Use
  the six-field form (`"* * * * * *"`) for per-second.

**Notifications — `notify(target, options)`**

`notify` persists a notification and can broadcast and email it. Use it for
user-visible events, not internal side effects.

```ts
import { notify } from "@/framework/facade.js";

await notify(user.id, {
  type: "success",
  title: "Deposit approved",
  body: "Your deposit has been credited.",
  broadcast: true,
  mail: { subject: "Deposit approved" }
});
```

Never use `notify` for something the user does not need to see. Use `broadcast` or
`dispatchEvent` for internal events.

## 8. Frontend — pages and components

The UI is Vue 3 + Pinia + Vue Router under `src/resources/`. Here `@/` is
`src/resources/src/`.

Reuse the shipped kit — never hand-roll a control it already provides:

| Need        | Component                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| buttons     | `@/components/Button.vue`, `FeatureButton.vue`, `FloatButton.vue`, `Href.vue`                                       |
| fields      | `@/components/Input.vue`, `InputPasswordToggle.vue`, `InputGroup.vue`, `TextArea.vue`, `Checkbox.vue`, `Switch.vue` |
| dropdown    | `@/components/Select.vue`                                                                                           |
| date        | `@/components/Datepicker.vue`                                                                                       |
| table       | `@/components/datatable/index.vue` (+ `DataTableSkeleton.vue`)                                                      |
| overlays    | `@/components/Modal.vue`, `Toast.vue`, `Spinner.vue`                                                                |
| page chrome | `@/components/Pagebar.vue`, `Refresh.vue`, `FeatureButton.vue`                                                      |

Props, slots and events: https://niyamulahsan.github.io/nexwire/guide/resources/components

A page is a single-file component at `src/resources/src/pages/<feature>/index.vue`.
Register it as a lazy child of the `dashlayout` route in
`src/resources/src/router/index.ts`:

```ts
{ path: "/posts", name: "posts", component: () => import("@/pages/posts/index.vue"), meta: { requiresAuth: true } }
```

Guest pages go under `authlayout` with `meta: { guestOnly: true }`. Set the tab
title with `useHead({ title: "Posts" })` and the in-app header with
`<Pagebar title="Posts" />`.

Canonical form submit — the page owns the form and submits it to a store action
through the matching `*With` helper:

```vue
<script setup lang="ts">
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import { useGum } from "@/plugins/gum";
import { useAuthStore, type RegisterPayload } from "@/stores/auth";

const auth = useAuthStore();
const gum = useGum({ name: "", email: "", password: "", password_confirmation: "" });
const form = gum.form;

const onSubmit = () =>
  form.postWith({
    fetcher: (body) => auth.register(body as RegisterPayload),
    transform: (data) => ({ ...data, name: String(data.name).trim() }),
    onSuccess: () => form.reset(),
    onError: (_errors, error) => { /* surface the message */ }
  });
</script>
```

- `form.data` is the reactive model (`v-model="form.data.email"`), `form.errors`
  carries server validation errors (`:err="form.errors.email"`), `form.processing`
  disables submit, and `form.reset("password")` clears one field (no argument
  clears the form).
- `useGum()` with no defaults has no `form` — use `gum.postWith({ fetcher })` /
  `gum.getWith(...)` for a request with no form.

Never:

- Hand-roll an `<input>`, `<select>`, `<textarea>`, checkbox, switch, modal,
  table, button, datepicker, toast or spinner. The kit is the kit.
- Call axios from a page. A page calls a store action through
  `form.postWith` / `putWith` / `patchWith` / `deleteWith`, or
  `gum.postWith` / `getWith` for a visit with no form.
- Put a pure function in a component. Pure → `@/helpers/`; shared reactive state
  → `@/composables/`.
- Add a global plugin without registering it in `main.ts`.

Full Gum surface: https://niyamulahsan.github.io/nexwire/guide/resources/gum

## 9. Frontend — stores

One store per resource at `src/resources/src/stores/<name>.ts`, matching
`stores/example.ts`: one `index` / `show` / `store` / `update` / `destroy` action
per resource.

```ts
// ./src/resources/src/stores/collection.ts

import axios from "@/plugins/axios";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useCollectionStore = defineStore("collection", () => {
  const collections = ref<any>(null);
  const collection = ref<any>(null);
  const loading = ref(false);

  const index = async (params: { search?: string; page?: number; size?: number } = {}) => {
    loading.value = true;
    try {
      const response = await axios.get("/api/collection", { params });
      collections.value = response.data?.data || null;
      return collections.value;
    } finally {
      loading.value = false;
    }
  };

  const store = async (payload: Record<string, any>) => {
    const response = await axios.post("/api/collection", payload);
    return String(response.data?.message || "Collection created");
  };

  return { collections, collection, loading, index, store };
});
```

Never:

- Call `fetch` from a store. Use the shared axios instance — `@/plugins/axios`
  holds the app config (base URL, `withCredentials`, `X-Requested-With`, the 401
  redirect) and is loaded once in `main.ts`.
- Put request logic in a page.
- Return the raw axios response from an action. Return what the page consumes —
  `response.data.data` for a list, `response.data.message` for a write.
- Skip the loading flag on a list fetch.

## 10. Frontend — passing data and handlers down

A page owns state and network calls. Child components (forms, tables, modals) are
dumb: they receive data and function references as props.

```vue
<!-- ./src/resources/src/pages/circle/index.vue -->
<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { pulse } from "@/plugins/pulse";
import { useCircleStore } from "@/stores/circle";
import CircleForm from "./CircleForm.vue";
import CircleTable from "./CircleTable.vue";

const circleStore = useCircleStore();
const { circles } = storeToRefs(circleStore);
const route = useRoute();
const formRef = ref<InstanceType<typeof CircleForm> | null>(null);

const fetchCircles = async () =>
  await circleStore.index({
    search: String(route.query.search || ""),
    page: Number(route.query.page || 1),
    size: Number(route.query.size || 10)
  });

const edit = async (id: number) => {
  const item = await circleStore.show(id);
  formRef.value?.setForm(item || {});
};

const del = async (ids: (string | number)[]) => {
  if (!ids.length) return;
  await circleStore.destroy(ids);
  await fetchCircles();
};

watch(() => route.query, fetchCircles, { immediate: true });

onMounted(() => {
  const ch = pulse.channel("circle");
  const handler = () => fetchCircles();
  ch.listen("circle.changed", handler);
  onUnmounted(() => ch.stopListening("circle.changed", handler));
});
</script>

<template>
  <Pagebar title="Circle" />
  <div class="row gx-2">
    <div class="col-12 col-lg-4 mb-3 mb-lg-0">
      <CircleForm ref="formRef" @saved="fetchCircles" />
    </div>
    <div class="col-12 col-lg-8">
      <CircleTable :data="circles" :search="String(route.query.search || '')" :edit="edit" :del="del" />
    </div>
  </div>
</template>
```

```vue
<!-- ./src/resources/src/pages/circle/CircleTable.vue -->
<script setup lang="ts">
import DataTable from "@/components/datatable/index.vue";

const props = defineProps<{
  data: Record<string, any> | any[] | null;
  search: string;
  edit: (value: number) => void;
  del: (value: (string | number)[]) => void;
}>();
</script>
```

Rules:

- Data goes down as a prop (`:data="circles"`); a handler goes down as a prop
  (`:edit="edit"`, `:del="del"`), not as an emit.
- Type every handler: `edit: (id: number) => void`,
  `del: (ids: (string | number)[]) => void`, `fetch: () => Promise<void>`. Never
  `Function` or `any`.
- A child that must trigger a re-fetch receives a `fetch` / `onSaved` prop. It
  never imports the store.
- Bulk selection lives in the child (the `DataTable`'s `remove` event hands the
  array to the `del` prop). The page owns the confirm dialog, the toast and the
  store call.
- `DataTable` receives `data`, `search` and `option` and renders its slots. The
  page never builds rows.
- A dumb child never imports a Pinia store, `@/plugins/axios`, a service, or
  `useGum`, and never calls `dialog` / `toast` / `pulse`. Those belong to the page.

Never:

- Import a store inside a table/form/modal child.
- Pass an entire store object (`:store="store"`) into a child.
- Type a handler prop as `Function` or `any`.
- Re-emit an event the page handles unchanged — that is what a function prop is for.

## 11. The `@/` alias — enforced

| Context                 | `@/` resolves to     |
| ----------------------- | -------------------- |
| Backend (`src/**`)      | `src/`               |
| UI (`src/resources/**`) | `src/resources/src/` |

Never:

- `import { x } from "../services/x.js"` across folders. Use
  `@/modules/<m>/services/x.js`.
- `import { X } from "@/framework/<deep>/…"`. Use `@/framework/facade.js`.
- `import Button from "../../components/Button.vue"`. Use
  `@/components/Button.vue`.
- A same-folder sibling import (`./post.js`) is allowed.

## 12. Commands

```bash
npm run dev                                  # API + UI + queue in one process
npm run dev -- --with=redis,maildev,studio   # …with sidecar UIs
npm run maker module:make blog               # scaffold a whole module
npm run maker module:make-controller blog post
npm run maker module:make-route blog post
npm run maker module:make-model blog post
npm run maker module:make-schema blog post
npm run maker module:migrate blog            # create + run the module's migration
npm run maker db:migrate -- --seed
npm run lint                                 # biome
npm run test:run                             # vitest
```

`maker` has a wide surface — modules, database, runtime, testing, deploy. **Do not
guess a command name or flag.** List everything with
`npm run maker -- --help`, and read one command's options with
`npm run maker -- <command> --help` (the `--` is required so npm forwards the flag
instead of swallowing it). Full reference:
https://niyamulahsan.github.io/nexwire/cli/reference

Use `--path=<panel>` to nest a module under a panel
(`module:make blog --path=admin` → `src/modules/admin/blog`).

## 13. Before you say "done"

Run these and fix every failure:

```bash
npx tsc -p tsconfig.json --noEmit   # 0 errors
npm run typecheck:ui                # 0 errors (the Vue UI)
npm run lint                        # clean
npm run test:run                    # green
```

Then confirm by hand:

- Every new file opens with its location header + blank line and imports only
  through `@/`.
- Every request shape lives in `schemas/` (an `<X>Schema` + `<X>Type` pair), not in
  `types/`; a response schema is optional and never required.
- Every list endpoint returns a paginator's `PaginatedResult`, wrapped as
  `{ message, data }`.
- Every controller answers with `HttpStatusCodes.<NAME>` and the `{ message, data }`
  envelope; no service builds the HTTP response.
- Every UI control comes from `@/components/**`, and every page submits through a
  store, not axios.
- Every dumb child receives data + typed handlers as props (no store, no axios, no
  dialog/toast/pulse).
- Every job is in `jobs/`, every scheduler in `console/` or `schedules/`, and every
  `dispatchEvent(..., { queue })` name has a matching `shouldQueue`.
- Realtime uses `pulse.channel(...).listen(...)`, cleaned up in `onUnmounted` — no
  raw `WebSocket`, `EventSource` or polling loop.
- No helper was created for a single call site.

A change that violates one of these is rejected. If you cannot comply, stop and
ask — do not improvise.
