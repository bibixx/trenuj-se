import { createReactComponent } from "@tabler/icons-react";

/**
 * "GPX" lettermark in Tabler's outline style.
 * Built with Tabler's own factory so it shares the exact icon type
 * (`ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>`) and props as every other `@tabler/icons-react` icon.
 */
export const IconGpx = createReactComponent("outline", "gpx", "IconGpx", [
  ["path", { d: "M16.65 8L20.65 16" }],
  ["path", { d: "M16.65 16L20.65 8" }],
  [
    "path",
    {
      d: "M7.34998 8H5.34998C4.81954 8 4.31084 8.21071 3.93576 8.58579C3.56069 8.96086 3.34998 9.46957 3.34998 10V14C3.34998 14.5304 3.56069 15.0391 3.93576 15.4142C4.31084 15.7893 4.81954 16 5.34998 16H7.34998V12H6.34998",
    },
  ],
  [
    "path",
    {
      d: "M10.35 12H12.35C12.8804 12 13.3891 11.7893 13.7642 11.4142C14.1393 11.0391 14.35 10.5304 14.35 10C14.35 9.46957 14.1393 8.96086 13.7642 8.58579C13.3891 8.21071 12.8804 8 12.35 8H10.35V16",
    },
  ],
]);
