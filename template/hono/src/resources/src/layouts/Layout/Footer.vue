<template>
  <!-- footer start -->
  <footer
    class="d-flex flex-column flex-sm-row row-gap-2 align-items-center justify-content-center justify-content-sm-between py-3 fst-italic">
    <div class="text-secondary">
      © nexwire {{ startYear }} - {{ currentYear }} ❤️ created by
      <a href="#" target="_blank" class="text-decoration-none">niYam</a>
    </div>
    <div class="d-block">
      <a href="#" target="_blank" class="text-decoration-none me-2">About</a>
      <a href="#" target="_blank" class="text-decoration-none me-2">Support</a>
      <a href="#" target="_blank" class="text-decoration-none me-2">Contact Us</a>
    </div>
  </footer>
  <!-- footer end -->
</template>

<script setup lang="ts">
const startYear: number = 2026;
const currentYear: number = new Date().getFullYear();
</script>

<style scoped></style>
