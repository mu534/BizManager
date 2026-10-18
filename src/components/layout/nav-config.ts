import type { ComponentType } from "react";
import type { IconProps } from "@components/ui/icons";
import {
  IconBox, IconCart, IconChart, IconDashboard, IconReceipt, IconSettings, IconTag, IconWallet,
} from "@components/ui/icons";

// ─── Internal config (server-only, contains functions) ──────────────────────

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  match: (pathname: string, base: string) => boolean;
  financial?: boolean;
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
    { label: "Expenses", path: "/expenses", icon: IconReceipt, match: prefix("/expenses"), financial: true },
    { label: "Accounts", path: "/accounts", icon: IconWallet, match: prefix("/accounts"), financial: true },
    { label: "Reports", path: "/reports", icon: IconChart, match: prefix("/reports"), financial: true },
  ] },
  { label: "Business", items: [
    { label: "Plan & billing", path: "/settings/subscription", icon: IconSettings, match: prefix("/settings"), financial: true },
  ] },
];

export function visibleGroups(canSeeFinancials: boolean): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => canSeeFinancials || !i.financial) }))
    .filter((g) => g.items.length > 0);
}

// ─── Serializable types (safe to pass to Client Components) ─────────────────

export type IconKey =
  | "dashboard" | "cart" | "receipt" | "box" | "tag"
  | "wallet" | "chart" | "settings";

const ICON_KEYS: Map<ComponentType<IconProps>, IconKey> = new Map([
  [IconDashboard, "dashboard"],
  [IconCart,      "cart"],
  [IconReceipt,   "receipt"],
  [IconBox,       "box"],
  [IconTag,       "tag"],
  [IconWallet,    "wallet"],
  [IconChart,     "chart"],
  [IconSettings,  "settings"],
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
