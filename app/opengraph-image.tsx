import { ImageResponse } from "next/og";
import { getDictionary } from "@shared/i18n";

export const alt = "BizManager — shop management for Ethiopian businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card used by link previews (Telegram, WhatsApp, Facebook, LinkedIn…). */
export default function OpenGraphImage() {
  const t = getDictionary("en");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "white",
          background: "linear-gradient(135deg, #062f2b 0%, #0a5148 45%, #0b7f6d 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#14997f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ fontSize: 40, fontWeight: 600 }}>BizManager</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>{t.hero.title}</div>
          <div style={{ fontSize: 30, color: "#c7f0e3" }}>{t.meta.description}</div>
        </div>
      </div>
    ),
    size,
  );
}