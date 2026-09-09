export interface ProfileStage {
  name: string;
  distanceKm: number;
  highPointMeters: number;
  lowPointMeters: number;
}

interface StagesLike {
  stages?: Array<{
    name?: { en?: string };
    distanceKm?: number;
    highPointMeters?: number;
    lowPointMeters?: number;
  }>;
}

// Shape-check rather than just nullish-check: this reads files it does not
// control, and a declared type with the wrong shape would otherwise throw
// several calls deeper. One Array.isArray per level is the bound here —
// stages.json is schema-validated upstream, so anything more contrived than
// "not an array" is not worth chasing.
export function stagesOf(stagesJson: unknown): ProfileStage[] {
  const stages = (stagesJson as StagesLike)?.stages;
  const raw = Array.isArray(stages) ? stages : [];

  return raw.map((stage) => ({
    name: stage?.name?.en ?? "",
    distanceKm: stage?.distanceKm ?? 0,
    highPointMeters: stage?.highPointMeters ?? 0,
    lowPointMeters: stage?.lowPointMeters ?? 0,
  }));
}

const MINIMUM_RANGE_METERS = 1;

/**
 * A stepped area chart: one flat run per stage, its height the stage's high
 * point, plotted against cumulative distance. Stepped rather than smoothed
 * because stages.json gives bounds per stage, not a continuous elevation
 * series — a smooth curve would imply resolution the data does not have.
 */
export function profileSvg(stages: ProfileStage[], width = 800, height = 120): string {
  if (stages.length === 0) return "";

  // A dataset that declares no high point anywhere has no profile to draw, and
  // the peak floor below would render it as a flat path labelled "high point
  // 1 m" — in an aria-label, as fact. Shikoku's four dōjō are exactly that
  // case: their lines are 2D and their stages carry no elevation at all, on a
  // circuit whose own metadata declares 911 m at Temple 66. Silence is the
  // same answer as no stages: emit nothing, and let the caller skip the file.
  if (stages.every((stage) => stage.highPointMeters === 0)) return "";

  const totalKm = stages.reduce((sum, s) => sum + s.distanceKm, 0) || 1;
  const peak = Math.max(...stages.map((s) => s.highPointMeters), 1);
  const floor = Math.min(...stages.map((s) => s.lowPointMeters));
  const range = peak - floor || MINIMUM_RANGE_METERS;

  const y = (metres: number): number => height - ((metres - floor) / range) * height;

  let cursor = 0;
  let d = `M0,${height.toFixed(1)}`;

  for (const stage of stages) {
    const top = y(stage.highPointMeters).toFixed(1);
    cursor += (stage.distanceKm / totalKm) * width;
    d += ` V${top} H${cursor.toFixed(1)}`;
  }

  d += ` V${height.toFixed(1)} Z`;

  return [
    `<svg viewBox="0 0 ${width} ${height}" class="profile" role="img"`,
    ` aria-label="Elevation profile: ${stages.length} stages, low point ${floor} m, high point ${peak} m">`,
    `<path d="${d}" class="profile-fill"/>`,
    `</svg>`,
  ].join("");
}
