import {
  AUTH_PROVIDER_KEY,
  type AuthProvider,
  NOTIFICATION_PROVIDER_KEY,
  type NotificationProvider,
  type ProviderKey
} from "./contracts.js";

/**
 * Why: Holds the app-wide provider implementations in one place.
 * When: A provider file in `src/providers/` (or a module's `providers.ts`)
 *       registers its implementation at boot.
 * Where: Read by the framework through `resolve*Provider()` helpers.
 * How: A plain key/value map. No container, no decorators, no auto-wiring.
 */
const registry = new Map<string, unknown>();

/**
 * Why: Registers a provider implementation under a key.
 * When: A provider file runs at boot and claims a contract.
 * Where: Application code, through the framework facade.
 * How: Stores the implementation and returns it so it can be inlined.
 */
export function registerProvider<T>(key: ProviderKey, implementation: T): T {
  registry.set(key, implementation);
  return implementation;
}

/** Returns the registered implementation for a key, or null when absent. */
export function getProvider<T = unknown>(key: ProviderKey): T | null {
  const found = registry.get(key);
  return (found as T) ?? null;
}

/** Reports whether a provider is registered for a key. */
export function hasProvider(key: ProviderKey): boolean {
  return registry.has(key);
}

/** Removes a registered provider. Mainly useful in tests. */
export function clearProvider(key: ProviderKey): void {
  registry.delete(key);
}

/** Lists every registered provider key, sorted for stable output. */
export function listProviders(): string[] {
  return [...registry.keys()].sort();
}

/** Registers the auth provider that the framework's auth middleware uses. */
export function registerAuthProvider(provider: AuthProvider): AuthProvider {
  return registerProvider(AUTH_PROVIDER_KEY, provider);
}

/** Returns the registered auth provider, or null when none was registered. */
export function getAuthProvider(): AuthProvider | null {
  return getProvider<AuthProvider>(AUTH_PROVIDER_KEY);
}

/** Reports whether a custom auth provider is registered. */
export function hasAuthProvider(): boolean {
  return hasProvider(AUTH_PROVIDER_KEY);
}

/** Removes the registered auth provider. Mainly useful in tests. */
export function clearAuthProvider(): void {
  clearProvider(AUTH_PROVIDER_KEY);
}

/** Registers the storage provider `notify()` and `/api/notification/*` use. */
export function registerNotificationProvider(provider: NotificationProvider): NotificationProvider {
  return registerProvider(NOTIFICATION_PROVIDER_KEY, provider);
}

/** Returns the registered notification provider, or null when none was registered. */
export function getNotificationProvider(): NotificationProvider | null {
  return getProvider<NotificationProvider>(NOTIFICATION_PROVIDER_KEY);
}

/** Reports whether a notification provider is registered. */
export function hasNotificationProvider(): boolean {
  return hasProvider(NOTIFICATION_PROVIDER_KEY);
}

/** Removes the registered notification provider. Mainly useful in tests. */
export function clearNotificationProvider(): void {
  clearProvider(NOTIFICATION_PROVIDER_KEY);
}
