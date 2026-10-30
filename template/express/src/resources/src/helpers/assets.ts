// src/helpers/assets.ts

// 1. Eagerly load ALL images in the entire src folder.
// This tells Vite: "Find every image, hash it, and give me the final URL."
const allImages = import.meta.glob("/src/**/*.{png,jpg,jpeg,svg,webp,gif}", {
  eager: true,
  import: "default"
});

/**
 * Resolves ANY image path (using @, relative, or absolute) for both dev and prod.
 */
export default function asset(path: string): string {
  // 1. If it's already a full URL or data URI, return it as is.
  if (path.startsWith("http") || path.startsWith("data:")) {
    return path;
  }

  // 2. Normalize the path.
  // Vite's glob keys always start from the root, like "/src/assets/..."
  let cleanPath = path;

  // Convert alias `@/` to `/src/`
  if (cleanPath.startsWith("@/")) {
    cleanPath = cleanPath.replace("@/", "/src/");
  }
  // Convert absolute `/` to `/src/` (assuming you mean inside src)
  else if (cleanPath.startsWith("/") && !cleanPath.startsWith("/src/")) {
    cleanPath = `/src${cleanPath}`;
  }
  // Convert relative `../../` (This is the tricky part)
  else if (cleanPath.startsWith("../")) {
    // We can't easily resolve `../../` from a utility file, so we just
    // try to find a matching suffix in the glob keys.
    // (e.g., if you pass "../../assets/foo.png", we look for "assets/foo.png" inside /src)
    const match = Object.keys(allImages).find((key) => key.endsWith(cleanPath.replace(/^(\.\.\/)+/, "")));
    if (match) {
      return allImages[match] as string;
    }
  }

  // 3. Look up the normalized path in the glob object
  const resolved = allImages[cleanPath] as string | undefined;

  if (!resolved) {
    console.warn(`[getAssetUrl] Image not found: ${path}. Returning original path.`);
    return path;
  }

  return resolved;
}
