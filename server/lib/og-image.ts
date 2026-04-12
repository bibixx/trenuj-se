import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import fontMedium from "../assets/fonts/PlusJakartaSans-Medium.ttf";
import fontBold from "../assets/fonts/PlusJakartaSans-Bold.ttf";

const WIDTH = 1200;
const HEIGHT = 630;

// Colors matching the dark theme
const COLORS = {
  bg: "#1e1e24",
  bgCard: "rgba(255, 255, 255, 0.05)",
  textPrimary: "#f5f5f6",
  textSecondary: "rgba(255, 255, 255, 0.6)",
  textMuted: "rgba(255, 255, 255, 0.35)",
  accent: "#b8f25d",
  border: "rgba(255, 255, 255, 0.08)",
};

// Satori element helper — avoids needing JSX in server code
type SatoriNode = string | number | null | undefined | boolean | SatoriElement;
interface SatoriElement {
  type: string;
  props: Record<string, unknown> & { children?: SatoriNode | SatoriNode[] };
}

function h(type: string, props: Record<string, unknown>, ...children: SatoriNode[]): SatoriElement {
  const flat = children.flat();
  return { type, props: { ...props, children: flat.length === 1 ? flat[0] : flat } };
}

export interface OgImageData {
  planName: string;
  goal: string | null;
  phaseName: string | null;
  workoutCount: number;
  weekCount: number;
  labelSummary: string[];
}

function buildOgElement(data: OgImageData): SatoriElement {
  const statsItems: string[] = [];
  if (data.workoutCount > 0) statsItems.push(`${data.workoutCount} workouts`);
  if (data.weekCount > 0) statsItems.push(`${data.weekCount} weeks`);
  const statsText = statsItems.join(" · ");

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: WIDTH,
        height: HEIGHT,
        background: COLORS.bg,
        padding: "60px 72px",
        fontFamily: "Plus Jakarta Sans",
      },
    },
    // Top section: branding
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
        },
      },
      h("div", {
        style: {
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: COLORS.accent,
        },
      }),
      h(
        "span",
        {
          style: {
            fontSize: "24px",
            fontWeight: 500,
            color: COLORS.textSecondary,
            letterSpacing: "-0.02em",
          },
        },
        "trenuj.se",
      ),
    ),
    // Middle section: plan info
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        },
      },
      // Phase badge
      data.phaseName
        ? h(
            "div",
            { style: { display: "flex" } },
            h(
              "span",
              {
                style: {
                  fontSize: "16px",
                  fontWeight: 500,
                  color: COLORS.accent,
                  background: "rgba(184, 242, 93, 0.1)",
                  padding: "6px 16px",
                  borderRadius: "999px",
                },
              },
              data.phaseName,
            ),
          )
        : null,
      // Plan name
      h(
        "div",
        {
          style: {
            fontSize: data.planName.length > 30 ? "48px" : "56px",
            fontWeight: 700,
            color: COLORS.textPrimary,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            // Satori supports text overflow via maxLines
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          },
        },
        data.planName,
      ),
      // Goal
      data.goal
        ? h(
            "div",
            {
              style: {
                fontSize: "24px",
                fontWeight: 500,
                color: COLORS.textSecondary,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              },
            },
            data.goal,
          )
        : null,
    ),
    // Bottom section: stats + labels
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        },
      },
      // Stats
      statsText
        ? h(
            "span",
            {
              style: {
                fontSize: "20px",
                fontWeight: 500,
                color: COLORS.textMuted,
              },
            },
            statsText,
          )
        : h("span", {}),
      // Label pills
      data.labelSummary.length > 0
        ? h(
            "div",
            {
              style: {
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                maxWidth: "50%",
              },
            },
            ...data.labelSummary.slice(0, 4).map((label) =>
              h(
                "span",
                {
                  style: {
                    fontSize: "16px",
                    fontWeight: 500,
                    color: COLORS.textSecondary,
                    background: COLORS.bgCard,
                    border: `1px solid ${COLORS.border}`,
                    padding: "6px 16px",
                    borderRadius: "999px",
                  },
                },
                label,
              ),
            ),
          )
        : null,
    ),
  );
}

// WASM singleton
let wasmInitialized = false;

async function ensureWasm(): Promise<void> {
  if (wasmInitialized) return;
  await initWasm(resvgWasm);
  wasmInitialized = true;
}

export async function renderOgImage(data: OgImageData): Promise<Uint8Array> {
  await ensureWasm();

  const element = buildOgElement(data);

  const svg = await satori(element as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "Plus Jakarta Sans",
        data: fontMedium as unknown as ArrayBuffer,
        weight: 500,
        style: "normal",
      },
      {
        name: "Plus Jakarta Sans",
        data: fontBold as unknown as ArrayBuffer,
        weight: 700,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
  });

  const rendered = resvg.render();
  return rendered.asPng();
}
