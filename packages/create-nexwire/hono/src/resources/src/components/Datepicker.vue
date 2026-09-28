<template>
  <div :class="parentClass">
    <label class="text-capitalize d-flex align-items-center mb-1" :class="{ 'd-none': !inputLabel }">
      <div class="position-relative">
        <span class="text-capitalize" v-html="inputLabel"></span>
        <span class="position-absolute text-danger rounded-circle bg-danger must" :class="{ 'd-none': !props.must }"></span>
      </div>
      <div class="text-uppercase w-100 text-end text-primary fw-semibold" :class="{ 'd-none': !props.hood }" style="font-size: 12px; margin-top: 0.15rem" v-html="hoodHtml"></div>
    </label>
    <VueDatePicker
      v-if="usePicker"
      v-model="model"
      :month-picker="props.mode === 'month'"
      :year-picker="props.mode === 'year'"
      :time-picker="props.mode === 'datetime'"
      :time-config="timeConfig"
      :formats="formats"
      text-input
      v-bind="$attrs"></VueDatePicker>
    <input
      v-else
      type="month"
      class="form-control"
      :value="nativeValue"
      :disabled="Boolean($attrs.disabled)"
      :readonly="Boolean($attrs.readonly)"
      @input="onNativeInput" />
    <div class="form-text text-danger" :class="{ 'd-none': !props.err }" style="font-size: 0.8rem">
      {{ props.err }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { VueDatePicker } from "@vuepic/vue-datepicker";
import { computed, useAttrs } from "vue";
import "@vuepic/vue-datepicker/dist/main.css";
import { browserDetect } from "@/plugins/browserDetect";

defineOptions({ name: "Datepicker", inheritAttrs: false });

type DateMode = "date" | "datetime" | "month" | "year";
type DateValue = string | number | Date | null;

interface DateProps {
  must?: boolean;
  err?: string | boolean;
  hood?: string | boolean;
  mode?: DateMode;
}

const $attrs = useAttrs();
const props = withDefaults(defineProps<DateProps>(), {
  err: false,
  mode: "date"
});

const model = defineModel<DateValue>();

const usePicker = computed(() => browserDetect.isFirefox.value || props.mode !== "month");

const nativeValue = computed(() => {
  const value = model.value;
  if (typeof value === "string") return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }
  return "";
});

const onNativeInput = (e: Event) => {
  model.value = (e.target as HTMLInputElement).value || null;
};

const parentClass = computed(() => ($attrs.parentclass as string | undefined) || "mb-2");
const inputLabel = computed(() => ($attrs.label as string | undefined) || "");

const hoodHtml = computed(() => (props.hood === false || props.hood == null ? "" : String(props.hood)));

const timeConfig = computed(() => (props.mode === "datetime" ? { is24: false } : undefined));

const formats = computed(() => {
  switch (props.mode) {
    case "year":
      return { input: "yyyy" };
    case "month":
      return { input: "MM/yyyy" };
    case "datetime":
      return { input: "dd/MM/yyyy hh:mm a" };
    default:
      return { input: "dd/MM/yyyy" };
  }
});
</script>

<style lang="scss" scoped>
.must {
  width: 4px;
  height: 4px;
  top: 0;
  margin-top: 5px;
  margin-left: 2px;
}
</style>
