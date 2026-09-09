/**
 * Where a route is filed, in one place. index.json's catalog entry and the
 * ways package's route.json card both answer this question, and the app reads
 * both — a route filed under Spain in one and France in the other would show
 * up twice, in two regions, on the same screen. Neither file owns the rule, so
 * it lives here rather than in either of them.
 */

export const REGION_BY_COUNTRY: Record<string, string> = {
  ES: "Europe", FR: "Europe", PT: "Europe", IT: "Europe", DE: "Europe",
  NO: "Europe", SE: "Europe", GB: "Europe",
  JP: "Asia", IN: "Asia", CN: "Asia", KR: "Asia", NP: "Asia",
  US: "Americas", MX: "Americas", CA: "Americas",
  IL: "Middle East", TR: "Middle East",
};

/**
 * The last country is the one the route ends in — the Camino Francés starts in
 * France and is filed under Spain — and a single-country route is filed under
 * the only one it has.
 */
export function primaryCountry(countries: string[] | undefined): string {
  const list = countries ?? [];
  return list.length > 1 ? list[list.length - 1] : list[0] ?? "";
}

export function regionOf(country: string): string {
  return REGION_BY_COUNTRY[country] ?? "Other";
}

/**
 * The route detail pages spell their Countries cell in English — "France →
 * Spain" against routes/camino-frances/metadata.json's ["FR", "ES"] — so
 * something has to hold the correspondence for a check to compare the two.
 * REGION_BY_COUNTRY above answers a different question (which continent a
 * route is filed under) and cannot stand in for this one.
 *
 * Deliberately not an ISO 3166 table. It covers exactly the four codes the
 * corpus uses today — ES, FR, JP, PT are the only codes any metadata.json
 * under routes/ carries — because countryName returns undefined for anything
 * else and its caller
 * treats that as "nothing to compare" rather than a failure. A route through
 * Italy would then publish an unchecked Countries cell until someone adds IT
 * here, which is the right way round: a new country must not break CI before
 * anyone has written its page. Growing this map is how that coverage is
 * turned back on.
 */
const COUNTRY_NAME: Record<string, string> = {
  ES: "Spain",
  FR: "France",
  JP: "Japan",
  PT: "Portugal",
};

export function countryName(code: string): string | undefined {
  return COUNTRY_NAME[code];
}
