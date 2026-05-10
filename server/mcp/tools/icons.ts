import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolError, toolSuccess } from "../context";
import { iconEntries } from "../icon-catalog";

const InputSchema = z.object({
  query: z.string().min(1).describe("Search term to match against icon names, categories, and tags"),
  limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of results to return (default 20, max 50)"),
});

export function registerIconTools(server: McpServer) {
  server.registerTool(
    "search_icons",
    {
      title: "Search Icons",
      description: "Search the Tabler icon library by name, category, or tag.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        const { query, limit } = InputSchema.parse(input);
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

        const scored = iconEntries
          .map((icon) => {
            let score = 0;
            const nameLower = icon.name.toLowerCase();
            const categoryLower = icon.category.toLowerCase();
            const tagsLower = icon.tags.map((tag) => tag.toLowerCase());

            for (const term of terms) {
              // Exact name match — strongest signal
              if (nameLower === term) {
                score += 10;
              } else if (nameLower.includes(term)) {
                score += 5;
              }

              if (categoryLower === term) {
                score += 3;
              } else if (categoryLower.includes(term)) {
                score += 1;
              }

              for (const tag of tagsLower) {
                if (tag === term) {
                  score += 2;
                } else if (tag.includes(term)) {
                  score += 1;
                }
              }
            }

            return { icon, score };
          })
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name))
          .slice(0, limit);

        const results = scored.map(({ icon }) => ({
          name: icon.name,
          category: icon.category,
          tags: icon.tags,
        }));

        return toolSuccess({ total: scored.length, icons: results });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
