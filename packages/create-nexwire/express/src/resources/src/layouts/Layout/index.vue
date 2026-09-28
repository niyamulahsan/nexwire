<template>
  <Sidebar :class="{ tgl: sidebarOpen }" :on-toggle-sidebar="ui.toggleSidebar" />
  <!-- main start -->
  <div class="main" :class="{ tgl: sidebarOpen, 'no-transition': disableTransition }">
    <div class="content-wrapper container-xxl px-0">
      <Header
        :is-scrolled="headerScrolled"
        :theme-mode="themeMode"
        :on-logout="logout"
        :on-toggle-sidebar="ui.toggleSidebar"
        :on-toggle-theme="ui.cycleTheme" />
      <!-- content start -->
      <div class="content">
        <router-view />
      </div>
      <!-- content end -->
      <Footer />
    </div>
  </div>
  <!-- main end -->
  <div class="backdrop" :class="{ 'off-canvas': sidebarOpen }" @click="ui.toggleSidebar"></div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, provide, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import Footer from "@/layouts/Layout/Footer.vue";
import Header from "@/layouts/Layout/Header.vue";
import Sidebar from "@/layouts/Layout/Sidebar.vue";
import { useAdminUiStore } from "@/stores/admin-ui";
import { useAuthStore } from "@/stores/auth";

const ui = useAdminUiStore();
const auth = useAuthStore();
const router = useRouter();
const { themeMode, sidebarOpen } = storeToRefs(ui);
const headerScrolled = ref(false);
const disableTransition = ref(true);
const featureButtons = reactive<
  Array<{
    id: symbol;
    icon?: string;
    label: string;
    title: string;
    attrs?: Record<string, string>;
    onClick: () => void;
  }>
>([]);
provide("featureButtons", featureButtons);

async function logout() {
  await auth.logout();
  await router.push("/login");
}

function onScroll() {
  const y = window.scrollY;
  if (y > 20) {
    headerScrolled.value = true;
  } else if (y < 5) {
    headerScrolled.value = false;
  }
}

onMounted(() => {
  ui.initTheme();

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Force reflow then enable transitions on next frame
  void document.body.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      disableTransition.value = false;
    });
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  ui.cleanupTheme();
});
</script>

<style scoped></style>
