import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { triggerHaptic } from "tactus";
import { ScrollAreaComponent as ScrollArea } from "../../components/primitives/ScrollArea/ScrollArea.tsx";
import { ToggleGroup } from "../../components/primitives/ToggleGroup/ToggleGroup.tsx";
import { useTheme } from "../../lib/theme.ts";
import type { ThemePreference } from "../../lib/theme.ts";
import styles from "./design-system.module.css";
import { IconChartBar } from "@tabler/icons-react";
import { Button } from "../../components/primitives/Button/Button.tsx";

export const Route = createFileRoute("/dev/design-system")({
  component: DesignSystemLayout,
});

const SECTIONS = [
  { label: "Tokens", to: "/dev/design-system/tokens" },
  { label: "Primitives", to: "/dev/design-system/primitives" },
  { label: "Domain", to: "/dev/design-system/domain" },
  { label: "Composites", to: "/dev/design-system/composites" },
  { label: "Markdown", to: "/dev/design-system/markdown" },
  { label: "Charts", to: "/dev/design-system/charts" },
  { label: "Colors", to: "/dev/design-system/colors" },
  { label: "Toasts", to: "/dev/design-system/toasts" },
  { label: "Crossfade", to: "/dev/design-system/crossfade" },
  { label: "Tooltip", to: "/dev/design-system/tooltip" },
] as const;

function DesignSystemLayout() {
  const [preference, resolved, setTheme] = useTheme();

  return (
    <div className={styles.themeRoot} data-theme={resolved}>
      <div className={styles.layout}>
        <nav className={styles.sidebar}>
          <ScrollArea.Root style={{ width: "100%", height: "100%" }}>
            <ScrollArea.Viewport className={styles.sidebarViewport} fadeout={{ sizeTop: 64, sizeBottom: 0, sizeLeft: 64, sizeRight: 64, direction: "both" }}>
              <ScrollArea.Content className={styles.sidebarContent}>
                <div className={styles.sidebarHeader}>
                  <div>
                    <Button size="sm" className={styles.sidebarHeaderName} variant="ghost" nativeButton={false} render={<Link to="/" />} icon={<IconChartBar />}>
                      trenuj.se
                    </Button>
                  </div>
                  <ToggleGroup.Root value={[preference]} onValueChange={(v) => v.length > 0 && setTheme(v[0] as ThemePreference)} aria-label="Theme preview">
                    <ToggleGroup.Item value="system">System</ToggleGroup.Item>
                    <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
                    <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
                  </ToggleGroup.Root>
                </div>
                {SECTIONS.map((section) => (
                  <Link key={section.to} to={section.to} className={styles.navItem} activeProps={{ className: styles.navItemActive }} onClick={() => triggerHaptic()}>
                    {section.label}
                  </Link>
                ))}
                <div className={styles.mobileThemeToggle}>
                  <ToggleGroup.Root value={[preference]} onValueChange={(v) => v.length > 0 && setTheme(v[0] as ThemePreference)} aria-label="Theme preview">
                    <ToggleGroup.Item value="system">System</ToggleGroup.Item>
                    <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
                    <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
                  </ToggleGroup.Root>
                </div>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar />
          </ScrollArea.Root>
        </nav>
        <ScrollArea.Root style={{ width: "100%", height: "100%" }}>
          <ScrollArea.Viewport fadeout={{ sizeTop: 64, sizeBottom: 0 }}>
            <ScrollArea.Content>
              <main className={styles.main}>
                <Outlet />
              </main>
            </ScrollArea.Content>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar />
        </ScrollArea.Root>
      </div>
    </div>
  );
}
