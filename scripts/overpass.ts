export const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * The Overpass interpreter every script here posts to. `OVERPASS_URL` points
 * them all at another public instance of the same OpenStreetMap database when
 * the main one cannot be reached from where the pipeline runs — the data and
 * its licence are the same, only the server differs. Unset or blank, nothing
 * changes.
 */
export function overpassUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OVERPASS_URL?.trim();
  return configured ? configured : DEFAULT_OVERPASS_URL;
}
