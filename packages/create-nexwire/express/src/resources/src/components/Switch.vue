<template>
  <div :class="wrapperClass">
    <label :class="props.vertical ? 'form-check-label d-block' : 'd-none'">
      <span v-html="statusHtml"></span>
    </label>
    <div class="form-check form-switch d-inline-block">
      <input
        class="form-check-input shadow-none border-primary"
        type="checkbox"
        role="switch"
        :checked="isChecked"
        v-bind="$attrs" />
      <label :class="props.vertical ? 'd-none' : 'form-check-label'">
        <span v-html="statusHtml"></span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ name: "Switch", inheritAttrs: false });

interface SwitchProps {
  modelValue?: string | number | boolean;
  value?: unknown[] | Record<string, unknown> | string | number | boolean;
  vertical?: boolean;
  checked?: boolean | number;
}

const $attrs = useAttrs();
const props = defineProps<SwitchProps>();

const textLabel = computed(() => ($attrs.text as string | undefined) || "");
const blankLabel = computed(() => ($attrs.blank as string | undefined) || "");
const topclass = computed(() => ($attrs.topclass as string | undefined) || "");

const isChecked = computed(() => Boolean(props.checked));

const wrapperClass = computed(() => (props.vertical ? `text-center ${topclass.value}`.trim() : ""));

const statusHtml = computed(() => {
  if (isChecked.value) {
    return `<div class='d-flex justify-content-center'><span>${textLabel.value}</span><div class='rounded-circle bg-success indicator'></div></div>`;
  }

  return `<div class='d-flex justify-content-center'><span>${blankLabel.value}</span><div class='rounded-circle bg-danger indicator'></div></div>`;
});
</script>

<style lang="scss">
.indicator {
  width: 4px;
  height: 4px;
  margin-left: 2px;
  margin-top: 5px;
}
</style>
<style lang="scss" scoped>
label,
input {
  cursor: pointer;
}
</style>
