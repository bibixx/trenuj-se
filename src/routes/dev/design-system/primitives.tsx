import { IconDotsVertical, IconFilter, IconPencil, IconPlus, IconSettings, IconTrash, IconX } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../../components/primitives/Button/Button.tsx";
import { Input } from "../../../components/primitives/Input/Input.tsx";
import { Checkbox } from "../../../components/primitives/Checkbox/Checkbox.tsx";
import { ProgressBar } from "../../../components/primitives/ProgressBar/ProgressBar.tsx";
import { Badge } from "../../../components/primitives/Badge/Badge.tsx";
import { Card } from "../../../components/primitives/Card/Card.tsx";
import { Dialog } from "../../../components/primitives/Dialog/Dialog.tsx";
import { Select } from "../../../components/primitives/Select/Select.tsx";
import { ScrollAreaComponent as ScrollArea } from "../../../components/primitives/ScrollArea/ScrollArea.tsx";
import { ToggleGroup } from "../../../components/primitives/ToggleGroup/ToggleGroup.tsx";
import styles from "../design-system.module.css";

export const Route = createFileRoute("/dev/design-system/primitives")({
  component: PrimitivesSection,
});

function PrimitivesSection() {
  const [checked, setChecked] = useState(false);
  const [indeterminate, setIndeterminate] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectValue, setSelectValue] = useState<string | null>(null);
  const [toggleValue, setToggleValue] = useState<string[]>(["center"]);

  return (
    <div className={styles.section}>
      <h1 className={styles.sectionTitle}>Base Primitives</h1>

      <h2 className={styles.subTitle}>Button</h2>
      <div className={styles.row}>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
      <div className={styles.row}>
        <Button variant="primary" size="sm">
          Small Primary
        </Button>
        <Button variant="secondary" size="sm">
          Small Secondary
        </Button>
      </div>
      <div className={styles.row}>
        <Button variant="primary" icon={<IconPlus />}>
          Add Workout
        </Button>
        <Button variant="secondary" icon={<IconSettings />}>
          Settings
        </Button>
        <Button variant="ghost" icon={<IconFilter />}>
          Filter
        </Button>
        <Button variant="destructive" icon={<IconTrash />}>
          Delete
        </Button>
      </div>
      <div className={styles.row}>
        <Button variant="primary" icon={<IconPlus />} size="sm">
          Add
        </Button>
        <Button variant="secondary" icon={<IconPencil />} size="sm">
          Edit
        </Button>
      </div>
      <div className={styles.row}>
        <Button variant="primary" icon={<IconPlus />} />
        <Button variant="secondary" icon={<IconSettings />} />
        <Button variant="ghost" icon={<IconDotsVertical />} />
        <Button variant="ghost" icon={<IconX />} size="sm" />
      </div>
      <div className={styles.row}>
        <Button variant="primary" disabled>
          Disabled
        </Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
      </div>

      <h2 className={styles.subTitle}>Input</h2>
      <div className={styles.inputGrid}>
        <Input label="Default" placeholder="Type something..." />
        <Input label="With Error" placeholder="Invalid input" error="This field is required" />
        <Input label="Disabled" placeholder="Can't touch this" disabled />
      </div>

      <h2 className={styles.subTitle}>Checkbox</h2>
      <div className={styles.row}>
        <label className={styles.checkLabel}>
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
          <span>Accent (default)</span>
        </label>
        <label className={styles.checkLabel}>
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} hue={150} />
          <span>Hue 150</span>
        </label>
        <label className={styles.checkLabel}>
          <Checkbox checked={indeterminate} indeterminate={!indeterminate} onCheckedChange={setIndeterminate} hue={250} />
          <span>Indeterminate (hue 250)</span>
        </label>
        <label className={styles.checkLabel}>
          <Checkbox disabled />
          <span>Disabled</span>
        </label>
      </div>

      <h2 className={styles.subTitle}>Progress Bar</h2>
      <div className={styles.progressGrid}>
        <ProgressBar value={0} />
        <ProgressBar value={28} />
        <ProgressBar value={65} />
        <ProgressBar value={100} />
      </div>

      <h2 className={styles.subTitle}>Badge</h2>
      <div className={styles.row}>
        <Badge>Default</Badge>
        <Badge variant="phase" hue={150}>
          Build
        </Badge>
        <Badge variant="phase" hue={30}>
          Peak
        </Badge>
        <Badge variant="phase" hue={0}>
          Race
        </Badge>
        <Badge variant="optional">Optional</Badge>
        <Badge variant="status" hue={220}>
          Planned
        </Badge>
      </div>

      <h2 className={styles.subTitle}>Card</h2>
      <Card>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>A floating card surface with border-shine glow.</p>
      </Card>

      <h2 className={styles.subTitle}>Dialog</h2>
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        Open Dialog
      </Button>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content>
          <Dialog.Close />
          <Dialog.Title>Past Plans</Dialog.Title>
          <Dialog.Description>Select a plan to view its workouts.</Dialog.Description>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Card>
              <strong style={{ fontSize: "var(--text-sm)" }}>Trail 50K Prep</strong>
              <br />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Jan 6 – Mar 29, 2026</span>
            </Card>
            <Card>
              <strong style={{ fontSize: "var(--text-sm)" }}>Half Marathon Plan</strong>
              <br />
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Sep 1 – Nov 15, 2025</span>
            </Card>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <h2 className={styles.subTitle}>Select</h2>
      <div style={{ maxWidth: 240 }}>
        <Select
          label="Color By"
          options={[
            { value: "sport", label: "Sport" },
            { value: "category", label: "Category" },
          ]}
          value={selectValue}
          onValueChange={setSelectValue}
          placeholder="Choose..."
        />
      </div>

      <h2 className={styles.subTitle}>Toggle Group</h2>
      <div className={styles.row}>
        <ToggleGroup.Root value={toggleValue} onValueChange={(v) => v.length > 0 && setToggleValue(v)} aria-label="Alignment">
          <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
          <ToggleGroup.Item value="center">Center</ToggleGroup.Item>
          <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <h2 className={styles.subTitle}>Scroll Area</h2>
      <div className={styles.scrollAreaGrid}>
        <div>
          <p className={styles.description}>Vertical with fadeout</p>
          <div className={styles.scrollAreaDemo}>
            <ScrollArea.Root>
              <ScrollArea.Viewport fadeout={{ direction: "vertical", size: 32 }}>
                <ScrollArea.Content>
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className={styles.scrollAreaItem}>
                      Week {i + 1} — Training session
                    </div>
                  ))}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar />
            </ScrollArea.Root>
          </div>
        </div>
        <div>
          <p className={styles.description}>Horizontal with fadeout</p>
          <div className={styles.scrollAreaDemoH}>
            <ScrollArea.Root>
              <ScrollArea.Viewport fadeout={{ direction: "horizontal", size: 40 }}>
                <ScrollArea.Content style={{ flexDirection: "row", gap: 8 }} className={styles.scrollAreaDemoHContent}>
                  {Array.from({ length: 15 }, (_, i) => (
                    <div key={i} className={styles.scrollAreaChip}>
                      Zone {i + 1}
                    </div>
                  ))}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar orientation="horizontal" />
            </ScrollArea.Root>
          </div>
        </div>
      </div>
    </div>
  );
}
