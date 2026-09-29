<template>
  <button class="shadow-none" :type="props.type" v-bind="$attrs">
    <slot v-if="hasDefaultSlot"></slot>
    <template v-else>
      <span v-if="props.label" class="text-capitalize" :class="{ 'me-1': props.icon }">
        {{ props.label }}
      </span>
      <span v-if="props.icon"><i :class="props.icon"></i></span>
    </template>
  </button>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";

interface ButtonProps {
  label?: string;
  icon?: string;
  type?: "button" | "submit" | "reset";
}

defineOptions({ name: "Button", inheritAttrs: false });

const slots = useSlots();
const props = withDefaults(defineProps<ButtonProps>(), {
  type: "button"
});

const hasDefaultSlot = computed(() => Boolean(slots.default?.().length));
</script>

<style lang="scss" scoped></style>
