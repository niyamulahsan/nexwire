<template>
  <!-- sidebar start -->
  <div class="sidebar">
    <a
      href="#"
      role="button"
      class="sidebar-toggle card card-body rounded-circle position-absolute top-0 end-0 d-xl-none"
      title="sidebar-toggle"
      @click.prevent="props.onToggleSidebar">
      <i class="bi bi-chevron-left fw-bold"></i>
    </a>

    <div class="app-brand">
      <a href="#" aria-label="logo">
        <img src="@/assets/images/logo.png" alt="nexwire" />
      </a>
    </div>
    <div id="accordion-sidebar" class="accordion accordion-flush">
      <ul class="list-group px-3">
        <li class="list-group-item" :class="{ active: isActive('/') }">
          <router-link to="/">
            <div class="menu-icon">
              <i class="bi bi-house"></i>
            </div>
            <span>Dashboard</span>
          </router-link>
        </li>
        <li class="split-label">
          <span class="text-uppercase">setup</span>
        </li>
        <li class="list-group-item accordion-item">
          <a
            href="#"
            class="accordion-button collapsed"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#flush-collapseOne"
            aria-expanded="false"
            aria-controls="flush-collapseOne">
            <div class="menu-icon">
              <i class="bi bi-shield-check"></i>
            </div>
            <span>Content</span>
          </a>
          <ul
            id="flush-collapseOne"
            class="list-group accordion-collapse collapse"
            data-bs-parent="#accordion-sidebar">
            <li class="list-group-item">
              <a href="#">Posts</a>
            </li>
            <li class="list-group-item">
              <a href="#">Pages</a>
            </li>
            <li class="list-group-item accordion-item">
              <a
                href="#"
                class="accordion-button collapsed"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#flush-collapseTwo"
                aria-expanded="false"
                aria-controls="flush-collapseTwo">
                <span>Media</span>
              </a>
              <ul id="flush-collapseTwo" class="list-group accordion-collapse collapse">
                <li class="list-group-item">
                  <a href="#">Image</a>
                </li>
                <li class="list-group-item active">
                  <a href="#">Audio</a>
                </li>
                <li class="list-group-item accordion-item">
                  <a
                    href="#"
                    class="accordion-button collapsed"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target="#flush-collapseThree"
                    aria-expanded="false"
                    aria-controls="flush-collapseThree">
                    <span>Settings</span>
                  </a>
                  <ul id="flush-collapseThree" class="list-group accordion-collapse collapse">
                    <li class="list-group-item">
                      <a href="#">Users</a>
                    </li>
                    <li class="list-group-item">
                      <a href="#">Roles</a>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </li>
        <li class="list-group-item">
          <a href="#">
            <div class="menu-icon">
              <i class="bi bi-chat"></i>
            </div>
            <span>Comments</span>
          </a>
        </li>
        <li class="list-group-item">
          <a href="#">
            <div class="menu-icon">
              <i class="bi bi-gear"></i>
            </div>
            <span>Tools</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
  <!-- sidebar end -->
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useAdminUiStore } from "@/stores/admin-ui";

const props = defineProps<{ onToggleSidebar: () => void }>();

const ui = useAdminUiStore();
const route = useRoute();

function isActive(path: string) {
  return route.path === path;
}

onMounted(() => ui.initSidebarCollapsePersistence());
onBeforeUnmount(() => ui.cleanupSidebarCollapsePersistence());
</script>

<style lang="scss" scoped></style>
