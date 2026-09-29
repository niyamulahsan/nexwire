/**
 * Why: Account/authentication policy settings.
 * When: Register, login, and email verification flows.
 * Where: src/config/auth.ts.
 * How: Plain literals. `requireEmailVerification` adds a verify-email step
 *      before a new account can log in.
 */
export const authConfig = {
  requireEmailVerification: false
};

export type AuthConfig = typeof authConfig;
