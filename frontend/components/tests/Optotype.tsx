export type Dir = "up" | "down" | "left" | "right";
const ROT: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

/** Tumbling-E optotype on a 5x5 grid (stroke width = 1/5 of letter height). */
export function TumblingE({ dir, sizePx, color = "#0B1A2C", glow = false }: { dir: Dir; sizePx: number; color?: string; glow?: boolean }) {
  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 5 5" role="img" aria-label="letter E"
      style={{ transform: `rotate(${ROT[dir]}deg)`, filter: glow ? `drop-shadow(0 0 ${Math.max(2, sizePx / 6)}px ${color})` : undefined }}
      shapeRendering="crispEdges">
      <path d="M0 0H5V1H1V2H5V3H1V4H5V5H0Z" fill={color} />
    </svg>
  );
}

export const DIRS: Dir[] = ["up", "down", "left", "right"];
export const randomDir = (not?: Dir): Dir => {
  const opts = DIRS.filter((d) => d !== not);
  return opts[Math.floor(Math.random() * opts.length)];
};

export function ArrowPad({ onAnswer, disabled, dark }: { onAnswer: (d: Dir) => void; disabled?: boolean; dark?: boolean }) {
  const b = `h-16 w-16 rounded-2xl text-2xl font-bold shadow-sm ${dark ? "bg-white/10 text-white" : "bg-white text-navy border border-slate-200"} active:scale-95`;
  return (
    <div className="grid grid-cols-3 gap-2" aria-label="Answer direction">
      <span />
      <button className={b} disabled={disabled} onClick={() => onAnswer("up")} aria-label="Up">↑</button>
      <span />
      <button className={b} disabled={disabled} onClick={() => onAnswer("left")} aria-label="Left">←</button>
      <span />
      <button className={b} disabled={disabled} onClick={() => onAnswer("right")} aria-label="Right">→</button>
      <span />
      <button className={b} disabled={disabled} onClick={() => onAnswer("down")} aria-label="Down">↓</button>
      <span />
    </div>
  );
}
