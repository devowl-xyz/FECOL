import { useRef, useEffect, useState } from "react";
import { useHandTracker } from "@/lib/hand-api";
import { Layout } from "@/components/layout";
import { Trash2, Eraser, Paintbrush, ExternalLink } from "lucide-react";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const PALETTE = [
  "#000000", "#625BF6", "#ef4444",
  "#f97316", "#FFE500", "#22c55e",
  "#06b6d4", "#ec4899",
];

const BRUSH_SIZES = [3, 6, 12, 20];

// PiP dimensions
const PIP_W = 190;
const PIP_H = 140;
const PIP_R = 10;   // corner radius
const PIP_M = 14;   // margin from edge

type Tool = "pen" | "eraser";

export default function Draw() {
  const { latestFrame, videoRef, status } = useHandTracker();

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const rafRef        = useRef<number>(0);
  const frameRef      = useRef(latestFrame);
  frameRef.current    = latestFrame;

  const [color,     setColor]     = useState("#000000");
  const [brushSize, setBrushSize] = useState(6);
  const [tool,      setTool]      = useState<Tool>("pen");

  const colorRef  = useRef(color);
  const brushRef  = useRef(brushSize);
  const toolRef   = useRef(tool);
  colorRef.current  = color;
  brushRef.current  = brushSize;
  toolRef.current   = tool;

  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const ink = document.createElement("canvas");
    ink.width  = 1280;
    ink.height = 720;
    inkCanvasRef.current = ink;
    return () => { inkCanvasRef.current = null; };
  }, []);

  useEffect(() => {
    if (status === "iframe") return;

    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      rafRef.current = requestAnimationFrame(render);

      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;
      if (canvas!.width !== W || canvas!.height !== H) {
        canvas!.width  = W;
        canvas!.height = H;
        const ink = inkCanvasRef.current;
        if (ink && (ink.width !== W || ink.height !== H)) {
          const tmp = document.createElement("canvas");
          tmp.width = W; tmp.height = H;
          tmp.getContext("2d")?.drawImage(ink, 0, 0, W, H);
          ink.width = W; ink.height = H;
          ink.getContext("2d")?.drawImage(tmp, 0, 0);
        }
      }

      // ── 1. White canvas background ─────────────────────────────────────────
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, W, H);

      // ── 2. Ink strokes ─────────────────────────────────────────────────────
      const ink = inkCanvasRef.current;
      if (ink) ctx!.drawImage(ink, 0, 0);

      // ── 3. Hand drawing + skeleton ─────────────────────────────────────────
      const frame = frameRef.current;
      if (frame && frame.hands.length > 0) {
        const hand    = frame.hands[0];
        const tip     = hand.landmarks[8];
        const isPoint = hand.gesture === "point";
        const tx      = (1 - tip.x) * W;
        const ty      = tip.y * H;
        const hcolor  = hand.handedness === "Left" ? "#e5a000" : "#4f46e5";

        // Write stroke onto ink canvas
        if (isPoint && ink) {
          const inkCtx = ink.getContext("2d");
          if (inkCtx) {
            const lp = lastPtRef.current;
            if (lp) {
              inkCtx.beginPath();
              inkCtx.moveTo(lp.x, lp.y);
              inkCtx.lineTo(tx, ty);
              inkCtx.lineCap  = "round";
              inkCtx.lineJoin = "round";
              if (toolRef.current === "eraser") {
                inkCtx.globalCompositeOperation = "destination-out";
                inkCtx.strokeStyle = "rgba(0,0,0,1)";
                inkCtx.lineWidth   = brushRef.current * 4;
              } else {
                inkCtx.globalCompositeOperation = "source-over";
                inkCtx.strokeStyle = colorRef.current;
                inkCtx.lineWidth   = brushRef.current;
              }
              inkCtx.stroke();
            }
            lastPtRef.current = { x: tx, y: ty };
          }
        } else {
          lastPtRef.current = null;
        }

        // Skeleton — dark lines with slight opacity so they don't dominate
        ctx!.lineWidth   = 2.5;
        ctx!.strokeStyle = `${hcolor}cc`;
        ctx!.lineCap     = "round";
        HAND_CONNECTIONS.forEach(([a, b]) => {
          const s = hand.landmarks[a];
          const e = hand.landmarks[b];
          if (!s || !e) return;
          ctx!.beginPath();
          ctx!.moveTo((1 - s.x) * W, s.y * H);
          ctx!.lineTo((1 - e.x) * W, e.y * H);
          ctx!.stroke();
        });

        // Landmark dots
        hand.landmarks.forEach((lm, i) => {
          const r   = i === 8 ? 6 : 4;
          const x   = (1 - lm.x) * W;
          const y   = lm.y * H;
          // Fill
          ctx!.beginPath();
          ctx!.arc(x, y, r, 0, Math.PI * 2);
          ctx!.fillStyle = i === 8 ? hcolor : "#ffffff";
          ctx!.fill();
          // Dark outline for visibility on white
          ctx!.strokeStyle = i === 8 ? "rgba(0,0,0,0.5)" : hcolor;
          ctx!.lineWidth   = i === 8 ? 1.5 : 1.5;
          ctx!.stroke();
        });

        // Cursor ring at fingertip
        const isEraser    = toolRef.current === "eraser";
        const cursorColor = isEraser ? "rgba(0,0,0,0.55)" : colorRef.current;
        const cursorR     = isEraser
          ? brushRef.current * 2
          : Math.max(brushRef.current * 0.7, 7);

        ctx!.save();
        ctx!.globalAlpha = isPoint ? 1 : 0.5;
        if (!isEraser) {
          ctx!.shadowColor = cursorColor;
          ctx!.shadowBlur  = isPoint ? 14 : 4;
        }
        ctx!.beginPath();
        ctx!.arc(tx, ty, cursorR, 0, Math.PI * 2);
        ctx!.strokeStyle = cursorColor;
        ctx!.lineWidth   = 2.5;
        ctx!.stroke();
        if (isPoint) {
          ctx!.globalAlpha = 0.12;
          ctx!.fillStyle   = cursorColor;
          ctx!.fill();
        }
        ctx!.restore();

      } else {
        lastPtRef.current = null;
      }

      // ── 4. PiP camera (bottom-right) ───────────────────────────────────────
      const video = videoRef?.current;
      if (video && video.readyState >= 2) {
        const px = W - PIP_W - PIP_M;
        const py = H - PIP_H - PIP_M;

        ctx!.save();

        // Drop shadow behind pip
        ctx!.shadowColor  = "rgba(0,0,0,0.35)";
        ctx!.shadowBlur   = 12;
        ctx!.shadowOffsetY = 3;

        // Clip to rounded rect
        ctx!.beginPath();
        (ctx! as CanvasRenderingContext2D).roundRect(px, py, PIP_W, PIP_H, PIP_R);
        ctx!.clip();

        // Clear shadow before drawing video (otherwise it bleeds inside)
        ctx!.shadowColor  = "transparent";
        ctx!.shadowBlur   = 0;
        ctx!.shadowOffsetY = 0;

        // Mirror + draw
        ctx!.translate(px + PIP_W, py);
        ctx!.scale(-1, 1);
        ctx!.drawImage(video, 0, 0, PIP_W, PIP_H);

        ctx!.restore();

        // Border over the pip
        ctx!.save();
        ctx!.beginPath();
        (ctx! as CanvasRenderingContext2D).roundRect(px, py, PIP_W, PIP_H, PIP_R);
        ctx!.strokeStyle = "rgba(0,0,0,0.18)";
        ctx!.lineWidth   = 1.5;
        ctx!.stroke();
        ctx!.restore();
      }
    }

    render();
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, videoRef]);

  function clearCanvas() {
    const ink = inkCanvasRef.current;
    if (!ink) return;
    ink.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
  }

  // ── iframe guard ───────────────────────────────────────────────────────────

  if (status === "iframe") {
    const href = (() => {
      try { return window.location.href.split("/__replco")[0]; } catch { return "/"; }
    })();
    return (
      <Layout>
        <div className="h-full flex items-center justify-center">
          <div className="text-center px-6 max-w-sm">
            <div className="text-4xl mb-4">🎨</div>
            <p className="font-black text-white text-lg uppercase tracking-tight mb-2">
              Open in your browser
            </p>
            <p className="text-white/60 text-sm mb-6 font-medium leading-relaxed">
              Camera access is blocked in the embedded preview. Open the app directly to paint with your hand.
            </p>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#FFE500] text-black font-bold px-5 py-2.5 rounded-md text-sm uppercase tracking-wider hover:bg-[#f5dc00] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open App
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="h-full flex flex-col p-6 gap-4" style={{ minHeight: 0 }}>

        <div className="shrink-0">
          <h2 className="text-3xl font-black uppercase tracking-tight">Draw</h2>
          <p className="text-muted-foreground font-medium mt-0.5 text-sm">
            ☝ Point to paint · change gesture to lift pen
          </p>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">

          {/* Drawing canvas */}
          <div className="relative flex-1 rounded-lg overflow-hidden border-2 border-border bg-white">
            <canvas ref={mainCanvasRef} className="absolute inset-0 w-full h-full" />

            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="bg-black/10 text-black/60 px-4 py-2 rounded-md font-mono text-sm animate-pulse">
                  LOADING MEDIAPIPE…
                </p>
              </div>
            )}
            {status === "no-camera" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center px-6">
                  <p className="font-bold text-black/40 text-base uppercase mb-2">No camera</p>
                  <p className="text-black/30 text-sm">Allow camera access and reload.</p>
                </div>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div
            className="flex flex-col gap-4 items-center py-3 px-2 rounded-lg shrink-0"
            style={{ background: "#111114", border: "1.5px solid #2a2a2e", width: 52 }}
          >
            {/* Pen / Eraser */}
            <div className="flex flex-col gap-1 w-full items-center">
              {([["pen", Paintbrush], ["eraser", Eraser]] as const).map(([t, Icon]) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  title={t === "pen" ? "Pen" : "Eraser"}
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                  style={
                    tool === t
                      ? { background: "linear-gradient(160deg,#FFE500,#FFBB00)", color: "#000" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }
                  }
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Brush sizes */}
            <div className="flex flex-col gap-2 items-center">
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setBrushSize(s)}
                  title={`${s}px`}
                  className="rounded-full transition-all"
                  style={{
                    width:           Math.max(s * 1.4, 8),
                    height:          Math.max(s * 1.4, 8),
                    backgroundColor: tool === "eraser" ? "rgba(255,255,255,0.3)" : color,
                    outline:         brushSize === s ? `2px solid ${["#000000","#ffffff"].includes(color) ? "#888" : color}` : "none",
                    outlineOffset:   3,
                    opacity:         brushSize === s ? 1 : 0.4,
                  }}
                />
              ))}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Color palette */}
            <div className="flex flex-col gap-1.5 items-center">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setTool("pen"); }}
                  title={c}
                  className="rounded-full transition-all"
                  style={{
                    width:           26,
                    height:          26,
                    backgroundColor: c,
                    outline:         color === c && tool === "pen"
                      ? `2px solid ${["#000000","#ffffff"].includes(c) ? "#888" : c}`
                      : "none",
                    outlineOffset:   2,
                    opacity:         color === c && tool === "pen" ? 1 : 0.55,
                    border:          c === "#000000" ? "1px solid rgba(255,255,255,0.15)" : undefined,
                    transform:       color === c && tool === "pen" ? "scale(1.15)" : undefined,
                  }}
                />
              ))}
            </div>

            <div className="mt-auto">
              <button
                onClick={clearCanvas}
                title="Clear canvas"
                className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.2)";
                  (e.currentTarget as HTMLElement).style.color = "rgb(239,68,68)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)";
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
