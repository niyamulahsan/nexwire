<template>
  <router-view />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useAdminUiStore } from "@/stores/admin-ui";

const ui = useAdminUiStore();

onMounted(() => {
  ui.initTheme();
});

onBeforeUnmount(() => {
  ui.cleanupTheme();
});
</script>

<style scoped></style>
