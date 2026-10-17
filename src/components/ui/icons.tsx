import type { SVGProps } from "react";

/** Minimal 24px stroke icon set (no dependency). */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

function p(d: string) {
  return function PathIcon(props: IconProps) {
    return (
      <svg {...base(props)}>
        <path d={d} />
      </svg>
    );
  };
}

export const IconDashboard = (props: IconProps) => (
  <svg {...base(props)}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
);
export const IconCart = (props: IconProps) => (
  <svg {...base(props)}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.7 11.4a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 7H6" /></svg>
);
export const IconBox = (props: IconProps) => (
  <svg {...base(props)}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
);
export const IconTag = (props: IconProps) => (
  <svg {...base(props)}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1" /></svg>
);
export const IconReceipt = (props: IconProps) => (
  <svg {...base(props)}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></svg>
);
export const IconWallet = (props: IconProps) => (
  <svg {...base(props)}><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1Z" /><circle cx="16.5" cy="14" r="1" /></svg>
);
export const IconChart = (props: IconProps) => (
  <svg {...base(props)}><path d="M4 20V4M4 20h16" /><path d="m8 15 3-4 3 2 5-6" /></svg>
);
export const IconSettings = (props: IconProps) => (
  <svg {...base(props)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const IconPlus = p("M12 5v14M5 12h14");
export const IconSearch = (props: IconProps) => (
  <svg {...base(props)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconMenu = p("M4 6h16M4 12h16M4 18h16");
export const IconClose = p("M6 6l12 12M18 6 6 18");
export const IconCheck = p("m5 12 5 5 9-10");
export const IconChevronRight = p("m9 6 6 6-6 6");
export const IconChevronDown = p("m6 9 6 6 6-6");
export const IconArrowRight = p("M5 12h14m-6-6 6 6-6 6");
export const IconArrowLeft = p("M19 12H5m6-6-6 6 6 6");
export const IconAlert = (props: IconProps) => (
  <svg {...base(props)}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v5M12 18h.01" /></svg>
);
export const IconInfo = (props: IconProps) => (
  <svg {...base(props)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const IconOffline = (props: IconProps) => (
  <svg {...base(props)}><path d="M2 8.8a15 15 0 0 1 4-2.4M22 8.8a15 15 0 0 0-9-3.7M5 12.9a10 10 0 0 1 3.4-2M19 12.9a10 10 0 0 0-4-2.4M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" /></svg>
);
export const IconTrash = p("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3");
export const IconUndo = p("M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3");
export const IconTransfer = p("M4 8h14l-4-4M20 16H6l4 4");
export const IconLogout = p("M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h11");
export const IconBarcode = p("M4 5v14M8 5v14M12 5v14M16 5v14M20 5v14M6 5v14");
export const IconUsers = (props: IconProps) => (
  <svg {...base(props)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6 6 0 0 0-4-5.6" /></svg>
);
export const IconBuilding = p("M4 21V5l8-2v18M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20");
export const IconMore = (props: IconProps) => (
  <svg {...base(props)}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>
);
export const IconMinus = p("M5 12h14");
