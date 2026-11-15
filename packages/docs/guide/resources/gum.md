# Gum

Gum is nexwire's lightweight Inertia-style helper for SPA visits and forms. One `useGum()` call gives you:

- **Visits** — axios requests plus Vue Router navigation, query updates, scroll preservation and remembered-state reset.
- **Forms** — a reactive form object with validation, field errors, upload progress, dirty tracking and success timing.
- **Shared lifecycle** — both layers use the same hooks, the same error normalizer and the same global processing counter.

Gum does not replace Pinia. The store still owns API data; Gum owns *navigation* and *submission* state.

## Imports

```ts
import { GumPlugin, clearRememberForPath, normalizeValidationErrors, useGum, useGumForm, useGumRemember } from "@/plugins/gum";
```

## Mental Model

| Layer              | Purpose                                                       | Owns                                              |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| `route.query`      | Reload-safe request state: page, size, search, filters        | URL                                               |
| Pinia store        | API data and shared application state                         | Data                                              |
| `useGum()`         | Visits, query navigation, scroll preservation, remember reset | Router + global processing                        |
| `useGum(defaults)` | The same visit API **plus** `gum.form`                        | Field errors, dirty tracking, per-form processing |
| `useGumRemember()` | Local UI state that should not live in the URL                | localStorage                                      |

## Initialization

```ts
// Visit only — no form state, no `gum.form`.
const gum = useGum();

// Visit + form — `gum.form` is available and typed.
const gum = useGum({ email: "", password: "" });
```

Two rules:

1. **`useGum()` without defaults has no `form`.** TypeScript enforces it: `form` is typed `undefined`, so `gum.form.data` is a type error.
2. **One call per form instance.** Two forms on one page = two `useGum(defaults)` calls. `processing` is shared globally; `form.processing` is not.

```ts
const login = useGum({ email: "", password: "" });
const signup = useGum({ name: "", email: "", password: "" });

login.form.processing.value; // independent
signup.form.processing.value; // independent
login.processing.value; // shared global counter
signup.processing.value; // same global ref
```

## Method Matrix

### Visits — URL-based (axios)

| Method       | Signature                        | Request body       | Navigates?                     |
| ------------ | -------------------------------- | ------------------ | ------------------------------ |
| `gum.get`    | `(url, options?)`                | —                  | Yes                            |
| `gum.post`   | `(url, data?, options?)`         | Yes                | No                             |
| `gum.put`    | `(url, data?, options?)`         | Yes                | No                             |
| `gum.patch`  | `(url, data?, options?)`         | Yes                | No                             |
| `gum.delete` | `(url, options?)`                | via `options.data` | No                             |
| `gum.reload` | `(options?)`                     | —                  | Yes — current route, `replace` |
| `gum.visit`  | `(url, options?)` or `(options)` | depends            | depends                        |

### Visits — fetcher-only (no URL)

| Method           | Signature   | Request body       | Navigates?                     |
| ---------------- | ----------- | ------------------ | ------------------------------ |
| `gum.getWith`    | `(options)` | —                  | Yes                            |
| `gum.postWith`   | `(options)` | via `options.data` | No                             |
| `gum.putWith`    | `(options)` | via `options.data` | No                             |
| `gum.patchWith`  | `(options)` | via `options.data` | No                             |
| `gum.deleteWith` | `(options)` | via `options.data` | No                             |
| `gum.reloadWith` | `(options)` | —                  | Yes — current route, `replace` |

All `*With` methods **require `fetcher`** at the type level.

### Forms — URL-based (axios)

| Method            | Signature                            | Navigates? |
| ----------------- | ------------------------------------ | ---------- |
| `gum.form.post`   | `(url, payload?, options?)`          | No         |
| `gum.form.put`    | `(url, payload?, options?)`          | No         |
| `gum.form.patch`  | `(url, payload?, options?)`          | No         |
| `gum.form.delete` | `(url, payload?, options?)`          | No         |
| `gum.form.submit` | `(method, url?, payload?, options?)` | No         |

### Forms — fetcher-only (no URL)

| Method                | Signature   | Navigates? |
| --------------------- | ----------- | ---------- |
| `gum.form.postWith`   | `(options)` | No         |
| `gum.form.putWith`    | `(options)` | No         |
| `gum.form.patchWith`  | `(options)` | No         |
| `gum.form.deleteWith` | `(options)` | No         |

`*With` requires `fetcher`. The payload is `form.data` after `transform` (or the explicit `payload` argument).

## Visit Options

Every visit method accepts the same options object:

| Option           | Type                                              | Default            | Meaning                                                        |
| ---------------- | ------------------------------------------------- | ------------------ | -------------------------------------------------------------- |
| `method`         | `"get" \| "post" \| "put" \| "patch" \| "delete"` | `"get"`            | HTTP verb (used directly by `visit()`)                         |
| `data`           | `object \| FormData`                              | —                  | Request body (ignored for GET)                                 |
| `query`          | `object`                                          | `route.query`      | Query-string params, always merged into the request params     |
| `routePath`      | `string`                                          | `route.path`       | Destination path when navigating                               |
| `replace`        | `boolean`                                         | `false`            | Use `router.replace` instead of `router.push`                  |
| `preserveState`  | `boolean`                                         | `method !== "get"` | When `false`, clears `useGumRemember` keys for the destination |
| `preserveScroll` | `boolean`                                         | `false`            | Restore `window.scrollY` after the call                        |
| `skipFetch`      | `boolean`                                         | `false`            | Skip the network call — navigate only                          |
| `fetcher`        | `(payload) => Promise<unknown>`                   | —                  | Delegate the network call (e.g. a store method)                |
| `onBefore`       | `() => boolean \| Promise<boolean>`               | —                  | Return `false` to cancel                                       |
| `onStart`        | `() => void \| Promise<void>`                     | —                  | Before the network call                                        |
| `onProgress`     | `(event: AxiosProgressEvent) => void`             | —                  | Raw upload-progress event                                      |
| `onSuccess`      | `(response: AxiosResponse) => void`               | —                  | After a successful response                                    |
| `onError`        | `(errors, error) => void`                         | —                  | If provided, the error is swallowed                            |
| `onFinish`       | `() => void \| Promise<void>`                     | —                  | Always runs, after processing stops                            |

## Form Options

Form methods accept `onBefore`, `onStart`, `onProgress`, `onSuccess`, `onError`, `onFinish`, `fetcher`, plus:

| Option      | Type                                                       | Meaning                                                                           |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `validate`  | `(data: T) => Record<string, string> \| null \| undefined` | Local validation before the network. Errors map to `form.errors`.                 |
| `transform` | `(data: T) => object \| FormData`                          | Reshape the payload before sending. Takes precedence over the `payload` argument. |
| `fetcher`   | `(payload) => Promise<unknown>`                            | Delegate the network call                                                         |

An empty `{}` from `validate` means "no errors" and the submit continues.

## Visits

### Basic REST calls

```ts
const gum = useGum();

// GET with query params
await gum.get("/api/users", { query: { page: 2 } });

// POST / PUT / PATCH with a body
await gum.post("/api/users", { name: "A" });
await gum.put("/api/users/1", { name: "B" });
await gum.patch("/api/users/1", { name: "B" });

// DELETE with a body (sent as the request body)
await gum.delete("/api/users/1", { data: { force: true } });
```

`gum.get()` also pushes the destination route. `post`, `put`, `patch` and `delete` never navigate.

### Navigate only, no request

```ts
await gum.get("/about", { skipFetch: true });
await gum.visit("/about", { skipFetch: true, replace: true });
```

### Replace instead of push

```ts
await gum.get("/login", { replace: true });
await gum.reload(); // current route, implicit replace
```

### Multi-parameter GET

```ts
await gum.get("/search", {
  query: { q: "vue", page: 3 },
  routePath: "/search/results",
  replace: true,
  preserveScroll: true
});
```

`routePath` controls the router destination; `query` controls both the axios params and the URL query.

### Preserve or reset remembered state

```ts
// Any GET defaults to preserveState: false — remember keys for the destination are cleared.
await gum.get("/dashboard");

// Keep remembered state.
await gum.get("/dashboard", { preserveState: true });
```

`preserveState` only affects `useGumRemember` keys registered for the destination route. Writes on `post`/`put`/`patch`/`delete` default to `true`.

### Navigate with a store call (fetcher)

```ts
const auth = useAuthStore();

await gum.getWith({
  fetcher: () => auth.me(),
  preserveScroll: true
});

await gum.postWith({
  fetcher: () => auth.logout(),
  onSuccess: () => router.push("/login")
});

await gum.reloadWith({ fetcher: () => api.me() });
```

The fetcher receives `{}` when there is no body, and `options.data` when there is one.

### Object form of `visit`

```ts
await gum.visit({
  fetcher: () => auth.me(),
  query: { tab: "profile" },
  routePath: "/profile",
  preserveScroll: true
});
```

The object form requires `fetcher` and forwards every visit option. The string form accepts a URL:

```ts
await gum.visit("/about", { skipFetch: true, replace: true });
```

### Cancel before the request

```ts
await gum.get("/admin", {
  onBefore: () => (auth.isAuthenticated ? true : (router.push("/login"), false))
});
// No request, no processing, no navigation.
```

### Swallow errors (opt-in)

```ts
await gum.get("/api/optional", {
  onError: () => {
    /* handled — no throw */
  }
});
```

Without `onError`, the error re-throws after `onFinish` so callers and error trackers can handle it.

### Listing + DataTable pattern

```ts
const route = useRoute();
const gum = useGum();

const queryParams = () => ({
  page: Number(route.query.page || 1),
  size: Number(route.query.size || 10),
  search: String(route.query.search || "")
});

// DataTable / Pagination call this, then the query watcher refetches the store.
gum.get("/api/posts", {
  query: queryParams(),
  routePath: route.path,
  preserveState: true,
  preserveScroll: true,
  skipFetch: true
});

watch(
  () => route.query,
  () => store.fetchPosts(queryParams()),
  { immediate: true }
);
```

The URL is the source of truth; the store fetches from `route.query`. `skipFetch: true` stops Gum from double-fetching.

## Forms

`gum.form` exists only when defaults are passed:

```ts
const gum = useGum({
  name: "",
  email: "",
  password: ""
});

const form = gum.form;
```

`form.data` and `form.errors` are reactive objects (no `.value`). The rest are refs/computed refs (`form.processing.value`, `form.isDirty.value`).

### Submit a URL-based form

```ts
await gum.form.post("/api/auth/register", undefined, {
  transform: (data) => ({
    name: data.name.trim(),
    email: data.email.trim(),
    password: data.password
  }),
  onSuccess: () => router.push("/")
});
```

Pass a second argument to override the payload entirely:

```ts
await gum.form.post("/api/tags", { name: "vue" });
```

### Submit through a store (fetcher)

```ts
const auth = useAuthStore();

await gum.form.postWith({
  fetcher: (body) => auth.register(body as RegisterPayload),
  transform: (data) => ({ email: data.email.trim(), password: data.password }),
  onSuccess: () => router.push("/")
});
```

Plain return values are wrapped automatically, so store methods that return `string`, `User` or `void` work without a wrapper (see [Fetcher Contract](#fetcher-contract)).

### Full lifecycle

```ts
await gum.form.post("/api/auth/register", undefined, {
  validate: (data) => (data.name ? null : { name: "Required" }),
  transform: (data) => ({ name: data.name.trim(), email: data.email.trim() }),
  onBefore: () => !gum.form.processing.value,
  onStart: () => console.log("start"),
  onProgress: (event) => console.log(event.loaded, event.total),
  onSuccess: () => router.push("/"),
  onError: (errors, error) => console.warn("field errors:", errors, error),
  onFinish: () => console.log("done")
});
```

### Validation and server errors

```ts
const result = await gum.form.post("/api/users", undefined, {
  validate: (data) => {
    const errors: Record<string, string> = {};
    if (!data.email) errors.email = "Email is required";
    if (data.password.length < 8) errors.password = "Too short";
    return errors;
  }
});

// Server validation is normalized into form.errors automatically.
form.errors.email; // string | undefined
```

When `validate` returns errors, no request is made. `form.errors` is populated and the promise resolves `undefined`.

### Read submission state

```ts
const processing = form.processing; // destructure refs for templates
const isDirty = form.isDirty;
const saved = form.recentlySuccessful;
```

```vue
<template>
  <button :disabled="processing" type="submit">Save</button>
  <p v-if="saved">Saved!</p>
  <span v-if="isDirty">Unsaved changes</span>
</template>
```

| State                     | Meaning                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `form.processing`         | `true` while this form is submitting                       |
| `form.wasSuccessful`      | `true` after the last success, until the next submit       |
| `form.recentlySuccessful` | `true` for `recentlySuccessfulDuration` ms after a success |
| `form.isDirty`            | `true` when `form.data` differs from the initial defaults  |
| `form.progress`           | `0..100` during an upload, otherwise `null`                |
| `gum.processing`          | `true` while **any** Gum request anywhere is running       |

### Manual field errors

```ts
form.setError("email", "Already taken");
form.clearErrors("email");
form.clearErrors(); // all fields
```

### Reset

```ts
form.reset(); // all fields to defaults + clear errors
form.reset("email"); // one field
```

### File upload with progress

```ts
const fd = new FormData();
fd.append("file", file);

await gum.form.post("/api/upload", undefined, {
  transform: () => fd,
  onProgress: (event) => console.log(event.loaded, event.total)
});

form.progress.value; // 0..100 or null
```

### Two forms on one page

```ts
const login = useGum({ email: "", password: "" });
const signup = useGum({ name: "", email: "", password: "" });

await login.form.postWith({ fetcher: (body) => auth.login(body as LoginPayload) });
await signup.form.postWith({ fetcher: (body) => auth.register(body as RegisterPayload) });
```

### Both URL and fetcher

```ts
await gum.form.post("/ignored", undefined, {
  fetcher: (body) => auth.register(body)
});
```

In development Gum warns that the URL is ignored. At runtime the fetcher always wins.

### Neither URL nor fetcher

```ts
await gum.form.post("", undefined, {});
// gum: submit requires either "url" or "fetcher". Pass a URL for axios, or a fetcher ...
```

### Mixed visit + form calls

```ts
const gum = useGum({ q: "" });

await Promise.all([
  gum.get("/api/counts"),
  gum.form.postWith({ fetcher: () => api.search(gum.form.data.q) })
]);
```

Both calls increment and decrement the same global counter, so `gum.processing` is only `false` when everything has finished.

## `useGumRemember`

Remembered UI state is persisted to `localStorage` and cleared automatically by a GET visit whose `preserveState` is `false`.

```ts
const ui = useGumRemember("filters", {
  selected: [] as number[],
  open: false
});

ui.value.selected; // script
```

```vue
<template>
  <input v-model="ui.open" type="checkbox" />
</template>
```

Keys are stored as `${rememberPrefix}:${key}` (`gum:` by default) and registered against the current route, so a visit can clear them.

## Plugin Install

```ts
// main.ts
import { GumPlugin } from "./plugins/gum";

app.use(GumPlugin, {
  rememberPrefix: "nx",
  recentlySuccessfulDuration: 3000
});
```

| Option                       | Default | Meaning                                           |
| ---------------------------- | ------- | ------------------------------------------------- |
| `rememberPrefix`             | `"gum"` | `localStorage` key prefix for `useGumRemember`    |
| `recentlySuccessfulDuration` | `2000`  | How long `recentlySuccessful` stays `true`, in ms |

## Lifecycle Order

Visits and forms share the same order:

```txt
onBefore → (validate? form only) → (transform? form only)
→ processing = true, trackStart
→ onStart
→ network (axios or fetcher)
→ onError (if it failed) | onSuccess (if it succeeded)
→ processing = false, trackEnd
→ onFinish
→ restoreScroll (visits only, when preserveScroll)
```

Scroll restoration runs after `onFinish` so `onFinish` can adjust layout first.

## Error Contract

Server errors are normalized into a flat `{ field: message }` shape. Two common formats are understood:

```ts
// Laravel / Rails style
{ errors: { email: ["taken"], password: "too short" } }

// Zod / class-validator style
{ error: { issues: [{ path: ["email"], message: "taken" }] } }
```

Both become `{ email: "taken", password: "too short" }`. Array values use the first element. `normalizeValidationErrors()` is exported if you need the same behavior elsewhere.

Throw policy:

| You passed `onError`? | Result                                                                          |
| --------------------- | ------------------------------------------------------------------------------- |
| No                    | The error re-throws **after** `onFinish`                                        |
| Yes                   | The error is swallowed; the promise resolves `undefined`; `onFinish` still runs |

## Fetcher Contract

A `fetcher` delegates the network call to your own function — usually a store method. It receives the post-transform, post-validation payload and may return **either**:

- an `AxiosResponse` (`{ data, status, headers, config, ... }`), or
- **any plain value** (`string`, `User`, `void`, …).

Plain values are wrapped into `{ data: <value>, status: 200, ... }` before `onSuccess` receives them. All of these work without wrappers:

```ts
// Returns an AxiosResponse
fetcher: (body) => axios.post("/api/auth/register", body)

// Returns a User
fetcher: (body) => auth.register(body as RegisterPayload)

// Returns a string message
fetcher: (body) => auth.forgotPassword(body as ForgotPayload)

// Returns void
fetcher: async () => {
  await auth.logout();
}
```

The `Fetcher` return type is intentionally `Promise<unknown>`; do not rely on the fetcher's return type being narrow. When a plain value is returned, `onSuccess(response)` receives `response.data` equal to that value.

An object is treated as an `AxiosResponse` only when it has a `data` property **and** a numeric `status`. Anything else is wrapped.

## Complete Example — URL-Based (the component owns the URL)

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useGum, useGumRemember } from "@/plugins/gum";
import { usePostsStore } from "@/stores/posts";
import DataTable from "@/components/datatable/index.vue";

const route = useRoute();
const gum = useGum({ title: "", body: "" });
const store = usePostsStore();
const { posts } = storeToRefs(store);

const ui = useGumRemember("posts.index.ui", {
  selected: [] as number[],
  formOpen: false
});

const search = computed(() => String(route.query.search || ""));
const searchText = ref(search.value);
const processing = gum.form.processing;
const isDirty = gum.form.isDirty;

function queryParams() {
  return {
    page: Number(route.query.page || 1),
    size: Number(route.query.size || 10),
    search: search.value
  };
}

function applySearch() {
  gum.get("/api/posts", {
    query: { ...queryParams(), page: 1, search: searchText.value },
    routePath: route.path,
    preserveState: true,
    preserveScroll: true,
    skipFetch: true
  });
}

function openCreate() {
  gum.form.reset();
  ui.value.formOpen = true;
}

async function submit() {
  await gum.form.post("/api/posts", undefined, {
    validate: (data) => (data.title.trim() ? null : { title: "Title is required" }),
    onSuccess: async () => {
      ui.value.formOpen = false;
      await store.fetchPosts(queryParams());
    }
  });
}

function destroy(id: number) {
  void gum.delete(`/api/posts/${id}`, {
    onBefore: () => window.confirm("Delete this post?"),
    preserveScroll: true,
    onSuccess: async () => {
      await store.fetchPosts(queryParams());
    }
  });
}

watch(
  () => route.query,
  () => store.fetchPosts(queryParams()),
  { immediate: true }
);
</script>

<template>
  <div>
    <GlobalSpinner v-if="gum.processing.value" />

    <input v-model="searchText" placeholder="Search" @keyup.enter="applySearch" />
    <button type="button" @click="openCreate">New post</button>

    <DataTable :data="posts" :search="search" :option="[10, 25, 50]" :searchable="false">
      <template #thead>
        <th>Title</th>
        <th />
      </template>
      <template #tbody="{ td }">
        <td>{{ td.title }}</td>
        <td><button type="button" @click="destroy(td.id)">Delete</button></td>
      </template>
    </DataTable>

    <form v-if="ui.formOpen" @submit.prevent="submit">
      <input v-model="gum.form.data.title" />
      <p v-if="gum.form.errors.title">{{ gum.form.errors.title }}</p>

      <textarea v-model="gum.form.data.body" />

      <button :disabled="processing" type="submit">Save</button>
      <button type="button" @click="gum.form.reset()">Reset</button>
      <p v-if="isDirty">Unsaved changes</p>
      <p v-if="gum.form.recentlySuccessful.value">Saved!</p>
    </form>
  </div>
</template>
```

## Complete Example — Store-Owned (the fetcher owns the call)

The previous example lets the page own the URL and the store fetch from `route.query`. The alternative is to let the **store own the endpoint** and hand Gum a `fetcher`. Every mutation becomes a store method call; no URL is duplicated in the component.

```ts
// stores/posts.ts — the contract this page assumes
import axios from "axios";
import { defineStore } from "pinia";
import { ref } from "vue";

export type PostQuery = { page: number; size: number; search: string };
export type PostPayload = { title: string; body: string };

export const usePostsStore = defineStore("posts", () => {
  const posts = ref({
    data: [],
    current_page: 1,
    last_page: 1,
    per_page: 10,
    total: 0,
    path: "/api/posts"
  });

  async function list(params: PostQuery) {
    const res = await axios.get("/api/posts", { params });
    posts.value = res.data;
    return res; // AxiosResponse
  }

  async function create(payload: PostPayload) {
    return await axios.post("/api/posts", payload);
  }

  async function remove(id: number) {
    return await axios.delete(`/api/posts/${id}`, { data: { force: true } });
  }

  return { posts, list, create, remove };
});
```

The page uses `*With` for submit and delete, and keeps the built-in `DataTable` pagination working by letting the route watcher call `store.list`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useGum, useGumRemember } from "@/plugins/gum";
import { usePostsStore, type PostPayload } from "@/stores/posts";
import DataTable from "@/components/datatable/index.vue";

const route = useRoute();
const gum = useGum({ title: "", body: "" });
const store = usePostsStore();
const { posts } = storeToRefs(store);

const ui = useGumRemember("posts.index.ui", {
  selected: [] as number[],
  formOpen: false
});

const search = computed(() => String(route.query.search || ""));
const searchText = ref(search.value);
const processing = gum.form.processing;
const isDirty = gum.form.isDirty;

function queryParams() {
  return {
    page: Number(route.query.page || 1),
    size: Number(route.query.size || 10),
    search: search.value
  };
}

// Navigation is still URL-based: DataTable/Pagination only change the URL,
// then the watcher asks the store to fetch. The store owns the endpoint.
function applySearch() {
  gum.get("/api/posts", {
    query: { ...queryParams(), page: 1, search: searchText.value },
    routePath: route.path,
    preserveState: true,
    preserveScroll: true,
    skipFetch: true
  });
}

function openCreate() {
  gum.form.reset();
  ui.value.formOpen = true;
}

// Mutation goes straight through the store — no URL in the component.
async function submit() {
  await gum.form.postWith({
    fetcher: (body) => store.create(body as PostPayload),
    validate: (data) => (data.title.trim() ? null : { title: "Title is required" }),
    onSuccess: async () => {
      ui.value.formOpen = false;
      await store.list(queryParams());
    }
  });
}

function destroy(id: number) {
  void gum.deleteWith({
    fetcher: () => store.remove(id),
    onBefore: () => window.confirm("Delete this post?"),
    preserveScroll: true,
    onSuccess: async () => {
      await store.list(queryParams());
    }
  });
}

watch(
  () => route.query,
  () => store.list(queryParams()),
  { immediate: true }
);
</script>
```

The template is identical to the URL-based example.

### Fully fetcher-driven listing

If a page has its **own** pagination controls (instead of the built-in `DataTable` footer), the GET can also go through the store and the `route.query` watcher can be dropped:

```ts
import { onMounted } from "vue";

function applySearch() {
  const q = { ...queryParams(), page: 1, search: searchText.value };
  gum.getWith({
    fetcher: () => store.list(q),
    query: q,
    routePath: route.path,
    preserveState: true,
    preserveScroll: true
  });
}

function goToPage(page: number) {
  const q = { ...queryParams(), page };
  gum.getWith({
    fetcher: () => store.list(q), // the fetcher IS the fetch
    query: q, // same object, so URL matches data
    routePath: route.path,
    preserveState: true,
    preserveScroll: true
  });
}

// Initial load only. No watcher: the fetcher already fetched,
// so a watcher would double-fetch after each navigation.
onMounted(() => store.list(queryParams()));
```

Two rules for this version:

1. **`query` and the fetcher params are separate.** Gum uses `query` to build the router URL; the fetcher uses its own arguments for the store call. Pass the same object to both or the URL will not match the data.
2. **Gum runs the fetcher before `router.push`.** A fetcher that reads `route.query` sees the old values. Pass the params explicitly.

Do **not** combine `getWith` navigation with `watch(route.query)` — both fetch, so each navigation fires two requests.

### Built-in `DataTable` caveat

The template's `DataTable`, `Pagination` and `SelectOption` components navigate with `gum.get(..., { skipFetch: true })` — they change the URL and rely on the page watcher to fetch. The backend `paginate()` helper only shapes the response (`path`, `current_page`, `last_page`, `per_page`, `total`); it does not trigger a fetch, so it does not remove the need for the watcher. If you use them:

- Keep `watch(route.query)` → `store.list(...)` for the listing (store-owned mutations are still fine).
- Do **not** drop the watcher and use `getWith`, or pagination/search clicks will only update the URL and never fetch.
- Do **not** keep the watcher **and** use `getWith` for navigation, or every click fetches twice.

| Concern                       | URL-based                                     | Store-owned (`*With`)                                       |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Who knows the URL             | Component                                     | Store                                                       |
| GET/listing                   | `gum.get(url, { skipFetch: true })` + watcher | `gum.getWith({ fetcher })` + no watcher (custom pagination) |
| Submit                        | `gum.form.post(url, ...)`                     | `gum.form.postWith({ fetcher })`                            |
| Delete                        | `gum.delete(url, ...)`                        | `gum.deleteWith({ fetcher })`                               |
| Refresh after mutation        | Required in `onSuccess`                       | Optional — only if the store does not update itself         |
| Works with built-in DataTable | Yes                                           | Yes, but keep the watcher for listing                       |

Never mix both styles for the same call on one page — one path through the store and one bypassing it will leave the store state out of sync with the URL.

## Migration from `useGumForm`

`useGumForm` still works and is now a thin alias:

```ts
// Before
import { useGumForm } from "@/plugins/gum";
const form = useGumForm({ email: "", password: "" });

// After (recommended)
import { useGum } from "@/plugins/gum";
const gum = useGum({ email: "", password: "" });
const form = gum.form;
```

`useGumForm(defaults)` is deprecated but returns the same form object. Existing pages need no changes.

## Rules of Thumb

| Situation                                   | Use                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Listing page with pagination/search/filters | `gum.get(..., { query, routePath, skipFetch: true })` + store watcher |
| Dashboard navigation                        | `gum.get("/dashboard")`                                               |
| Login redirect                              | `gum.get("/login", { replace: true })`                                |
| Store owns the endpoint                     | `*With({ fetcher })`                                                  |
| Plain REST endpoint                         | URL-based `gum.*` / `gum.form.*`                                      |
| Form submission                             | `useGum(defaults)` + `gum.form.*`                                     |
| Navigate without a request                  | `{ skipFetch: true }`                                                 |
| Keep scroll position                        | `{ preserveScroll: true }`                                            |
| Preserve remembered UI state on navigation  | `{ preserveState: true }`                                             |
| Global spinner                              | `gum.processing`                                                      |
| Button spinner                              | `gum.form.processing`                                                 |
| "Saved" toast                               | `gum.form.recentlySuccessful`                                         |
| Upload bar                                  | `gum.form.progress` + `onProgress`                                    |
| Local validation                            | `validate` option                                                     |
| Reshape before send                         | `transform` option                                                    |
| Cancel from the UI                          | `onBefore: () => confirm(...)`                                        |
| Handle errors locally                       | pass `onError`                                                        |
| Let errors bubble                           | omit `onError`                                                        |
