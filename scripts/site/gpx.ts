import { segmentsOf } from "./glyphs.js";
import type { Point } from "./project.js";

const GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1";
const GPX_CREATOR = "open-pilgrimages";
const GPX_VERSION = "1.1";
const SITE_ORIGIN = "https://open.pilgrimag.es";
const ODBL_AUTHOR = "OpenStreetMap contributors";
const ODBL_LICENSE_URL = "https://opendatacommons.org/licenses/odbl/1-0/";
const COORDINATE_PRECISION = 6;

export interface GpxMeta {
  id: string;
  name: string;
  description: string;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

function trkptXml(point: Point): string {
  const [lon, lat] = point;
  return `<trkpt lat="${lat.toFixed(COORDINATE_PRECISION)}" lon="${lon.toFixed(COORDINATE_PRECISION)}"/>`;
}

function trksegXml(segment: Point[]): string {
  return `<trkseg>${segment.map(trkptXml).join("")}</trkseg>`;
}

function metadataXml(meta: GpxMeta, name: string, description: string): string {
  const link = `${SITE_ORIGIN}/${escapeXml(meta.id)}`;
  return (
    `<metadata>` +
    `<name>${name}</name>` +
    `<desc>${description}</desc>` +
    `<copyright author="${escapeXml(ODBL_AUTHOR)}"><license>${escapeXml(ODBL_LICENSE_URL)}</license></copyright>` +
    `<link href="${link}"><text>${name}</text></link>` +
    `</metadata>`
  );
}

/**
 * Renders full-fidelity GPX 1.1 for a route: no timestamp (would break the
 * byte-stability CI relies on) and no waypoints (waypoints.geojson already
 * serves those) — track segments only, one per source segment, so a
 * MultiLineString or a route split across several LineString features draws
 * as distinct legs rather than one implausible continuous line.
 */
export function gpxFrom(geojson: unknown, meta: GpxMeta): string {
  const segments = segmentsOf(geojson);
  if (segments.length === 0) return "";

  const name = escapeXml(meta.name);
  const description = escapeXml(meta.description);

  const trackXml = `<trk><name>${name}</name>${segments.map(trksegXml).join("")}</trk>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx xmlns="${GPX_NAMESPACE}" creator="${GPX_CREATOR}" version="${GPX_VERSION}">` +
    metadataXml(meta, name, description) +
    trackXml +
    `</gpx>\n`
  );
}
