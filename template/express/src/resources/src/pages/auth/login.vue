<template>
  <div class="container position-absolute start-50 top-50 translate-middle">
    <div class="auth col-12 col-sm-9 col-md-7 col-lg-5 col-xl-4 mx-auto py-5">
      <div class="card card-body border-0">
        <div class="d-block mb-2 text-center">
          <img src="@/assets/images/logo.png" alt="nexwire" style="max-height: 60px;" />
        </div>
        <p v-if="errorMessage" class="text-center alert alert-danger text-danger py-1 mt-2">
          {{ errorMessage }}
        </p>
        <form @submit.prevent="onSubmit">
          <div class="mb-4">
            <Input
              id="email"
              v-model="form.data.email"
              type="email"
              label="email"
              placeholder="Enter your email..."
              :err="form.errors.email"
              focus
              must />
          </div>
          <div class="mb-4">
            <input-password-toggle
              id="password"
              v-model="form.data.password"
              label="password"
              placeholder="Enter your password..."
              :err="form.errors.password"
              must />
          </div>
          <div class="mb-4 d-flex align-items-center justify-content-between">
            <Checkbox id="remember-me" v-model="form.data.remember" label="Remember me" />
            <router-link to="/forget-password" class="text-decoration-none mb-1">Forget
              Password?</router-link>
          </div>
          <Button type="submit" class="btn btn-primary w-100" label="Login"
            icon="bi bi-box-arrow-in-right" :disabled="processing" />
          <div class="text-center mt-3">
            <span class="text-muted">Don't have an account?</span>
            <router-link to="/register" class="ms-1 text-decoration-none">Register</router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useHead } from "@vueuse/head";
import { ref } from "vue";
import { useRouter } from "vue-router";
import Button from "@/components/Button.vue";
import Checkbox from "@/components/Checkbox.vue";
import Input from "@/components/Input.vue";
import InputPasswordToggle from "@/components/InputPasswordToggle.vue";
import { useGumForm } from "@/plugins/gum";
import { useAuthStore } from "@/stores/auth";

useHead({ title: "Login" });

const router = useRouter();
const auth = useAuthStore();
const errorMessage = ref("");

const form = useGumForm({
  email: "",
  password: "",
  remember: false
});

const processing = form.processing;

const onSubmit = async () => {
  errorMessage.value = "";
  await form.post(
    "/api/auth/login",
    {
      email: String(form.data.email || "").trim(),
      password: form.data.password,
      remember: !!form.data.remember
    },
    {
      onSuccess: async () => {
        auth.initialized = false;
        await auth.bootstrap();
        form.reset("password");
        await router.push("/");
      },
      onError: (_errors, error) => {
        errorMessage.value = error instanceof Error ? error.message : "Unable to login right now";
        form.reset("password");
      }
    }
  );
};
</script>

<style lang="scss" scoped></style>
