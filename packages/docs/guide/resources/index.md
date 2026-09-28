# Resources (UI)

The UI lives under `src/resources/` and is served by the framework's Vite dev server with automatic API, WebSocket, and storage proxy.

## Framework agnostic

The nexwire backend is **UI-agnostic**. The default template ships with **Vue 3** + **Pinia** + **Vue Router**, but you can swap it for any Vite-compatible framework:

| Framework           | Plugin                                              | Notes                                          |
| ------------------- | --------------------------------------------------- | ---------------------------------------------- |
| **Vue 3** (default) | `@vitejs/plugin-vue`                                | Ships with the template                        |
| **React**           | `@vitejs/plugin-react`                              | Replace plugin, rewrite `main.tsx` + `App.tsx` |
| **Preact**          | `@vitejs/plugin-react` (with `React.createElement`) | Lightweight React alternative                  |
| **Solid**           | `vite-plugin-solid`                                 | JSX with fine-grained reactivity               |
| **Svelte**          | `@sveltejs/vite-plugin-svelte`                      | `.svelte` components                           |
| **Astro**           | `@astrojs/vite-plugin-astro`                        | Static-first, islands architecture             |

### What to change

Only two files are framework-specific:

1. **`vite.config.ts`** — swap `@vitejs/plugin-vue` for your framework's plugin
2. **`src/main.ts`** — rewrite the entry point for your framework

Everything else (proxy, build output, aliases, `__SOCKET_ENABLED__` define) stays the same. The API layer, auth, storage, and all backend services are consumed via HTTP — they don't care what UI framework you use.

## Project structure

```
src/resources/
├── index.html              # HTML shell
├── vite.config.ts          # Vite dev server & build config
├── src/
│   ├── main.ts             # App entry — mounts Vue with all plugins
│   ├── App.vue             # Root component (<router-view />)
│   ├── plugins/            # Vue plugins (gum, pulse, dialog, axios, routeProgress, browserDetect)
│   ├── router/             # Vue Router configuration & guards
│   ├── stores/             # Pinia stores (auth, admin-ui)
│   ├── composables/        # Shared composable functions (useAuth)
│   ├── layouts/            # Page layouts (dashboard, auth)
│   ├── pages/              # Route-level page components
│   ├── components/         # Reusable UI components
│   ├── helpers/            # Utility functions (nformatter, utils)
│   └── assets/             # SCSS theme, CSS, images
```

## Quick reference

| Page                                        | What it covers                                                       |
| ------------------------------------------- | -------------------------------------------------------------------- |
| [Entry Point](/guide/resources/entry-point) | `main.ts`, `App.vue`, `index.html`, plugin registration order        |
| [Vite Config](/guide/resources/vite-config) | Dev server proxy, aliases, build output, SCSS options                |
| [Router](/guide/resources/router)           | Route definitions, auth guards, meta flags, route progress           |
| [Pages](/guide/resources/pages)             | Page components, dashboard & auth examples                           |
| [Layouts](/guide/resources/layouts)         | Dashboard layout (header, sidebar, footer) and auth layout           |
| [Plugins](/guide/resources/gum)             | Gum, Pulse, Dialog — dedicated guides with full API reference        |
| [Stores](/guide/resources/stores)           | Auth store and admin-ui Pinia store                                  |
| [Composables](/guide/resources/composables) | `useAuth` composable                                                 |
| [Components](/guide/resources/components)   | DataTable, Select, Datepicker, Button, Input, Modal, Toast, and more |
| [Helpers](/guide/resources/helpers)         | Number formatting and utility functions                              |
