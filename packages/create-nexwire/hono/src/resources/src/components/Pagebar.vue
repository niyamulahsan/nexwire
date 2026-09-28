<template>
  <Teleport v-if="target" :to="target">
    <p v-if="props.title && !$slots.default" class="m-0 fs-4">{{ props.title }}</p>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref, useSlots } from "vue";

defineOptions({ name: "PageBar", inheritAttrs: false });

interface PageBarProps {
  title?: string;
}

const props = defineProps<PageBarProps>();
const slots = useSlots();

const target = ref<HTMLElement | null>(null);

onMounted(() => {
  target.value = document.getElementById("pagebar");
});
</script>

<style lang="scss" scoped></style>
