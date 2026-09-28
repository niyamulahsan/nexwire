<template>
  <div class="skeleton card border">
    <div class="card-header border-bottom-0 pb-0 px-2 px-sm-3">
      <div class="row align-items-center">
        <div class="col-12 col-sm-6 col-lg-3 col-xl-3 mb-2 mb-lg-0 d-flex">
          <div class="py-2 rounded-1 border bg-custom ps-3 me-2"></div>
          <div class="form-control py-2 bg-custom"></div>
        </div>
        <div class="col-12 col-sm-6 col-lg-4 col-xl-5 mb-2 mb-lg-0">
          <slot name="extra-option"></slot>
        </div>
        <div class="col-12 col-lg-5 col-xl-4">
          <div class="row gx-1">
            <div class="col-2 col-sm-4 col-md-6 col-lg-2 text-start text-lg-end">
              <span class="form-control py-2 bg-custom"></span>
            </div>
            <div class="mb-2 mb-sm-0 text-start col-6 col-sm-6 col-md-4 col-lg-7">
              <span class="form-control py-2 bg-custom"></span>
            </div>
            <div class="col-4 col-sm-2 col-md-2 col-lg-3 text-end">
              <span class="bg-custom form-control py-2"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card-body py-3 px-2 px-sm-3">
      <div class="table-responsive rounded-1">
        <table class="table table-bordered table-striped table-sm align-middle m-0">
          <thead>
            <tr>
              <th v-for="dt in colCount" :key="`h-${dt}`" class="bg-custom py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rowCount" :key="`r-${r}`">
              <td v-for="c in colCount" :key="`c-${r}-${c}`" class="bg-custom py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card-footer border-top-0 pt-0 px-2 px-sm-3">
      <div class="row align-items-center">
        <div class="col-12 col-md-5 mb-2 mb-md-0"></div>
        <div class="col-12 col-md-7 text-center text-md-end">
          <span class="form-control bg-custom py-2"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const $attrs = useAttrs();
const colCount = computed(() => Number($attrs.col ?? 1));
const rowCount = computed(() => Number($attrs.row ?? 1));
</script>

<style lang="scss" scoped>
table,
tr,
th,
td {
  border-color: #cccccc;
  animation: anim 3s infinite;
}

.bg-custom {
  animation: anim 3s infinite;
}

@keyframes anim {
  0% {
    background-color: #efefef;
  }

  25% {
    background-color: #f8f8f8;
  }

  50% {
    background-color: #efefef;
  }

  75% {
    background-color: #f8f8f8;
  }

  100% {
    background-color: #efefef;
  }
}
</style>
