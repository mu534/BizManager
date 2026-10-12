import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BizManager — Business Management",
    short_name: "BizManager",
    description:
      "Fast business management for retail shops. Inventory, sales, expenses and reports — works offline.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f9fafb",
    theme_color: "#1d4ed8",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
