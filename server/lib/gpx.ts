export type StravaStream = { type: string; data: unknown[] };

export interface GpxActivityMeta {
  name: string;
  sport: string;
  startDate: string;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function streamData(streams: StravaStream[], type: string): unknown[] | null {
  const stream = streams.find((entry) => entry.type === type);
  return stream && Array.isArray(stream.data) ? stream.data : null;
}

function numberAt(data: unknown[] | null, index: number): number | null {
  const value = data?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Build a GPX 1.1 document from Strava activity streams (fetched with key_type=time).
 * Returns null when the activity has no `latlng` stream (indoor/treadmill/trainer) — there is no track to export.
 * HR and cadence are emitted via the Garmin TrackPointExtension so other tools (Garmin, agents) can read them.
 */
export function buildGpx(streams: StravaStream[], meta: GpxActivityMeta): string | null {
  const latlng = streamData(streams, "latlng");
  if (!latlng || latlng.length === 0) {
    return null;
  }

  const time = streamData(streams, "time");
  const altitude = streamData(streams, "altitude");
  const heartrate = streamData(streams, "heartrate");
  const cadence = streamData(streams, "cadence");

  const startMs = new Date(meta.startDate).getTime();
  const hasStart = Number.isFinite(startMs);

  const trackpoints: string[] = [];
  for (let i = 0; i < latlng.length; i++) {
    const pair = latlng[i];
    if (!Array.isArray(pair)) continue;
    const coords = pair as unknown[];
    const lat = numberAt(coords, 0);
    const lon = numberAt(coords, 1);
    if (lat == null || lon == null) continue;

    const lines: string[] = [];
    const ele = numberAt(altitude, i);
    if (ele != null) lines.push(`        <ele>${ele}</ele>`);

    const offset = numberAt(time, i);
    if (offset != null && hasStart) lines.push(`        <time>${new Date(startMs + offset * 1000).toISOString()}</time>`);

    const hr = numberAt(heartrate, i);
    const cad = numberAt(cadence, i);
    if (hr != null || cad != null) {
      const ext = `${hr != null ? `<gpxtpx:hr>${Math.round(hr)}</gpxtpx:hr>` : ""}${cad != null ? `<gpxtpx:cad>${Math.round(cad)}</gpxtpx:cad>` : ""}`;
      lines.push(`        <extensions><gpxtpx:TrackPointExtension>${ext}</gpxtpx:TrackPointExtension></extensions>`);
    }

    const inner = lines.length > 0 ? `\n${lines.join("\n")}\n      ` : "";
    trackpoints.push(`      <trkpt lat="${lat}" lon="${lon}">${inner}</trkpt>`);
  }

  const name = escapeXml(meta.name);
  const metadataTime = hasStart ? `\n    <time>${new Date(startMs).toISOString()}</time>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Workout Planner" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">
  <metadata>
    <name>${name}</name>${metadataTime}
  </metadata>
  <trk>
    <name>${name}</name>
    <type>${escapeXml(meta.sport)}</type>
    <trkseg>
${trackpoints.join("\n")}
    </trkseg>
  </trk>
</gpx>
`;
}
