<template>
  <header :class="{ scrolled: isScrolled }">
    <nav class="navbar bg-transparent p-0">
      <div class="container-fluid p-0 row-gap-2 column-gap-1">
        <button
          id="off-canvas"
          type="button"
          class="nav-btn order-0"
          title="Toggle Button"
          @click="props.onToggleSidebar">
          <i class="bi bi-layout-text-sidebar-reverse"></i>
        </button>
        <div id="pagebar" class="card card-body nav-card order-5 order-sm-2"></div>
        <template v-for="btn in featureButtons" :key="btn.id">
          <button v-if="!btn.render" type="button" class="nav-btn order-3 order-sm-3" :class="btn.class" :title="btn.title || undefined" :aria-label="btn.label || 'button'" v-bind="btn.attrs" @click="btn.onClick">
            <i v-if="btn.icon" :class="btn.icon"></i>
            <span v-if="btn.label" class="ms-1">{{ btn.label }}</span>
          </button>
          <template v-else>
            <component :is="featureComponent(btn)" />
          </template>
        </template>
        <div class="btn-group order-4 order-sm-4">
          <button type="button" class="nav-btn w-100" title="user" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false" aria-label="button">
            <i class="bi bi-person-circle"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li>
              <a class="dropdown-item" href="#">
                <div class="d-flex align-items-center">
                  <div class="flex-shrink-0 me-3">
                    <i class="bi bi-person-circle fs-1"></i>
                  </div>
                  <div class="flex-grow-1 text-capitalize">
                    <h6 class="mb-0">{{ authUser?.name }}</h6>
                    <small class="text-muted">{{ authUser.role?.name }}</small>
                  </div>
                </div>
              </a>
            </li>
            <li>
              <div class="dropdown-divider my-1"></div>
            </li>
            <li>
              <router-link class="dropdown-item" to="/profile">
                <i class="bi bi-person-check me-3"></i><span>My Profile</span>
              </router-link>
            </li>
            <li>
              <button type="button" class="dropdown-item" @click="props.onLogout">
                <i class="bi bi-power me-3"></i><span>Log Out</span>
              </button>
            </li>
          </ul>
        </div>
        <button id="theme-switch" type="button" title="theme" class="nav-btn order-1 order-sm-5" aria-label="button" @click="props.onToggleTheme">
          <i :class="themeIconClass"></i>
        </button>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed, h, inject } from "vue";
import { authUser } from "@/composables/useAuth";

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

function featureComponent(btn: ButtonEntry) {
  return {
    name: "FeatureSlot",
    render: () => h("div", { class: ["order-3 order-sm-4", btn.class] }, btn.render!())
  };
}

interface HeaderProps {
  isScrolled: boolean;
  themeMode: "light" | "dark" | "auto";
  onLogout: () => void | Promise<void>;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
}

const props = defineProps<HeaderProps>();

const themeIconClass = computed(() => {
  if (props.themeMode === "light") return "bi bi-brightness-high-fill";
  if (props.themeMode === "dark") return "bi bi-moon-stars";
  return "bi bi-circle-half";
});
</script>

<style lang="scss" scoped></style>
