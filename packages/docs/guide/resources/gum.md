# Gum

Gum is nexwire's lightweight Inertia-style UI helper. It combines axios requests, Vue Router query updates, scroll preservation, form lifecycle state, and remembered UI state.

Use Gum when a page needs SPA-style visits without replacing the Pinia store pattern.

## Imports

```ts
import { useGum, useGumForm, useGumRemember } from "@/plugins/gum";
```

The composable re-exports the plugin from `src/resources/src/plugins/gum.ts`.

## Mental Model

Use each layer for one job:

| Layer              | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `route.query`      | Reload-safe request state: page, size, search, filters |
| Pinia store        | API data and shared application state                  |
| `useGum()`         | Visit lifecycle, query navigation, scroll preservation |
| `useGumForm()`     | Form submission, errors, processing, upload progress   |
| `useGumRemember()` | Local UI state that should not be in the URL           |

The common flow for listings is:

```txt
DataTable/Pagination -> gum.get(apiUrl, { routePath, query })
Vue Router query changes -> page watcher calls store.fetch...
Pinia store updates -> UI re-renders
```

## `useGum()`

```ts
const gum = useGum();
```

Returned helpers:

| Helper                      | Purpose                                       |
| --------------------------- | --------------------------------------------- |
| `processing`                | `ref<boolean>` while a Gum request is running |
| `visit(url, options)`       | Core request method                           |
| `get(url, options)`         | GET request and route query visit             |
| `post(url, data, options)`  | POST request                                  |
| `put(url, data, options)`   | PUT request                                   |
| `patch(url, data, options)` | PATCH request                                 |
| `delete(url, options)`      | DELETE request                                |
| `reload(options)`           | GET current route with current query          |

Options:

| Option           | Type                                                | Default                               | Purpose                                                                                                                                                        |
| ---------------- | --------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`         | `get \| post \| put \| patch \| delete`             | `get`                                 | HTTP method for `visit()`                                                                                                                                      |
| `data`           | `object \| FormData`                                | —                                     | Request body for non-GET requests                                                                                                                              |
| `query`          | `object`                                            | —                                     | Query params sent to the API and written to the UI URL for GET requests                                                                                        |
| `routePath`      | `string`                                            | current route path                    | UI route path to update after a GET request                                                                                                                    |
| `replace`        | `boolean`                                           | `false`                               | Use `router.replace()` instead of `router.push()`                                                                                                              |
| `preserveState`  | `boolean`                                           | `false` for GET, `true` for mutations | Keep `useGumRemember()` state                                                                                                                                  |
| `preserveScroll` | `boolean`                                           | `false`                               | Restore scroll after request and router update                                                                                                                 |
| `skipFetch`      | `boolean`                                           | `false`                               | Skip the API call — only navigate and preserve scroll/state. Used by datatable components (page watcher handles the data fetch)                                |
| `onBefore`       | `() => boolean \| void \| Promise<boolean \| void>` | —                                     | Return `false` to cancel                                                                                                                                       |
| `onStart`        | `() => void \| Promise<void>`                       | —                                     | Runs before request                                                                                                                                            |
| `onProgress`     | `(event: AxiosProgressEvent) => void`               | —                                     | Upload progress callback (`useGum` and `useGumForm`; forms also track `form.progress`)                                                                         |
| `onSuccess`      | `(response) => void \| Promise<void>`               | —                                     | Runs on successful response                                                                                                                                    |
| `onError`        | `(errors, error) => void \| Promise<void>`          | —                                     | Runs on failed response with normalized validation errors and the raw Axios error. Error is **not** rethrown when `onError` is provided — no try/catch needed. |
| `onFinish`       | `() => void \| Promise<void>`                       | —                                     | Always runs after request                                                                                                                                      |

## GET Visits

Use `gum.get()` for pagination, search, and filters.

```ts
await gum.get("/api/posts", {
  routePath: "/posts",
  query: {
    page: 2,
    size: 10,
    search: "vue",
  },
  preserveState: true,
  preserveScroll: true,
});
```

The first argument is the API endpoint. `routePath` is the Vue UI route that should receive the query string.

```txt
API request:  GET /api/posts?page=2&size=10&search=vue
Browser URL:  /posts?page=2&size=10&search=vue
```

This matters when the API path and UI route are not the same.

## Listing Page Pattern

For reload-safe pagination and search, the page must read from `route.query`.

```vue
<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { usePostsStore } from "@/stores/posts";
import DataTable from "@/components/datatable/index.vue";

const route = useRoute();
const store = usePostsStore();
const { posts } = storeToRefs(store);

const search = computed(() => String(route.query.search || ""));

function queryParams() {
  return {
    page: Number(route.query.page || 1),
    size: Number(route.query.size || 10),
    search: String(route.query.search || ""),
  };
}

watch(
  () => route.query,
  async () => {
    await store.fetchPosts(queryParams());
  },
  { immediate: true },
);
</script>

<template>
  <DataTable :data="posts" :search="search" :option="[10, 25, 50]">
    <template #thead>
      <th>Title</th>
      <th>Status</th>
    </template>

    <template #tbody="{ td }">
      <td>{{ td.title }}</td>
      <td>{{ td.status }}</td>
    </template>
  </DataTable>
</template>
```

The store stays responsible for data fetching:

```ts
import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";

export const usePostsStore = defineStore("posts", () => {
  const posts = ref({
    data: [],
    current_page: 1,
    last_page: 1,
    per_page: 10,
    total: 0,
    path: "/api/posts",
  });

  async function fetchPosts(params: {
    page?: number;
    size?: number;
    search?: string;
  }) {
    const response = await axios.get("/api/posts", { params });
    posts.value = response.data.data;
    return posts.value;
  }

  return { posts, fetchPosts };
});
```

## DataTable Integration

The built-in datatable already calls Gum for search, page changes, and page-size changes.

It expects the paginated object to include `path`, which is the API endpoint:

```ts
{
  data: [],
  current_page: 1,
  last_page: 1,
  per_page: 10,
  total: 0,
  path: "/api/posts"
}
```

Internally, datatable actions use this pattern:

```ts
gum.get(props.data.path, {
  routePath: route.path,
  query: {
    page,
    size,
    search,
  },
  preserveState: true,
  preserveScroll: true,
  skipFetch: true,
});
```

`skipFetch: true` tells Gum to **skip the API call** and only navigate (update URL, preserve scroll, preserve state). The page's `route.query` watcher handles the single data fetch via the Pinia store — no duplicate requests.

### Props

| Prop         | Type                      | Default | Notes                                                                                  |
| ------------ | ------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `data`       | `object`                  | —       | Paginated object with `data`, `current_page`, `last_page`, `per_page`, `total`, `path` |
| `search`     | `string`                  | `""`    | Initial search text synced to internal state                                           |
| `option`     | `Array<string \| number>` | `[]`    | Page size options (e.g., `[10, 25, 50]`)                                               |
| `removable`  | `boolean`                 | `true`  | Show checkbox column and delete button                                                 |
| `countable`  | `boolean`                 | `true`  | Show row number column                                                                 |
| `searchable` | `boolean`                 | `true`  | Show search input                                                                      |
| `optionable` | `boolean`                 | `true`  | Show page size selector                                                                |

### Events

| Event    | Payload                   | Description                                             |
| -------- | ------------------------- | ------------------------------------------------------- |
| `remove` | `Array<string \| number>` | Array of selected row IDs when delete button is clicked |

## Search

Search should reset to page 1.

```ts
await gum.get("/api/posts", {
  routePath: "/posts",
  query: {
    page: 1,
    size: route.query.size || 10,
    search: searchText,
  },
  preserveState: true,
  preserveScroll: true,
});
```

## Pagination

Pagination keeps the current search and size.

```ts
await gum.get("/api/posts", {
  routePath: "/posts",
  query: {
    page: nextPage,
    size: route.query.size || 10,
    search: route.query.search || "",
  },
  preserveState: true,
  preserveScroll: true,
});
```

## Page Size

Changing page size usually keeps the current page or resets to page 1. Reset to page 1 if the new size can make the old page invalid.

```ts
await gum.get("/api/posts", {
  routePath: "/posts",
  query: {
    page: 1,
    size: 25,
    search: route.query.search || "",
  },
  preserveState: true,
  preserveScroll: true,
});
```

## Mutations

Use `post`, `put`, `patch`, and `delete` for mutations. These do not change the UI route by default.

```ts
await gum.post("/api/posts", payload, {
  preserveScroll: true,
  preserveState: true,
  onSuccess: async () => {
    await store.fetchPosts(queryParams());
  },
});
```

Update:

```ts
await gum.put(`/api/posts/${id}`, payload, {
  preserveScroll: true,
  preserveState: true,
  onSuccess: async () => {
    await store.fetchPosts(queryParams());
  },
});
```

Delete:

```ts
await gum.delete(`/api/posts/${id}`, {
  preserveScroll: true,
  preserveState: true,
  onSuccess: async () => {
    await store.fetchPosts(queryParams());
  },
});
```

Use this when Pinia owns the list data.

### Mutation Errors

`useGum()` normalizes common backend validation shapes before calling `onError`.

When `onError` is provided, the error is considered handled and does **not** rethrow — no try/catch wrapper needed. If `onError` is omitted, the error throws as normal for external handling.

It supports common field-error responses:

```json
{
  "errors": {
    "name": ["Name is required"]
  }
}
```

And Zod/Hono issue errors:

```json
{
  "error": {
    "issues": [{ "path": ["name"], "message": "Name is required" }]
  }
}
```

Both become the first `onError` argument:

```ts
await gum.post("/api/posts", payload, {
  onError: (errors, error) => {
    const er: Record<string, string> = {};
    Object.keys(errors).map((key) => (er[key] = errors[key].toString()));

    console.log(er.name);
    console.error(error);
  },
});
```

Nested issue paths are joined with dots:

```txt
["user", "email"] -> "user.email"
["items", 0, "name"] -> "items.0.name"
```

## Reload Current Query

Use `reload()` when you want to re-run the current GET visit with the current route query.

```ts
await gum.reload({
  preserveScroll: true,
  preserveState: true,
  onSuccess: (response) => {
    // Optional: write response data into local state or a store.
  },
});
```

In Pinia-based pages, explicit store refetching is often clearer:

```ts
await store.fetchPosts(queryParams());
```

## Forms

Use `useGumForm()` when a form needs processing state, validation errors, dirty detection, and upload progress.

```vue
<script setup lang="ts">
import { useGumForm } from "@/plugins/gum";

const form = useGumForm({
  title: "",
  body: "",
});

async function submit() {
  await form.post("/api/posts", undefined, {
    onSuccess: () => form.reset(),
  });
}
</script>

<template>
  <form @submit.prevent="submit">
    <Input v-model="form.data.title" label="Title" :err="form.errors.title" />
    <TextArea v-model="form.data.body" label="Body" :err="form.errors.body" />
    <Button type="submit" label="Save" :loading="form.processing" />
  </form>
</template>
```

Form submission accepts the same lifecycle hooks as visits — `onBefore`, `onStart`, `onProgress`, `onSuccess`, `onError`, `onFinish`:

| Option       | Type                                                                     | Purpose                                                          |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `onBefore`   | `() => boolean \| void \| Promise<boolean \| void>`                       | Return `false` to cancel                                         |
| `onStart`    | `() => void \| Promise<void>`                                            | Runs before the request                                          |
| `onProgress` | `(event: AxiosProgressEvent) => void \| Promise<void>`                    | Upload progress callback; `form.progress` is updated internally   |
| `onSuccess`  | `(response: AxiosResponse) => void \| Promise<void>`                      | Runs on the full **AxiosResponse** — use `e.data` / `e.status`   |
| `onError`    | `(errors, error) => void \| Promise<void>`                               | Runs on failed response with normalized errors; not rethrown      |
| `onFinish`   | `() => void \| Promise<void>`                                            | Always runs after the request                                    |

```ts
async function submit() {
  await form.post("/api/posts", undefined, {
    onSuccess: (e) => {
      // e is the full AxiosResponse: e.data, e.status, e.headers
      form.reset();
    },
  });
}
```

When the request payload differs from the form's data shape, pass it explicitly as the second argument:

```ts
await form.post(
  "/api/auth/login",
  {
    email: form.data.email.trim(),
    password: form.data.password,
  },
  {
    onSuccess: async () => {
      // handle success
    },
    onError: (errors, error) => {
      // handle error — no try/catch needed
    },
  },
);
```

Form helpers:

| Helper                          | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `form.data`                     | Reactive form data                             |
| `form.errors`                   | Server or manual validation errors             |
| `form.processing`               | Submission state                               |
| `form.progress`                 | Upload progress percentage                     |
| `form.wasSuccessful`            | True after success                             |
| `form.recentlySuccessful`       | True briefly after success                     |
| `form.isDirty`                  | True when values changed from initial defaults |
| `form.setError(field, message)` | Set a manual error                             |
| `form.clearErrors(...fields)`   | Clear all or selected errors                   |
| `form.reset(...fields)`         | Reset all or selected fields                   |

### Form Errors

`useGumForm()` also normalizes both backend validation shapes before calling `onError`.

Same behavior as `useGum()` — when `onError` is provided, the error does **not** rethrow, so no try/catch is needed around the submit call.

You can either bind directly to `form.errors`:

```vue
<Input v-model="form.data.name" label="Name" :err="form.errors.name" />
```

Or use `onError(errors)` to copy errors into your own local error object:

```ts
const err = reactive({ name: "" });

await form.post("/api/posts", payload, {
  onError: (errors) => {
    const er: Record<string, string> = {};
    Object.keys(errors).map((key) => (er[key] = errors[key].toString()));
    err.name = er.name;
  },
});
```

The second `onError` argument is the raw Axios error:

```ts
onError: (errors, error) => {
  console.log(errors);
  console.error(error);
};
```

## File Uploads

`useGumForm()` tracks upload progress automatically via `form.progress`. Bind it to a progress bar or percentage display.

```ts
const form = useGumForm({ file: null as File | null });

async function upload() {
  const body = new FormData();
  if (form.data.file) body.append("file", form.data.file);

  await form.post("/api/uploads", body, {
    onSuccess: () => {
      console.log("Upload complete");
    },
  });
}
```

In the template, bind `form.progress` (a number 0-100 or `null`) to a progress indicator:

```vue
<progress v-if="form.progress !== null" :value="form.progress" max="100" />
```

## Remembered State

Use `useGumRemember()` for local UI state that should survive navigation but should not be part of the URL.

```ts
const state = useGumRemember("posts.index", {
  selected: [] as number[],
  activeTab: "published",
  formOpen: false,
});
```

Good remembered state:

- selected checkboxes
- active tab
- collapsed panels
- draft UI values
- open modal flags

Do not remember request state that should be shareable or reload-safe. Put these in `route.query` instead:

- page
- size
- search
- filters

## Preserve Scroll

Set `preserveScroll: true` for table actions and mutations that should not jump the page to the top.

```ts
await gum.get("/api/posts", {
  routePath: "/posts",
  query: { page: 2 },
  preserveScroll: true,
});
```

Gum restores scroll after Vue and Vue Router finish updating the page.

## `onBefore` Confirmation

```ts
await gum.delete(`/api/posts/${id}`, {
  onBefore: () => window.confirm("Delete this post?"),
  preserveScroll: true,
  onSuccess: async () => {
    await store.fetchPosts(queryParams());
  },
});
```

Returning `false` from `onBefore` cancels the request.

## Complete Example

```vue
<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useGum, useGumForm, useGumRemember } from "@/plugins/gum";
import { usePostsStore } from "@/stores/posts";
import DataTable from "@/components/datatable/index.vue";

const route = useRoute();
const gum = useGum();
const store = usePostsStore();
const { posts } = storeToRefs(store);

const ui = useGumRemember("posts.index.ui", {
  selected: [] as number[],
  formOpen: false,
});

const form = useGumForm({ title: "", body: "" });
const search = computed(() => String(route.query.search || ""));

function queryParams() {
  return {
    page: Number(route.query.page || 1),
    size: Number(route.query.size || 10),
    search: String(route.query.search || ""),
  };
}

watch(
  () => route.query,
  async () => {
    await store.fetchPosts(queryParams());
  },
  { immediate: true },
);

async function save() {
  await form.post("/api/posts", undefined, {
    preserveScroll: true,
    preserveState: true,
    onSuccess: async () => {
      form.reset();
      ui.value.formOpen = false;
      await store.fetchPosts(queryParams());
    },
  });
}

async function remove(ids: number[]) {
  await gum.delete(`/api/posts/${ids[0]}`, {
    preserveScroll: true,
    preserveState: true,
    onSuccess: async () => {
      ui.value.selected = [];
      await store.fetchPosts(queryParams());
    },
  });
}
</script>

<template>
  <form v-if="ui.formOpen" @submit.prevent="save">
    <Input v-model="form.data.title" label="Title" :err="form.errors.title" />
    <TextArea v-model="form.data.body" label="Body" :err="form.errors.body" />
    <Button type="submit" label="Save" :loading="form.processing" />
  </form>

  <DataTable
    :data="posts"
    :search="search"
    :option="[10, 25, 50]"
    @remove="remove">
    <template #thead>
      <th>Title</th>
      <th>Status</th>
    </template>

    <template #tbody="{ td }">
      <td>{{ td.title }}</td>
      <td>{{ td.status }}</td>
    </template>
  </DataTable>
</template>
```

## Rules Of Thumb

- Use `gum.get()` for list navigation: page, search, filters.
- Use `route.query` as the source of truth for reload-safe request state.
- Use Pinia stores for API data.
- Use `useGumForm()` for create/update forms.
- Use `useGumRemember()` only for local UI state.
- Use `preserveScroll: true` for table actions and inline mutations.
- After mutations, refetch the current query or call `gum.reload()`.
