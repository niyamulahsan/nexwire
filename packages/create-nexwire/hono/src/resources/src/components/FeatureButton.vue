<template></template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, useAttrs, useSlots } from "vue";

defineOptions({ name: "FeatureButton", inheritAttrs: false });

const props = defineProps<{
  icon?: string;
  label?: string;
  title?: string;
  buttonClass?: any;
}>();

const emit = defineEmits<(e: "click") => void>();

interface ButtonEntry {
  id: symbol;
  icon?: string;
  label: string;
  title: string;
  attrs?: Record<string, string>;
  class?: any;
  onClick: () => void;
  render?: () => any[];
}

const featureButtons = inject<ButtonEntry[]>("featureButtons")!;
const slots = useSlots();
const fallthroughAttrs = useAttrs();

const id = Symbol();

onMounted(() => {
  featureButtons.push({
    id,
    icon: props.icon,
    label: props.label ?? "",
    title: props.title ?? props.label ?? "",
    attrs: fallthroughAttrs as any,
    class: props.buttonClass,
    onClick: () => emit("click"),
    render: slots.default || undefined
  });
});

onBeforeUnmount(() => {
  const index = featureButtons.findIndex((b) => b.id === id);
  if (index !== -1) featureButtons.splice(index, 1);
});
</script>

<style lang="scss" scoped></style>
