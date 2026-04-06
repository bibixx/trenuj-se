import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../../components/primitives/Button/Button.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/tokens")({
  component: TokensSection,
});

function TokensSection() {
  const colors = [
    { name: "--bg", description: "Page background" },
    { name: "--bg-card", description: "Card surface" },
    { name: "--bg-inset", description: "Inset controls" },
    { name: "--bg-hover", description: "Hover surface" },
    { name: "--bg-elevated", description: "Dialogs and popovers" },
    { name: "--text-primary", description: "Primary text" },
    { name: "--text-secondary", description: "Secondary text" },
    { name: "--text-muted", description: "Muted metadata" },
    { name: "--border-subtle", description: "Subtle borders" },
    { name: "--border-strong", description: "Strong borders" },
    { name: "--accent", description: "Primary accent" },
    { name: "--strava", description: "Strava brand accent" },
    { name: "--success", description: "Success state" },
    { name: "--destructive", description: "Destructive state" },
  ];

  const typeScale = [
    { name: "--text-xs", className: styles.typeXs, label: "11px — labels" },
    { name: "--text-sm", className: styles.typeSm, label: "13px — body" },
    { name: "--text-base", className: styles.typeBase, label: "16px — workout titles" },
    { name: "--text-lg", className: styles.typeLg, label: "19px — section headings" },
    { name: "--text-xl", className: styles.typeXl, label: "23px" },
    { name: "--text-2xl", className: styles.type2xl, label: "28px — page title" },
  ];

  const radii = [
    { name: "--radius-sm", value: "6px" },
    { name: "--radius", value: "10px" },
    { name: "--radius-lg", value: "14px" },
    { name: "--radius-full", value: "9999px" },
  ];

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Design Tokens</h1>
      <p className={styles.description}>These swatches are live previews of the currently selected design-system theme.</p>

      <h2 className={styles.subTitle}>Colors</h2>
      <div className={styles.swatchGrid}>
        {colors.map((c) => (
          <div key={c.name} className={styles.swatch}>
            <div className={styles.swatchColor} style={{ background: `var(${c.name})` }} />
            <code className={styles.swatchName}>{c.name}</code>
            <span className={styles.themeNote}>{c.description}</span>
          </div>
        ))}
      </div>

      <h2 className={styles.subTitle}>Border Shine</h2>
      <p className={styles.themeNote}>The surface treatment below swaps between the dark glow and the new light shine token.</p>
      <div className={styles.shineDemo}>
        <div className={styles.shineBox}>border-shine</div>
      </div>

      <h2 className={styles.subTitle}>Type Scale</h2>
      <div className={styles.typeScale}>
        {typeScale.map((t) => (
          <div key={t.name} className={styles.typeRow}>
            <span className={t.className}>The quick brown fox</span>
            <code className={styles.typeLabel}>
              {t.name} — {t.label}
            </code>
          </div>
        ))}
      </div>

      <h2 className={styles.subTitle}>Font Family</h2>
      <p>Plus Jakarta Sans — The quick brown fox jumps over the lazy dog</p>

      <h2 className={styles.subTitle}>Radius</h2>
      <div className={styles.radiusGrid}>
        {radii.map((r) => (
          <div key={r.name} className={styles.radiusItem}>
            <div className={styles.radiusBox} style={{ borderRadius: `var(${r.name})` }} />
            <code className={styles.swatchName}>
              {r.name} ({r.value})
            </code>
          </div>
        ))}
      </div>

      <h2 className={styles.subTitle}>Motion</h2>
      <MotionDemo />
    </div>
  );
}

function MotionDemo() {
  const [running, setRunning] = useState(false);
  const timings = [
    { name: "motion-timing-fast", label: "fast (150ms)" },
    { name: "motion-timing-medium", label: "medium (300ms)" },
    { name: "motion-timing-slow", label: "slow (500ms)" },
  ];
  return (
    <div>
      <p className={styles.description} style={{ marginBottom: 8 }}>
        Single curve: <code>cubic-bezier(0.4, 0, 0.2, 1)</code> — three durations.
      </p>
      <Button variant="secondary" size="sm" onClick={() => setRunning(!running)}>
        Animate
      </Button>
      <div className={styles.easingGrid}>
        {timings.map((t) => (
          <div key={t.name} className={styles.easingRow}>
            <code className={styles.easingLabel}>{t.label}</code>
            <div className={styles.easingTrack}>
              <div
                className={styles.easingDot}
                style={{
                  transitionTimingFunction: "var(--motion-function)",
                  transitionDuration: `var(--${t.name})`,
                  left: running ? "calc(100% - 12px)" : "0",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
