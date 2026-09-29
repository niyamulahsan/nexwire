<template>
  <div :class="wrapperClass">
    <div class="position-relative">
      <div class="position-relative mb-1">
        <span class="text-capitalize" v-html="inputLabel"></span>
        <span
          class="position-absolute text-danger rounded-circle bg-danger must"
          :class="{ 'd-none': !props.must }"></span>
      </div>
      <div class="form-floating h-100">
        <textarea
          :value="props.modelValue"
          class="form-control mb-0 h-100"
          :maxlength="maxLengthAttr"
          :aria-describedby="`${inputId}Help`"
          v-bind="$attrs"
          rows="3"
          @input="updateModel">
        </textarea>
        <label
          :for="inputId"
          class="d-block placeholder-label border-0"
          :class="{ 'd-none': !placeholderText }">
          {{ placeholderText }}
        </label>
      </div>
      <label
        class="position-absolute end-0 pe-1 text-secondary max"
        :class="{ 'd-none': !max }"
        style="top: 28px">
        {{ maxCounter }}
      </label>
    </div>
    <div :id="`${inputId}Help`" class="form-text text-danger" :class="{ 'd-none': !props.err }">
      {{ props.err }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, useAttrs } from "vue";

defineOptions({ name: "TextArea", inheritAttrs: false });

const $attrs = useAttrs();
interface TextAreaProps {
  focus?: boolean;
  must?: boolean;
  err?: string | boolean;
  modelValue?: string | number;
}

const props = withDefaults(defineProps<TextAreaProps>(), {
  modelValue: ""
});

const inputId = computed(() => ($attrs.id as string | undefined) || "");
const inputLabel = computed(() => ($attrs.label as string | undefined) || "");
const placeholderText = computed(() => ($attrs.placeholder as string | undefined) || "");
const topclass = computed(() => ($attrs.topclass as string | undefined) || "");

const wrapperClass = computed(() =>
  topclass.value ? `${topclass.value} position-relative` : "mb-2"
);

const max = computed<number | null>(() => {
  const raw = $attrs.maxlength as string | number | undefined;
  return raw != null ? Number(raw) : null;
});

const maxLengthAttr = computed<number | undefined>(() => max.value ?? undefined);
const maxCounter = computed(() =>
  max.value == null ? "" : max.value - String(props.modelValue).length
);

const emit = defineEmits<(event: "update:modelValue", value: string) => void>();
const updateModel = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  emit("update:modelValue", target.value);
};

onMounted(() => {
  if (!props.focus || !inputId.value) {
    return;
  }

  nextTick(() => {
    const textarea = document.querySelector(`#${inputId.value}`) as HTMLTextAreaElement | null;
    textarea?.focus();
  });
});
</script>

<style lang="scss" scoped>
.form-floating {
  label {
    top: -1px;
    left: 1px;
  }

  textarea:focus+label,
  textarea:not(:placeholder-shown)+label {
    top: -6px;
  }
}

.placeholder-label {
  color: #cccccc !important;
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
