# Pulse

Pulse is nexwire's realtime event system. It pairs backend `dispatchEvent()` broadcasts with a UI Socket.IO client for live push notifications, presence updates, and collaborative features.

```
Backend                              UI
  │                                      │
  │  dispatchEvent("order.placed",       │
  │    payload, { broadcast: ... })      │
  │  ──────────────────────────────────> │
  │                                      │  pulse.channel("orders")
  │                                      │    .listen("order.placed", fn)
```

## Architecture

| Layer       | Technology                             | Role                                             |
| ----------- | -------------------------------------- | ------------------------------------------------ |
| Server      | Socket.IO (Node.js)                    | Room-based event fan-out                         |
| Transport   | WebSocket (polling fallback)           | Bidirectional realtime communication             |
| Backend API | `dispatchEvent()` + `BroadcastOptions` | Emit events from controllers/jobs                |
| UI client   | `pulse` plugin                         | Subscribe to rooms and listen for events         |
| Auth        | JWT from httpOnly cookie               | Authenticate socket connections and assign rooms |

## Backend: Broadcasting Events

Broadcasting starts on the backend with `dispatchEvent()`. The `broadcast` option controls who receives the event.

### Broadcast Targets

```ts
import { dispatchEvent } from "@/framework/facade.js";

// All connected clients (including guests)
dispatchEvent(
  "system.announcement",
  { message: "Maintenance in 5min" },
  {
    broadcast: { all: true },
  },
);

// All authenticated users
dispatchEvent(
  "user.updated",
  { id: 1 },
  {
    broadcast: { auth: true },
  },
);

// Specific roles
dispatchEvent(
  "admin.alert",
  { severity: "critical" },
  {
    broadcast: { roles: ["admin"] },
  },
);

// Specific users by ID
dispatchEvent(
  "notification.created",
  { title: "New message" },
  {
    broadcast: { users: [42] },
  },
);

// Custom rooms
dispatchEvent(
  "chat.message",
  { text: "Hello" },
  {
    broadcast: { rooms: ["chat:room:general"] },
  },
);

// Combine targets
dispatchEvent(
  "order.placed",
  { orderId: 99 },
  {
    broadcast: { roles: ["admin"], users: [42] },
  },
);
```

### Broadcast + Queue

Broadcast can be combined with a background job:

```ts
dispatchEvent(
  "post.published",
  { postId: 1 },
  {
    queue: "mail", // enqueue email job
    broadcast: { roles: ["admin"] }, // also notify admins in realtime
  },
);
```

### BroadcastOptions Reference

| Option  | Type                   | Description                | Room            |
| ------- | ---------------------- | -------------------------- | --------------- |
| `all`   | `boolean`              | Every connected client     | (global emit)   |
| `auth`  | `boolean`              | All authenticated users    | `"auth"`        |
| `roles` | `string[]`             | Users with a specific role | `"role:{name}"` |
| `users` | `(number \| string)[]` | Specific users by ID       | `"user:{id}"`   |
| `rooms` | `string[]`             | Arbitrary custom rooms     | `"{name}"`      |

## Backend: Event Jobs + Broadcast

The most powerful pattern is broadcasting from within a queue job — for example, after sending an email:

```ts
// jobs/registeruser.ts
shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, userId } = job.data;

  await mail.sendMail({ to: email, subject: "Welcome!" });

  // Notify admins
  await dispatchEvent(
    "admin.user.registered",
    { userId, name, email },
    {
      broadcast: { roles: ["admin"] },
    },
  );

  // Notify the user
  await dispatchEvent(
    "user.registered",
    { message: "Welcome!" },
    {
      broadcast: { users: [userId] },
    },
  );
});
```

## UI: Pulse Client

Import and use Pulse from any Vue component:

```ts
import { pulse } from "@/plugins/pulse";
```

### `pulse` API

| Method                | Purpose                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pulse.channel(name)` | Join a Socket.IO room and create a channel for listening. Auto-connects if not connected. Emits `"join"` to the server. |
| `pulse.private(name)` | Shorthand for `pulse.channel("private:{name}")`.                                                                        |
| `pulse.leave(name)`   | Leave a room and remove **all** event listeners registered for that room.                                               |
| `pulse.connect()`     | Manually connect the socket (usually not needed — `channel()` auto-connects).                                           |
| `pulse.disconnect()`  | Disconnect the socket entirely.                                                                                         |

### `channel` API

```ts
const ch = pulse.channel("orders");
```

| Method                               | Purpose                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `ch.listen(event, callback)`         | Register a listener for a named event. Returns the channel for chaining.         |
| `ch.stopListening(event, callback?)` | Remove a specific listener, or all listeners for the event if no callback given. |

### Basic Usage

```ts
import { pulse } from "@/plugins/pulse";
import { onUnmounted } from "vue";

const ch = pulse.channel("orders");

ch.listen("order.placed", (payload: any) => {
  console.log("New order:", payload.orderId);
  showToast(`Order #${payload.orderId} received`);
});

onUnmounted(() => {
  ch.stopListening("order.placed");
});
```

## Auto-Joined Rooms vs Custom Rooms

The server assigns every authenticated socket to several rooms automatically at connection time:

| Room            | Pattern        | Who gets it             |
| --------------- | -------------- | ----------------------- |
| `"auth"`        | `"auth"`       | All authenticated users |
| `"user:{id}"`   | `"user:42"`    | That specific user      |
| `"role:{name}"` | `"role:admin"` | Users with that role    |
| `"guest"`       | `"guest"`      | Unauthenticated users   |

This means `pulse.channel("user:42")` is **redundant** — the socket is already in that room. You can listen directly:

```ts
// Works fine — socket is already in "user:42"
import { pulse } from "@/plugins/pulse";

// pulse.channel(...) is not needed for auto-joined rooms,
// but listen() still works because the socket is already there
```

Custom rooms (like `"orders"`, `"chat:room:1"`) **must** be joined explicitly via `pulse.channel()`:

```ts
// Custom room — channel() is required
const ch = pulse.channel("orders");
ch.listen("order.placed", handler);
```

### When to use `channel()` vs direct listen

| Scenario                    | Room type                    | Approach                                     |
| --------------------------- | ---------------------------- | -------------------------------------------- |
| User-specific notifications | `user:{id}` (auto-joined)    | Can listen directly, `channel()` is optional |
| Role-wide announcements     | `role:admin` (auto-joined)   | Can listen directly, `channel()` is optional |
| Custom feature rooms        | `"orders"` (not auto-joined) | **Must** use `channel()` to join             |
| Private user rooms          | `"private:chat:{id}"`        | **Must** use `private()` or `channel()`      |

## Room Strategy Reference

The bridge between UI and backend is the room name:

```
Backend dispatchEvent                    UI channel
─────────────────────                    ────────────────
broadcast: { users: [42] }       <──>    pulse.channel("user:42")
broadcast: { roles: ["admin"] }  <──>    pulse.channel("role:admin")
broadcast: { auth: true }        <──>    (socket already in "auth")
broadcast: { rooms: ["orders"] } <──>    pulse.channel("orders")
broadcast: { all: true }         <──>    (global emit — no room needed)
```

## Lifecycle Management

### Connection

Pulse auto-connects the Socket.IO socket on the first `channel()` call. You can also connect explicitly:

```ts
pulse.connect(); // optional — channel() does this automatically
```

### Reconnection

Socket.IO reconnects automatically on disconnect. Pulse re-joins all previously joined rooms on reconnect via the `"connect"` event handler.

### Cleanup

Always clean up listeners when a component unmounts:

```ts
import { onUnmounted } from "vue";
import { pulse } from "@/plugins/pulse";

const ch = pulse.channel("orders");
ch.listen("order.placed", handler);

onUnmounted(() => {
  ch.stopListening("order.placed");
  pulse.leave("orders"); // optional — removes all listeners for the room
});
```

### Disconnect

```ts
pulse.disconnect(); // close the socket entirely
```

## Graceful Degradation

When `SOCKET=false` in `.env`, Pulse returns a no-op implementation on the UI, and the backend Socket.IO server does not start:

```ts
pulse.channel("orders").listen("event", fn); // silent no-op
pulse.connect(); // silent no-op
```

Your code never needs to check `if (SOCKET)` — Pulse handles it internally.

## Complete Example: Dashboard with Realtime Updates

Since the auth store bootstraps asynchronously, use `onMounted` to ensure the user is loaded before joining the channel:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useHead } from "@vueuse/head";
import { pulse } from "@/plugins/pulse";
import { useAuthStore } from "@/stores/auth";

useHead({ title: "Dashboard" });

const authStore = useAuthStore();
let ch: ReturnType<typeof pulse.channel> | null = null;

onMounted(() => {
  if (!authStore.user?.id) return;

  ch = pulse.channel(`user:${authStore.user.id}`);
  ch.listen("user.registered", (payload: any) => {
    console.log("User registered:", payload);
  });
});

onUnmounted(() => {
  ch?.stopListening("user.registered");
});
</script>
```

## Complete Example: Chat

```vue
<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { pulse } from "@/plugins/pulse";
import { useGumForm } from "@/plugins/gum";

const roomId = "chat:general";
const messages = ref<string[]>([]);

const form = useGumForm({ message: "" });

const ch = pulse.channel(roomId);
ch.listen("chat.message", (payload: any) => {
  messages.value.push(payload.text);
});

async function send() {
  await form.post(
    "/api/chat/send",
    {
      room: roomId,
      message: form.data.message,
    },
    {
      onSuccess: () => form.reset(),
    },
  );
}

onUnmounted(() => {
  ch.stopListening("chat.message");
  pulse.leave(roomId);
});
</script>

<template>
  <div>
    <div v-for="msg in messages" :key="msg">{{ msg }}</div>
    <form @submit.prevent="send">
      <input v-model="form.data.message" />
      <button type="submit" :disabled="form.processing">Send</button>
    </form>
  </div>
</template>
```

## Event Delivery Flow

```
Controller / Job
  │
  ├─ dispatchEvent("order.placed", payload, { broadcast: { roles: ["admin"] } })
  │
  ▼
broadcast.ts
  │
  ├─ io.to("role:admin").emit("order.placed", payload)
  │
  ▼
Socket.IO delivers to all clients in "role:admin" room
  │
  ▼
pulse channel listener fires:
  pulse.channel("role:admin").listen("order.placed", fn)
```

## Env Variables

Pulse uses the general Redis and Socket configuration from `env.ts`:

| Variable       | Default                  | Description                                                                   |
| -------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `SOCKET`       | `false`                  | Enable/disable Socket.IO on both backend and UI                               |
| `APP_URL`      | (required)               | CORS origin for Socket.IO                                                     |
| `FRONTEND_URL` | optional                 | Additional CORS origin                                                        |
| `REDIS`        | `false`                  | Enable Redis adapter for multi-process broadcasting                           |
| `REDIS_URL`    | `redis://127.0.0.1:6379` | Redis connection (shared across all Redis features)                           |
| `REDIS_PREFIX` | `nexwire`                 | Prefix for Redis pub/sub broadcast channel (shared across all Redis features) |
