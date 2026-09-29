<template>
  <div class="float-button position-fixed text-center removeprintarea" :style="floatStyle" v-bind="$attrs">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface FloatButtonProps {
  top?: string;
  right?: string;
  zIndex?: number;
}

const props = withDefaults(defineProps<FloatButtonProps>(), {
  top: "200px",
  right: "0",
  zIndex: 100
});

const floatStyle = computed(() => ({
  top: props.top,
  right: props.right,
  zIndex: props.zIndex
}));
</script>

<style lang="scss" scoped>
.float-button {
  border-radius: 0 5px 5px 5px;
}
</style>
