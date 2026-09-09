import { byCodepoint } from "./cli.js";

export interface PilgrimageBlock {
  id: string;
  name: Record<string, string>;
  kind: "legs" | "alternatives";
  order: number;
  /**
   * The walk returns to where it began. It belongs here and not on a section's
   * `overview.topology`, because Shikoku's four dōjō are each linear — Awa runs
   * Temple 1 to 23 and does not come back — and only the circuit they add up to
   * closes.
   */
  circular?: boolean;
  /**
   * Counts measured over the whole walk. Carried here rather than in a
   * section's `stats.json` because that file's figures are one route's, and a
   * completion certificate issued for a circuit belongs to no leg of it. The
   * shape is `schema/pilgrimage.schema.json`'s to state; this module only
   * carries it, so a field added there needs no change here.
   */
  stats?: Record<string, unknown>;
}

const KINDS = new Set(["legs", "alternatives"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A section's declaration of the pilgrimage it belongs to. `build-index`
 * derives `pilgrimages[]` from these and `validate` checks them against each
 * other, so both read the block through here and cannot drift.
 */
export function readPilgrimage(metadata: unknown): PilgrimageBlock | undefined {
  const raw = (metadata as { pilgrimage?: unknown } | null)?.pilgrimage;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object") throw new Error("pilgrimage must be an object");
  const block = raw as Record<string, unknown>;

  if (typeof block.id !== "string" || !/^[a-z0-9-]+$/.test(block.id)) {
    throw new Error("pilgrimage.id must be a kebab-case string");
  }
  if (typeof block.name !== "object" || block.name === null || typeof (block.name as Record<string, unknown>).en !== "string") {
    throw new Error("pilgrimage.name must be a localized object with en");
  }
  if (typeof block.kind !== "string" || !KINDS.has(block.kind)) {
    throw new Error(`pilgrimage.kind must be "legs" or "alternatives"`);
  }
  if (typeof block.order !== "number" || !Number.isInteger(block.order) || block.order < 1) {
    throw new Error("pilgrimage.order must be a positive integer");
  }
  if (block.circular !== undefined && typeof block.circular !== "boolean") {
    throw new Error("pilgrimage.circular must be a boolean");
  }
  if (block.stats !== undefined && !isPlainObject(block.stats)) {
    throw new Error("pilgrimage.stats must be an object");
  }

  return {
    id: block.id,
    name: block.name as Record<string, string>,
    kind: block.kind as "legs" | "alternatives",
    order: block.order,
    ...(block.circular === undefined ? {} : { circular: block.circular as boolean }),
    ...(block.stats === undefined ? {} : { stats: block.stats }),
  };
}

/**
 * Where two copies of the same block first disagree, as a path a contributor
 * can go and open — `stats.annualPilgrims.walkingCompletions.trend[20].count`.
 *
 * The `name` check beside this one in `validate` names the locale rather than
 * printing both blocks, for the reason this exists: a field is where the fix
 * has to be made. `stats` is a hundred lines deep, so a whole-block comparison
 * could only report that two files differ somewhere inside it.
 *
 * Key order is not a disagreement. The same block hand-copied into four
 * metadata.json files differs in the order its keys were typed and in nothing
 * else, which is the trap a serialized comparison falls into.
 */
export function firstDifferingPath(a: unknown, b: unknown, path: string): string | undefined {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return path;
    for (const [i, item] of a.entries()) {
      const deeper = firstDifferingPath(item, b[i], `${path}[${i}]`);
      if (deeper !== undefined) return deeper;
    }
    return undefined;
  }

  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return path;
    // The union of both key sets, so a key one side leaves out is a difference
    // rather than a key nobody looks at.
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(byCodepoint)) {
      const deeper = firstDifferingPath(a[key], b[key], `${path}.${key}`);
      if (deeper !== undefined) return deeper;
    }
    return undefined;
  }

  return Object.is(a, b) ? undefined : path;
}

export function groupSections(
  sections: { routeId: string; block: PilgrimageBlock }[],
): Map<string, { block: PilgrimageBlock; routeIds: string[] }> {
  const grouped = new Map<string, { block: PilgrimageBlock; routeIds: string[] }>();
  for (const { routeId, block } of [...sections].sort(
    (a, b) => a.block.order - b.block.order || byCodepoint(a.routeId, b.routeId),
  )) {
    const existing = grouped.get(block.id);
    if (existing) existing.routeIds.push(routeId);
    else grouped.set(block.id, { block, routeIds: [routeId] });
  }
  return grouped;
}
