<template>
  <Teleport to="#toast-show">
    <div
      ref="notify"
      class="toast position-fixed"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style="z-index: 1000000; top: 10px; right: 23px"
      data-bs-delay="2000">
      <div :class="`text-bg-${bgcolor} align-items-center rounded-1 shadow-sm`">
        <div class="d-flex">
          <div class="toast-body">
            {{ message }}
          </div>
          <button
            type="button"
            class="btn-close btn-close-white me-2 m-auto"
            data-bs-dismiss="toast"
            aria-label="Close"></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import Toast from "bootstrap/js/dist/toast.js";
import { ref } from "vue";

defineOptions({ name: "Toast", inheritAttrs: false });

interface ToastProps {
  icon?: string;
}

defineProps<ToastProps>();

const notify = ref<HTMLElement | null>(null);
const message = ref("");
const bgcolor = ref("primary");

const toastme = (msg: string, bg: string) => {
  message.value = msg;
  bgcolor.value = bg;
  if (!notify.value) {
    return;
  }
  const toast = Toast.getOrCreateInstance(notify.value);
  toast.show();
};

defineExpose({ toastme });
</script>

<style lang="scss" scoped></style>
