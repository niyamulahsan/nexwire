<template>
  <div class="d-flex align-items-center justify-content-center justify-content-md-start mb-2 mb-md-0" :class="{ 'd-none': !props.isOptions }">
    Show
    <select
      v-model="selectedoption"
      class="form-select shadow-none w-auto mx-2"
      @change="selectOption">
      <option v-for="(val, i) in props.option" :key="i" :value="val">{{ val }}</option>
    </select>
    entries
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useGum } from "@/plugins/gum";

interface DataPage {
  path: string;
  current_page: number;
}

interface SelectOptionProps {
  data: DataPage;
  search?: string;
  isOptions?: boolean;
  option?: Array<string | number>;
  selectedoption?: string | number;
}

const props = withDefaults(defineProps<SelectOptionProps>(), {
  search: "",
  isOptions: true,
  option: () => []
});
const gum = useGum();
const route = useRoute();

// select option and pass SelectOption component
const selectedoption = ref<string | number | undefined>(props.selectedoption);

watch(
  () => props.selectedoption,
  (value) => {
    selectedoption.value = value;
  }
);

const selectOption = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  selectedoption.value = target.value;

  return gum.get(props.data.path, {
    query: { page: props.data.current_page, size: selectedoption.value, search: props.search },
    routePath: route.path,
    preserveState: true,
    preserveScroll: true,
    skipFetch: true
  });
};
</script>

<style lang="scss" scoped></style>
