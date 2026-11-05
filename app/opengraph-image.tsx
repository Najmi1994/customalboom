import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "CustomAlboom.com custom album designer with wedding, family and travel photo memories";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function OpenGraphImage() {
  const collageBytes = await readFile(path.join(process.cwd(), "public", "og-photo-collage.png"));
  const collage = collageBytes.buffer.slice(
    collageBytes.byteOffset,
    collageBytes.byteOffset + collageBytes.byteLength,
  ) as ArrayBuffer;

  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#1f2227",
        color: "#f7f4ec",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <img
        src={collage as unknown as string}
        alt=""
        width={1200}
        height={630}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: "linear-gradient(90deg,rgba(24,26,30,.99) 0%,rgba(24,26,30,.96) 34%,rgba(24,26,30,.72) 48%,rgba(24,26,30,.08) 69%,rgba(24,26,30,0) 100%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          width: 560,
          height: "100%",
          padding: "54px 0 48px 62px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 27, fontWeight: 700, letterSpacing: ".3px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              border: "2px solid #f8d96d",
              borderRadius: 10,
              color: "#f8d96d",
              fontSize: 21,
            }}
          >
            C
          </div>
          CustomAlboom.com
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 82 }}>
          <div style={{ display: "flex", fontSize: 64, lineHeight: 1.02, fontWeight: 700, letterSpacing: "-2.5px" }}>
            Design Your Custom Album Online
          </div>
          <div style={{ display: "flex", marginTop: 25, color: "#ddd7cc", fontSize: 21, lineHeight: 1.4 }}>
            Flexible templates • Private photos • Print-ready
          </div>
          <div style={{ display: "flex", marginTop: 13, color: "#f8d96d", fontSize: 22, lineHeight: 1.35 }}>
            Reka album anda, cara anda.
          </div>
        </div>
        <div style={{ display: "flex", marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              border: "1px solid rgba(248,217,109,.62)",
              borderRadius: 999,
              background: "linear-gradient(118deg,#ffe99a 0%,#fff0cf 38%,#ffd695 57%,#f8d96d 100%)",
              color: "#17130a",
              padding: "9px 16px",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Private by design · Print-ready exports
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
