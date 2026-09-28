# Dialog

Dialog is nexwire's lightweight, zero-dependency modal system. It provides `alert`, `confirm`, and `prompt` dialogs via DOM-injected Bootstrap-styled cards — no extra component imports needed.

The dialog system is built as a Vue plugin that registers `$dialog` on the global properties. Dialogs are rendered as absolutely-positioned card overlays appended to the `#modal-show` element, making them independent of your component tree.

```
Your Component
     │
     ├─ dialog.alert("Saved!")
     ├─ dialog.confirm("Delete?", callback)
     └─ dialog.prompt("Name?", options, callback)
     │
     ▼
DOM shell injected into #modal-show
     │
     ▼
User clicks OK / Cancel → callback fires → shell removed
```

## Setup

Dialog is registered in `src/resources/src/main.ts` via `app.use()`:

```ts
import { DialogPlugin } from "@/plugins/dialog";

const app = createApp(App);
app.use(DialogPlugin);
app.mount("#app");
```

This installs the `$dialog` object on the component global properties. No additional setup is required.

### Host Element

Dialogs are appended to the `#modal-show` element in your HTML. This element is already present in the default template:

```html
<!-- src/resources/index.html -->
<div id="modal-show"></div>
```

If `#modal-show` is not found, the dialog falls back to `document.body`.

## Imports

In any Vue component, access the dialog via the Composition API:

```ts
import { dialog } from "@/plugins/dialog";
```

Or via the Options API with `this.$dialog` (available because of the plugin registration).

## TypeScript Types

```ts
type PromptOptions = {
  limit?: number;          // Max characters for the textarea
  placeholder?: string;    // Placeholder text (default: "Remarks...")
  defaultValue?: string;   // Pre-filled value
};

type DialogClient = {
  alert: (text?: string) => void;
  confirm: (text?: string, callback?: (ok: boolean) => void) => void;
  prompt: (
    text?: string,
    options?: PromptOptions,
    callback?: (result: { ok: boolean; value: string }) => void
  ) => void;
};
```

The `DialogClient` type is also augmented on Vue's `ComponentCustomProperties` so `$dialog` is recognized in TypeScript files without additional declarations.

## API Reference

### `dialog.alert(text?)`

Displays a simple message with an **OK** button. The dialog closes on OK or close (X) click.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | `string` | `""` | The message to display in the dialog body |

Returns `void`. This is a fire-and-forget notification — no callback needed.

```ts
import { dialog } from "@/plugins/dialog";

dialog.alert("Profile updated successfully");
dialog.alert(); // empty dialog (useful as a minimal loading indicator)
```

### `dialog.confirm(text?, callback)`

Displays a message with **OK** and **Cancel** buttons. The callback receives `true` if the user clicked OK, or `false` if Cancel/close was clicked.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | `string` | `""` | The confirmation message |
| `callback` | `(ok: boolean) => void` | — | Called with the user's decision |

```ts
import { dialog } from "@/plugins/dialog";

dialog.confirm("Delete this post?", (ok) => {
  if (ok) {
    // proceed with deletion
  }
});
```

### `dialog.prompt(text?, options?, callback)`

Displays a message with a textarea input, **OK**, and **Cancel** buttons. The callback receives an object with the user's input and decision.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | `string` | `""` | The prompt message |
| `options` | `PromptOptions` | `{}` | Configuration object (see below) |
| `callback` | `(result: { ok: boolean; value: string }) => void` | — | Called with the result |

**PromptOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `limit` | `number` | `0` | Max character count (0 = unlimited). When set, a character counter is shown next to the label and `maxlength` is applied to the textarea. |
| `placeholder` | `string` | `"Remarks..."` | Placeholder text for the textarea |
| `defaultValue` | `string` | `""` | Pre-filled value for the textarea |

```ts
import { dialog } from "@/plugins/dialog";

dialog.prompt("Enter your reason:", { limit: 200, placeholder: "Optional..." }, (result) => {
  if (result.ok) {
    console.log("User entered:", result.value);
  }
});
```

## Using `$dialog` in Components

When the plugin is installed, `$dialog` is available in templates and the Options API:

```vue
<template>
  <button @click="$dialog.alert('Button clicked!')">Show Alert</button>
</template>

<script lang="ts">
export default {
  methods: {
    confirmDelete() {
      this.$dialog.confirm("Are you sure?", (ok) => {
        if (ok) this.deleteItem();
      });
    }
  }
};
</script>
```

In `<script setup>`, import the `dialog` object directly:

```vue
<script setup lang="ts">
import { dialog } from "@/plugins/dialog";

function handleDelete() {
  dialog.confirm("Delete this item?", (ok) => {
    if (ok) {
      // perform deletion
    }
  });
}
</script>
```

## Promise-based Wrapper (Recommended)

While the dialog API is callback-based, you can easily wrap it in a Promise for use with `async/await`:

```ts
import { dialog } from "@/plugins/dialog";

function confirmAsync(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.confirm(message, (ok) => resolve(ok));
  });
}

function promptAsync(
  message: string,
  options?: { limit?: number; placeholder?: string; defaultValue?: string }
): Promise<string | null> {
  return new Promise((resolve) => {
    dialog.prompt(message, options, (result) => {
      resolve(result.ok ? result.value : null);
    });
  });
}

// Usage
const confirmed = await confirmAsync("Are you sure?");
if (confirmed) {
  // proceed
}

const name = await promptAsync("What is your name?", {
  placeholder: "Enter name..."
});
if (name !== null) {
  console.log("Hello,", name);
}
```

For convenience, you can create a `useDialog` composable that returns these Promise-based wrappers:

```ts
// composables/useDialog.ts
import { dialog } from "@/plugins/dialog";

export function useDialog() {
  function alert(message?: string): Promise<void> {
    return new Promise((resolve) => {
      dialog.alert(message);
      resolve();
    });
  }

  function confirm(message?: string): Promise<boolean> {
    return new Promise((resolve) => {
      dialog.confirm(message, (ok) => resolve(ok));
    });
  }

  function prompt(
    message?: string,
    options?: { limit?: number; placeholder?: string; defaultValue?: string }
  ): Promise<string | null> {
    return new Promise((resolve) => {
      dialog.prompt(message, options, (result) => {
        resolve(result.ok ? result.value : null);
      });
    });
  }

  return { alert, confirm, prompt };
}
```

## Complete Examples

### Delete Confirmation

```vue
<script setup lang="ts">
import { dialog } from "@/plugins/dialog";

function deleteUser(userId: number) {
  dialog.confirm("Are you sure you want to delete this user?", (ok) => {
    if (!ok) return;

    axios.delete(`/api/users/${userId}`).then(() => {
      dialog.alert("User deleted successfully");
    });
  });
}
</script>

<template>
  <button class="btn btn-danger btn-sm" @click="deleteUser(42)">
    Delete User
  </button>
</template>
```

### Prompt for Input

```vue
<script setup lang="ts">
import { dialog } from "@/plugins/dialog";

function renameItem() {
  dialog.prompt(
    "Enter the new name:",
    { limit: 100, placeholder: "Item name..." },
    (result) => {
      if (result.ok && result.value.trim()) {
        axios.put("/api/items/1", { name: result.value }).then(() => {
          dialog.alert("Item renamed");
        });
      }
    }
  );
}
</script>

<template>
  <button class="btn btn-outline-secondary btn-sm" @click="renameItem">
    Rename
  </button>
</template>
```

### Form Save Confirmation with Gum

```vue
<script setup lang="ts">
import { dialog } from "@/plugins/dialog";
import { useGumForm } from "@/plugins/gum";

const form = useGumForm({ title: "", body: "" });

function save() {
  dialog.confirm("Save this post?", (ok) => {
    if (!ok) return;

    form.post("/api/posts", undefined, {
      onSuccess: () => {
        form.reset();
        dialog.alert("Post saved!");
      },
      onError: (errors) => {
        dialog.alert(Object.values(errors).join("\n"));
      }
    });
  });
}
</script>

<template>
  <form @submit.prevent="save">
    <Input v-model="form.data.title" label="Title" :err="form.errors.title" />
    <TextArea v-model="form.data.body" label="Body" :err="form.errors.body" />
    <Button type="submit" label="Save" :loading="form.processing" />
  </form>
</template>
```

## Styling

The dialog creates its own absolutely-positioned overlay. It uses the framework's CSS theme variables (`--app-backdrop`, `--app-text`) so it follows light/dark mode automatically:

| Element | Classes / Style | Description |
|---------|---------|-------------|
| Overlay | `position-fixed w-100 h-100 top-0 start-0`, `background: var(--app-backdrop)`, `color: var(--app-text)` | Full-screen backdrop |
| Card | `card position-absolute top-50 start-50 translate-middle border` | Centered card (300px width) |
| Header | `card-header d-flex justify-content-between align-items-center px-2 py-1 border-0` | Title bar with site label and close button |
| Body | `card-body overflow-x-hidden overflow-y-scroll p-2 text-center` | Message area (max 200px height with scroll) |
| Footer | `card-footer d-flex justify-content-end align-items-center px-2 py-1 border-0` | Button row |
| OK button | `btn btn-primary btn-sm` | Primary action |
| Cancel button | `btn btn-secondary btn-sm ms-1` | Secondary action |

You can customize the dialog appearance by overriding these classes in your own stylesheet:

```scss
// Override the dialog card
.card[style*="position: absolute"][style*="z-index: 100000"] {
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

// Style the overlay
div[style*="z-index: 100000"] {
  backdrop-filter: blur(4px);
}
```

### Theming

Dialogs automatically inherit the framework theme variables. Because the overlay and card use `--app-backdrop`/`--app-text` and no longer hard-code `bg-white`, dialogs follow light and dark mode out of the box.

## Edge Cases & Graceful Degradation

### Keyboard Shortcuts

Dialogs support keyboard interaction out of the box:

| Key | Action |
|-----|--------|
| `Enter` | Triggers OK (when focus is not on a textarea/input) |
| `Escape` | Triggers Cancel (or closes the dialog) |

### Missing `#modal-show` Element

If the `#modal-show` element does not exist in the DOM, the dialog falls back to appending to `document.body`. This ensures dialogs always appear, even on pages that omit the host element.

### Multiple Dialogs

The dialog implementation appends a new shell element for each call. Calling `dialog.alert()` while another dialog is open will stack both overlays. Each dialog must be dismissed independently.

### Rapid Consecutive Calls

Since each call creates a new DOM shell, calling `dialog.alert()` rapidly in succession will create multiple overlapping dialogs. Use a guard in your application code:

```ts
let dialogOpen = false;

function showAlert(message: string) {
  if (dialogOpen) return;
  dialogOpen = true;
  dialog.alert(message);
}
```

## Modal Component

For complex dialog content (forms, tables, custom layouts), use the built-in `Modal.vue` component instead of the programmatic dialog:

```vue
<script setup lang="ts">
import { ref } from "vue";
import Modal from "@/components/Modal.vue";

const modal = ref<InstanceType<typeof Modal> | null>(null);
</script>

<template>
  <button @click="modal?.open()">Open Modal</button>

  <Modal ref="modal" id="my-modal" title="Edit User" size="lg">
    <template #modalbody>
      <!-- Complex form content here -->
    </template>
    <template #modalfooter>
      <button class="btn btn-secondary btn-sm" @click="modal?.close()">Close</button>
      <button class="btn btn-primary btn-sm">Save</button>
    </template>
  </Modal>
</template>
```

The `Modal` component teleports into the same `#modal-show` element and wraps Bootstrap's modal JavaScript. See the [Components section](/guide/resources/#components) in the Resources overview for full API details.

## Summary

| Method | Purpose | Callback |
|--------|---------|----------|
| `dialog.alert(text)` | Informational message with OK button | None (auto-dismiss on click) |
| `dialog.confirm(text, callback)` | Yes/no decision with OK and Cancel | `(ok: boolean) => void` |
| `dialog.prompt(text, options, callback)` | Text input with OK and Cancel | `({ ok, value }) => void` |

Use the programmatic dialog for quick notifications, confirmations, and simple text prompts. For rich custom content, use the `Modal` component with named slots.
