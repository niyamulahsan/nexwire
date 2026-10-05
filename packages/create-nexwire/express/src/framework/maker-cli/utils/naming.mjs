/**
 * Name handling for the generators.
 *
 * A developer may type a name in any common casing: `game-config`,
 * `game_config`, `gameConfig` or `GameConfig`. All of them must resolve to the
 * same thing, because a generator writes the name into four different places
 * that each need a different shape:
 *
 *   file name    game-config.ts      kebab
 *   SQL table    game_configs        snake
 *   identifier   gameConfigs         camel
 *   class name   GameConfigSeeder    pascal
 *
 * `normalizeName` produces the single canonical form (kebab). The other three
 * are derived from it. This has to happen *before* lowercasing, because
 * lowercasing `gameConfig` to `gameconfig` destroys the word boundary and no
 * later step can recover it.
 */

/**
 * A name is safe when it can be used as a folder name, a URL segment, a table
 * name and a TypeScript identifier without further quoting.
 *
 * Kebab-case, snake_case, camelCase and PascalCase all pass: they are folded
 * to one canonical kebab form first. What fails is anything that would produce
 * uncompilable code - spaces and dots break the generated `@/modules/...`
 * import, a leading digit breaks the identifier.
 */
const RAW_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Fold any accepted casing to canonical kebab-case.
 *
 * `gameConfig` and `GameConfig` split on the lowercase/uppercase boundary;
 * `game_config` splits on the underscore; repeated separators collapse to one
 * dash. An all-caps run such as `GAMECONFIG` carries no boundary information
 * and is deliberately kept as the single word `gameconfig`.
 */
export function normalizeName(value) {
  return String(value)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** Convert a kebab-case or camelCase string to snake_case (the SQL table name). */
export function snakeCase(input) {
  return String(input)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/**
 * Pluralise an identifier for a table/collection name.
 *
 * Deliberately minimal: consonant + `y` becomes `ies` (so `auditEntry` yields
 * `auditEntries`, matching the export a developer would hand-write), anything
 * else takes a plain `s`. A word that already ends in `s` is returned
 * unchanged so the helper is idempotent. English irregulars (`person` ->
 * `people`) are not modelled; correct those by hand after generating.
 */
export function plural(word) {
  const value = String(word);
  if (!value) return value;
  if (/[^aeiou]y$/i.test(value)) return `${value.slice(0, -1)}ies`;
  if (/s$/i.test(value)) return value;
  return `${value}s`;
}

/**
 * Best-effort readable repair of a rejected name, used only in error text.
 * Returns "" when no safe suggestion exists (e.g., a leading digit cannot be
 * reordered without guessing the developer's intent).
 */
function suggestName(value) {
  const cleaned = normalizeName(value);
  if (!cleaned || !/^[a-z]/.test(cleaned)) return "";
  return cleaned;
}

/**
 * Validate a name value exists and is safe to use, and return its canonical
 * form so every generator writes the same name to disk.
 * Throws with the exact command to run instead when the value is unusable.
 */
export function assertName(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  const trimmed = value.trim();
  if (!RAW_PATTERN.test(trimmed)) {
    const suggestion = suggestName(value);
    const reason = /^[0-9]/.test(trimmed)
      ? "must start with a lowercase letter"
      : "may only contain lowercase letters, numbers, dashes and underscores";
    throw new Error(`Invalid ${label.toLowerCase()}: "${value}" - a name ${reason}.${suggestion ? ` Use "${suggestion}" instead.` : ""}`);
  }

  return normalizeName(trimmed);
}

/** Convert a kebab-case or snake_case string to PascalCase. */
export function pascal(input) {
  return input.replace(/(^\w|[-_]\w)/g, (part) => part.replace(/[-_]/g, "").toUpperCase());
}

/** Convert a kebab-case or snake_case string to camelCase. */
export function camelCase(input) {
  const p = pascal(input);
  return p.charAt(0).toLowerCase() + p.slice(1);
}
