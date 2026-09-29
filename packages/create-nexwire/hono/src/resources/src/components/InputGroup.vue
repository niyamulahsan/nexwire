<template>
  <div :class="topclass">
    <div class="position-relative">
      <label
        :for="inputId"
        class="text-capitalize d-flex align-items-center mb-1"
        :class="{ 'd-none': !inputLabel }">
        <div class="position-relative">
          <span class="text-capitalize" v-html="inputLabel"></span>
          <span
            class="position-absolute text-danger rounded-circle bg-danger must"
            :class="{ 'd-none': !props.must }"></span>
        </div>
        <div
          :class="hoodClass"
          style="font-size: 12px; margin-top: 0.15rem"
          v-html="hoodHtml"></div>
      </label>
      <div class="input-group">
        <div class="position-relative" :style="props.half ? 'width: 50%;' : 'width: 35%;'">
          <input
            ref="inputRef"
            :id="inputId"
            type="text"
            class="form-control flex-grow-0 px-1 text-center rounded-0 rounded-start"
            :maxlength="maxLengthAttr"
            :value="props.modelValue"
            v-bind="$attrs"
            @input="updateModel" />
          <div
            class="position-absolute bottom-0 end-0 pe-1 text-secondary max"
            :class="{ 'd-none': !max }">
            {{ maxCounter }}
          </div>
        </div>
        <input
          type="text"
          class="form-control text-center border-start second-input"
          :style="props.half ? 'width: 50%;' : 'width: 62%;'"
          :placeholder="placeholder1"
          :value="props.calcdata"
          readonly />
      </div>
    </div>
    <div :id="`${inputId}Help`" class="form-text text-danger" :class="{ 'd-none': !props.err }">
      {{ props.err }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useAttrs } from "vue";

defineOptions({ name: "InputGroup", inheritAttrs: false });

type InputGroupCategory = "number" | "decimal" | "mobile" | string;

interface InputGroupProps {
  focus?: boolean;
  must?: boolean;
  half?: boolean;
  err?: string | boolean;
  modelValue?: string | number;
  category?: InputGroupCategory;
  calcdata?: string | number;
  hood?: string | number | boolean;
}

const $attrs = useAttrs();
const inputRef = ref<HTMLInputElement | null>(null);
const props = withDefaults(defineProps<InputGroupProps>(), {
  err: false,
  modelValue: "",
  calcdata: ""
});

const topclass = computed(() => ($attrs.topclass as string | undefined) || "mb-3");
const inputId = computed(() => ($attrs.id as string | undefined) || "");
const inputLabel = computed(() => ($attrs.label as string | undefined) || "");
const placeholder1 = computed(() => ($attrs.placeholder1 as string | undefined) || "");

const max = computed<number | null>(() => {
  const raw = $attrs.maxlength as string | number | undefined;
  return raw != null ? Number(raw) : null;
});

const maxLengthAttr = computed<number | undefined>(() => max.value ?? undefined);
const maxCounter = computed(() =>
  max.value == null ? "" : max.value - String(props.modelValue).length
);

const hoodHtml = computed(() =>
  props.hood === false || props.hood == null ? "" : String(props.hood)
);
const hoodClass = computed(() => [
  "text-uppercase w-50 text-end text-primary fw-semibold",
  props.half ? "w-50" : "w-100",
  !props.hood && "d-none"
]);

const emit = defineEmits<(event: "update:modelValue", value: string | number) => void>();

const updateModel = (e: Event) => {
  const target = e.target as HTMLInputElement;

  if (props.category === "number") {
    emit("update:modelValue", (target.value = target.value.replace(/[^\d]/gi, "")));
  } else if (props.category === "decimal") {
    let val = target.value;
    val = val.replace(/[^0-9.]/g, "");

    const parts = val.split(".");
    if (parts.length > 2) {
      val = `${parts[0]}.${parts.slice(1).join("")}`;
    }

    emit("update:modelValue", (target.value = val));
  } else if (props.category === "mobile") {
    const digits = target.value.replace(/[^\d]/g, "");
    let val = digits;
    if (target.value.includes("+")) {
      val = `+${digits}`;
    }
    emit("update:modelValue", (target.value = val));
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
