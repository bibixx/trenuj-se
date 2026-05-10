import iconsJson from "../../node_modules/@tabler/icons/icons.json" with { type: "json" };
import filledNodesJson from "../../node_modules/@tabler/icons/tabler-nodes-filled.json" with { type: "json" };

export interface IconEntry {
  name: string;
  category: string;
  tags: string[];
}

const rawEntries = Object.values(iconsJson as Record<string, { name: string; category: string; tags: (string | number)[] }>);

export const iconEntries: ReadonlyArray<IconEntry> = rawEntries.map((entry) => ({
  name: entry.name,
  category: entry.category,
  tags: entry.tags.map(String),
}));

export const outlineNames: ReadonlySet<string> = new Set(rawEntries.map((entry) => entry.name.toLowerCase()));

export const filledBaseNames: ReadonlySet<string> = new Set(Object.keys(filledNodesJson as Record<string, unknown>).map((name) => name.toLowerCase()));
