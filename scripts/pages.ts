/**
 * open.pilgrimag.es serves one flat page namespace: every route id, every
 * pilgrimage id, and every hand-authored page compete for the same
 * docs/<name>.html. The rules live here rather than in whichever script
 * happened to need them first, so the generator that writes a page
 * (scripts/site/build-assets.ts), the guard that reads the built site
 * (scripts/site/check-site.ts), and the validator that runs before either
 * (scripts/validate.ts) cannot come to disagree about what may name a page.
 */

/** Hand-authored pages a generated one must never be allowed to shadow. */
export const RESERVED_PAGE_NAMES = new Set([
  "index",
  "routes",
  "schema",
  "usage",
  "contribute",
  "404",
  "styles",
  "hero",
]);

/**
 * An id is interpolated straight into a path under docs/, so anything but a
 * bare slug — a traversal, a nested path, an absolute path — writes somewhere
 * nobody asked for. index.json's schema already constrains ids to this shape;
 * this is here so that constraint is not the only thing standing between a
 * hand-run generator and the rest of the filesystem.
 */
export const PAGE_ID_PATTERN = /^[a-z0-9-]+$/;
