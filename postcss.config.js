import postcssNesting from "postcss-nesting";
import postcssFocusVisible from "./postcss-focus-visible.js";
import postcssAssignLayer from "postcss-assign-layer";

/** Wraps a file's entire content in @layer if the path matches. */
const postcssAssignLayerByPath = (patterns) => {
  const plugin = {
    postcssPlugin: "postcss-assign-layer-by-path",
    Once(root, { AtRule }) {
      const file = root.source?.input.file;

      if (!file) return;
      for (const { test, layerName } of patterns) {
        if (test.test(file)) {
          const layer = new AtRule({ name: "layer", params: layerName, nodes: root.nodes });
          root.removeAll();
          root.append(layer);
          return;
        }
      }
    },
  };
  return plugin;
};

export default {
  plugins: [
    postcssNesting(),
    postcssFocusVisible(),
    postcssAssignLayer([{ include: "**/*.module.css", layerName: "components" }]),
    postcssAssignLayerByPath([
      { test: /\/styles\/global\.css$/, layerName: "base" },
      { test: /\/styles\/utilities\.css$/, layerName: "utilities" },
    ]),
  ],
};
