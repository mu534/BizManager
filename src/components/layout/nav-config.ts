import type { ComponentType } from "react";
import type { IconProps } from "@components/ui/icons";
import {
  IconBox, IconCart, IconChart, IconDashboard, IconReceipt, IconSettings, IconTag, IconUsers, IconWallet,
} from "@components/ui/icons";

// ─── Internal config (server-only, contains functions) ──────────────────────

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  match: (pathname: string, base: string) => boolean;
  /**
   * Who sees this item (a navigation convenience only — every page and action
   * still enforces access on the server):
   *   manager   — owner or manager (operational work such as recording expenses)
   *   financial — owner, or a manager the owner has granted report access
   *   owner     — owner only
   * Omitted means every member.
   */
  requires?: "manager" | "financial" | "owner";
}
export interface NavGroup { label: string; items: NavItem[] }

const prefix = (path: string) => (p: string, base: string) =>
  p === `${base}${path}` || p.startsWith(`${base}${path}/`);

export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", items: [
    { label: "Dashboard", path: "/dashboard", icon: IconDashboard, match: prefix("/dashboard") },
  ] },
  { label: "Sell", items: [
    { label: "Point of sale", path: "/sell", icon: IconCart, match: (p, b) => p === `${b}/sell` },
    { label: "Sales history", path: "/sell/history", icon: IconReceipt, match: prefix("/sell/history") },
  ] },
  { label: "Stock", items: [
    { label: "Products", path: "/products", icon: IconTag, match: prefix("/products") },
    { label: "Inventory", path: "/inventory", icon: IconBox, match: prefix("/inventory") },
  ] },
  { label: "Money", items: [
    { label: "Expenses", path: "/expenses", icon: IconReceipt, match: prefix("/expenses"), requires: "manager" },
    { label: "Accounts", path: "/accounts", icon: IconWallet, match: prefix("/accounts"), requires: "financial" },
    { label: "Reports", path: "/reports", icon: IconChart, match: prefix("/reports"), requires: "financial" },
  ] },
  { label: "Business", items: [
    { label: "Branches", path: "/settings/branches", icon: IconBox, match: prefix("/settings/branches"), requires: "owner" },
    { label: "Team", path: "/settings/team", icon: IconUsers, match: prefix("/settings/team"), requires: "owner" },
    { label: "Plan & billing", path: "/settings/subscription", icon: IconSettings, match: prefix("/settings/subscription"), requires: "owner" },
  ] },
];

export interface NavCapabilities {
  isOwner: boolean;
  isManagerOrOwner: boolean;
  canSeeFinancials: boolean;
}

function allowed(item: NavItem, caps: NavCapabilities): boolean {
  switch (item.requires) {
    case "owner": return caps.isOwner;
    case "manager": return caps.isManagerOrOwner;
    case "financial": return caps.canSeeFinancials;
    default: return true;
  }
}

export function visibleGroups(caps: NavCapabilities): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i, caps)) }))
    .filter((g) => g.items.length > 0);
}

// ─── Serializable types (safe to pass to Client Components) ─────────────────

export type IconKey =
  | "dashboard" | "cart" | "receipt" | "box" | "tag"
  | "wallet" | "chart" | "settings" | "users";

const ICON_KEYS: Map<ComponentType<IconProps>, IconKey> = new Map([
  [IconDashboard, "dashboard"],
  [IconCart,      "cart"],
  [IconReceipt,   "receipt"],
  [IconBox,       "box"],
  [IconTag,       "tag"],
  [IconWallet,    "wallet"],
  [IconChart,     "chart"],
  [IconSettings,  "settings"],
  [IconUsers,     "users"],
]);

export interface SerializedNavItem {
  label: string;
  path: string;
  iconKey: IconKey;
  /** Path prefix used to match the active state (just the relative path). */
  matchPath: string;
  /** Exact match only (no prefix). */
  exact?: boolean;
}

export interface SerializedNavGroup {
  label: string;
  items: SerializedNavItem[];
}

/**
 * Convert NavGroup[] → SerializedNavGroup[] — safe to pass as props to
 * Client Components. Drops functions (icon component refs, match fns)
 * and replaces them with serializable keys/strings.
 */
export function serializeGroups(groups: NavGroup[]): SerializedNavGroup[] {
  return groups.map((g) => ({
    label: g.label,
    items: g.items.map((item) => ({
      label: item.label,
      path: item.path,
      iconKey: ICON_KEYS.get(item.icon) ?? "dashboard",
      // For exact match items (POS /sell), store the path as-is with exact flag.
      matchPath: item.path,
      exact: item.path === "/sell",
    })),
  }));
}
