<template>
  <Teleport v-if="target" :to="target">
    <slot />
  </Teleport>
</template>

<script setup>
import { onMounted, ref } from "vue";

defineOptions({ name: "Refresh", inheritAttrs: false });

const target = ref(null);
onMounted(() => {
  // grab the header container once it's in the DOM
  target.value = document.getElementById("refresh");
});
</script>

<style lang="scss" scoped></style>
