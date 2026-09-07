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
}

const KINDS = new Set(["legs", "alternatives"]);

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

  return {
    id: block.id,
    name: block.name as Record<string, string>,
    kind: block.kind as "legs" | "alternatives",
    order: block.order,
    ...(block.circular === undefined ? {} : { circular: block.circular as boolean }),
  };
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
