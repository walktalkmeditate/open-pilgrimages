import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * "Which directories are sections?" has one answer, and it lives here rather
 * than in whichever script happened to need it first: a section is any
 * directory with a metadata.json, and a route's variants/ subdirectory holds
 * more of them. `validate` (which polices stages, chains and drafted text)
 * and `check-drafted-diff` (the CI gate that refuses a review-less strip)
 * have to agree on that set exactly, or a section one of them walks and the
 * other does not is a section only half-checked — which is how drafted text
 * under variants/ could once have reached main unreviewed.
 */
export function findRouteDirectories(root: string): string[] {
  const dirs: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (!statSync(full).isDirectory()) continue;
      if (existsSync(join(full, "metadata.json"))) {
        dirs.push(full);
      }
      const variantsDir = join(full, "variants");
      if (existsSync(variantsDir) && statSync(variantsDir).isDirectory()) {
        walk(variantsDir);
      }
    }
  }

  walk(join(root, "routes"));
  return dirs;
}
