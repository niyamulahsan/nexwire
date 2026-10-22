/**
 * Why: Defines the shapes a pluggable provider has to satisfy.
 * When: A developer replaces a framework default (auth today, payments later).
 * Where: Imported through the framework facade, never from framework internals.
 * How: Interfaces stay deliberately loose so custom user shapes pass through.
 */

/** Registry key of the built-in auth provider contract. */
export const AUTH_PROVIDER_KEY = "auth";

/**
 * Registry key for any provider implementation.
 *
 * `string & {}` keeps the literal keys above discoverable by editors while
 * still accepting any custom key, so a project can register its own contracts
 * (payments, otp, storage, ...) without the framework having to know them.
 */
export type ProviderKey = typeof AUTH_PROVIDER_KEY | (string & {});

export interface AuthProviderUser {
  id: number;
  email?: string | null;
  [key: string]: any;
}

export interface AuthProviderRefreshToken {
  id: number;
  jti: string;
  revoked?: boolean | null;
  expiresAt?: Date | string | null;
  userId?: number | null;
  [key: string]: any;
}

export interface AuthUserContext {
  id: number;
  email?: string | null;
  roleId?: number | null;
  role?: string | null;
  [key: string]: any;
}

export interface AuthUserContact {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}

export interface AuthProvider {
  getUserById(id: number): Promise<AuthProviderUser | null>;
  findRefreshToken(jti: string): Promise<AuthProviderRefreshToken | null>;
  revokeRefreshToken?(tokenId: number): Promise<void>;
  deleteRefreshToken?(tokenId: number): Promise<void>;
  getAuthContext?(user: AuthProviderUser, payload?: any): Promise<AuthUserContext | any>;
  getUserContact?(userId: number): Promise<AuthUserContact | null>;
}
