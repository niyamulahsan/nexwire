/**
 * Public API for the auth module.
 *
 * Other modules import from this file, never from controllers/ or services/ directly.
 * Re-export the pieces they are allowed to depend on:
 *
 * export { list, findOne } from "./services/auth.js";
 *
 * Rule: a facade must never import another module's facade.
 */

export { getCurrentUser, hasRole } from "@/modules/auth/helpers/auth.js";
