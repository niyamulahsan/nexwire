# Router

Routes are defined in `src/resources/src/router/index.ts` using Vue Router with `createWebHistory`.

```ts
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
        meta: { requiresAuth: true },
      },
      // Add your authenticated pages here
    ],
  },
  {
    path: "/login",
    name: "authlayout",
    component: () => import("@/layouts/AuthLayout.vue"),
    children: [
      {
        path: "/login",
        name: "login",
        component: () => import("@/pages/auth/login.vue"),
        meta: { guestOnly: true },
      },
      {
        path: "/register",
        name: "register",
        component: () => import("@/pages/auth/register.vue"),
        meta: { guestOnly: true },
      },
      {
        path: "/forget-password",
        name: "forget-password",
        component: () => import("@/pages/auth/forgetPassword.vue"),
        meta: { guestOnly: true },
      },
      {
        path: "/reset-password",
        name: "reset-password",
        component: () => import("@/pages/auth/resetPassword.vue"),
        meta: { guestOnly: true },
      },
      {
        path: "/verify-email",
        name: "verify-email",
        component: () => import("@/pages/auth/verifyEmail.vue"),
        meta: { guestOnly: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, savedPosition) => {
    if (savedPosition) return savedPosition;
    // Query-only changes (search / page / size on the same page) keep the reader
    // where they are; a same-path navigation must not force a jump to the top.
    if (to.path === from.path) return false;
    return { top: 0 };
  },
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
```

### Scroll behavior

On a **path change** the router jumps to the top; on a **query-only change** (the same page with new `?page=`/`?size=`/`?search=`) it leaves the scroll position alone. That second rule is what lets the built-in `DataTable` keep your place while it paginates — without it, every page click would yank the reader back to the top. See [Gum → preserveScroll](/guide/resources/gum) for the component-side half of the same behavior.

## Route structure

Two parent layouts with nested child routes:

- **`dashlayout`** (`/`) — Dashboard layout with Sidebar + Header + Footer, wraps all authenticated pages
- **`authlayout`** (`/login`) — Centered card layout for guest-only auth pages

## Route meta flags

| Flag                 | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `requiresAuth: true` | Redirects to `/login` if unauthenticated  |
| `guestOnly: true`    | Redirects to `/` if already authenticated |

## Auth guard

Every navigation runs `router.beforeEach` which:

1. Calls `auth.bootstrap()` to restore or verify the session
2. Checks `requiresAuth` — redirects to `/login?redirect=<path>` if not authenticated
3. Checks `guestOnly` — redirects to `/` if already authenticated

## Adding a new page

```ts
// Add a route child under "dashlayout"
children: [
  {
    path: "/posts",
    name: "posts",
    component: () => import("@/pages/posts/index.vue"),
    meta: { requiresAuth: true },
  },
];

// Create the page component at src/resources/src/pages/posts/index.vue
```

## Lazy loading

All page components use dynamic `import()` so they are code-split per route by Vite.

## Route progress bar

`setupRouteProgress(router)` adds a thin gradient progress bar at the top of the page that animates on navigation start and completes on navigation end.
