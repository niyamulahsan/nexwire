# Components

The framework ships a library of reusable Vue components under `src/resources/src/components/`.

## Component list

| Component             | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| `Button`              | Styled button with label/icon/slot                                             |
| `Input`               | Text input with label, formatting categories, maxlength counter, error display |
| `InputPasswordToggle` | Password input with show/hide toggle                                           |
| `InputGroup`          | Two-part input (editable + readonly)                                           |
| `Select`              | Searchable select with infinite-scroll, pagination, and API fetching           |
| `TextArea`            | Textarea with floating label & maxlength counter                               |
| `Checkbox`            | Checkbox with v-model                                                          |
| `Switch`              | Toggle switch                                                                  |
| `Modal`               | Bootstrap modal via teleport into `#modal-show`                                |
| `Toast`               | Bootstrap toast via teleport                                                   |
| `Spinner`             | Loading spinner                                                                |
| `Datepicker`          | Date/datetime/month/year picker                                                |
| `DataTable`           | Full data table with search, pagination, bulk delete, and skeleton loading     |
| `DataTableSkeleton`   | Skeleton placeholder shown while data loads                                    |
| `Pagebar`             | Teleports title into the header's page title area                              |
| `Refresh`             | Binds a click handler to the header's refresh button                           |
| `Href`                | Styled anchor link                                                             |
| `FloatButton`         | Positioned fixed action button                                                 |
| `FeatureButton`       | Header action button (injected via `featureButtons`)                           |

---

## DataTable

A fully-featured data table with server-side pagination, search, bulk delete, and configurable page size. Works with any paginated API response via the `PaginatedData` interface.

**Import:**

```vue
<script setup lang="ts">
import DataTable from "@/components/datatable/index.vue";
import DataTableSkeleton from "@/components/datatable/DataTableSkeleton.vue";
</script>
```

### Props

| Prop         | Type                   | Default  | Description                                                                            |
| ------------ | ---------------------- | -------- | -------------------------------------------------------------------------------------- |
| `data`       | `PaginatedData`        | required | Server response — must have `{ data, current_page, last_page, per_page, total, path }` |
| `search`     | `string`               | `""`     | Initial search query (typically from `route.query.search`)                             |
| `loop`       | `DataRow[] \| false`   | —        | Override rows (useful for local data). Falls back to `data.data`                       |
| `option`     | `(string \| number)[]` | `[]`     | Per-page size options for the "Show X entries" dropdown                                |
| `removable`  | `boolean`              | `true`   | Show checkboxes and trash button for bulk delete                                       |
| `countable`  | `boolean`              | `true`   | Show row number column                                                                 |
| `searchable` | `boolean`              | `true`   | Show search input in header                                                            |
| `optionable` | `boolean`              | `true`   | Show "Show X entries" dropdown                                                         |
| `disabled`   | `boolean`              | `false`  | Disable all interactive elements                                                       |

### Slots

| Slot          | Bindings          | Description                                                          |
| ------------- | ----------------- | -------------------------------------------------------------------- |
| `extra-tools` | —                 | Additional buttons/controls in the card header (right side)          |
| `extra`       | —                 | Content inserted before the table (inside card body)                 |
| `customhead`  | —                 | Replace the entire `<thead>` (hides default thead)                   |
| `thead`       | —                 | Extra `<th>` columns appended after checkbox + `#` columns           |
| `custombody`  | —                 | Replace the entire `<tbody>` (hides default tbody)                   |
| `tbody`       | `{ td: DataRow }` | Per-row `<td>` columns. Use `<slot name="tbody" :td="dt">` in parent |

### Events

| Event    | Payload                | Description                                                     |
| -------- | ---------------------- | --------------------------------------------------------------- |
| `remove` | `(string \| number)[]` | Emitted when the trash button is clicked, with selected row IDs |

### `PaginatedData` interface

```ts
interface PaginatedData {
  data: DataRow[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  path: string;
}
```

### Usage with server-side pagination

The standard pattern: fetch data in a store via `useGum().get()`, pass the paginated response to DataTable, and handle search/page/size changes via the store.

```vue
<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import DataTable from "@/components/datatable/index.vue";
import { usePostsStore } from "@/stores/posts";

const route = useRoute();
const store = usePostsStore();
const { posts } = storeToRefs(store);

const search = computed(() => String(route.query.search || ""));

watch(
  () => route.query,
  async () => {
    await store.fetchPosts({
      page: Number(route.query.page || 1),
      size: Number(route.query.size || 10),
      search: String(route.query.search || ""),
    });
  },
  { immediate: true },
);
</script>

<template>
  <DataTableSkeleton row="5" col="4" v-if="empty(posts)" />
  <DataTable
    v-else
    :data="posts"
    :search="search"
    :option="[10, 25, 50, 100]"
    :removable="true"
    @remove="(ids) => console.log('Delete', ids)">
    <template #thead>
      <th>Title</th>
      <th>Author</th>
      <th>Created</th>
    </template>
    <template #tbody="{ td }">
      <td>{{ td.title }}</td>
      <td>{{ td.author }}</td>
      <td>{{ td.created_at }}</td>
    </template>
  </DataTable>
</template>
```

### Real-world example — simple CRUD table

A compact table showing user info with edit/delete actions, inline status toggle, and view modal:

```vue
<template>
  <Modal ref="viewModal" id="user" title="User Info" size="md">
    <template #modalbody>
      <UserView :user="props.userpopup" />
    </template>
    <template #modalfooter>
      <Button
        type="button"
        label="Close"
        icon="bi bi-x-circle"
        class="btn btn-secondary"
        data-bs-dismiss="modal" />
    </template>
  </Modal>

  <DataTableSkeleton row="5" col="4" v-if="empty(props.data)" />
  <DataTable
    :data="props.data"
    :search="props.search"
    :option="[5, 10, 15]"
    @remove="props.del"
    :removable="hasRole('supreme', 'superadmin')"
    v-else>
    <template #thead>
      <th class="col-12">User</th>
      <th class="text-center">Action</th>
    </template>
    <template #tbody="{ td }">
      <td :class="Number(td?.status) ? '' : 'text-muted'">
        <p class="m-0" title="name & commissionerate">
          <i class="bi bi-person-bounding-box"></i> :
          {{ td?.name }}
          {{
            hasRole("superadmin") && td.commissionerate
              ? `(${td?.commissionerate?.name})`
              : ""
          }}
        </p>
        <p class="m-0" title="role">
          <i class="bi bi-person-badge"></i> : {{ td?.role?.name }}
        </p>
        <p class="m-0" title="email">
          <i class="bi bi-person-vcard"></i> : {{ td?.email }}
        </p>
        <p class="m-0" title="number">
          <i class="bi bi-telephone"></i> : {{ td?.mobile }}
        </p>
      </td>
      <td class="text-center">
        <div :class="{ 'd-none': hasRole('admin') }">
          <Switch
            text="Alive"
            blank="Dead"
            :checked="Number(td.status)"
            @change="props.statusUpdate(td.id, td.status)"
            vertical />
        </div>
        <div
          class="btn-group mx-auto"
          :class="{ 'flex-column': hasRole('admin') }">
          <Button
            type="button"
            title="view"
            class="btn btn-outline-secondary rounded"
            icon="bi bi-eye"
            data-bs-toggle="modal"
            data-bs-target="#user"
            @click="props.view(td.id)" />
          <Button
            type="button"
            class="btn btn-outline-dark rounded"
            title="edit"
            icon="bi bi-pencil-square"
            @click="props.edit(td.id)"
            :disabled="hasRole('admin') && td.status == '0'" />
        </div>
      </td>
    </template>
  </DataTable>
</template>
```

### Multi-column table

Multiple columns with nested object access:

```vue
<template>
  <DataTableSkeleton row="5" col="4" v-if="empty(props.data)" />
  <DataTable
    v-else
    :data="props.data"
    :search="props.search"
    :option="[5, 10, 15]"
    :removable="hasRole('superadmin', 'admin')"
    @remove="props.del">
    <template #thead>
      <th class="col-3">Commissionerate</th>
      <th class="col-3">Division</th>
      <th class="col-3">Circle</th>
      <th class="col-3">Sector</th>
      <th class="text-center">Action</th>
    </template>
    <template #tbody="{ td }">
      <td>{{ td.commissionerate?.name }}</td>
      <td>{{ td.division?.name }}</td>
      <td>{{ td.circle?.name }}</td>
      <td>{{ td.sector?.name }}</td>
      <td class="text-center">
        <Button
          type="button"
          title="edit"
          class="btn btn-outline-dark mx-auto"
          icon="bi bi-pencil-square"
          @click="props.edit(+td.id)" />
      </td>
    </template>
  </DataTable>
</template>
```

### Key points

- **Pass all three: `data`, `search` and `option`.** `data` must be the paginator's object (`{ data, current_page, last_page, per_page, total, path }`), never a bare array — the component reads `data.path`, `data.current_page` and `data.per_page`. `option` is the page-size list (`:option="[10, 25, 50]"`); the active size is resolved by matching `data.per_page` against it.
- **Search, page size and pagination are internal but URL-based.** They call `gum.get(..., { skipFetch: true })`, which only rewrites the URL (`?page=&size=&search=`) — no request is made. Your page's `watch(() => route.query, ...)` performs the fetch, so keep it (see [Gum](/guide/resources/gum)). The `search` prop seeds the search input *and* is forwarded to the footer, so paging keeps the term — pass `:search="String(route.query.search || '')"`.
- **No sort functionality.** DataTable does not sort rows client-side. If you need sorted data, sort it server-side before passing to the `data` prop.
- **Use `DataTableSkeleton` while loading** — show it when your data is null/empty, then swap to `DataTable` once data arrives.
- **`removable` controls checkboxes.** When `false`, no checkboxes or trash button appear. The parent can also conditionally pass `:removable="hasRole('admin')"` to restrict bulk delete to certain roles.

---

## Datepicker

A date/time picker wrapping `@vuepic/vue-datepicker`. Supports `date`, `datetime`, `month`, and `year` modes with locale-friendly input formats. Falls back to a native `<input type="month">` for month mode on Firefox.

**Import:**

```vue
<script setup lang="ts">
import Datepicker from "@/components/Datepicker.vue";
</script>
```

### Props

| Prop   | Type                                        | Default  | Description                           |
| ------ | ------------------------------------------- | -------- | ------------------------------------- |
| `mode` | `"date" \| "datetime" \| "month" \| "year"` | `"date"` | Picker mode                           |
| `err`  | `string \| boolean`                         | `false`  | Error message shown below the picker  |
| `must` | `boolean`                                   | —        | Show the required indicator dot       |
| `hood` | `string \| boolean`                         | —        | Right-aligned caption above the input |

All additional `@vuepic/vue-datepicker` props (like `model-type`, `placeholder`, `disabled`, `readonly`) are passed through via `v-bind="$attrs"`. See the [vue-datepicker docs](https://vuepic.github.io/vue-datepicker/) for the full list.

**Inherited via `$attrs`:**

| Attr          | Type      | Description                                              |
| ------------- | --------- | -------------------------------------------------------- |
| `label`       | `string`  | Label text shown above the picker                        |
| `parentclass` | `string`  | CSS class on the wrapper div (default `"mb-2"`)          |
| `model-type`  | `string`  | Format of the emitted value (e.g. `"yyyy-MM"` for month) |
| `placeholder` | `string`  | Placeholder text in the input                            |
| `disabled`    | `boolean` | Disable the picker                                       |
| `readonly`    | `boolean` | Make the picker read-only                                |

### Input formats

| Mode       | Input display format       | Emits                                      |
| ---------- | -------------------------- | ------------------------------------------ |
| `date`     | `dd/MM/yyyy`               | `Date`                                     |
| `datetime` | `dd/MM/yyyy hh:mm a` (12h) | `Date`                                     |
| `month`    | `MM/yyyy`                  | `string \| Date` (depends on `model-type`) |
| `year`     | `yyyy`                     | `string \| Date` (depends on `model-type`) |

### Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import Datepicker from "@/components/Datepicker.vue";

const birthDate = ref(null);
const billingPeriod = ref(null);
const expiry = ref(null);
const taxYear = ref(null);
</script>

<template>
  <Datepicker v-model="birthDate" label="Date of birth" />
  <Datepicker v-model="billingPeriod" label="Billing period" mode="month" />
  <Datepicker v-model="expiry" label="Expiry" mode="datetime" />
  <Datepicker v-model="taxYear" label="Tax year" mode="year" />
</template>
```

### Real-world example — month picker with `model-type`

Common pattern: month picker that emits a `"yyyy-MM"` string for API submission.

```vue
<template>
  <Datepicker
    v-model="form.data.taxPeriod"
    mode="month"
    model-type="yyyy-MM"
    label="Tax Period"
    placeholder="mm/yyyy"
    :err="form.errors.taxPeriod"
    must />
</template>

<script setup lang="ts">
import { useGum } from "@/plugins/gum";

const form = useGum({
  taxPeriod: "", // will be "yyyy-MM" string after selection
}).form;
</script>
```

### Real-world example — range pickers (start/end)

Two independent Datepickers for a date range filter. The `parentclass` attr controls spacing:

```vue
<template>
  <div class="col-12 col-sm-6">
    <Datepicker
      v-model="field.startTaxPeriod"
      mode="month"
      model-type="yyyy-MM"
      placeholder="Start: mm/yyyy"
      :parentclass="`mb-0 ${
        err.startTaxPeriod ? 'border border-danger rounded-2' : ''
      }`" />
  </div>
  <div class="col-12 col-sm-6">
    <Datepicker
      v-model="field.endTaxPeriod"
      mode="month"
      model-type="yyyy-MM"
      placeholder="End: mm/yyyy"
      :parentclass="`mb-0 ${
        err.endTaxPeriod ? 'border border-danger rounded-2' : ''
      }`" />
  </div>
</template>
```

### Real-world example — disabled on edit

When editing an existing record, the Datepicker is disabled:

```vue
<Datepicker
  v-model="form.data.taxPeriod"
  mode="month"
  model-type="yyyy-MM"
  label="Month"
  placeholder="mm/yyyy"
  :err="form.errors.taxPeriod"
  must
  :disabled="Boolean(form.data.id)" />
```

### Key points

- **Always set `model-type`** when using month/year mode to control the emitted string format (e.g. `"yyyy-MM"`).
- **Month mode on Firefox** falls back to a native `<input type="month">` automatically — no configuration needed.
- **`mode="datetime"` uses 12-hour format** (`hh:mm a`) by default. The `time-config` prop is set internally to `{ is24: false }`.
- **Use `parentclass`** to control spacing or add dynamic error styling (e.g. `border border-danger rounded-2`).
- **Pass `placeholder`** as a regular attr — it shows inside the input field.
- **Use `disabled`** to lock the picker in edit mode (common pattern: `:disabled="Boolean(form.data.id)"`).

---

## Select

A searchable select with infinite-scroll pagination and API data fetching. Built on `vue-select`. Handles everything from simple static option lists to server-side paginated searches with dependent (cascade) dropdowns.

**Import:**

```vue
<script setup lang="ts">
import Select from "@/components/Select.vue";
</script>
```

### Props

| Prop           | Type                     | Default | Description                                                                                            |
| -------------- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| `fetched`      | `(payload) => FetchPack` | —       | Function returning `{ url, data, mapFn, params?, option? }`. Called internally for search/reset/reload |
| `must`         | `boolean`                | —       | Show a required-field indicator (red dot next to label)                                                |
| `err`          | `string \| boolean`      | —       | Validation error text displayed below the select                                                       |
| `hood`         | `string \| boolean`      | —       | Right-aligned hint/helper text next to the label                                                       |
| `defaultValue` | `SelectValue`            | `null`  | Pre-select a value on mount                                                                            |
| `resetKey`     | `any`                    | `null`  | **Cascade key.** When this changes, the select clears + reloads automatically                          |

**Inherited via `v-bind="$attrs"`:**

| Attr          | Type      | Description                                                |
| ------------- | --------- | ---------------------------------------------------------- |
| `title`       | `string`  | Label text                                                 |
| `label`       | `string`  | Key to use as display label in options (default `"title"`) |
| `placeholder` | `string`  | Placeholder text in the search input                       |
| `id`          | `string`  | Sets `for` on the label                                    |
| `parentclass` | `string`  | CSS class on the wrapper div (default `"mb-2"`)            |
| `multiple`    | `boolean` | Enable multi-select                                        |
| `options`     | `array`   | Static options array (for non-API mode)                    |
| `disabled`    | `boolean` | Disable the select                                         |

### Events

| Event     | Payload | Description                                                |
| --------- | ------- | ---------------------------------------------------------- |
| `fetched` | —       | Emitted after options are fetched                          |
| `clear`   | —       | Emitted when the selection is cleared (via × or backspace) |

### Exposed methods

| Method     | Description                             |
| ---------- | --------------------------------------- |
| `reload()` | Reset selection and re-fetch first page |

### `FetchPack` interface

```ts
interface FetchPack {
  url: string; // API endpoint
  data: string; // key in response that holds the paginated data
  params?: Record<string, any>; // extra query params (e.g. filter by parent)
  mapFn?: (item) => Record<string, any>; // transform API row → { id, title, ... }
  option?: (value) => void; // callback fired when selection changes
}
```

The component adds `page`, `size`, and `search` params automatically. Your `mapFn` receives the raw API row — transform it to the shape your app needs (usually `{ id, title }`).

### Basic usage — API-fetched

The standard pattern: `fetched` is a function returning the fetch config. The component handles search, page changes, and infinite scroll internally.

```vue
<script setup lang="ts">
import { ref } from "vue";
import Select from "@/components/Select.vue";

const user = ref(null);

const fetchUsers = () => ({
  url: "/api/auth/user/dropdown",
  data: "data",
  mapFn: (row: any) => ({
    id: Number(row.id),
    title: String(row.name || ""),
  }),
});
</script>

<template>
  <Select
    v-model="user"
    title="Select User"
    label="title"
    placeholder="Select..."
    :fetched="fetchUsers" />
</template>
```

### Real-world example — simple Select with store function

When the fetch function lives in a store and requires form-scoped data, wrap it in an arrow:

```vue
<script setup lang="ts">
import Select from "@/components/Select.vue";
import { useRoleStore } from "@/stores/role";

type OptionValue = { id: number; title: string } | null;

const form = useGum({
  role: null as OptionValue,
}).form;

const roleStore = useRoleStore();
</script>

<template>
  <Select
    v-model="form.data.role"
    title="role"
    label="title"
    placeholder="Select..."
    :fetched="roleStore.roleDD"
    :err="form.errors.roleId"
    must />
</template>
```

**Store (for reference):**

```ts
// stores/role.ts
export const useRoleStore = defineStore("role", () => {
  const roleDD = () => ({
    url: "/api/role/dropdown",
    data: "data",
    mapFn: (item: any) => ({
      id: Number(item.id),
      title: String(item.name || ""),
    }),
  });

  return { roleDD };
});
```

### Dependent (cascade) dropdown with `resetKey`

When a parent select changes, the child automatically reloads via `resetKey`. The child's `fetched` function reads the parent's value for its `params`.

```vue
<script setup lang="ts">
import Select from "@/components/Select.vue";

type OptionValue = { id: number; title: string } | null;

const form = useGum({
  commissionerate: null as OptionValue,
  division: null as OptionValue,
}).form;
</script>

<template>
  <Select
    v-model="form.data.commissionerate"
    title="commissionerate"
    label="title"
    placeholder="Select..."
    :fetched="commStore.commDD"
    must />

  <Select
    v-model="form.data.division"
    title="division"
    label="title"
    placeholder="Select..."
    :fetched="
      () =>
        divStore.divDDByCommissionerate({
          commissionerateId: form.data.commissionerate?.id,
        })
    "
    :reset-key="form.data.commissionerate?.id"
    must />
</template>
```

When `form.data.commissionerate` changes → `resetKey` on the division Select changes → select clears + reloads → `fetched` runs again, picks up the new `commissionerateId` in params.

### Multi-level cascade (3+ levels)

For three or more levels, chain `resetKey` at each level:

```vue
<script setup lang="ts">
import { nextTick } from "vue";
import Select from "@/components/Select.vue";

type OptionValue = { id: number; title: string } | null;

const form = useGum({
  commissionerate: null as OptionValue,
  division: null as OptionValue,
  circle: null as OptionValue,
}).form;
</script>

<template>
  <Select
    v-model="form.data.commissionerate"
    title="commissionerate"
    label="title"
    placeholder="Select..."
    :fetched="commStore.commDD"
    must />

  <Select
    v-model="form.data.division"
    title="division"
    label="title"
    placeholder="Select..."
    :fetched="
      () =>
        divStore.divDDByCommissionerate({
          commissionerateId: form.data.commissionerate?.id,
        })
    "
    :reset-key="form.data.commissionerate?.id"
    must />

  <Select
    v-model="form.data.circle"
    title="circle"
    label="title"
    placeholder="Select..."
    :fetched="
      () =>
        circleStore.circleDD({
          commissionerateId: form.data.commissionerate?.id,
          divisionId: form.data.division?.id,
        })
    "
    :reset-key="form.data.division?.id"
    must />
</template>
```

### `option` callback for side effects

Use `option` in the returned `FetchPack` to react when selection changes — e.g., clearing dependent dropdowns, reloading child data, or fetching related records.

Single callback:

```ts
const fetchUser = () => ({
  url: "/api/auth/user/dropdown/revenue",
  data: "data",
  mapFn: (item: any) => ({
    id: Number(item.id),
    title: String(item.email || item.name || ""),
  }),
  option: (selected: any) => {
    // selected is the chosen option object, or null on clear
    entitySelect.value?.reload(); // clear + reload dependent Select via ref
  },
});
```

Multiple callbacks (array):

```ts
const fetchUser = () => ({
  url: "/api/auth/user/dropdown",
  data: "data",
  mapFn: (item: any) => ({ id: item.id, title: item.name }),
  option: [
    (val: any) => {
      form.user = val;
    },
    (val: any) => {
      form.entity = null;
      entitySelect.value?.reload();
    },
  ],
});
```

### Edit mode — populating cascading dropdowns

When editing a record with cascade-dependent selects, you **must** `await nextTick()` between each cascade level in `setForm`. This gives the child Select's `resetKey` watch time to fire, clear the old value, and reload options before you set the next level.

```vue
<script setup lang="ts">
import { nextTick } from "vue";
import Select from "@/components/Select.vue";

type OptionValue = { id: number; title: string } | null;

const form = useGum({
  commissionerate: null as OptionValue,
  division: null as OptionValue,
  circle: null as OptionValue,
  sector: null as OptionValue,
}).form;

const setForm = async (row: Record<string, any> = {}) => {
  form.data.id = String(row.id || "");

  form.data.commissionerate = row.commissionerateId
    ? {
        id: Number(row.commissionerateId),
        title: String(row.commissionerate?.name || ""),
      }
    : null;
  await nextTick(); // let division select reset + reload

  form.data.division = row.divisionId
    ? { id: Number(row.divisionId), title: String(row.division?.name || "") }
    : null;
  await nextTick(); // let circle select reset + reload

  form.data.circle = row.circleId
    ? { id: Number(row.circleId), title: String(row.circle?.name || "") }
    : null;

  form.data.sector = row.sectorId
    ? { id: Number(row.sectorId), title: String(row.sector?.name || "") }
    : null;

  form.clearErrors();
};
</script>
```

**Why `nextTick` is required:** When you set `form.data.commissionerate`, the division Select's `resetKey` changes, triggering its internal watch. That watch clears the division model (setting it to `null`) and fetches fresh options. Without `nextTick`, setting `form.data.division` immediately after would be overwritten by the watch. `nextTick` lets the flush complete so the child resets first, then you can safely set its value.

**Do NOT use `nextTick` for user cascade.** The `resetKey` watch handles that automatically — user changes a parent → watch fires → child clears + reloads. `nextTick` is only needed in `setForm` when programmatically restoring all cascade levels at once.

### Reloading from outside via `ref`

You can call `reload()` on a Select from outside using a template ref — useful after an external event (e.g. Pulse broadcast) indicates the dropdown data has changed:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Select from "@/components/Select.vue";
import { pulse } from "@/plugins/pulse";

const commSelect = ref<InstanceType<typeof Select> | null>(null);

onMounted(() => {
  const ch = pulse.channel("commissionerate");
  ch.listen("commissionerate.changed", () => commSelect.value?.reload());
});

onUnmounted(() => pulse.leave("commissionerate"));
</script>

<template>
  <Select
    ref="commSelect"
    v-model="form.data.commissionerate"
    title="commissionerate"
    label="title"
    placeholder="Select..."
    :fetched="commStore.commDD"
    must />
</template>
```

### Static options (no API)

For simple cases where options don't come from an API:

```vue
<script setup lang="ts">
import { ref } from "vue";
import Select from "@/components/Select.vue";

const role = ref(null);
const roles = [
  { id: 1, title: "Admin" },
  { id: 2, title: "Editor" },
  { id: 3, title: "Viewer" },
];
</script>

<template>
  <Select v-model="role" title="Role" :options="roles" label="title" />
</template>
```

### Search behavior

When you type in the search box, results are fetched from the API. If you clear the search, the select refetches the full list and **pins the results of your last search on top** so you don't lose your place. Selecting an option clears this pinned state.

### Key points

- **`fetched` is a plain function** — not reactive, not a computed. It runs fresh on every search/page/reload. Your function closes over reactive form values, so it always reads the latest parent state.
- **`label="title"`** is the default display key — options should have an `id` and `title` field (or whatever you set `label` to).
- **`resetKey` must be a primitive or reactive ref** — when it changes, the component clears and reloads. Pass the parent's `id` (e.g. `form.data.country?.id`).
- **Use `reload()` via ref** when external data changes (e.g. after a Pulse broadcast or form submission that affects the dropdown).
- **Infinite scroll** is built in — when the user scrolls to the bottom of the dropdown, the next page loads automatically.
- **`option` can be a function or array of functions** — each is called with the selected value (or `null` on clear) when the selection changes.

---

## FeatureButton

`FeatureButton` adds an action button into the app header. It registers itself with the layout's `featureButtons` provider on mount and removes itself on unmount, so header buttons are automatically scoped to the page that renders them.

```vue
<script setup lang="ts">
import FeatureButton from "@/components/FeatureButton.vue";
</script>

<template>
  <FeatureButton
    icon="bi bi-plus-lg"
    label="New"
    title="Create new record"
    button-class="btn-success"
    @click="openCreateModal" />
</template>
```

### Props

| Prop          | Type     | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| `icon`        | `string` | Bootstrap icon class (e.g. `bi bi-plus-lg`) |
| `label`       | `string` | Text shown next to the icon                 |
| `title`       | `string` | Tooltip (falls back to `label`)             |
| `buttonClass` | `string` | CSS class applied to the header button      |

### Slots

| Slot      | Description                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default` | Custom content. When present, the button is replaced by a slot renderer (wrapped with the same order/class as a normal button) — useful for dropdowns or compound controls. |

### Usage with role-based visibility

```vue
<FeatureButton v-if="hasRole('admin', 'sector_officer')">
  <Countdown />
</FeatureButton>
```
