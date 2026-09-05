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
