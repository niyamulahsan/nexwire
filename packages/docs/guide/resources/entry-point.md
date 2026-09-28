# Entry Point

## `main.ts`

`src/resources/src/main.ts` bootstraps the UI application:

```ts
import "@/plugins/axios";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { createHead } from "@vueuse/head";
import { DialogPlugin } from "@/plugins/dialog";
import { PulsePlugin } from "@/plugins/pulse";
import { GumPlugin } from "@/plugins/gum";

import App from "./App.vue";
import router from "./router";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "@/assets/scss/custom.scss";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

const app = createApp(App);
const pinia = createPinia();
const head = createHead({
  titleTemplate: (title) => (title ? `${title} | nexwire` : "nexwire"),
});

app.use(pinia);
app.use(router);
app.use(head);
app.use(DialogPlugin);
app.use(GumPlugin);
app.use(PulsePlugin);
app.mount("#app");
```

### Registration order

| Plugin                       | Source             | Purpose                                                    |
| ---------------------------- | ------------------ | ---------------------------------------------------------- |
| `axios` (side-effect import) | `@/plugins/axios`  | Configures axios defaults and 401 interceptor              |
| Pinia                        | `pinia`            | State management via stores                                |
| Vue Router                   | `@/router`         | Navigation, guards, lazy routes                            |
| `@vueuse/head`               | `@vueuse/head`     | Reactive `<title>` and `<meta>` management                 |
| DialogPlugin                 | `@/plugins/dialog` | `$dialog.alert()`, `$dialog.confirm()`, `$dialog.prompt()` |
| GumPlugin                    | `@/plugins/gum`    | Inertia-style page visits and form handling                |
| PulsePlugin                  | `@/plugins/pulse`  | Socket.IO real-time channels                               |

### CSS imports (in order)

1. `bootstrap/dist/css/bootstrap.min.css` — Bootstrap grid, utilities, components
2. `bootstrap-icons/font/bootstrap-icons.css` — Icon font
3. `@/assets/scss/custom.scss` — Project-specific overrides, theme variables
4. `bootstrap/dist/js/bootstrap.bundle.min.js` — Bootstrap JS (collapse, modal, dropdown)

## `App.vue`

The root component is minimal:

```vue
<template>
  <router-view />
</template>
```

## `index.html`

`src/resources/index.html` is the HTML shell:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>nexwire</title>
  </head>
  <body>
    <div id="app"></div>
    <div id="modal-show"></div>
  </body>
</html>
```

The `#modal-show` element is where DialogPlugin and the `Modal` component inject their overlays.
