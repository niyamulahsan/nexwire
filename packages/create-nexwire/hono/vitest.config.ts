import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["src/resources/**", "src/storage/**", "node_modules/**", "dist/**"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/resources/**", "src/storage/**", "src/framework/maker-cli/**", "src/**/*.d.ts", "src/**/*.test.ts", "src/**/*.spec.ts"]
    }
  }
});
