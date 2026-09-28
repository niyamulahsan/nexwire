<template>
  <div class="h-100" v-bind="$attrs">
    <div class="h-100 d-flex align-items-center justify-content-center">
      <div class="spinner-grow" :style="spinnerStyle" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <div class="fw-bold ms-2">
        <span v-if="props.text" :class="props.textsize" :style="textStyle">
          {{ props.text }}
        </span>
        <span v-else>Loading...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

defineOptions({ name: "Spinner", inheritAttrs: false });

interface SpinnerProps {
  size?: string;
  text?: string;
  textsize?: string;
}

const props = withDefaults(defineProps<SpinnerProps>(), {
  size: "3rem",
  text: "",
  textsize: ""
});

const spinnerStyle = computed(() => ({
  width: props.size,
  height: props.size
}));

const textStyle = computed(() => ({
  fontSize: props.textsize || undefined
}));
</script>
