<!-- ./src/resources/src/components/datatable/SelectOpption.vue -->

<template>
  <div
    class="d-flex align-items-center justify-content-center justify-content-md-start mb-2 mb-md-0"
    :class="{ 'd-none': !props.isOptions }"
  >
    Show
    <select v-model="selectedoption" class="form-select shadow-none w-auto mx-2" @change="selectOption">
      <option v-for="(val, i) in props.option" :key="i" :value="val">{{ val }}</option>
    </select>
    entries
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

interface NavigateOverrides {
  page?: number;
  size?: string | number;
  search?: string;
}

interface SelectOptionProps {
  navigate: (overrides?: NavigateOverrides) => void;
  isOptions?: boolean;
  option?: Array<string | number>;
  selectedoption?: string | number;
}

const props = withDefaults(defineProps<SelectOptionProps>(), {
  isOptions: true,
  option: () => []
});

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

  return props.navigate({ size: selectedoption.value });
};
</script>

<style lang="scss" scoped></style>
