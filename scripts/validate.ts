import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { resolveInvokedPath } from "./cli.js";
import { RESERVED_PAGE_NAMES } from "./pages.js";
import { nearestVertex, walkedLine, haversineMeters, SNAP_METERS } from "./ways/geo.js";
import type { Position } from "./ways/types.js";
import { readPilgrimage, groupSections, type PilgrimageBlock } from "./pilgrimage.js";

type Ajv = InstanceType<typeof Ajv2020>;

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * One contributor's syntax error is one file's problem. Read bare, it threw an
 * unattributed SyntaxError out of whichever check reached the file first and
 * took every error already collected with it — from the tool whose whole job
 * is naming files. `unchecked` says what the run lost, since the same file is
 * read by several checks and each loses something different.
 */
function readJsonOrReport(
  root: string,
  path: string,
  errors: ValidationError[],
  unchecked: string,
): unknown | undefined {
  try {
    return loadJson(path);
  } catch {
    errors.push({
      file: relative(root, path),
      message: `Invalid JSON, so ${unchecked} was not checked`,
      severity: "error",
    });
    return undefined;
  }
}

function findRouteDirectories(): string[] {
  const routesDir = join(ROOT, "routes");
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

  walk(routesDir);
  return dirs;
}

export interface ValidationError {
  file: string;
  message: string;
  severity: "error" | "warning";
}

export function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const schemaDir = join(ROOT, "schema");

  for (const name of [
    "index.schema.json",
    "pilgrimage.schema.json",
    "stages.schema.json",
    "route.schema.json",
    "waypoints.schema.json",
    "way.schema.json",
    "way-route.schema.json",
    "way-report.schema.json",
  ]) {
    ajv.addSchema(loadJson(join(schemaDir, name)), name);
  }

  return ajv;
}

export function validateFile(
  ajv: Ajv,
  schemaName: string,
  filePath: string,
  errors: ValidationError[]
) {
  if (!existsSync(filePath)) return;

  let data: unknown;
  try {
    data = loadJson(filePath);
  } catch {
    errors.push({
      file: relative(ROOT, filePath),
      message: "Invalid JSON",
      severity: "error",
    });
    return;
  }

  const valid = ajv.validate(schemaName, data);
  if (!valid && ajv.errors) {
    for (const err of ajv.errors) {
      errors.push({
        file: relative(ROOT, filePath),
        message: `${err.instancePath || "/"}: ${err.message}`,
        severity: "error",
      });
    }
  }
}

function validateDataConsistency(
  routeDir: string,
  errors: ValidationError[]
): void {
  const rel = (f: string) => relative(ROOT, f);

  const metaPath = join(routeDir, "metadata.json");
  const stagesPath = join(routeDir, "stages.json");
  const routePath = join(routeDir, "route.geojson");
  const wpPath = join(routeDir, "waypoints.geojson");

  // main() reaches this before the pilgrimage-level checks, so an unguarded
  // read here would kill the run just as surely as one of theirs. The shapes
  // stay loose: validateFile has already run them against their schemas, and
  // this function only cross-checks fields against each other.
  const read = (path: string, unchecked: string): any =>
    existsSync(path) ? readJsonOrReport(ROOT, path, errors, unchecked) : null;

  const meta = read(metaPath, "this route's cross-checks");
  const stages = read(stagesPath, "its stage cross-checks");
  const route = read(routePath, "its route cross-checks");
  const wp = read(wpPath, "its waypoint cross-checks");

  if (!meta) return;
  const routeId = meta.id;

  if (stages) {
    if (stages.stageCount !== stages.stages.length) {
      errors.push({
        file: rel(stagesPath),
        message: `stageCount=${stages.stageCount} but ${stages.stages.length} stages in array`,
        severity: "error",
      });
    }
    if (stages.routeId !== routeId) {
      errors.push({
        file: rel(stagesPath),
        message: `routeId="${stages.routeId}" doesn't match metadata id="${routeId}"`,
        severity: "error",
      });
    }
    for (const stage of stages.stages) {
      const hp = stage.highPointMeters;
      const startElev = stage.start?.coordinates?.[2];
      const endElev = stage.end?.coordinates?.[2];
      if (hp != null && startElev != null && endElev != null) {
        if (hp < Math.max(startElev, endElev)) {
          errors.push({
            file: rel(stagesPath),
            message: `stage ${stage.index}: highPoint ${hp}m < endpoint ${Math.max(startElev, endElev)}m`,
            severity: "error",
          });
        }
      }
    }
  }

  if (route) {
    for (const feat of route.features) {
      const fid = feat.properties?.routeId;
      if (fid && fid !== routeId) {
        errors.push({
          file: rel(routePath),
          message: `feature "${feat.id}": routeId="${fid}" doesn't match "${routeId}"`,
          severity: "error",
        });
      }
    }
  }

  if (wp) {
    for (const feat of wp.features) {
      const fid = feat.properties?.routeId;
      if (!fid) {
        errors.push({
          file: rel(wpPath),
          message: `waypoint "${feat.id}" missing routeId`,
          severity: "error",
        });
      } else if (fid !== routeId) {
        errors.push({
          file: rel(wpPath),
          message: `waypoint "${feat.id}": routeId="${fid}" doesn't match "${routeId}"`,
          severity: "error",
        });
      }
    }
  }

  const bbox = meta.overview?.bbox;
  if (bbox && route) {
    for (const feat of route.features) {
      const positions =
        feat.geometry.type === "MultiLineString"
          ? feat.geometry.coordinates.flat()
          : feat.geometry.coordinates;
      for (const coord of positions) {
        const [lon, lat] = coord;
        if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
          errors.push({
            file: rel(routePath),
            message: `coordinate [${lon},${lat}] outside bbox [${bbox}]`,
            severity: "warning",
          });
          break;
        }
      }
    }
  }

  for (const src of meta.provenance?.sources ?? []) {
    if (!src.license) {
      errors.push({
        file: rel(metaPath),
        message: `provenance source "${src.name}" missing license`,
        severity: "error",
      });
    }
  }
}

function stageFileNameFor(index: number): string {
  return `stage-${String(index).padStart(2, "0")}.json`;
}

function stageIndexFromFileName(fileName: string): number {
  return Number(fileName.slice("stage-".length, fileName.length - ".json".length));
}

/**
 * The build validates what it writes, but the committed files are what ships:
 * a hand-edited stage file, or one left behind by an older build, would
 * otherwise reach the CDN unchecked. Schema validation alone can't catch a
 * package that drifted from a correct build — a stale route.json, a copied
 * stage file, a partial commit after a mid-build failure — because the
 * identity and index fields the phone's importer cross-checks are each
 * independently valid, just inconsistent with each other. This function is
 * that cross-check, mirroring PilgrimageWayImporter's own guards.
 */
export function validateWays(ajv: Ajv, routeDir: string, errors: ValidationError[]): void {
  const waysDir = join(routeDir, "ways");
  if (!existsSync(waysDir) || !statSync(waysDir).isDirectory()) return;

  const metaPath = join(routeDir, "metadata.json");
  const meta = existsSync(metaPath)
    ? (readJsonOrReport(ROOT, metaPath, errors, "the ways package's identity") as { id?: string } | undefined)
    : undefined;
  const routeId: string | undefined = meta?.id;

  validateFile(ajv, "way-report.schema.json", join(waysDir, "report.json"), errors);

  const routePath = join(waysDir, "route.json");
  validateFile(ajv, "way-route.schema.json", routePath, errors);

  let route: { stageCount?: unknown; stages?: Array<{ index?: unknown }> } | undefined;
  if (existsSync(routePath)) {
    try {
      route = loadJson(routePath);
    } catch {
      route = undefined; // validateFile above already recorded the Invalid JSON error
    }
  }

  if (route) {
    const stageCount = route.stageCount;
    const indices = (route.stages ?? []).map((s) => s.index);

    if (typeof stageCount === "number" && indices.length !== stageCount) {
      errors.push({
        file: relative(ROOT, routePath),
        message: `${routeId}: stageCount=${stageCount} but the stages array has ${indices.length} entries`,
        severity: "error",
      });
    }

    const expectedCount = typeof stageCount === "number" ? stageCount : indices.length;
    const expectedIndices = Array.from({ length: expectedCount }, (_, i) => i);
    const sortedIndices = [...indices].sort((a, b) => Number(a) - Number(b));
    if (JSON.stringify(sortedIndices) !== JSON.stringify(expectedIndices)) {
      errors.push({
        file: relative(ROOT, routePath),
        message: `${routeId}: stage indices ${JSON.stringify(indices)} are not exactly 0..<${expectedCount}`,
        severity: "error",
      });
    }

    if (typeof stageCount === "number") {
      for (let i = 0; i < stageCount; i++) {
        const stagePath = join(waysDir, stageFileNameFor(i));
        if (!existsSync(stagePath)) {
          errors.push({
            file: relative(ROOT, stagePath),
            message: `${routeId}: route.json declares stageCount=${stageCount} but this stage file is missing`,
            severity: "error",
          });
        }
      }
    }
  }

  for (const entry of readdirSync(waysDir)) {
    // stageFileName pads to at least two digits, and the schemas allow up to
    // 200 stages, so a three-digit stage (stage-100.json) must match too.
    if (!/^stage-\d{2,3}\.json$/.test(entry)) continue;
    const stagePath = join(waysDir, entry);
    validateFile(ajv, "way.schema.json", stagePath, errors);

    let stageFile: { id?: unknown; stage?: { routeId?: unknown; index?: unknown; count?: unknown; hours?: { min?: unknown; max?: unknown } } } | undefined;
    try {
      stageFile = loadJson(stagePath);
    } catch {
      // validateFile above already recorded the Invalid JSON error
    }
    if (!stageFile) continue;

    const nn = stageIndexFromFileName(entry);
    const expectedId = `pilgrimage:${routeId}:${nn}`;
    if (stageFile.id !== expectedId) {
      errors.push({
        file: relative(ROOT, stagePath),
        message: `id "${stageFile.id}" does not match the expected "${expectedId}" for route "${routeId}"`,
        severity: "error",
      });
    }

    const stage = stageFile.stage;
    if (stage) {
      if (stage.routeId !== routeId) {
        errors.push({
          file: relative(ROOT, stagePath),
          message: `stage.routeId "${stage.routeId}" does not match route "${routeId}"`,
          severity: "error",
        });
      }
      if (stage.index !== nn) {
        errors.push({
          file: relative(ROOT, stagePath),
          message: `stage.index ${stage.index} does not match this file's own index ${nn}`,
          severity: "error",
        });
      }
      if (typeof stage.index === "number" && typeof stage.count === "number" && !(stage.index < stage.count)) {
        errors.push({
          file: relative(ROOT, stagePath),
          message: `stage.index ${stage.index} is not less than stage.count ${stage.count}`,
          severity: "error",
        });
      }
      const hours = stage.hours;
      if (hours && typeof hours.min === "number" && typeof hours.max === "number" && hours.min > hours.max) {
        errors.push({
          file: relative(ROOT, stagePath),
          message: `hours.min ${hours.min} is greater than hours.max ${hours.max}`,
          severity: "error",
        });
      }
    }
  }
}

interface AnchoredStage {
  index?: unknown;
  name?: { en?: unknown };
  start?: { coordinates?: unknown };
  end?: { coordinates?: unknown };
}

/**
 * A walked line and the stage anchors it was cut for can drift apart without
 * either file becoming invalid on its own, and CI's drift check cannot see it:
 * that check reruns the build and diffs the output, and the build happily
 * rebuilds from the stale line. Editing a stage's start or end in stages.json
 * without rerunning `npm run build-main-line` is exactly that — the anchor
 * moves off the line, build-ways quietly falls back to placing the boundary by
 * declared distance instead of by position, and the stage that ships is cut in
 * the wrong place.
 *
 * So: every anchor must be within the distance the build is willing to snap
 * across. Only routes that have a walked line are checked; a route still
 * cutting from route.geojson has nothing to be stale against.
 */
export function validateWalkedLine(routeDir: string, errors: ValidationError[]): void {
  const linePath = join(routeDir, "route.main.geojson");
  const stagesPath = join(routeDir, "stages.json");
  const metaPath = join(routeDir, "metadata.json");
  if (!existsSync(linePath) || !existsSync(stagesPath)) return;

  let line: Position[];
  let stages: unknown;
  let routeId: unknown;
  try {
    line = walkedLine(loadJson(linePath));
    stages = loadJson(stagesPath)?.stages;
    routeId = existsSync(metaPath) ? loadJson(metaPath)?.id : undefined;
  } catch {
    return; // validateFile above already recorded the Invalid JSON error
  }
  if (line.length === 0 || !Array.isArray(stages)) return;

  for (const stage of stages as AnchoredStage[]) {
    for (const end of ["start", "end"] as const) {
      const coordinates = stage[end]?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;

      const found = nearestVertex(line, coordinates as Position);
      if (found.meters > SNAP_METERS) {
        errors.push({
          file: relative(ROOT, linePath),
          message:
            `${routeId}: stage ${stage.index} ("${stage.name?.en}") ${end} is ` +
            `${Math.round(found.meters)} m from the nearest point on the walked line, past the ` +
            `${SNAP_METERS} m the build can snap across — either the anchor moved or the line is ` +
            `stale; rerun npm run build-main-line`,
          severity: "error",
        });
      }
    }
  }
}

export function validatePilgrimages(root: string, dirs: string[], errors: ValidationError[]): void {
  const declared: { routeId: string; dir: string; block: PilgrimageBlock }[] = [];
  const routeIds = new Set<string>();

  for (const dir of dirs) {
    const metaPath = join(dir, "metadata.json");
    if (!existsSync(metaPath)) continue;
    const meta = readJsonOrReport(root, metaPath, errors, "its pilgrimage block") as
      | { id?: string }
      | undefined;
    if (!meta) continue;
    const routeId = meta.id ?? basename(dir);
    // A variant ships no page of its own, so only a top-level route competes
    // with a pilgrimage for docs/<id>.html.
    if (dirname(dir) === join(root, "routes")) routeIds.add(routeId);
    try {
      const block = readPilgrimage(meta);
      if (block) declared.push({ routeId, dir, block });
    } catch (error) {
      errors.push({
        file: relative(root, metaPath),
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
      });
    }
  }

  for (const id of groupSections(declared.map(({ routeId, block }) => ({ routeId, block }))).keys()) {
    const members = declared.filter((d) => d.block.id === id);

    // Both collisions are also checked by check-site, but only after
    // build-assets has already written docs/<id>.html over whatever was
    // there. validate runs before the generator in the pipeline and in CI, so
    // this is where a claim on someone else's page can still be refused
    // rather than reported as damage.
    if (RESERVED_PAGE_NAMES.has(id)) {
      errors.push({
        file: `pilgrimage:${id}`,
        message: `pilgrimage id "${id}" collides with a reserved page name; its generated page would shadow docs/${id}.html`,
        severity: "error",
      });
    }

    if (routeIds.has(id)) {
      errors.push({
        file: `pilgrimage:${id}`,
        message: `"${id}" is claimed twice — it is both a pilgrimage and a route id, and the two share one page under docs/`,
        severity: "error",
      });
    }

    // One pilgrimage, one identity: build-index derives a single entry from
    // whichever section it reads first, so disagreement would be silent.
    const kinds = new Set(members.map((m) => m.block.kind));
    if (kinds.size > 1) {
      errors.push({
        file: `pilgrimage:${id}`,
        message: `sections of "${id}" declare conflicting kind: ${[...kinds].map((k) => `"${k}"`).join(" vs ")}`,
        severity: "error",
      });
    }

    // The flag decides whether the circuit is checked at all, so one section
    // quietly leaving it out would decide for the other three.
    const circles = new Set(members.map((m) => m.block.circular === true));
    if (circles.size > 1) {
      errors.push({
        file: `pilgrimage:${id}`,
        message: `sections of "${id}" declare conflicting circular: ${[...circles].join(" vs ")}`,
        severity: "error",
      });
    }

    // Locale by locale, not block against block: the same name hand-copied
    // into four metadata.json files differs only in the order its keys were
    // typed, and comparing serialized objects read that as a conflict. The
    // locale is also the thing a contributor has to go and fix.
    for (const locale of [...new Set(members.flatMap((m) => Object.keys(m.block.name)))].sort()) {
      const values = new Set(members.map((m): string | undefined => m.block.name[locale]));
      if (values.size > 1) {
        const written = [...values].map((v) => (v === undefined ? "(absent)" : `"${v}"`));
        errors.push({
          file: `pilgrimage:${id}`,
          message: `sections of "${id}" declare conflicting name.${locale}: ${written.join(" vs ")}`,
          severity: "error",
        });
      }
    }
    const orders = members.map((m) => m.block.order);
    const duplicate = orders.find((o, i) => orders.indexOf(o) !== i);
    if (duplicate !== undefined) {
      errors.push({
        file: `pilgrimage:${id}`,
        message: `two sections of "${id}" claim order ${duplicate}`,
        severity: "error",
      });
    }
  }
}

interface ChainStage {
  index: number;
  start?: { name?: { en?: string }; coordinates?: number[] };
  end?: { name?: { en?: string }; coordinates?: number[] };
}

/** Where a section begins or ends: the one place and point the chain compares. */
interface ChainEnd {
  name: string;
  coordinates: Position;
}

/**
 * A stage that already failed its schema still reaches the chain, because
 * main() collects errors rather than exiting and the cast above hides the
 * half-written stage from tsc. Both the distance and the message it would
 * print need the anchor whole, so an anchor missing either half is reported
 * rather than dereferenced.
 */
function chainEnd(stage: ChainStage | undefined, side: "start" | "end"): ChainEnd | undefined {
  const anchor = stage?.[side];
  const coordinates = anchor?.coordinates;
  if (typeof anchor?.name?.en !== "string") return undefined;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return undefined;
  return { name: anchor.name.en, coordinates: coordinates as Position };
}

/**
 * Spec sections 4.3 and 5.2: a section whose way graph cannot be closed ships
 * metadata-only with `ways: null` and waits for a later release, rather than
 * holding its pilgrimage's release open. So a deferred section's absent
 * stages.json is a state the design intends, and one unbuildable dōjō must not
 * make the whole of Shikoku unshippable.
 *
 * A route absent from index.json is not read as deferred: build-index has
 * simply not run since it was added, and guessing the generous reading there
 * would turn every unlisted section's missing package into a warning.
 */
function deferredSectionIds(root: string, errors: ValidationError[]): Set<string> {
  const indexPath = join(root, "index.json");
  if (!existsSync(indexPath)) return new Set();

  const index = readJsonOrReport(root, indexPath, errors, "which sections are deferred") as
    | { routes?: { id?: unknown; ways?: unknown }[] }
    | undefined;

  const deferred = new Set<string>();
  for (const route of index?.routes ?? []) {
    // build-index omits the key entirely rather than writing null, and the
    // design's phrase for the same state is `ways: null`.
    if (typeof route.id === "string" && (route.ways === undefined || route.ways === null)) {
      deferred.add(route.id);
    }
  }
  return deferred;
}

/**
 * A `legs` pilgrimage is one walk cut into sections that ship as separate
 * routes; nothing else checks that section N+1 actually starts where N left
 * off. `alternatives` pilgrimages have no such seam — a walker picks one
 * section, not all of them — so only `legs` blocks are chained here.
 */
export function validateSectionChain(root: string, dirs: string[], errors: ValidationError[]): void {
  const declared: { routeId: string; dir: string; block: PilgrimageBlock }[] = [];

  for (const dir of dirs) {
    const metaPath = join(dir, "metadata.json");
    if (!existsSync(metaPath)) continue;
    const meta = readJsonOrReport(root, metaPath, errors, "the chain through this section") as
      | { id?: string }
      | undefined;
    if (!meta) continue;
    let block: PilgrimageBlock | undefined;
    try {
      block = readPilgrimage(meta);
    } catch {
      // validatePilgrimages already reported this block; skip the section
      // rather than the run, so one bad file cannot hide every other gap.
      continue;
    }
    if (!block || block.kind !== "legs") continue;
    declared.push({ routeId: meta.id ?? basename(dir), dir, block });
  }

  if (declared.length === 0) return;
  const deferredIds = deferredSectionIds(root, errors);

  for (const [, { block: pilgrimage, routeIds }] of groupSections(
    declared.map(({ routeId, block }) => ({ routeId, block })),
  )) {
    const ordered = routeIds.map((routeId) => declared.find((d) => d.routeId === routeId)!);
    const ends = ordered.map((section) => {
      const stagesPath = join(section.dir, "stages.json");
      // Either way the chain breaks here rather than bridging across: measuring
      // on would compare two sections that are not adjacent and report the
      // distance between them as a gap nobody's data claims.
      if (!existsSync(stagesPath)) {
        const deferred = deferredIds.has(section.routeId);
        errors.push({
          file: relative(root, stagesPath),
          message: deferred
            ? `section "${section.routeId}" of "${section.block.id}" ships metadata-only ` +
              `(no ways in index.json), so the chain is not checked through it`
            : `section "${section.routeId}" of "${section.block.id}" has no stages.json, ` +
              `so the chain cannot be checked through it`,
          severity: deferred ? "warning" : "error",
        });
        return { section, first: undefined, last: undefined };
      }

      const stagesFile = readJsonOrReport(
        root,
        stagesPath,
        errors,
        `the chain through "${section.routeId}"`,
      ) as { stages?: ChainStage[] } | undefined;
      if (!stagesFile) return { section, first: undefined, last: undefined };

      const stages = stagesFile.stages;
      // main() collects errors rather than exiting, so a stages.json that
      // already failed its schema still arrives here. Reading sorted[0] off
      // it threw a bare TypeError naming no file, from the tool whose job is
      // naming files.
      if (!Array.isArray(stages) || stages.length === 0) {
        errors.push({
          file: relative(root, stagesPath),
          message: `section "${section.routeId}" has no stages, so the chain cannot be checked through it`,
          severity: "error",
        });
        return { section, first: undefined, last: undefined };
      }
      const sorted = [...stages].sort((a, b) => a.index - b.index);
      const first = chainEnd(sorted[0], "start");
      const last = chainEnd(sorted[sorted.length - 1], "end");
      if (!first || !last) {
        const side = first ? "end" : "start";
        const stage = first ? sorted[sorted.length - 1] : sorted[0];
        errors.push({
          file: relative(root, stagesPath),
          message:
            `section "${section.routeId}" stage ${stage.index} has no usable ${side} anchor ` +
            `(a name.en and coordinates), so the chain cannot be checked through it`,
          severity: "error",
        });
        return { section, first: undefined, last: undefined };
      }
      return { section, first, last };
    });

    for (let i = 0; i < ends.length - 1; i++) {
      const from = ends[i];
      const to = ends[i + 1];
      // A section with no endpoints is not a seam. Measuring across it would
      // compare two sections that are not adjacent and report the distance
      // between them as a gap that nobody's data claims.
      if (!from.last || !to.first) continue;

      const gap = haversineMeters(from.last.coordinates, to.first.coordinates);
      if (gap > SNAP_METERS) {
        errors.push({
          file: relative(root, from.section.dir),
          message:
            `section "${from.section.routeId}" ends at "${from.last.name}" but ` +
            `"${to.section.routeId}" begins at "${to.first.name}", ${Math.round(gap)} m away`,
          severity: "error",
        });
      }
    }

    // A circuit the pilgrimage claims but never walks is the gap this catches.
    // The claim is the pilgrimage's own, checked for agreement across its
    // sections in validatePilgrimages; a section's `overview.topology`
    // describes that section and says nothing about the circuit.
    const closes = ends[ends.length - 1]?.last;
    const opens = ends[0]?.first;
    if (closes && opens && pilgrimage.circular) {
      const closing = haversineMeters(closes.coordinates, opens.coordinates);
      if (closing > SNAP_METERS) {
        errors.push({
          file: relative(root, ends[0].section.dir),
          message:
            `the circuit does not close: "${closes.name}" is ` +
            `${Math.round(closing)} m from "${opens.name}"`,
          severity: "error",
        });
      }
    }
  }
}

const FENCE_LINE = /^(`{3,}|~{3,})/;
const INDENTED_LINE = /^(?: {4,}|\t)/;
const LIST_ITEM_LINE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]/;

/**
 * Per spec section 6, the checklist quotes each stage's drafted text
 * verbatim, so a line shaped like "- [x] stage N" can appear inside that
 * quoted prose without anyone having reviewed anything. Every read below uses
 * this filtered view instead of the raw file, so a quote buried in a fence,
 * blockquote, or indented aside can never masquerade as a real entry.
 *
 * An indented line is dropped as code only where markdown would render it as
 * code. Four spaces under a list item is a nested entry, which is how a
 * checklist that groups its stages under their section is written — dropping
 * those hid real entries, and a hidden entry reads as no entry at all.
 */
function topLevelChecklistLines(checklist: string): string {
  const kept: string[] = [];
  let fenceMarker: string | null = null;
  let inList = false;

  for (const line of checklist.split("\n")) {
    const trimmed = line.trimStart();

    if (fenceMarker !== null) {
      if (trimmed.startsWith(fenceMarker)) fenceMarker = null;
      continue;
    }

    const fenceOpen = FENCE_LINE.exec(trimmed);
    if (fenceOpen) {
      fenceMarker = fenceOpen[1];
      continue;
    }

    if (trimmed.startsWith(">")) continue;
    if (trimmed === "") {
      kept.push(line);
      continue;
    }

    const isListItem = LIST_ITEM_LINE.test(line);
    if (INDENTED_LINE.test(line) && !(inList && isListItem)) continue;

    inList = isListItem;
    kept.push(line);
  }

  return kept.join("\n");
}

/** Every bullet GitHub renders as a task list, including the ordered forms. */
const BULLET = String.raw`(?:[-*+]|\d+[.)])`;
const ANY_BOX = " xX";
const TICKED_BOX = "xX";

/**
 * One builder for every read, so "listed" and "ticked" cannot come to disagree
 * about what an entry for a stage looks like — and one that accepts what a
 * reviewer's editor and GitHub both accept, since a line that renders as a
 * ticked box and does not match here is a review the gate cannot see.
 */
function checklistEntry(lines: string, box: string, label: string): boolean {
  return new RegExp(`^[ \\t]*${BULLET}[ \\t]+\\[[${box}]\\][ \\t]+${label}\\b`, "m").test(lines);
}

interface ReviewChecklist {
  file: string;
  lines: string;
  /** Prefixes every entry in a pilgrimage-level file, and nothing in a section's own. */
  qualifier: string;
}

function readChecklist(root: string, id: string, qualifier: string): ReviewChecklist | undefined {
  const path = join(root, "docs", "review", `${id}.md`);
  if (!existsSync(path)) return undefined;
  return {
    file: `docs/review/${id}.md`,
    lines: topLevelChecklistLines(readFileSync(path, "utf8")),
    qualifier,
  };
}

function mentionsAnyStage(checklist: ReviewChecklist, indices: number[]): boolean {
  return indices.some((index) =>
    checklistEntry(checklist.lines, ANY_BOX, `${checklist.qualifier}stage ${index}`),
  );
}

/**
 * Spec section 6 names the checklist for the pilgrimage, or for the section
 * where a PR's content work is scoped to one — so both have to be looked for,
 * or the anti-strip half of the gate never fires for a whole-pilgrimage PR.
 * The file that reviews these stages is the one that names them: a section
 * file kept for notes must not shadow the pilgrimage file doing the reviewing.
 *
 * Which file it is decides the form of its lines. Four sections of one
 * pilgrimage each have a stage 0, so in a shared file every entry names its
 * section ("- [x] kumano-kodo-kohechi stage 0") and only that form counts:
 * a bare "stage 0" there would clear all four at once.
 */
function reviewChecklist(
  root: string,
  routeId: string,
  pilgrimageId: string | undefined,
  indices: number[],
): ReviewChecklist | undefined {
  const section = readChecklist(root, routeId, "");
  const pilgrimage = pilgrimageId
    ? readChecklist(root, pilgrimageId, `${escapeForPattern(routeId)} `)
    : undefined;

  if (section && mentionsAnyStage(section, indices)) return section;
  if (pilgrimage && mentionsAnyStage(pilgrimage, indices)) return pilgrimage;
  return section ?? pilgrimage;
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The gate is at merge, not at tagging: release.md Phase 2b requires the tag
 * to follow the merge immediately, so a slow review would leave @main naming
 * a release tag that does not exist and every package URL 404ing.
 */
export function validateDraftedText(root: string, dirs: string[], errors: ValidationError[]): void {
  for (const dir of dirs) {
    const stagesPath = join(dir, "stages.json");
    const metaPath = join(dir, "metadata.json");
    if (!existsSync(stagesPath) || !existsSync(metaPath)) continue;
    const meta = readJsonOrReport(root, metaPath, errors, "its drafted stage text") as
      | { id?: string }
      | undefined;
    if (!meta) continue;
    const routeId = meta.id ?? basename(dir);
    const stagesFile = readJsonOrReport(root, stagesPath, errors, "its drafted stage text") as
      | { stages?: { index: number; drafted?: boolean }[] }
      | undefined;
    if (!stagesFile) continue;
    const stages = stagesFile.stages ?? [];

    let pilgrimageId: string | undefined;
    try {
      pilgrimageId = readPilgrimage(meta)?.id;
    } catch {
      // validatePilgrimages already reported this block; a section whose
      // pilgrimage cannot be read simply has no shared checklist to fall
      // back to, and its own file still applies.
    }

    const checklist = reviewChecklist(root, routeId, pilgrimageId, stages.map((stage) => stage.index));
    const sectionFile = `docs/review/${routeId}.md`;
    const example = (index: number, box: string) =>
      `- [${box}] ${checklist?.qualifier ?? ""}stage ${index}`;

    for (const stage of stages) {
      if (stage.drafted !== true) continue;
      errors.push({
        file: relative(root, stagesPath),
        message:
          `stage ${stage.index} is still marked drafted; review it, tick ` +
          `"${example(stage.index, "x")}" in ${checklist?.file ?? sectionFile}, then remove ` +
          `the flag before this merges`,
        severity: "error",
      });
    }

    const drafted = stages.find((stage) => stage.drafted === true);
    if (!checklist) {
      // A review with nowhere to be recorded is no review: the flag could be
      // stripped in the same pass that wrote the text, and nothing would be
      // left in the tree to say a reviewer had ever read it.
      if (drafted) {
        errors.push({
          file: sectionFile,
          message:
            `"${routeId}" ships drafted stage text but has no review checklist; create ` +
            `${sectionFile}, or docs/review/<pilgrimage-id>.md where the PR covers a whole ` +
            `pilgrimage, listing every stage — e.g. "- [ ] stage ${drafted.index}"`,
          severity: "error",
        });
      }
      continue;
    }

    for (const stage of stages) {
      if (stage.drafted === true) continue;
      const label = `${checklist.qualifier}stage ${stage.index}`;
      const listed = checklistEntry(checklist.lines, ANY_BOX, label);
      // A pilgrimage-level file only has the qualified form: the bare form
      // matches nothing above, so writing it here is the exact silent hole
      // the qualified form exists to close, just moved from the wrong
      // filename to the wrong line shape.
      const unqualified =
        checklist.qualifier !== "" && checklistEntry(checklist.lines, ANY_BOX, `stage ${stage.index}`);

      if (listed && !checklistEntry(checklist.lines, TICKED_BOX, label)) {
        errors.push({
          file: checklist.file,
          message: `stage ${stage.index} of "${routeId}" carries no drafted flag but is unticked in ${checklist.file}`,
          severity: "error",
        });
      } else if (!listed && !unqualified) {
        // The gate's other half: an unticked line is refused, and so is no
        // line at all. Without this, deleting the flag and the checklist entry
        // in one pass cleared the stage more quietly than leaving the flag on.
        errors.push({
          file: checklist.file,
          message:
            `stage ${stage.index} of "${routeId}" is not listed in ${checklist.file}; ` +
            `a reviewed stage needs its own line there, e.g. "${example(stage.index, "x")}"`,
          severity: "error",
        });
      }

      if (unqualified) {
        errors.push({
          file: checklist.file,
          message: `stage ${stage.index} of "${routeId}" is unqualified in ${checklist.file}; a pilgrimage-level checklist line must carry its section id, e.g. "- [ ] ${routeId} stage ${stage.index}"`,
          severity: "error",
        });
      }
    }
  }
}

export function validatePinnedRelations(root: string, dirs: string[], errors: ValidationError[]): void {
  for (const dir of dirs) {
    const metaPath = join(dir, "metadata.json");
    // ways/route.json, not ways/: a refused route still leaves a report.json
    // behind, and a route with no walked line has nothing to pin.
    if (!existsSync(metaPath) || !existsSync(join(dir, "ways", "route.json"))) continue;
    const meta = readJsonOrReport(root, metaPath, errors, "its pinned relations") as
      | { id?: string; osm?: { relations?: number[] } }
      | undefined;
    if (!meta) continue;
    if (!Array.isArray(meta.osm?.relations) || meta.osm.relations.length === 0) {
      errors.push({
        file: relative(root, metaPath),
        message: `"${meta.id ?? basename(dir)}" has a ways/ package but no osm.relations to rebuild its walked line from`,
        severity: "error",
      });
    }
  }
}

function main() {
  const ajv = createValidator();
  const errors: ValidationError[] = [];

  const indexPath = join(ROOT, "index.json");
  if (existsSync(indexPath)) {
    validateFile(ajv, "index.schema.json", indexPath, errors);
  }

  const routeDirs = findRouteDirectories();
  console.log(`Found ${routeDirs.length} route(s)\n`);

  for (const dir of routeDirs) {
    const name = relative(join(ROOT, "routes"), dir);
    console.log(`Validating: ${name}`);

    validateFile(ajv, "pilgrimage.schema.json", join(dir, "metadata.json"), errors);
    validateFile(ajv, "stages.schema.json", join(dir, "stages.json"), errors);
    validateFile(ajv, "route.schema.json", join(dir, "route.geojson"), errors);
    validateFile(ajv, "waypoints.schema.json", join(dir, "waypoints.geojson"), errors);
    validateFile(ajv, "route.schema.json", join(dir, "route.main.geojson"), errors);
    validateWays(ajv, dir, errors);
    validateWalkedLine(dir, errors);

    validateDataConsistency(dir, errors);
  }

  validatePilgrimages(ROOT, routeDirs, errors);
  validateSectionChain(ROOT, routeDirs, errors);
  validatePinnedRelations(ROOT, routeDirs, errors);
  validateDraftedText(ROOT, routeDirs, errors);

  const errs = errors.filter((e) => e.severity === "error");
  const warns = errors.filter((e) => e.severity === "warning");

  console.log("");
  if (warns.length > 0) {
    console.log(`Warnings (${warns.length}):`);
    for (const w of warns) {
      console.log(`  ⚠ ${w.file}: ${w.message}`);
    }
  }

  if (errs.length > 0) {
    console.log(`\nErrors (${errs.length}):`);
    for (const e of errs) {
      console.log(`  ✗ ${e.file}: ${e.message}`);
    }
    console.log(`\nValidation failed with ${errs.length} error(s)`);
    process.exit(1);
  }

  console.log(`Validation passed (${warns.length} warning(s))`);
}

if (import.meta.filename === resolveInvokedPath(process.argv[1])) {
  main();
}
