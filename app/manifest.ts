import type { MetadataRoute } from "next";

/**
 * PWA Web App Manifest.
 *
 * This is a stub — icons, colours, and final app name will be updated
 * in Phase 10 (PWA/mobile). The manifest must be valid for the browser
 * to offer installation, but placeholder icons are acceptable during
 * development.
 *
 * Icon files needed in public/icons/ before Phase 10:
 *   - icon-192x192.png  (standard)
 *   - icon-512x512.png  (standard)
 *   - icon-maskable-192x192.png  (maskable, for Android adaptive icons)
 *   - icon-maskable-512x512.png
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BizManager — Business Management",
    short_name: "BizManager",
    description:
      "Simple, fast business management for retail shops. " +
      "Inventory, sales, expenses, and reports — works offline.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#111827", // Tailwind gray-900 — update to brand colour in Phase 10
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
