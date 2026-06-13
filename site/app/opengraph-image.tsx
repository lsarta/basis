import { ImageResponse } from "next/og";

export const alt = "Basis — a cap rate is three forces wearing one number";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Static social-preview card (rendered at build time). Echoes the site's paper + cobalt
// aesthetic and the three-force bar motif. No custom fonts — keeps the build hermetic.
export default function OpengraphImage() {
  const paper = "#f6f4ee";
  const ink = "#141414";
  const cobalt = "#1f3ad6";
  const faint = "#8a877f";
  const rule = "#d8d4c8";

  const bars = [
    { label: "Debt cost", w: 150 },
    { label: "Income / NOI", w: 360 },
    { label: "Required return", w: 240 },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: paper,
          padding: "70px 80px",
        }}
      >
        {/* eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 8, color: cobalt }}>
            BASIS
          </div>
          <div style={{ flex: 1, height: 2, background: rule }} />
          <div style={{ fontSize: 22, letterSpacing: 3, color: faint }}>
            NYC PUBLIC RECORDS
          </div>
        </div>

        {/* title */}
        <div style={{ display: "flex", flexWrap: "wrap", fontSize: 78, letterSpacing: -2, color: ink, lineHeight: 1.06 }}>
          <span>A cap rate is&nbsp;</span>
          <span style={{ color: cobalt }}>three forces&nbsp;</span>
          <span>wearing one number.</span>
        </div>

        {/* three-force bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {bars.map((b) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div style={{ width: 300, fontSize: 26, color: faint }}>{b.label}</div>
              <div style={{ width: b.w, height: 20, background: cobalt, borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* footer */}
        <div style={{ display: "flex", fontSize: 24, color: faint }}>
          buildabasis.com — decomposing CRE price moves into debt, income &amp; required return
        </div>
      </div>
    ),
    { ...size },
  );
}
