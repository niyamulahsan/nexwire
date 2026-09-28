/** Check if a specific flag name exists in the flags array. */
export function hasFlag(flags, name) {
  return flags.includes(name);
}

/** Extract the value of a --key=value flag from the flags array. Returns fallback if not found. */
export function getOption(flags = [], name, fallback = "") {
  const item = flags.find((flag) => flag.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : fallback;
}

export function stripWorkflowFlags(flags = []) {
  return flags.filter((flag) => !["--server-only", "--app-only", "--refresh", "--dry-run"].includes(flag) && !flag.startsWith("--config="));
}
