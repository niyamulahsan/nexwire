<template>
  <div class="form-check mb-0" :class="props.topclass">
    <input
      :id="String(props.id)"
      v-model="model"
      class="form-check-input shadow-none border-secondary"
      type="checkbox"
      v-bind="$attrs" />
    <label v-if="props.label" class="form-check-label" :for="String(props.id)">{{ props.label }}</label>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: "Checkbox", inheritAttrs: false });

interface CheckboxProps {
  id?: string | number;
  label?: string;
  topclass?: string;
}

const props = defineProps<CheckboxProps>();

type CheckboxModel = boolean | Array<string | number>;

const model = defineModel<CheckboxModel>({ default: false });
</script>

<style lang="scss" scoped></style>
