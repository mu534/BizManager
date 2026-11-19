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
    background_color: "#f6f9f8",
    theme_color: "#0b7f6d",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}