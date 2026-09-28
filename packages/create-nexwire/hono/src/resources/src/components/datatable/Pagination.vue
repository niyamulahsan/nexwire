<template>
  <div class="row">
    <div class="col-12 col-md-6 mb-3 mb-md-0">
      <div class="py-2 text-black-50 text-center text-md-start">
        Showing {{ page.from }} to {{ page.to }} of {{ nFormatter(page.total) }} entries
      </div>
    </div>
    <div class="col-12 col-md-6">
      <nav :class="['datatable-pagination', `pagination-${variant}`]" aria-label="Page navigation">
        <ul class="pagination justify-content-center justify-content-md-end">
          <!-- First -->
          <li :class="['page-item', { disabled: noPreviousPage }]">
            <button type="button" class="page-link" :aria-disabled="noPreviousPage ? 'true' : 'false'"
              :tabindex="noPreviousPage ? -1 : 0" @click.prevent="!noPreviousPage && loadPage(1)">
              <i class="bi bi-chevron-double-left"></i>
            </button>
          </li>

          <!-- Prev -->
          <li :class="['page-item', { disabled: noPreviousPage }]">
            <button type="button" class="page-link" :aria-disabled="noPreviousPage ? 'true' : 'false'"
              :tabindex="noPreviousPage ? -1 : 0"
              @click.prevent="!noPreviousPage && loadPage(props.data.current_page - 1)">
              <i class="bi bi-chevron-left"></i>
            </button>
          </li>

          <li class="page-item">
            <div class="input-group input-group-sm">
              <Input v-model="page.page" type="text" category="number" topclass="m-0" class="text-center"
                style="width: 100px" @keyup.enter="loadPage(page.page)" />
            </div>
          </li>

          <li class="page-item">
            <span class="page-link text-nowrap"> of {{ nFormatter(props.data.last_page) }} </span>
          </li>

          <!-- Next -->
          <li :class="['page-item', { disabled: noNextPage }]">
            <button type="button" class="page-link" :aria-disabled="noNextPage ? 'true' : 'false'"
              :tabindex="noNextPage ? -1 : 0" @click.prevent="!noNextPage && loadPage(props.data.current_page + 1)">
              <i class="bi bi-chevron-right"></i>
            </button>
          </li>

          <!-- Last -->
          <li :class="['page-item', { disabled: noNextPage }]">
            <button type="button" class="page-link" :aria-disabled="noNextPage ? 'true' : 'false'"
              :tabindex="noNextPage ? -1 : 0" @click.prevent="!noNextPage && loadPage(props.data.last_page)">
              <i class="bi bi-chevron-double-right"></i>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watchEffect } from "vue";
import { useRoute } from "vue-router";
import Input from "@/components/Input.vue";
import { formatCompactNumber } from "@/helpers/nformatter";
import { useGum } from "@/plugins/gum";

interface PaginationData {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  path: string;
}

interface PaginationProps {
  data: PaginationData;
  selectedoption?: string | number;
  search?: string;
  variant?: string;
}

const props = withDefaults(defineProps<PaginationProps>(), {
  search: "",
  variant: "dark"
});

const gum = useGum();
const route = useRoute();

const page = reactive({ page: 1, from: 0, to: 0, total: 0 });

const noPreviousPage = computed(() => props.data.current_page - 1 <= 0);
const noNextPage = computed(() => props.data.current_page + 1 > props.data.last_page);

const loadPage = (pageNo: string | number) => {
  let p = parseInt(String(pageNo), 10);

  // fallback if NaN
  if (Number.isNaN(p)) p = props.data.current_page;

  const last = Number(props.data.last_page) || 1;

  // clamp between 1 and last
  if (p < 1) p = 1;
  if (p > last) p = last;

  return gum.get(props.data.path, {
    query: { page: p, size: props.selectedoption, search: props.search },
    routePath: route.path,
    preserveState: true,
    preserveScroll: true,
    skipFetch: true
  });
};

const nFormatter = formatCompactNumber;

watchEffect(() => {
  // "Showing {$from} to {$to} of {$total} entries"
  page.page = props.data.current_page;
  page.from = (props.data.current_page - 1) * props.data.per_page + 1;
  page.to = Math.min(props.data.current_page * props.data.per_page, props.data.total);
  page.total = props.data.total;
});
</script>

<style lang="scss" scoped>
ul.pagination {
  margin: 0;

  :deep(.page-item.disabled .page-link),
  :deep(.page-link:disabled),
  :deep(.page-link[aria-disabled="true"]) {
    pointer-events: none;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .page-link {
    border-radius: 5px !important;
    margin-left: 0;
    border-color: #cdcdcd !important;
    color: inherit;
    box-shadow: none;
  }
}
</style>
