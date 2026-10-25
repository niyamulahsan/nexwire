# `notify` — notifications

Imported from the facade: `import { notify } from "@/framework/facade.js"`.

Creates a user-visible notification through the registered notification provider, and optionally broadcasts it over Socket.IO and/or delivers it by email. The shipped `src/modules/notification` module exposes the CRUD endpoints under `/api/notification` and needs no setup beyond `db:migrate`. See [Notifications](./../guide/notification).

## Functions

| Function | Signature                                                  | Description                                                        |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `notify` | `(target, options) => Promise<NotificationRecord \| null>` | Stores a notification; optionally broadcasts + emails. `null` when no provider is available. |

`target` is `number | string | { type?: string; id: number | string }`. A bare number/string becomes `{ type: "user", id }`.

`NotificationOptions`:

| Option      | Type      | Default  | Description                                              |
| ----------- | --------- | -------- | -------------------------------------------------------- |
| `type`      | `string`  | `"info"` | Category: `info`, `success`, `warning`, `error`          |
| `title`     | `string`  | —        | **Required.** Notification title                         |
| `body`      | `string`  | —        | Body text                                                |
| `link`      | `string`  | —        | Click-through URL                                        |
| `data`      | `object`  | —        | Arbitrary JSON stored in the `data` column               |
| `broadcast` | `boolean` | `false`  | Emit `"notification.created"` to the user's socket room  |
| `mail`      | `object`  | —        | `{ subject?, html?, to? }` — sends email via the `mail` queue |

### Recipient resolution

When `mail` is set, the recipient is resolved in this order: `mail.to` → the auth provider's `getUserContact(id)` → skipped. There is no users-model fallback. See [Providers](./../guide/providers).

## Use cases

### Save to database only

```ts
import { notify } from "@/framework/facade.js";

await notify(userId, {
  type: "info",
  title: "Profile Updated",
  body: "Your profile was saved.",
});
```

### Save + realtime broadcast

```ts
await notify(userId, {
  type: "success",
  title: "Payment Received",
  body: "$50.00 credited.",
  broadcast: true, // UI bell badge updates instantly via Pulse
});
```

### Save + broadcast + email

```ts
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

### Inside a controller

::: code-group

```ts [Hono]
export const createComment: Handler = async (c: any) => {
  const { postId, content } = c.req.valid("json");
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
export const createComment = async (req: Request, res: Response) => {
  const { postId, content } = req.body;
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

### Client-side pickup

```ts
import { pulse } from "@/plugins/pulse";

const channel = pulse.channel(`user:${userId}`);
channel.listen("notification.created", (payload) => {
  items.value.unshift(payload);
  unread.value++;
});
```

## Lifecycle

```
notify(target, { broadcast: true, mail: { ... } })
  ├─ 1. resolveNotificationProvider() — registered provider, else the shipped store
  ├─ 2. provider.create(target, input)
  ├─ 3. dispatchEvent("notification.created", normalized, { broadcast: { users: [target.id] } })
  │      └─ Socket.IO emits to room "user:<id>"
  └─ 4. If mail option:
         └─ dispatchEvent("notification:mail", ..., { queue: "mail" })
             └─ BullMQ worker sends the email
```

## `dispatchEvent` vs `notify`

|                     | `dispatchEvent`                                     | `notify`                                                                  |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| **Persistence**     | No — fire-and-forget signal                         | Yes — stores through the notification provider, returns the normalized record |
| **Broadcast scope** | Flexible (`all`, `auth`, `roles`, `users`, `rooms`) | Always to a single user (`users: [userId]`)                               |
| **Email delivery**  | No                                                  | Yes — via `mail: { subject, html }`                                       |
| **Queue option**    | Yes                                                 | Yes — internally calls `dispatchEvent` with `{ queue: "mail" }` for email |

## Notes

- The notification table is standalone: `src/modules/notification/database/models/notification.ts`, with no foreign key to auth. One row is one notification for one `(notifiable_type, notifiable_id)` owner.
- `broadcast: true` emits the `"notification.created"` event — listen on the `user:<id>` room to update bell badges without polling.
- Return value is the normalized record: `{ id, notifiableType, notifiableId, type, title, body, data, link, readAt, createdAt }`. `id` is a string (UUID by default), so it works whether the auth id is numeric or a UUID.
- Numeric and string ids are both accepted and always stored as text.
