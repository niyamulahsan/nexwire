# Realtime (Socket.IO)

## Overview

**nexwire** integrates **Socket.IO** for realtime, bidirectional communication. The framework auto-joins authenticated sockets to structured rooms based on user identity and roles, making targeted broadcasts simple.

### Dependencies

- **Socket.IO** — WebSocket server with HTTP long-polling fallback
- **Redis adapter** — Optional, for cross-instance broadcasting across multiple server processes

## Environment Variables

| Variable  | Default  | Description                                       |
| --------- | -------- | ------------------------------------------------- |
| `SOCKET`  | `false`  | Enable/disable Socket.IO server entirely          |
| `REDIS`   | `false`  | Enable Redis adapter for multi-instance broadcast |

Set `SOCKET=false` in `.env` to disable all WebSocket functionality. `dispatchEvent()` with `broadcast` options will be a no-op.

## Room Strategy

When a client connects, the `initRealtime()` middleware extracts the JWT from the handshake cookie and joins the socket to rooms automatically:

| Condition                   | Rooms Joined                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| Authenticated               | `"auth"`, `"user:<userId>"`, `"role:<role1>"`, `"role:<role2>"`, ... |
| Unauthenticated             | `"guest"`                                                            |
| Client emits `"join"` event | Any custom room name(s)                                              |

```ts
// Server-side: socket joins these rooms automatically
socket.join("auth");
socket.join("user:42");
socket.join("role:admin");
socket.join("role:user");

// Client-side: join a custom room
socket.emit("join", "room:chat:general");
```

## Broadcasting

### Direct `broadcast()`

Use `broadcast()` directly when you only need to emit a Socket.IO event — no event dispatching, no queue:

```ts
import { broadcast } from "@/framework/facade.js";

// To all connected clients
broadcast("post.published", { postId: 1 }, { all: true });

// To all authenticated users
broadcast("notification.new", payload, { auth: true });

// To specific users
broadcast("user.message", payload, { users: [recipientId] });

// To specific roles
broadcast("admin.alert", payload, { roles: ["admin"] });

// To custom rooms
broadcast("chat.message", payload, { rooms: ["room:chat:general"] });
```

### Via `dispatchEvent()`

Use `dispatchEvent()` when you need to broadcast **and** optionally enqueue a background job at the same time:

```ts
import { dispatchEvent } from "@/framework/facade.js";

// Broadcast only (same as broadcast())
await dispatchEvent("post.published", { postId: 1 }, {
  broadcast: { all: true },
});

// Broadcast + enqueue
await dispatchEvent("post.published", { postId: 1 }, {
  broadcast: { all: true },
  queue: "default",
});
```

## Broadcasting from Queue Handlers

A common pattern: queue a background job, then broadcast the result when the job completes:

```ts
// src/modules/auth/jobs/registeruser.ts
import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { userId, name, email } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Welcome",
    html: `<p>Hi ${name}</p>`,
  });

  // Notify admins in realtime
  await dispatchEvent(
    "admin.user.registered",
    { userId, name, email },
    {
      broadcast: { roles: ["admin"] },
    },
  );

  // Notify the new user
  await dispatchEvent(
    "user.registered",
    { message: "Welcome!" },
    {
      broadcast: { users: [userId] },
    },
  );
});
```

This way broadcasting only happens after the background work succeeds.

## Redis Adapter (Multi-Instance)

When `REDIS=true`, Socket.IO uses `@socket.io/redis-adapter` to broadcast across all server instances:

```
Instance A                     Redis Pub/Sub                    Instance B
    │                              │                              │
    │  broadcast("event")          │                              │
    │ ──────────────────────────>  │                              │
    │                              │  broadcast("event")          │
    │                              │ ───────────────────────────> │
    │                              │                              │
    │  ✓ Connected clients         │         ✓ Connected clients  │
    │  on Instance A receive       │         on Instance B receive│
```

Without Redis, broadcasting works only within a single process.

## Client-Side Integration

The UI uses the **Pulse** plugin (a wrapper around `socket.io-client`) to connect and listen for events:

```ts
import { pulse } from "@/plugins/pulse";

// Listen on a specific channel (maps to a Socket.IO room) — auto-connects
const channel = pulse.channel("user:42");
channel.listen("post.published", (data) => {
  appendToFeed(data);
});

// Listen on a role-based channel
const adminChannel = pulse.channel("role:admin");
adminChannel.listen("admin.user.registered", (data) => {
  refreshAdminDashboard();
});

// Listen on a custom room
const chatChannel = pulse.channel("room:chat:general");
chatChannel.listen("chat.message", (data) => {
  displayMessage(data);
});

// Clean up listeners when leaving the page
onUnmounted(() => {
  channel.stopListening("post.published");
  adminChannel.stopListening("admin.user.registered");
  chatChannel.stopListening("chat.message");
  pulse.leave("room:chat:general");
});
```

### Pulse API Reference

| Method                              | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `pulse.channel(name)`               | Join a room (auto-connects) and return a channel for listening |
| `pulse.private(name)`               | Alias for `channel("private:<name>")`                          |
| `pulse.disconnect()`                | Disconnect the socket                                          |
| `pulse.leave(name)`                 | Leave a room and remove all listeners                          |
| `channel.listen(event, cb)`         | Listen for an event on this channel                            |
| `channel.stopListening(event, cb?)` | Stop listening (omit cb to remove all)                         |

The JWT access cookie (`{cookie.name}_access`) is sent automatically with `withCredentials: true`, and the server extracts the user's identity and roles from it to assign rooms.

## Toggling Realtime

Set `SOCKET=false` in `.env` to disable Socket.IO entirely:

```bash
# .env
SOCKET=false
```

When disabled:

- `initRealtime()` returns `null`
- `socketServer()` returns `null`
- `broadcast()` returns immediately without emitting
- `dispatchEvent()` with `broadcast` options is a no-op
- The server starts faster, uses less memory

## Complete Controller Example

::: code-group

```ts [Hono]
// src/modules/posts/controllers/post.controller.ts
import type { Handler } from "hono";
import { dispatchEvent } from "@/framework/facade.js";

export const publishPost: Handler = async (c: any) => {
  const { id, title } = c.req.valid("json");

  // Queue the heavy work (image processing, notifications)
  await dispatchEvent("post.publish", { postId: id }, { queue: "default" });

  // Immediately confirm to the author
  return c.json({ message: "Post queued for publishing" });
};
```

```ts [Express]
// src/modules/posts/controllers/post.controller.ts
import type { Request, Response } from "express";
import { dispatchEvent } from "@/framework/facade.js";

export const publishPost = (req: Request, res: Response) => {
  const { id, title } = req.body;

  // Queue the heavy work (image processing, notifications)
  void dispatchEvent("post.publish", { postId: id }, { queue: "default" });

  // Immediately confirm to the author
  res.json({ message: "Post queued for publishing" });
};
```

:::

```ts
// src/modules/posts/jobs/publish-post.ts
import { dispatchEvent, shouldQueue } from "@/framework/facade.js";

shouldQueue("post.publish", "default", async (job) => {
  const { postId } = job.data;
  // ... process images, generate thumbnails, etc.

  // Broadcast completion to all clients
  await dispatchEvent(
    "post.published",
    { postId, status: "live" },
    {
      broadcast: { all: true },
    },
  );

  // Notify the author specifically
  await dispatchEvent(
    "post.notification",
    { postId, message: "Your post is live!" },
    {
      broadcast: { users: [job.data.authorId] },
    },
  );
});
```

```ts
// Client listens via Pulse
import { pulse } from "@/plugins/pulse";

const channel = pulse.channel("user:42");
channel.listen("post.published", (data) => appendToFeed(data));
channel.listen("post.notification", (data) => showToast(data.message));
```
