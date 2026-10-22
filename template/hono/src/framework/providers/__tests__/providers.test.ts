import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthProvider,
  clearProvider,
  getAuthProvider,
  getProvider,
  hasAuthProvider,
  hasProvider,
  listProviders,
  registerAuthProvider,
  registerProvider
} from "@/framework/providers/registry.js";

/**
 * The provider system is the framework's public extension point, so these
 * tests cover the two promises it makes to an application:
 *
 *  - registering an implementation is enough for the framework to use it
 *  - a file dropped into `src/providers/` is imported without any wiring
 */
describe("provider registry", () => {
  afterEach(() => {
    clearProvider("payment");
    clearAuthProvider();
  });

  it("registers and reads any implementation by key", () => {
    const implementation = { charge: async () => "ok" };

    registerProvider("payment", implementation);

    expect(getProvider("payment")).toBe(implementation);
    expect(hasProvider("payment")).toBe(true);
    expect(listProviders()).toContain("payment");
  });

  it("returns null for a key that was never registered", () => {
    expect(getProvider("never-registered")).toBe(null);
    expect(hasProvider("never-registered")).toBe(false);
  });

  it("clears a registered implementation", () => {
    registerProvider("payment", { charge: async () => "ok" });

    clearProvider("payment");

    expect(getProvider("payment")).toBe(null);
    expect(hasProvider("payment")).toBe(false);
  });

  it("registers the auth provider under the auth key", () => {
    const provider = {
      getUserById: async () => null,
      findRefreshToken: async () => null
    };

    registerAuthProvider(provider);

    expect(getAuthProvider()).toBe(provider);
    expect(hasAuthProvider()).toBe(true);
  });

  it("clears the auth provider", () => {
    registerAuthProvider({
      getUserById: async () => null,
      findRefreshToken: async () => null
    });

    clearAuthProvider();

    expect(getAuthProvider()).toBe(null);
    expect(hasAuthProvider()).toBe(false);
  });
});

describe("provider loader", () => {
  const providersDir = path.resolve(process.cwd(), "src/providers");
  const fixture = path.join(providersDir, "__loader-fixture.ts");
  const moduleFixtureDir = path.resolve(process.cwd(), "src/modules/__loader-fixture-module/providers");
  const moduleFixture = path.join(moduleFixtureDir, "__loader-fixture.ts");

  afterEach(async () => {
    await rm(fixture, { force: true });
    await rm(path.resolve(process.cwd(), "src/modules/__loader-fixture-module"), { recursive: true, force: true });
    delete (globalThis as any).__nexwireProviderFixture;
    vi.resetModules();
  });

  it("imports a provider file dropped into src/providers without any wiring", async () => {
    await mkdir(providersDir, { recursive: true });
    await writeFile(fixture, "globalThis.__nexwireProviderFixture = true;\n", "utf8");

    vi.resetModules();
    const loader = await import("@/framework/providers/loader.js");

    const loaded = await loader.loadProviders();

    expect(loaded).toBeGreaterThan(0);
    expect((globalThis as any).__nexwireProviderFixture).toBe(true);
  });

  it("imports a provider file dropped into a module's providers folder", async () => {
    // A module offers its implementation to the whole app the same way the app
    // does: by dropping a file where the loader looks for it.
    await mkdir(moduleFixtureDir, { recursive: true });
    await writeFile(moduleFixture, "globalThis.__nexwireProviderFixture = true;\n", "utf8");

    vi.resetModules();
    const loader = await import("@/framework/providers/loader.js");

    await loader.loadProviders();

    expect((globalThis as any).__nexwireProviderFixture).toBe(true);
  });

  it("loads providers only once", async () => {
    vi.resetModules();
    const loader = await import("@/framework/providers/loader.js");

    const first = await loader.loadProviders();
    const second = await loader.loadProviders();

    expect(second).toBe(first);
  });
});
