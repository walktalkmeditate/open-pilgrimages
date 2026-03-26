import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

type Ajv = InstanceType<typeof Ajv2020>;
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dirname, "..");

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
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

interface ValidationError {
  file: string;
  message: string;
  severity: "error" | "warning";
}

function createValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const schemaDir = join(ROOT, "schema");
  const schemas: Record<string, object> = {};

  for (const name of [
    "index.schema.json",
    "pilgrimage.schema.json",
    "stages.schema.json",
    "route.schema.json",
    "waypoints.schema.json",
  ]) {
    const schema = loadJson(join(schemaDir, name));
    schemas[name] = schema;
    ajv.addSchema(schema, name);
  }

  return { ajv, schemas };
}

function validateFile(
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

  const meta = existsSync(metaPath) ? loadJson(metaPath) : null;
  const stages = existsSync(stagesPath) ? loadJson(stagesPath) : null;
  const route = existsSync(routePath) ? loadJson(routePath) : null;
  const wp = existsSync(wpPath) ? loadJson(wpPath) : null;

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
      for (const coord of feat.geometry.coordinates) {
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

function main() {
  const { ajv } = createValidator();
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

    validateDataConsistency(dir, errors);
  }

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

main();
