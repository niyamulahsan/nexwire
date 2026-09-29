<template>
  <div :class="topclass">
    <div class="position-relative">
      <label :for="inputId" class="d-flex align-items-center" :class="{ 'd-none': !inputLabel }">
        <div class="position-relative">
          <span class="text-capitalize mb-1" v-html="inputLabel"></span>
          <span
            class="position-absolute text-danger rounded-circle bg-danger must"
            :class="{ 'd-none': !props.must }"></span>
        </div>
        <div
          class="text-end ms-auto text-primary align-self-center"
          :class="{ 'd-none': !props.hood }"
          style="font-size: 12px; margin-top: 0.15rem"
          v-html="hoodHtml"></div>
      </label>

      <div class="input-group mb-3">
        <input
          ref="inputRef"
          class="form-control border-0"
          :type="showPassword ? 'text' : 'password'"
          :value="props.modelValue"
          :maxlength="maxLengthAttr"
          :readonly="props.readonly"
          v-bind="$attrs"
          @input="updateModel" />
        <button
          class="input-group-text p-0 border-0 border-start border-1 position-relative z-1"
          type="button"
          @click="togglePassword">
          <i
            class="py-2 px-3"
            :class="showPassword ? 'bi bi-eye' : 'bi bi-eye-slash'"
            style="font-size: 15px"></i>
        </button>
      </div>
      <!-- <input class="form-control" v-model="model" :maxlength="max" v-bind="$attrs"> vue3.3 (2nd way)/3.4 -->
      <div
        class="position-absolute bottom-0 end-0 pe-1 text-secondary max"
        :class="{ 'd-none': !max }">
        {{ maxCounter }}
      </div>
    </div>
    <div
      :id="`${inputId}Help`"
      class="form-text mt-1 text-danger"
      :class="{ 'd-none': !props.err }">
      {{ props.err }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useAttrs } from "vue";
import { browserDetect } from "@/plugins/browserDetect";

defineOptions({ name: "InputPasswordToggle", inheritAttrs: false });
const { isFirefox } = browserDetect;

const $attrs = useAttrs();
const inputRef = ref<HTMLInputElement | null>(null);
type InputPasswordCategory =
  | "number"
  | "decimal"
  | "mobile"
  | "tax-period"
  | "bin"
  | "challan-number"
  | string;

interface InputPasswordProps {
  focus?: boolean;
  must?: boolean;
  err?: string | boolean;
  modelValue?: string | number;
  category?: InputPasswordCategory;
  hood?: string | boolean | number;
  readonly?: boolean;
}

const props = withDefaults(defineProps<InputPasswordProps>(), {
  err: false,
  modelValue: ""
});

const topclass = computed(() => ($attrs.topclass as string | undefined) || "mb-3");
const inputId = computed(() => ($attrs.id as string | undefined) || "");
const inputLabel = computed(() => ($attrs.label as string | undefined) || "");
const inputType = computed(() => ($attrs.type as string | undefined) || "text");

const max = computed<number | null>(() => {
  const raw = $attrs.maxlength as string | number | undefined;
  return raw != null ? Number(raw) : null;
});
const maxLengthAttr = computed<number | undefined>(() => max.value ?? undefined);

const hoodHtml = computed(() =>
  props.hood === false || props.hood == null ? "" : String(props.hood)
);

const maxCounter = computed(() => {
  if (max.value == null) {
    return "";
  }

  if (!isFirefox && inputType.value === "month") {
    return "";
  }

  return max.value - String(props.modelValue).length;
});

const emit = defineEmits<(event: "update:modelValue", value: string | number) => void>();
const updateModel = (e: Event) => {
  const target = e.target as HTMLInputElement;

  if (props.category === "number") {
    emit("update:modelValue", (target.value = target.value.replace(/[^\d]/gi, "")));
  } else if (props.category === "decimal") {
    let val = target.value.replace(/[^\d.]/g, "");
    const parts = val.split(".");
    val = parts[0];
    if (parts.length > 1) {
      val += `.${parts.slice(1).join("")}`;
    }
    emit("update:modelValue", (target.value = val));
  } else if (props.category === "mobile") {
    let digits = target.value.replace(/[^\d]/g, ""); // only digits
    let val = digits;
    if (target.value.includes("+")) {
      val = `+${digits}`;
    }
    emit("update:modelValue", (target.value = val));
  } else if (props.category === "tax-period") {
    let val = target.value.replace(/[^\d-]/g, ""); // Only numbers and hyphen
    val = val.replace(/-/g, ""); // Remove all hyphens
    val = val.slice(0, 6); // Only 6 digits (YYYYMM)

    if (val.length > 4) {
      let year = val.slice(0, 4);
      let month = val.slice(4, 6);

      // Only correct if both month digits entered
      if (month.length === 2) {
        let m = parseInt(month, 10);
        // Clamp month between 1 and 12
        if (m < 1) m = 1;
        if (m > 12) m = 12;
        // Always pad to 2 digits
        month = m.toString().padStart(2, "0");
      }

      val = `${year}-${month}`;
    }

    emit("update:modelValue", (target.value = val));
  } else if (props.category === "bin") {
    let digits = target.value.replace(/[^\d]/g, "");
    digits = digits.slice(0, 14);
    let formatted = digits;
    if (digits.length > 9) {
      formatted = `${digits.slice(0, 9)}-${digits.slice(9, 14)}`;
    }
    emit("update:modelValue", (target.value = formatted));
  } else if (props.category === "challan-number") {
    let digits = target.value.replace(/[^\d]/g, "");
    digits = digits.slice(0, 16);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4, 16)}`;
    }
    emit("update:modelValue", (target.value = formatted));
  } else {
    emit("update:modelValue", target.value);
  }
};

const showPassword = ref(false);
const togglePassword = () => (showPassword.value = !showPassword.value);

onMounted(() => {
  const shouldFocus = props.focus !== false && props.focus !== undefined;
  if (!shouldFocus) return;

  nextTick(() => inputRef.value?.focus());
});
</script>

<style lang="scss" scoped>
input {
  border-color: #cccccc;

  &:read-only {
    background-color: #f8f8f8;
  }

  &::placeholder {
    color: #bfbfbf;
  }
}

button:focus-visible {
  border: none;
  box-shadow: none;
}

.form-text {
  font-size: 0.75rem;
}

.must {
  width: 4px;
  height: 4px;
  margin-left: 2px;
  margin-top: 5px;
}

.max {
  font-size: 0.6rem;
}
</style>
