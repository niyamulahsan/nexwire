/**
 * A name is safe when it can be used as a folder name, a URL segment, a table
 * name and a TypeScript identifier without further quoting.
 *
 * Kebab-case, snake_case and camelCase all pass: `pascal` already folds `-` and
 * `_`, and names are lowercased before this test. What fails is anything that
 * would produce uncompilable code - spaces and dots break the generated
 * `@/modules/...` import, a leading digit breaks the identifier.
 */
const NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;

/**
 * Best-effort readable repair of a rejected name, used only in error text.
 * Returns "" when no safe suggestion exists (e.g. a leading digit cannot be
 * reordered without guessing the developer's intent).
 */
function suggestName(value) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (!cleaned || !/^[a-z]/.test(cleaned)) return "";
  return cleaned;
}

/**
 * Validate that a name value exists and is safe to use.
 * Throws with the exact command to run instead when the value is unusable.
 */
export function assertName(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  const name = value.trim().toLowerCase();
  if (NAME_PATTERN.test(name)) return name;

  const suggestion = suggestName(value);
  const reason = /^[0-9]/.test(name)
    ? "must start with a lowercase letter"
    : "may only contain lowercase letters, numbers, dashes and underscores";
  throw new Error(`Invalid ${label.toLowerCase()}: "${value}" - a name ${reason}.${suggestion ? ` Use "${suggestion}" instead.` : ""}`);
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
