import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const cacheBase = process.env.LOCALAPPDATA || process.env.TEMP || ".";
const apiUrl = process.env.APP_URL || "http://localhost:3000";
const socketEnabled = process.env.SOCKET !== "false";

const proxy: Record<string, any> = {
  "/api": { target: apiUrl, changeOrigin: true },
  "/health": { target: apiUrl, changeOrigin: true },
  "/storage": { target: apiUrl, changeOrigin: true }
};

proxy["/socket.io"] = { target: apiUrl, changeOrigin: true, ws: true };

export default defineConfig({
  define: {
    __SOCKET_ENABLED__: socketEnabled,
    __API_URL__: JSON.stringify(apiUrl)
  },
  root: "src/resources",
  cacheDir: path.join(cacheBase, "nexwire", "vite-cache", "resources"),
  plugins: [vue()],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true
      }
    }
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  build: {
    outDir: "../../public",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy
  }
});
