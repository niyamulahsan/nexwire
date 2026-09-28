# Vite Configuration

`src/resources/vite.config.ts` configures the Vite dev server and build for the UI SPA.

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const cacheBase = process.env.LOCALAPPDATA || process.env.TEMP || ".";
const apiUrl = process.env.APP_URL || "http://localhost:3000";
const socketEnabled = process.env.SOCKET !== "false";

const proxy: Record<string, any> = {
  "/api": { target: apiUrl, changeOrigin: true },
  "/health": { target: apiUrl, changeOrigin: true },
  "/storage": { target: apiUrl, changeOrigin: true },
};

proxy["/socket.io"] = { target: apiUrl, changeOrigin: true, ws: true };

export default defineConfig({
  define: {
    __SOCKET_ENABLED__: socketEnabled,
    __API_URL__: JSON.stringify(apiUrl),
  },
  root: "src/resources",
  cacheDir: path.join(cacheBase, "nexwire", "vite-cache", "resources"),
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: { quietDeps: true },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "../../public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy,
  },
});
```

## Swapping the UI framework

Only the plugin line changes. Everything else (proxy, build output, defines, aliases) stays the same:

```ts
// Vue (default)
import vue from "@vitejs/plugin-vue";
plugins: [vue()],

// React
import react from "@vitejs/plugin-react";
plugins: [react()],

// Solid
import solid from "vite-plugin-solid";
plugins: [solid()],

// Svelte
import svelte from "@sveltejs/vite-plugin-svelte";
plugins: [svelte()],
```

Then rewrite `src/main.ts` for your framework's entry point.

## Key settings

| Setting              | Value                                        | Notes                                                                     |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `root`               | `src/resources`                              | Vite serves from the resources directory                                  |
| `@` alias            | `src/`                                       | Maps to `src/resources/src/`                                              |
| `outDir`             | `../../public`                               | Build output goes to the framework's public directory                     |
| `server.port`        | `5173`                                       | Dev server port                                                           |
| `__SOCKET_ENABLED__` | `process.env.SOCKET`                         | Compile-time constant for Pulse availability (set via `SOCKET` in `.env`) |
| `cacheDir`           | `%LOCALAPPDATA%/nexwire/vite-cache/resources` | Offloads cache from project directory                                     |

## Proxy

All backend requests are proxied to `env.APP_URL` to avoid CORS issues during development:

| Path         | Target        | WebSocket       |
| ------------ | ------------- | --------------- |
| `/api/*`     | `env.APP_URL` | —               |
| `/health`    | `env.APP_URL` | —               |
| `/storage/*` | `env.APP_URL` | —               |
| `/socket.io` | `env.APP_URL` | Yes (for Pulse) |
