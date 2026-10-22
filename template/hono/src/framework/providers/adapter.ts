import { eq } from "drizzle-orm";
import { db } from "@/framework/database/connection.js";
import type { AuthProvider } from "./contracts.js";
import { loadProviders } from "./loader.js";
import { getAuthProvider } from "./registry.js";

let defaultProvider: AuthProvider | null = null;
let defaultLoadAttempted = false;

/**
 * Why: Builds the built-in auth provider from the default auth module.
 * When: No custom provider was registered by the application.
 * Where: Auth provider adapter.
 * How: Lazily imports the default user/refresh-token models. When the default
 *      auth module was deleted or replaced, no provider is produced.
 */
async function loadDefaultProvider(): Promise<AuthProvider | null> {
  if (defaultProvider) return defaultProvider;
  if (defaultLoadAttempted) return null;
  defaultLoadAttempted = true;
  try {
    const userMod = await import("@/modules/auth/database/models/user.js").catch(() => null);
    if (!userMod?.users || !userMod?.refreshTokens) return null;

    const users = userMod.users;
    const refreshTokens = userMod.refreshTokens;

    defaultProvider = {
      async getUserById(id: number) {
        try {
          const user = await (db.query.users.findFirst as any)?.({
            where: eq(users.id, id),
            with: { role: true }
          });
          if (user) return user;
        } catch {}
        try {
          const rows = await db.select().from(users).where(eq(users.id, id));
          return rows?.[0] ?? null;
        } catch {
          return null;
        }
      },
      async findRefreshToken(jti: string) {
        try {
          const token = await (db.query.refreshTokens.findFirst as any)?.({
            where: eq(refreshTokens.jti, jti)
          });
          if (token) return token;
        } catch {}
        try {
          const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.jti, jti));
          return rows?.[0] ?? null;
        } catch {
          return null;
        }
      },
      async deleteRefreshToken(tokenId: number) {
        try {
          await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenId));
        } catch {}
      },
      async revokeRefreshToken(tokenId: number) {
        try {
          await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenId));
        } catch {}
      },
      async getAuthContext(user: any, payload?: any) {
        try {
          if (user?.role && typeof user.role === "object") {
            return {
              ...(payload || {}),
              id: user.id,
              email: user.email,
              roleId: user.role?.id ?? null,
              role: user.role?.name ?? null,
              ...user
            };
          }
        } catch {}
        return {
          ...(payload || {}),
          id: user.id,
          email: user.email,
          roleId: user.roleId ?? null,
          role: user.role ?? null,
          ...user
        };
      },
      async getUserContact(userId: number) {
        try {
          const user = await this.getUserById(userId);
          if (!user) return null;
          return {
            email: user.email ?? null,
            name: user.name ?? user.fullName ?? user.username ?? null,
            phone: user.phone ?? user.phoneNumber ?? null
          };
        } catch {
          return null;
        }
      }
    };
    return defaultProvider;
  } catch {
    return null;
  }
}

/**
 * Why: Resolves the auth provider the framework should use.
 * When: The auth middleware or the notification mailer needs user data.
 * Where: Auth provider adapter.
 * How: Application providers are loaded first, so a file in `src/providers/`
 *      wins. Otherwise the built-in provider from the default auth module is
 *      used. When neither exists the framework degrades gracefully.
 */
export async function resolveAuthProvider(): Promise<AuthProvider | null> {
  await loadProviders();
  const registered = getAuthProvider();
  if (registered) return registered;
  const def = await loadDefaultProvider();
  if (def) return def;
  return null;
}
