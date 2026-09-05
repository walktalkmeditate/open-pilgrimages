/**
 * Every string the build writes is capped at parse time on the app side too;
 * capping here means a long dataset field is truncated once, in a file the
 * reviewer can read, rather than silently on the phone.
 */
export function cap(value: string | undefined, maxCharacters: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, maxCharacters);
}

/**
 * The dataset's localized name maps include `en`, which is already the label.
 * Repeating it as a "local name" would print the same words twice on a card.
 */
export function nonEnglishNames(
  localized: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!localized) return undefined;
  const rest: Record<string, string> = {};
  for (const key of Object.keys(localized).sort()) {
    if (key === "en") continue;
    const value = cap(localized[key], 120);
    if (value) rest[key] = value;
  }
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * `metadata.lastUpdated` is only constrained to `format: date-time`, so a
 * contributor may legally write milliseconds or a `+02:00` offset. The Way
 * schema's `departedAt` pattern demands whole seconds in UTC, so the build
 * normalizes rather than trusting the dataset to have been tidy.
 */
export function wholeSecondISO(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`"${value}" is not a date-time this build can normalize`);
  }
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}
