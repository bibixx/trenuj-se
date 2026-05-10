import { useRender } from "@base-ui-components/react/use-render";
import { IconBrandStrava } from "@tabler/icons-react";
import styles from "./StravaPill.module.css";

interface StravaPillProps extends useRender.ComponentProps<"a"> {
  stravaActivityId: number;
}

export function StravaPill({ stravaActivityId, render, className, ...rest }: StravaPillProps) {
  return useRender({
    render: render ?? <a />,
    ref: null,
    props: {
      href: `https://www.strava.com/activities/${stravaActivityId}`,
      target: "_blank",
      rel: "noopener noreferrer",
      className: className ? `${styles.pill} ${className}` : styles.pill,
      children: (
        <>
          <IconBrandStrava size={14} />
          <span>Strava</span>
        </>
      ),
      ...rest,
    },
    state: {},
    defaultTagName: "a",
  });
}
