<script setup lang="ts">
import axios from "axios";
import { debounce } from "lodash-es";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useAttrs, watch } from "vue";
import "vue-select/dist/vue-select.css";
import vSelect from "vue-select";
import { empty } from "../helpers/utils";

defineOptions({ name: "Select", inheritAttrs: false });

type AnyRecord = Record<string, unknown>;
type SelectValue = string | number | boolean | AnyRecord | null;
type OptionHook = ((value: unknown) => void | Promise<void>) | null;

interface FetchPack {
  url?: string | null;
  data?: string | null;
  params?: AnyRecord;
  mapFn?: (x: AnyRecord) => AnyRecord;
  option?:
  | ((value: unknown) => void | Promise<void>)
  | Array<(value: unknown) => void | Promise<void>>;
  reset?: boolean;
  reload?: boolean;
}

interface SelectProps {
  fetched?: (payload: Record<string, any>) => any;
  must?: boolean;
  err?: string | boolean;
  hood?: string | boolean;
  defaultValue?: SelectValue;
  resetKey?: string | number | boolean | AnyRecord | null;
}

const $attrs = useAttrs();
const props = withDefaults(defineProps<SelectProps>(), {
  defaultValue: null,
  resetKey: null
});

// vue3.4 way
const emit = defineEmits<{
  (event: "fetched"): void;
  (event: "clear"): void;
}>();
const model = defineModel<SelectValue | SelectValue[]>();

const skipNextSearch = ref(false); // suppress search right after clear

let observer = ref<IntersectionObserver | null>(null);
let load = ref<HTMLElement | null>(null);

// store callbacks coming from fetchedDropdown(pack)
const hooks = ref<{ option: OptionHook | OptionHook[]; }>({ option: null }); // function | function[] | null

// remember last fetch config and search so the child can refetch/append by itself
const lastPack = ref<FetchPack | null>(null); // { url, data, params, mapFn }
const lastSearch = ref(""); // current search term
const lastSearchRows = ref<AnyRecord[]>([]); // results of the last search, to pin on top after clearing

const hasNextPage = computed(() => {
  const total = Number((fieldData.value as { total?: number; }).total ?? 0);
  return field.all.length < total;
});

// ask parent for a pack and run our internal fetcher
const callParentFetched = async (search: string, opts: Partial<FetchPack> = {}) => {
  const maybePack = await props.fetched?.({ search, ...opts });
  if (maybePack && typeof maybePack === "object") {
    await fetchedDropdown(search, { ...maybePack, ...opts });
  }
};

const onClear = () => {
  resetMe(); // clear options + selected value
  skipNextSearch.value = true; // suppress the immediate empty search
  emit("clear"); // notify parent that clear button was clicked
};

const onOpen = async () => {
  // if empty, load page 1 via parent fetcher (no boolean flags)
  if (!field.all.length) {
    if (lastPack.value) {
      await fetchedDropdown("", { ...lastPack.value, reset: true });
    } else {
      // await props.fetched?.('');
      await callParentFetched("", { reset: true });
    }
  }

  await nextTick();
  if (load.value && hasNextPage.value) {
    observer.value?.observe(load.value);
  }
};

const onClose = async () => {
  observer.value?.disconnect();
};

const onModelUpdate = async (val: unknown) => {
  const optHooks = Array.isArray(hooks.value.option)
    ? hooks.value.option
    : hooks.value.option
      ? [hooks.value.option]
      : [];

  // When user clicks × or backspaces everything, v-select sets model to null.
  if (val == null || val === "") {
    for (const f of optHooks) {
      if (typeof f === "function") {
        await Promise.resolve(f(null));
      }
    }
    emit("clear");
    return;
  }

  field.val = val as SelectValue;

  for (const f of optHooks) {
    if (typeof f === "function") {
      await Promise.resolve(f(val));
    }
  }
};

const inputSearch = debounce(async (search: string, loading: (value: boolean) => void) => {
  if (skipNextSearch.value && !search?.trim().length) {
    skipNextSearch.value = false; // consume the flag
    return;
  }

  if (search?.trim().length) {
    loading(true);
    if (lastPack.value) {
      await fetchedDropdown(search, { ...lastPack.value, reset: true }).finally(() =>
        loading(false)
      );
    } else {
      await callParentFetched(search, { reset: true }).finally(() => loading(false));
    }
  } else {
    // user erased the query manually: refetch the full list, then pin the last search results on top
    field.page = 0;
    if (lastPack.value) {
      await fetchedDropdown("", { ...lastPack.value, reset: true });
    } else {
      await callParentFetched("");
    }
    pinLastSearchRows();
    await nextTick();
    if (load.value && hasNextPage.value) observer.value?.observe(load.value);
  }
}, 400);

const infiniteScroll = async ([{ isIntersecting, target }]: IntersectionObserverEntry[]) => {
  if (!isIntersecting) return;

  const ul =
    target instanceof HTMLElement && target.offsetParent instanceof HTMLElement
      ? target.offsetParent
      : null;
  const scrollTop = ul?.scrollTop ?? 0;

  if (lastPack.value) {
    await fetchedDropdown(lastSearch.value, { ...lastPack.value }); // next page of current mode
  } else {
    await callParentFetched(lastSearch.value || "");
  }

  await nextTick();

  if (ul) ul.scrollTop = scrollTop;
};

onMounted(async () => {
  observer.value = new IntersectionObserver(infiniteScroll);

  // set default value if provided
  if (props.defaultValue) {
    await nextTick();
    field.val = props.defaultValue;
    model.value = props.defaultValue;
  }
});

onBeforeUnmount(() => {
  observer.value?.disconnect();
  observer.value = null;
});

// prototype and it will call from parent
const field = reactive<{ all: AnyRecord[]; val: SelectValue; page: number; size: number; }>({
  all: [],
  val: "",
  page: 0,
  size: 10
});
const fieldData = ref<AnyRecord>({});

const resetMe = () => {
  field.all = [];
  field.page = 0;
  field.val = "";
};

const reloadMe = () => {
  field.all = [];
  field.page = 0;
};

const fetchedDropdown = async (search: string, pack: FetchPack | null = null) => {
  const url = pack?.url ?? null;
  const data = pack?.data ?? null;
  const params = pack?.params ?? {};
  const mapFn = pack?.mapFn ?? ((x: AnyRecord) => x);
  const reset = !!pack?.reset;
  const reload = !!pack?.reload;

  // make option sticky: only overwrite if caller provided it
  if ("option" in (pack ?? {})) {
    const pOpt = pack?.option;
    hooks.value.option = Array.isArray(pOpt)
      ? pOpt.filter((fn) => typeof fn === "function")
      : typeof pOpt === "function"
        ? [pOpt]
        : [];
  }

  // remember essentials so the child can refetch/append on its own
  lastPack.value = { url, data, params, mapFn };
  lastSearch.value = search ?? "";

  // if pass and true -> reset, reload , search
  (reset && resetMe()) ||
    (reload && reloadMe()) ||
    (!empty(search) && !reset && !reload && reloadMe());

  // after reset/reload/search
  field.page++;
  const param = { page: field.page, size: field.size, search: search };

  // log once (don't call axios twice)
  // console.log('GET', pack.url, { params: pack.params ? { ...pack.params, ...param } : param });

  if (!url || !data) {
    return;
  }

  let key: any;
  try {
    key = await axios.get(url, { params: params ? { ...params, ...param } : param });
  } catch {
    return; // failed to fetch (e.g. cascade with missing parent)
  }
  const payload = key.data[data as string] as AnyRecord;

  fieldData.value = payload;
  const rows = Array.isArray((payload as { data?: unknown; }).data)
    ? (payload as { data: AnyRecord[]; }).data
    : [];

  const options = rows
    .map((dt) => (dt == null ? null : mapFn(dt)))
    .filter((opt): opt is AnyRecord => opt != null);

  // remember the last fresh search results so they can be pinned on top after clearing the search
  if (search?.trim().length && reset) {
    lastSearchRows.value = options.map((opt) => ({ ...opt }));
  }

  // console.log('Fetched', payload?.data);
  options.forEach((opt) => {
    const key = opt?.id ?? opt?.title ?? JSON.stringify(opt); // build a comparison key: prefer id, then title, then full object

    if (
      !field.all.some(
        (o) =>
          o != null &&
          ((o as { id?: unknown; title?: unknown; }).id ??
            (o as { id?: unknown; title?: unknown; }).title ??
            JSON.stringify(o)) === key
      )
    ) {
      field.all = [...field.all, opt];
    }
  });
};

const optionKey = (o: AnyRecord) =>
  (o as { id?: unknown; title?: unknown; }).id ??
  (o as { id?: unknown; title?: unknown; }).title ??
  JSON.stringify(o);

// after a refetch, move the last search results to the top of the list
const pinLastSearchRows = () => {
  if (!lastSearchRows.value.length) return;
  const pinKeys = new Set(lastSearchRows.value.map(optionKey));
  const rest = field.all.filter((o) => !pinKeys.has(optionKey(o)));
  field.all = [...lastSearchRows.value, ...rest];
};

/**
 * This function created for
 * functionally reset or reload
 * from without component
 * like fn.value.reload({reset:true/reload:true/both});
 * it is exposed, so we can call from with
 * template ref
 */
const reload = async () => {
  resetMe(); // clear field.all, page, val
  await callParentFetched("", { reset: true }); // ask parent to fetch first page again
};

/**
 * if backend send proper object or null
 * then watch function not get any axios
 * error else axios can send error
 */
watch(
  () => props.resetKey,
  async (newVal, oldVal) => {
    if (oldVal === undefined) return;

    const optHooks = Array.isArray(hooks.value.option)
      ? hooks.value.option
      : hooks.value.option
        ? [hooks.value.option]
        : [];

    model.value = "";

    // Notify hooks that selection is gone
    for (const fn of optHooks) {
      if (typeof fn === "function") {
        await Promise.resolve(fn(null));
      }
    }

    skipNextSearch.value = true; // avoid instant empty-search call
    if (newVal == null) {
      lastPack.value = null;
      return;
    } // parent cleared, don't fetch with null key
    await callParentFetched("", { reload: true });
    pinLastSearchRows();
    skipNextSearch.value = false; // allow subsequent empty-searches (backspace-to-empty)
  }
);

defineExpose({ field, fieldData, fetchedDropdown, reload });

const parentClass = computed(() => ($attrs.parentclass as string | undefined) || "mb-2");

const inputTitle = computed(() => ($attrs.title as string | undefined) || "");
const hoodHtml = computed(() =>
  props.hood === false || props.hood == null ? "" : String(props.hood)
);
</script>

<template>
  <div :class="parentClass">
    <label
      class="text-capitalize d-flex align-items-center mb-1"
      :class="{ 'd-none': !inputTitle }">
      <div class="position-relative">
        <span class="text-capitalize" v-html="inputTitle"></span>
        <span
          class="position-absolute text-danger rounded-circle bg-danger must"
          :class="{ 'd-none': !props.must }"></span>
      </div>
      <div
        class="text-uppercase w-100 text-end text-primary fw-semibold"
        :class="{ 'd-none': !props.hood }"
        style="font-size: 12px; margin-top: 0.15rem"
        v-html="hoodHtml"></div>
    </label>
    <v-select
      v-model="model"
      label="title"
      :filterable="false"
      :options="field.all"
      v-bind="$attrs"
      @open="onOpen"
      @update:model-value="onModelUpdate"
      @close="onClose"
      @search="inputSearch"
      @clear="onClear">
      <template #list-footer>
        <li v-show="hasNextPage" ref="load" class="loader">More...</li>
      </template>
    </v-select>
    <div class="form-text text-danger" :class="{ 'd-none': !props.err }" style="font-size: 0.8rem">
      {{ props.err }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.loader {
  text-align: center;
  color: #bbbbbb;
}

.must {
  width: 4px;
  height: 4px;
  top: 0;
  margin-top: 5px;
  margin-left: 2px;
}
</style>
