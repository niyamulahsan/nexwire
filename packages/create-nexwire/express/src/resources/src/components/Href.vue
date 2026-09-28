<template>
  <a :href="String(props.to)" class="d-flex align-items-center" v-bind="$attrs">
    <slot v-if="hasDefaultSlot"></slot>
    <template v-else>
      <span v-if="props.label" class="text-capitalize" :class="{ 'me-1': props.icon }">{{
        props.label
      }}</span>
      <span v-if="props.icon"><i :class="props.icon"></i></span>
    </template>
  </a>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";

interface HrefProps {
  label?: string;
  icon?: string;
  to?: string | number;
}

defineOptions({ name: "Href", inheritAttrs: false });

const slots = useSlots();
const props = withDefaults(defineProps<HrefProps>(), {
  to: "#"
});

const hasDefaultSlot = computed(() => Boolean(slots.default?.().length));
</script>

<style lang="scss" scoped></style>
