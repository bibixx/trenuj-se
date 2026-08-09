import { useRender } from "@base-ui/react/use-render";
import clsx from "clsx";
import type { UseRenderComponentProps } from "@base-ui/react/use-render";
import styles from "./TextLink.module.css";

type TextLinkVariant = "underline" | "accent";

type TextLinkProps = UseRenderComponentProps<"a"> & {
  /** `underline`: neutral inline link (auth pages). `accent`: accent-coloured link (content pages). */
  variant?: TextLinkVariant;
};

/**
 * Inline text link. Renders an `<a>` by default; pass `render` to compose with
 * a router `<Link>` or a `<button>` (button styling resets are included).
 */
export function TextLink({ variant = "underline", className, render, ...props }: TextLinkProps) {
  return useRender({
    render,
    defaultTagName: "a",
    props: { ...props, className: clsx(styles.link, styles[variant], className) },
  });
}
