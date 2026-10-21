# Notifications

## Overview

The notification system is a backend module with real-time support via Socket.IO. The CLI generates only the backend (controllers, routes, job). UI integration is manual — see the Vue guide below or build your own components for React, Svelte, Solid, Astro, etc.

## CLI Commands

### Create

::: code-group

```bash [npm]
npm run maker module:make-notification notification
```

```bash [pnpm]
pnpm maker module:make-notification notification
```

```bash [yarn]
yarn maker module:make-notification notification
```

```bash [bun]
bun maker module:make-notification notification
```

:::

Generates the backend module under `src/modules/notification/`:

| File                                     | Purpose                                                      |
| ---------------------------------------- | ------------------------------------------------------------ |
| `controllers/notification.controller.ts` | 5 handlers: list, unreadCount, markRead, markAllRead, remove |
| `controllers/notification.schema.ts`     | Zod/OpenAPI schemas                                          |
| `routes/api.ts`                          | 5 routes under `authMiddleware`                              |
| `jobs/notification.ts`                   | Queue handler for email delivery                             |

### Delete

::: code-group

```bash [npm]
npm run maker module:delete-notification notification --yes
```

```bash [pnpm]
pnpm maker module:delete-notification notification --yes
```

```bash [yarn]
yarn maker module:delete-notification notification --yes
```

```bash [bun]
bun maker module:delete-notification notification --yes
```

:::

Moves the backend module to `src/storage/trash/modules/`. UI files (if any) are user-managed.

### API Routes

All routes are mounted at `/api/notification` behind `authMiddleware`:

| Method   | Path            | Handler                          |
| -------- | --------------- | -------------------------------- |
| `GET`    | `/`             | Paginated list with unread count |
| `GET`    | `/unread-count` | `{ count }`                      |
| `PATCH`  | `/{id}/read`    | Mark single as read              |
| `PATCH`  | `/read-all`     | Mark all as read                 |
| `DELETE` | `/{id}`         | Delete a notification            |

## Database Model

Notifications use a single shared table defined in `src/modules/auth/database/models/notifications.ts`:

| Column       | Type                    | Notes                                 |
| ------------ | ----------------------- | ------------------------------------- |
| `id`         | `INT` PK auto-increment |                                       |
| `user_id`    | `INT` FK → users.id     | Cascade on delete                     |
| `type`       | `VARCHAR(100)`          | `info`, `success`, `warning`, `error` |
| `title`      | `VARCHAR(255)`          | Required                              |
| `body`       | `TEXT`                  | Nullable                              |
| `data`       | `TEXT`                  | JSON string — extra payload           |
| `link`       | `VARCHAR(500)`          | Click-through URL                     |
| `read_at`    | `TIMESTAMP`             | Nullable, set when read               |
| `created_at` | `TIMESTAMP`             | Default now                           |

## The `notify()` Function

Import from the facade:

```ts
import { notify } from "@/framework/facade.js";

// Save to database only
await notify(userId, {
  type: "info",
  title: "Profile Updated",
  body: "Your profile was saved.",
});

// Save + broadcast via Socket.IO in real-time
await notify(userId, {
  type: "success",
  title: "Payment Received",
  body: "$50.00 credited.",
  broadcast: true,
});

// Save + broadcast + send email (queued to "mail" queue)
await notify(userId, {
  type: "warning",
  title: "Password Expiring",
  body: "Change within 7 days.",
  broadcast: true,
  mail: {
    subject: "Password Expiry Notice",
    html: "<p>Your password expires soon.</p>",
  },
});
```

### Options

| Option      | Type      | Default  | Description                                         |
| ----------- | --------- | -------- | --------------------------------------------------- |
| `type`      | `string`  | `"info"` | Category: `info`, `success`, `warning`, `error`     |
| `title`     | `string`  | —        | **Required.** Notification title                    |
| `body`      | `string`  | —        | Notification body text                              |
| `link`      | `string`  | —        | Click-through URL                                   |
| `data`      | `object`  | —        | Arbitrary JSON stored in `data` column              |
| `broadcast` | `boolean` | `false`  | Emit `"notification.created"` via Socket.IO to user |
| `mail`      | `object`  | —        | `{ subject?, html?, to? }` — sends email via mail queue. Recipient resolved via auth provider `getUserContact()`, falls back to default users model, or uses `mail.to` explicitly. |

### Lifecycle

```
notify(userId, { broadcast: true, mail: { ... } })
  │
  ├─ 1. Insert row into notifications table
  │
  ├─ 2. dispatchEvent("notification.created", normalized, {
  │       broadcast: { users: [userId] }
  │     })
  │     └─ Socket.IO emits to room "user:<userId>"
  │
  └─ 3. If mail option:
        └─ dispatchEvent("notification:mail", ..., { queue: "mail" })
            └─ BullMQ Worker sends email
```

## Usage Example: Controller

::: code-group

```ts [Hono]
import type { Handler } from "hono";
import { notify } from "@/framework/facade.js";

export const createComment: Handler = async (c: any) => {
  const { postId, content } = c.req.valid("json");
  const post = await getPost(postId);

  // Notify the post author
  await notify(post.authorId, {
    type: "info",
    title: "New Comment",
    body: `${c.get("auth").name} commented on your post.`,
    link: `/posts/${postId}`,
    broadcast: true,
  });

  return c.json({ message: "Comment created" });
};
```

```ts [Express]
import type { Request, Response } from "express";
import { notify } from "@/framework/facade.js";

export const createComment = async (req: Request, res: Response) => {
  const { postId, content } = req.body;
  const post = await getPost(postId);

  // Notify the post author
  await notify(post.authorId, {
    type: "info",
    title: "New Comment",
    body: `${res.locals.auth.name} commented on your post.`,
    link: `/posts/${postId}`,
    broadcast: true,
  });

  res.json({ message: "Comment created" });
};
```

:::

## `dispatchEvent` vs. `notify`

Both functions can broadcast data to users in real-time, but they serve different purposes.

|                     | `dispatchEvent`                                                                                                     | `notify`                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Persistence**     | No — fire-and-forget signal                                                                                         | Yes — inserts a row into the `notifications` table                                            |
| **Return value**    | `Promise<void>`                                                                                                     | Returns the normalized notification object with `id`, `type`, `title`, `body`, `readAt`, etc. |
| **Broadcast scope** | Flexible — `{ all: true }`, `{ auth: true }`, `{ roles: [] }`, `{ users: [] }`, `{ rooms: [] }`, or any combination | Targeted — always to a single user via `broadcast: { users: [userId] }`                       |
| **Email delivery**  | No — you would need to build the email dispatch yourself                                                            | Built-in — pass `mail: { subject, html }` to queue an email                                   |
| **Queue option**    | Yes — `{ queue: "mail" }` enqueues a background job                                                                 | Uses `dispatchEvent` internally when email is needed                                          |
| **Use case**        | Custom real-time updates (chat messages, live feeds, admin alerts)                                                  | User-visible notifications with persistent history (bell icon, notification page)             |

---

## Vue Integration Guide

::: tip
The CLI only generates backend code. The Vue components below are provided as copy-paste reference. Adapt them to your layout, styling, or component library.
:::

### Step 1: Create the NotificationBell component

Create `src/resources/src/components/NotificationBell.vue`:

```vue
<template>
  <div class="btn-group order-3" ref="dropdownRef">
    <button
      type="button"
      class="nav-btn position-relative"
      data-bs-toggle="dropdown"
      data-bs-display="static"
      aria-expanded="false"
      aria-label="notifications">
      <i class="bi bi-bell"></i>
      <span
        v-if="unread > 0"
        class="badge bg-danger notification-badge position-absolute"
        style="top:7.5%; right: 7.5%;"
        >{{ unread > 99 ? "99+" : unread }}</span
      >
    </button>
    <div class="dropdown-menu notification-dropdown p-0">
      <div
        class="dropdown-header d-flex align-items-center justify-content-between px-3 py-2">
        <span class="fw-semibold">Notifications</span>
        <button
          v-if="unread > 0"
          class="btn btn-sm btn-link p-0 text-decoration-none"
          @click="markAllRead">
          Mark all read
        </button>
      </div>
      <div class="notification-list">
        <div
          v-if="items.length === 0"
          class="text-center text-secondary py-4 px-3">
          No notifications
        </div>
        <div
          v-for="item in items"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.readAt }"
          @click="handleClick(item)">
          <div class="d-flex align-items-start gap-2">
            <i :class="iconClass(item.type)" class="mt-1"></i>
            <div class="flex-grow-1 min-w-0">
              <div class="notification-title">{{ item.title }}</div>
              <div v-if="item.body" class="notification-body">
                {{ item.body }}
              </div>
              <div class="notification-time">{{ timeAgo(item.createdAt) }}</div>
            </div>
          </div>
        </div>
      </div>
      <router-link
        to="/notifications"
        class="dropdown-footer d-block text-center py-2 text-decoration-none">
        View all notifications
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import axios from "@/plugins/axios";
import { pulse } from "@/plugins/pulse";
import { useAuth } from "@/composables/useAuth";

const { user } = useAuth();

const unread = ref(0);
const items = ref<
  Array<{
    id: number;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    readAt: string | null;
    createdAt: string;
  }>
>([]);

function iconClass(type: string) {
  const map: Record<string, string> = {
    info: "bi bi-info-circle text-primary",
    success: "bi bi-check-circle text-success",
    warning: "bi bi-exclamation-triangle text-warning",
    error: "bi bi-x-circle text-danger",
  };
  return map[type] || "bi bi-bell text-secondary";
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function fetchUnread() {
  try {
    const res = await axios.get("/api/notification/unread-count");
    unread.value = res.data.count;
  } catch {}
}

async function fetchRecent() {
  try {
    const res = await axios.get("/api/notification?perPage=5");
    items.value = res.data.data;
    unread.value = res.data.unread;
  } catch {}
}

async function markAllRead() {
  try {
    await axios.patch("/api/notification/read-all");
    items.value.forEach((n) => (n.readAt = new Date().toISOString()));
    unread.value = 0;
  } catch {}
}

function handleClick(item: any) {
  if (!item.readAt) {
    axios.patch(`/api/notification/${item.id}/read`).catch(() => {});
    item.readAt = new Date().toISOString();
    unread.value = Math.max(0, unread.value - 1);
  }
}

let cleanup: (() => void) | null = null;

onMounted(async () => {
  await fetchRecent();

  if (user.value) {
    const channel = pulse.channel(`user:${user.value.id}`);
    channel.listen("notification.created", (payload: any) => {
      items.value.unshift(payload);
      unread.value++;
    });
    cleanup = () => channel.stopListening("notification.created");
  }
});

onUnmounted(() => {
  cleanup?.();
});
</script>

<style scoped>
.notification-badge {
  font-size: 0.6rem;
  padding: 0.15rem 0.35rem;
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 16px;
  border-radius: 8px;
}

.notification-dropdown {
  width: 360px;
  max-height: 480px;
}

@media (max-width: 575.98px) {
  .notification-dropdown {
    position: fixed !important;
    top: 56px;
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: calc(100vw - 32px);
    max-width: 400px;
  }
}

@media (min-width: 576px) {
  .notification-dropdown {
    left: auto !important;
    right: 0 !important;
    transform: none !important;
  }
}

.notification-list {
  max-height: 360px;
  overflow-y: auto;
}

.notification-item {
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid var(--app-border);
  transition: background 0.15s;
}

.notification-item:hover {
  background: var(--app-surface);
}

.notification-item.unread {
  background: rgba(var(--bs-primary-rgb), 0.04);
}

.notification-title {
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.3;
}

.notification-body {
  font-size: 0.8rem;
  color: var(--bs-secondary-color);
  margin-top: 0.15rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-time {
  font-size: 0.7rem;
  color: var(--bs-secondary-color);
  margin-top: 0.2rem;
}

.dropdown-footer {
  font-size: 0.85rem;
  border-top: 1px solid var(--app-border);
}
</style>
```

### Step 2: Add NotificationBell to the header

In `src/resources/src/layouts/Layout/Header.vue`, import the component and place it where you want the bell icon:

```vue
<script setup lang="ts">
import { computed, h, inject } from "vue";
import { authUser } from "@/composables/useAuth";
import NotificationBell from "@/components/NotificationBell.vue";
// ... rest of your imports
</script>
```

Place `<NotificationBell />` in the template before the user dropdown:

```vue
<template>
  <!-- ... other header elements ... -->
  <NotificationBell class="order-3 order-sm-3" />
  <div class="btn-group order-4 order-sm-4">
    <!-- user dropdown -->
  </div>
</template>
```

### Step 3: Create the notifications page

Create `src/resources/src/pages/notifications/index.vue`:

```vue
<template>
  <Pagebar title="Notifications" />
  <Refresh @click="fetchList" />

  <div class="notifications-page">
    <div class="card">
      <div
        class="card-header d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-bell"></i>
          <span class="fw-semibold">All Notifications</span>
          <span v-if="unread > 0" class="badge bg-danger"
            >{{ unread }} unread</span
          >
        </div>
        <div class="d-flex gap-2">
          <button
            v-if="unread > 0"
            class="btn btn-sm btn-outline-primary"
            @click="markAllRead">
            <i class="bi bi-check-all"></i> Mark all read
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border" role="status"></div>
        </div>
        <div
          v-else-if="items.length === 0"
          class="text-center text-secondary py-5">
          <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>
          No notifications yet
        </div>
        <div v-else>
          <div
            v-for="item in items"
            :key="item.id"
            class="notification-row"
            :class="{ unread: !item.readAt }">
            <div class="d-flex align-items-start gap-3 px-3 py-3">
              <i :class="iconClass(item.type)" class="fs-5 mt-1"></i>
              <div class="flex-grow-1 min-w-0">
                <div class="notification-title">{{ item.title }}</div>
                <div v-if="item.body" class="notification-body mt-1">
                  {{ item.body }}
                </div>
                <div class="notification-meta mt-1">
                  <span class="notification-time">{{
                    formatDate(item.createdAt)
                  }}</span>
                </div>
              </div>
              <div class="d-flex gap-1 flex-shrink-0">
                <button
                  v-if="!item.readAt"
                  class="btn btn-sm btn-outline-secondary"
                  title="Mark as read"
                  @click="markRead(item)">
                  <i class="bi bi-check"></i>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger"
                  title="Delete"
                  @click="remove(item)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="total > perPage"
        class="card-footer d-flex justify-content-center">
        <nav>
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item" :class="{ disabled: page <= 1 }">
              <button class="page-link" @click="goPage(page - 1)">
                Previous
              </button>
            </li>
            <li class="page-item" :class="{ disabled: page >= maxPage }">
              <button class="page-link" @click="goPage(page + 1)">Next</button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useHead } from "@vueuse/head";
import axios from "@/plugins/axios";
import { pulse } from "@/plugins/pulse";
import { useAuth } from "@/composables/useAuth";
import Pagebar from "@/components/Pagebar.vue";
import Refresh from "@/components/Refresh.vue";

useHead({ title: "Notifications" });

const { user } = useAuth();

const items = ref<any[]>([]);
const loading = ref(true);
const page = ref(1);
const perPage = ref(20);
const total = ref(0);
const unread = ref(0);

const maxPage = computed(() =>
  Math.max(1, Math.ceil(total.value / perPage.value)),
);

function iconClass(type: string) {
  const map: Record<string, string> = {
    info: "bi bi-info-circle text-primary",
    success: "bi bi-check-circle text-success",
    warning: "bi bi-exclamation-triangle text-warning",
    error: "bi bi-x-circle text-danger",
  };
  return map[type] || "bi bi-bell text-secondary";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

async function fetchList() {
  loading.value = true;
  try {
    const res = await axios.get(
      `/api/notification?page=${page.value}&perPage=${perPage.value}`,
    );
    items.value = res.data.data;
    total.value = res.data.total;
    unread.value = res.data.unread;
  } catch {}
  loading.value = false;
}

async function markRead(item: any) {
  try {
    await axios.patch(`/api/notification/${item.id}/read`);
    item.readAt = new Date().toISOString();
    unread.value = Math.max(0, unread.value - 1);
  } catch {}
}

async function markAllRead() {
  try {
    await axios.patch("/api/notification/read-all");
    items.value.forEach((n) => (n.readAt = new Date().toISOString()));
    unread.value = 0;
  } catch {}
}

async function remove(item: any) {
  try {
    await axios.delete(`/api/notification/${item.id}`);
    items.value = items.value.filter((n) => n.id !== item.id);
    if (!item.readAt) unread.value = Math.max(0, unread.value - 1);
  } catch {}
}

function goPage(p: number) {
  page.value = Math.max(1, Math.min(p, maxPage.value));
  fetchList();
}

let cleanup: (() => void) | null = null;

onMounted(async () => {
  await fetchList();

  if (user.value) {
    const channel = pulse.channel(`user:${user.value.id}`);
    channel.listen("notification.created", (payload: any) => {
      items.value.unshift(payload);
      unread.value++;
    });
    cleanup = () => channel.stopListening("notification.created");
  }
});

onUnmounted(() => {
  cleanup?.();
});
</script>

<style scoped>
.notifications-page {
  padding: 0.5rem;
}

.notification-row {
  border-bottom: 1px solid var(--app-border);
  transition: background 0.15s;
}

.notification-row:hover {
  background: var(--app-surface);
}

.notification-row.unread {
  background: rgba(var(--bs-primary-rgb), 0.04);
}

.notification-title {
  font-weight: 500;
}

.notification-body {
  font-size: 0.9rem;
  color: var(--bs-secondary-color);
}

.notification-time {
  font-size: 0.8rem;
  color: var(--bs-secondary-color);
}

@media (max-width: 768px) {
  .notifications-page {
    padding: 0;
  }
}
</style>
```

### Step 4: Add the route

In `src/resources/src/router/index.ts`, add a child route under the `dashlayout` children array:

```ts
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
    },
    {
      path: "/notifications",
      name: "notifications",
      component: () => import("@/pages/notifications/index.vue"),
      meta: { requiresAuth: true }
    }
  ]
}
```

### Real-time updates

The `NotificationBell.vue` uses Pulse (Socket.IO) to listen for real-time notifications:

```ts
import { pulse } from "@/plugins/pulse";

const channel = pulse.channel(`user:${user.value.id}`);
channel.listen("notification.created", (payload: any) => {
  items.value.unshift(payload); // prepend to dropdown
  unread.value++; // increment badge
});
```

When `notify()` is called with `broadcast: true`, the `"notification.created"` event fires via Socket.IO. The Pulse channel listener picks it up and updates the bell badge and dropdown in real-time — no polling, no page refresh.

---

## Other Frontends

For React, Svelte, Solid, Astro, or any other frontend framework, create equivalent components using the same API endpoints (`/api/notification/*`). The backend is framework-agnostic — all you need is:

- `GET /api/notification` — paginated list
- `GET /api/notification/unread-count` — badge count
- `PATCH /api/notification/{id}/read` — mark as read
- `PATCH /api/notification/read-all` — mark all as read
- `DELETE /api/notification/{id}` — delete

For real-time updates, connect to Socket.IO and listen for the `"notification.created"` event on the `user:{userId}` room.
