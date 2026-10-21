import type { AuthProvider } from "./contracts.js";

let provider: AuthProvider | null = null;

export function registerAuthProvider(p: AuthProvider) {
  provider = p;
}

export function getAuthProvider(): AuthProvider | null {
  return provider;
}

export function hasAuthProvider(): boolean {
  return provider !== null;
}

export function clearAuthProvider() {
  provider = null;
}
