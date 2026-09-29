<template>
  <div :class="topclass">
    <div class="position-relative">
      <label
        :for="inputId"
        class="d-flex align-items-center mb-1"
        :class="{ 'd-none': !inputLabel }">
        <div class="position-relative">
          <span class="text-capitalize" v-html="inputLabel"></span>
          <span
            class="position-absolute text-danger rounded-circle bg-danger must"
            :class="{ 'd-none': !props.must }"></span>
        </div>
        <div
          class="text-end ms-auto text-primary fw-semibold"
          :class="{ 'd-none': !props.hood }"
          style="font-size: 12px; margin-top: 0.15rem"
          v-html="hoodHtml"></div>
      </label>
      <input
        ref="inputRef"
        class="form-control"
        :value="props.modelValue"
        :maxlength="maxLengthAttr"
        :readonly="props.readonly"
        v-bind="$attrs"
        :autocomplete="inputAutocomplete"
        @input="updateModel" />
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

const { isFirefox } = browserDetect;

const $attrs = useAttrs();
const inputRef = ref<HTMLInputElement | null>(null);
type InputCategory =
  | "number"
  | "decimal"
  | "+decimal-"
  | "mobile"
  | "tax-period"
  | "bin"
  | "challan-number"
  | string;

interface InputProps {
  focus?: boolean;
  must?: boolean;
  err?: string | boolean;
  modelValue?: string | number;
  category?: InputCategory;
  hood?: string | boolean | number;
  readonly?: boolean;
}

const props = withDefaults(defineProps<InputProps>(), {
  err: false,
  modelValue: ""
});

const topclass = computed(() => ($attrs.topclass as string | undefined) || "mb-2");
const inputId = computed(() => ($attrs.id as string | undefined) || "");
const inputLabel = computed(() => ($attrs.label as string | undefined) || "");
const inputType = computed(() => ($attrs.type as string | undefined) || "text");

const max = computed<number | null>(() => {
  const raw = $attrs.maxlength as string | number | undefined;
  return raw != null ? Number(raw) : null;
});

const inputAutocomplete = computed(() => {
  const attrAutocomplete = $attrs.autocomplete as string | undefined;
  if (attrAutocomplete) {
    return attrAutocomplete;
  }
  return ["number", "decimal"].includes(props.category ?? "") ? "off" : "on";
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
    let val = target.value;

    // Remove everything except digits, decimal point, and minus sign
    val = val.replace(/[^0-9.]/g, "");

    // Allow only one decimal point
    const parts = val.split(".");
    if (parts.length > 2) {
      val = `${parts[0]}.${parts.slice(1).join("")}`;
    }

    emit("update:modelValue", (target.value = val));
  } else if (props.category === "+decimal-") {
    let val = target.value;

    // Remove everything except digits, decimal point, and minus sign
    val = val.replace(/[^0-9.-]/g, ""); // if need minus sign

    // Move minus sign to the front if it exists anywhere
    const isNegative = val.includes("-");
    val = val.replace(/-/g, ""); // remove all minus signs
    if (isNegative) {
      val = `-${val}`;
    }

    // Allow only one decimal point
    const parts = val.split(".");
    if (parts.length > 2) {
      val = `${parts[0]}.${parts.slice(1).join("")}`;
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
  } else if (props.category === 'echallan-number') {
    // Format: V + 9 digits (V000517226)
    let raw = (target.value || '').toUpperCase();

    // keep only digits, but allow V (we’ll force V at start)
    let digits = raw.replace(/[^\d]/g, '').slice(0, 9);

    // always prefix V
    let formatted = 'V' + digits;

    emit('update:modelValue', (target.value = formatted));

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

onMounted(() => {
  const shouldFocus = props.focus !== false && props.focus !== undefined;
  if (!shouldFocus) return;

  nextTick(() => inputRef.value?.focus());
});
</script>

<style lang="scss" scoped>
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
