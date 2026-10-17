import type { ComponentType } from "react";
import type { IconProps } from "@components/ui/icons";
import {
  IconBox, IconCart, IconChart, IconDashboard, IconReceipt, IconSettings, IconTag, IconWallet,
} from "@components/ui/icons";

export interface NavItem {
  label: string;
  /** Path relative to /app/{businessId}. */
  path: string;
  icon: ComponentType<IconProps>;
  /** Matches the active state for nested routes. */
  match: (pathname: string, base: string) => boolean;
  /** Hidden from STAFF (they may sell and look up stock, not see finances). */
  financial?: boolean;
}
export interface NavGroup { label: string; items: NavItem[] }

const prefix = (path: string) => (p: string, base: string) => p === `${base}${path}` || p.startsWith(`${base}${path}/`);

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
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSeeFinancials || !i.financial) })).filter((g) => g.items.length > 0);
}
