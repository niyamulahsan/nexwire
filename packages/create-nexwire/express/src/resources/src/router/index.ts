import { createRouter, createWebHistory } from "vue-router";
import { setupRouteProgress } from "@/plugins/routeProgress";
import { useAuthStore } from "@/stores/auth";

export const routes = [
  {
    path: "/",
    name: "dashlayout",
    component: () => import("@/layouts/Layout/index.vue"),
    redirect: { path: "/" },
    children: [
      {
        path: "/",
        name: "dashboard",
        component: () => import("@/pages/dashboard/index.vue"),
        meta: { requiresAuth: true }
      }
    ]
  },
  {
    path: "/login",
    name: "authlayout",
    component: () => import("@/layouts/AuthLayout.vue"),
    children: [
      {
        path: "/register",
        name: "register",
        component: () => import("@/pages/auth/register.vue"),
        meta: { guestOnly: true }
      },
      {
        path: "/login",
        name: "login",
        component: () => import("@/pages/auth/login.vue"),
        meta: { guestOnly: true }
      },
      {
        path: "/forget-password",
        name: "forget-password",
        component: () => import("@/pages/auth/forgetPassword.vue"),
        meta: { guestOnly: true }
      },
      {
        path: "/reset-password",
        name: "reset-password",
        component: () => import("@/pages/auth/resetPassword.vue"),
        meta: { guestOnly: true }
      },
      {
        path: "/verify-email",
        name: "verify-email",
        component: () => import("@/pages/auth/verifyEmail.vue"),
        meta: { guestOnly: true }
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (_to, _from, savedPosition) => {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  }
});

setupRouteProgress(router);

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.bootstrap();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { path: "/" };
  }

  return true;
});

export default router;
