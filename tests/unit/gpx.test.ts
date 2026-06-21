import { describe, test, expect } from "vitest";
import { buildGpx, type StravaStream } from "../../server/lib/gpx.ts";

const META = { name: "Morning Run", sport: "Run", startDate: "2026-06-20T06:00:00Z" };

describe("buildGpx", () => {
  test("returns null when there is no latlng stream", () => {
    expect(buildGpx([{ type: "time", data: [0, 1, 2] }], META)).toBeNull();
  });

  test("returns null when latlng is empty", () => {
    expect(buildGpx([{ type: "latlng", data: [] }], META)).toBeNull();
  });

  test("emits a trkpt per coordinate with ele, absolute time and Garmin hr/cad extensions", () => {
    const streams: StravaStream[] = [
      {
        type: "latlng",
        data: [
          [50.06, 19.93],
          [50.07, 19.94],
        ],
      },
      { type: "time", data: [0, 10] },
      { type: "altitude", data: [215, 218] },
      { type: "heartrate", data: [140, 145] },
      { type: "cadence", data: [86, 88] },
    ];
    const gpx = buildGpx(streams, META);

    expect(gpx).not.toBeNull();
    const text = gpx ?? "";
    expect(text.match(/<trkpt /g)).toHaveLength(2);
    expect(text).toContain(`<trkpt lat="50.06" lon="19.93">`);
    expect(text).toContain("<ele>215</ele>");
    // time stream offsets are applied to the activity start
    expect(text).toContain("<time>2026-06-20T06:00:00.000Z</time>");
    expect(text).toContain("<time>2026-06-20T06:00:10.000Z</time>");
    expect(text).toContain("<gpxtpx:hr>140</gpxtpx:hr>");
    expect(text).toContain("<gpxtpx:cad>88</gpxtpx:cad>");
    expect(text).toContain('xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"');
  });

  test("omits optional fields when those streams are absent", () => {
    const gpx = buildGpx([{ type: "latlng", data: [[1, 2]] }], META) ?? "";
    expect(gpx).toContain(`<trkpt lat="1" lon="2"></trkpt>`);
    expect(gpx).not.toContain("<ele>");
    expect(gpx).not.toContain("<extensions>");
  });

  test("skips malformed coordinate pairs", () => {
    const gpx =
      buildGpx(
        [
          {
            type: "latlng",
            data: [[50.06, 19.93], "nope", [null, 1], [50.08, 19.95]],
          },
        ],
        META,
      ) ?? "";
    expect(gpx.match(/<trkpt /g)).toHaveLength(2);
  });

  test("escapes XML special characters in the activity name", () => {
    const gpx = buildGpx([{ type: "latlng", data: [[1, 2]] }], { ...META, name: `A & B <"'>` }) ?? "";
    expect(gpx).toContain("A &amp; B &lt;&quot;&apos;&gt;");
    expect(gpx).not.toContain("A & B <");
  });

  test("rounds heart rate and cadence", () => {
    const gpx =
      buildGpx(
        [
          { type: "latlng", data: [[1, 2]] },
          { type: "heartrate", data: [140.7] },
          { type: "cadence", data: [85.4] },
        ],
        META,
      ) ?? "";
    expect(gpx).toContain("<gpxtpx:hr>141</gpxtpx:hr>");
    expect(gpx).toContain("<gpxtpx:cad>85</gpxtpx:cad>");
  });
});
