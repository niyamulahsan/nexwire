<!-- ./src/resources/src/components/datatable/index.vue -->

<template>
  <div class="card border">
    <div class="card-header" :class="{ 'd-none': !(props.removable || props.searchable || props.optionable) }">
      <div class="row align-items-center gx-1">
        <div class="col-12 col-md-3">
          <SelectOption
            :is-options="props.optionable"
            :option="props.option"
            :selectedoption="selectedoption"
            :navigate="navigate"
          />
        </div>
        <div class="col-12 col-md-9">
          <slot name="extra-tools"></slot>
          <div class="d-flex align-items-center justify-content-center justify-content-md-end">
            <div v-if="checked.checkcolumn.length > 0" class="me-1" :class="{ 'd-none': !props.removable }">
              <Button type="button" class="btn btn-outline-danger" @click.prevent="remove">
                <i class="bi bi-trash"></i>
              </Button>
            </div>
            <div class="d-flex align-items-center" :class="{ 'd-none': !props.searchable }">
              <Button class="btn btn-outline-secondary rounded-0 rounded-start" type="button" @click="searchMe">
                <i class="bi bi-search"></i>
              </Button>
              <Input
                v-model="searchdata"
                type="text"
                class="w-auto rounded-0 rounded-end"
                topclass="mb-0"
                placeholder="Search..."
                @keyup.enter="searchMe"
                @keyup.delete="searchMe"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card-body">
      <slot name="extra"></slot>
      <div class="table-responsive">
        <table class="table table-bordered table-striped border-custom table-sm align-middle m-0 datatable no-shrink-table">
          <slot name="customhead"></slot>
          <thead :class="{ 'd-none': slots.customhead }">
            <tr>
              <th class="align-middle" :class="{ 'd-none': !props.removable || !props.data.current_page }">
                <Checkbox v-model="checked.check" topclass="ms-2" :value="checked.check" :disabled="props.disabled" @click="checkAll" />
              </th>
              <th class="text-center align-middle" :class="{ 'd-none': !props.countable }">#</th>
              <slot name="thead"></slot>
            </tr>
          </thead>

          <slot name="custombody"></slot>
          <tbody :class="{ 'd-none': slots.custombody }">
            <tr v-for="(dt, i) in tableRows" :key="`${dt.id}-${i}`">
              <td class="align-middle" :class="{ 'd-none': !props.removable || !props.data.current_page }">
                <Checkbox v-model="checked.checkcolumn" topclass="ms-2" :value="dt.id" :disabled="props.disabled" @change="updateChecked" />
              </td>
              <td class="text-center align-middle" :class="{ 'd-none': !props.countable }">
                {{ props.data.current_page ? props.data.per_page * (props.data.current_page - 1) + (i + 1) : i + 1 }}
              </td>
              <slot name="tbody" :td="dt"></slot>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card-footer" :class="{ 'd-none': props.data.total <= props.data.data?.length }">
      <Pagination :data="props.data" :navigate="navigate" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { debounce } from "lodash-es";
import { computed, reactive, ref, useSlots, watchEffect } from "vue";
import { useRoute } from "vue-router";
import Button from "@/components/Button.vue";
import Checkbox from "@/components/Checkbox.vue";
import Input from "@/components/Input.vue";
import { useGum } from "@/plugins/gum";
import Pagination from "./Pagination.vue";
import SelectOption from "./SelectOpption.vue";

interface DataRow {
  id: string | number;
  [key: string]: any;
}

interface DataTableProps {
  data: any;
  search?: string;
  loop?: DataRow[] | false;
  option?: Array<string | number>;
  removable?: boolean;
  countable?: boolean;
  searchable?: boolean;
  optionable?: boolean;
  disabled?: boolean;
  filters?: Record<string, unknown>;
  fetcher?: (params: Record<string, unknown>) => Promise<unknown>;
}

const props = withDefaults(defineProps<DataTableProps>(), {
  search: "",
  option: () => [],
  removable: true,
  countable: true,
  searchable: true,
  optionable: true,
  disabled: false,
  filters: () => ({})
});
const gum = useGum();
const route = useRoute();

const slots = useSlots();

const emit = defineEmits<(event: "remove", value: Array<string | number>) => void>();

// checkbox select
let checked = reactive<{ check: boolean; checkcolumn: Array<string | number> }>({
  check: false,
  checkcolumn: []
});
const checkAll = () => {
  if (!checked.check) {
    props.data.data.forEach((dt: DataRow) => {
      if (!checked.checkcolumn.includes(dt.id)) {
        checked.checkcolumn.push(dt.id);
      }
    });
  } else {
    checked.checkcolumn = [];
  }
};
const updateChecked = () => (checked.checkcolumn.length === props.data.data.length ? (checked.check = true) : (checked.check = false));

// remove from parent
const remove = () => {
  emit("remove", checked.checkcolumn);
  checked.check = false;
};

// for change data size show
const selectedoption = ref<string | number | undefined>(undefined);
const tableRows = computed<DataRow[]>(() => (props.loop ? props.loop : props.data.data));

// search data
const searchdata = ref(props.search || "");

/**
 * The single navigation entry point for every built-in control (search,
 * page-size, pagination). It rebuilds the query from the current URL, overrides
 * the three built-ins (`page`, `size`, `search`) and merges `filters` last, so
 * extra query params are preserved instead of being wiped.
 *
 * - URL mode (default): rewrites `?page=&size=&search=` and relies on the
 *   page's `watch(() => route.query, …)` to re-fetch (`skipFetch: true`).
 * - Fetcher mode (`:fetcher`): calls the fetcher with the same query and keeps
 *   the URL in sync. The page must NOT also watch `route.query`, or each
 *   navigation fetches twice.
 */
const navigate = (overrides: { page?: number; size?: string | number; search?: string } = {}) => {
  const query: Record<string, unknown> = {
    ...route.query,
    page: overrides.page ?? props.data.current_page,
    size: overrides.size ?? selectedoption.value,
    search: overrides.search ?? searchdata.value,
    ...props.filters
  };

  const fetcher = props.fetcher;
  if (fetcher) {
    return gum.getWith({
      fetcher: () => fetcher(query),
      query,
      routePath: route.path,
      preserveState: true,
      preserveScroll: true
    });
  }

  return gum.get(route.path, {
    query,
    routePath: route.path,
    preserveState: true,
    preserveScroll: true,
    skipFetch: true
  });
};

const searchMe = debounce(() => {
  const isSearching = !!searchdata.value && searchdata.value.trim() !== "";
  navigate({ page: isSearching ? 1 : props.data.current_page, search: searchdata.value });
}, 500);

// watch instantce
watchEffect(() => {
  selectedoption.value = props.option.find((x) => Number(x) === Number(props.data.per_page));
  searchdata.value = props.search || "";
});
</script>

<style lang="scss" scoped>
.border-custom {
  border-color: #cccccc !important;
}

.no-shrink-table th,
.no-shrink-table td {
  white-space: nowrap;
}

/* By default (large screens and up) do not force a min-width:
   allow table to size normally so no horizontal scrollbar on large screens */
@media (min-width: 992px) {
  .no-shrink-table {
    min-width: 0;
  }
}

@media (max-width: 991.98px) {
  .no-shrink-table {
    min-width: 1000px;
  }
}
</style>
