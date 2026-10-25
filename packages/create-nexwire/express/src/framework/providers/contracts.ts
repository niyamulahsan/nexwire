/**
 * Why: Defines the shapes a pluggable provider has to satisfy.
 * When: A developer replaces a framework default (auth, notifications, payments later).
 * Where: Imported through the framework facade, never from framework internals.
 * How: Interfaces stay deliberately loose so custom user shapes pass through.
 */

/** Registry key of the built-in auth provider contract. */
export const AUTH_PROVIDER_KEY = "auth";

/** Registry key of the built-in notification storage provider. */
export const NOTIFICATION_PROVIDER_KEY = "notification";

/**
 * Registry key for any provider implementation.
 *
 * `string & {}` keeps the literal keys above discoverable by editors while
 * still accepting any custom key, so a project can register its own contracts
 * (payments, otp, storage, ...) without the framework having to know them.
 */
export type ProviderKey = typeof AUTH_PROVIDER_KEY | typeof NOTIFICATION_PROVIDER_KEY | (string & {});

export interface AuthProviderUser {
  id: number | string;
  email?: string | null;
  [key: string]: any;
}

export interface AuthProviderRefreshToken {
  id: number | string;
  jti: string;
  revoked?: boolean | null;
  expiresAt?: Date | string | null;
  userId?: number | string | null;
  [key: string]: any;
}

export interface AuthUserContext {
  id: number | string;
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
  getUserById(id: number | string): Promise<AuthProviderUser | null>;
  findRefreshToken(jti: string): Promise<AuthProviderRefreshToken | null>;
  revokeRefreshToken?(tokenId: number | string): Promise<void>;
  deleteRefreshToken?(tokenId: number | string): Promise<void>;
  getAuthContext?(user: AuthProviderUser, payload?: any): Promise<AuthUserContext | any>;
  getUserContact?(userId: number | string): Promise<AuthUserContact | null>;
}

/**
 * Who a notification belongs to. `id` accepts a numeric auth id and a string
 * id (UUID, ULID, ...) so replacing auth does not force a notification change.
 * The provider always stores the id as text.
 */
export interface NotifiableTarget {
  /** Notifiable class. Defaults to "user". */
  type?: string;
  id: number | string;
}

/** Payload accepted by `NotificationProvider.create()`. */
export interface NotificationCreateInput {
  type?: string;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
}

/** Normalized notification returned by every provider operation. */
export interface NotificationRecord {
  id: string;
  notifiableType: string;
  notifiableId: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListOptions {
  page?: number;
  perPage?: number;
}

export interface NotificationPage {
  data: NotificationRecord[];
  total: number;
  unread: number;
  page: number;
  perPage: number;
}

/**
 * Why: Keeps notification storage replaceable without touching `notify()` or
 *      the generated HTTP routes.
 * When: The default `src/modules/notification` store is replaced by a custom
 *       implementation (a different table, another service, ...).
 * Where: Registered through `registerNotificationProvider()`.
 * How: The framework only reads through this contract; mail and realtime
 *      delivery stay in the runtime so a storage swap cannot disable them.
 */
export interface NotificationProvider {
  create(target: NotifiableTarget, input: NotificationCreateInput): Promise<NotificationRecord>;
  list(target: NotifiableTarget, options?: NotificationListOptions): Promise<NotificationPage>;
  unreadCount(target: NotifiableTarget): Promise<number>;
  markRead(target: NotifiableTarget, id: number | string): Promise<boolean>;
  markAllRead(target: NotifiableTarget): Promise<number>;
  remove(target: NotifiableTarget, id: number | string): Promise<boolean>;
  /** Optional bulk cleanup when a notifiable target is deleted. */
  deleteForTarget?(target: NotifiableTarget): Promise<number>;
}
