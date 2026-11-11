// Procedurally drawn scenes for the "See Through My Eyes" simulator (no image assets needed).

export type SceneId = "camera" | "night" | "sun" | "reading";

export function drawScene(ctx: CanvasRenderingContext2D, scene: SceneId, w: number, h: number, t: number) {
  if (scene === "night") return night(ctx, w, h, t);
  if (scene === "sun") return sun(ctx, w, h);
  if (scene === "reading") return reading(ctx, w, h);
}

function night(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#02040a");
  sky.addColorStop(0.55, "#0b1626");
  sky.addColorStop(1, "#10141a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const hy = h * 0.52;
  // road
  ctx.fillStyle = "#16181c";
  ctx.beginPath();
  ctx.moveTo(w * 0.47, hy);
  ctx.lineTo(w * 0.53, hy);
  ctx.lineTo(w * 1.1, h);
  ctx.lineTo(-w * 0.1, h);
  ctx.fill();
  // lane dashes (moving)
  ctx.strokeStyle = "#d8d2a8";
  for (let i = 0; i < 8; i++) {
    const p = ((i / 8 + (t / 4000) % (1 / 8)) % 1);
    const y1 = hy + (h - hy) * p * p, y2 = hy + (h - hy) * Math.min(1, (p + 0.04) ** 2);
    ctx.lineWidth = 1 + 8 * p;
    ctx.beginPath();
    ctx.moveTo(w / 2, y1);
    ctx.lineTo(w / 2, y2);
    ctx.stroke();
  }
  // street lights
  for (let i = 0; i < 5; i++) {
    const s = 1 - i * 0.18;
    const x = w * (0.5 + 0.42 * s), y = hy - h * 0.28 * s;
    ctx.fillStyle = "#ffd68a";
    ctx.beginPath();
    ctx.arc(x, y, 6 * s + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // oncoming headlights
  const cx = w * 0.43, cy = hy + h * 0.08;
  for (const dx of [-26, 26]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx + dx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  // road sign
  ctx.fillStyle = "#0f5f3a";
  ctx.fillRect(w * 0.66, hy - h * 0.26, w * 0.2, h * 0.11);
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(h * 0.035)}px sans-serif`;
  ctx.fillText("Rourkela  12 km", w * 0.675, hy - h * 0.19);
  ctx.font = `${Math.round(h * 0.028)}px sans-serif`;
  ctx.fillText("Sundargarh  38 km", w * 0.675, hy - h * 0.16);
}

function sun(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#8fd3ff");
  sky.addColorStop(1, "#f6f1dd");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff8d0";
  ctx.beginPath();
  ctx.arc(w * 0.82, h * 0.18, h * 0.09, 0, Math.PI * 2);
  ctx.fill();
  const cols = ["#e9d7b4", "#d9c39b", "#f2e6cf", "#cbb28b", "#e3cfa9"];
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = cols[i % cols.length];
    const bw = w / 7, bh = h * (0.3 + ((i * 37) % 30) / 100);
    ctx.fillRect(i * bw, h - bh, bw - 4, bh);
    ctx.fillStyle = "#6b5b45";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) ctx.fillRect(i * bw + 12 + c * bw * 0.4, h - bh + 16 + r * bh * 0.2, bw * 0.22, bh * 0.1);
  }
  ctx.fillStyle = "#b91c1c";
  ctx.fillRect(w * 0.08, h * 0.38, w * 0.3, h * 0.12);
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(h * 0.05)}px sans-serif`;
  ctx.fillText("SALE 50% OFF", w * 0.1, h * 0.46);
}

const TEXT = [
  "Monsoon arrives early in Odisha; farmers",
  "prepare paddy fields as rainfall begins in",
  "Sundargarh and Keonjhar districts. The weather",
  "department expects normal rain this season,",
  "while the state plans new eye-care camps for",
  "rural schools to screen children for myopia.",
  "Medicine dose: take 1 tablet twice daily after",
  "food. Do not exceed 4 tablets in 24 hours.",
];

function reading(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#efe9dc";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `bold ${Math.round(h * 0.07)}px Georgia, serif`;
  ctx.fillText("The Daily Samachar", w * 0.06, h * 0.13);
  ctx.fillRect(w * 0.06, h * 0.16, w * 0.88, 3);
  ctx.font = `${Math.round(h * 0.042)}px Georgia, serif`;
  TEXT.forEach((line, i) => ctx.fillText(line, w * 0.06, h * (0.26 + i * 0.085)));
}
