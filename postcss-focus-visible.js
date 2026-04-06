/**
 * PostCSS plugin that rewrites `:focus-visible` selectors to
 * `[data-whatintent="keyboard"] :focus` for use with what-input.
 *
 * This ensures focus rings only appear for keyboard navigation,
 * not mouse/touch interactions.
 */
export default function postcssFocusVisible() {
  return {
    postcssPlugin: "focus-visible-whatintent",
    Rule(rule) {
      if (!rule.selector.includes(":focus-visible")) {
        return;
      }
      rule.selector = rule.selector.replace(/:focus-visible/g, ":focus");
      rule.selectors = rule.selectors.map((selector) => `[data-whatintent="keyboard"] ${selector}`);
    },
  };
}
