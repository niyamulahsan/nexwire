/** Validate that a name value exists and return it trimmed+lowercased. Throws if empty. */
export function assertName(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value.trim().toLowerCase();
}

/** Convert a kebab-case or snake_case string to PascalCase. */
export function pascal(input) {
  return input.replace(/(^\w|[-_]\w)/g, (part) => part.replace(/[-_]/g, "").toUpperCase());
}
