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
      // No `thresholds` here on purpose.
      //
      // This file is published inside the package, so any floor written here also
      // becomes every scaffolded project's floor - and it would fail them on the
      // first run. A new project ships with only the auth module's tests: the
      // framework's own tests under `src/framework/**/__tests__/` are not
      // published, because they test the framework rather than the application.
      // That measures 8.49% statements, so a floor calibrated for this repository
      // (14%) reports a failure for a developer who has done nothing wrong and
      // whose 56 tests all pass.
      //
      // The floor is a guard on this repository, so it is applied by CI, which
      // passes --coverage.thresholds.* on the command line. That keeps this file
      // byte-identical across both engines, keeps it free of a number that would
      // be meaningless in someone else's project, and still fails the build when
      // untested code is added here.
    }
  }
});
