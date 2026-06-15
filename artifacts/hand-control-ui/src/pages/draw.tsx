import { useRef, useEffect, useState } from "react";
import { useHandTracker } from "@/lib/hand-api";
import { Layout } from "@/components/layout";
import { Trash2, Eraser, Paintbrush, ExternalLink, Highlighter, Sparkles, Undo2 } from "lucide-react";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const PALETTE = [
  "#000000", "#ffffff", "#625BF6", "#ef4444",
  "#f97316", "#FFE500", "#22c55e",
  "#06b6d4", "#ec4899", "#a855f7",
];

const BRUSH_SIZES = [2, 5, 10, 18, 28];

const PIP_W = 190;
const PIP_H = 140;
const PIP_R = 10;
const PIP_M = 14;

type Tool = "pen" | "highlighter" | "spray" | "eraser";

const TOOL_DEFS: { id: Tool; label: string; Icon: React.ElementType }[] = [
  { id: "pen",         label: "Pen",         Icon: Paintbrush  },
  { id: "highlighter", label: "Highlighter", Icon: Highlighter  },
  { id: "spray",       label: "Spray",       Icon: Sparkles     },
  { id: "eraser",      label: "Eraser",      Icon: Eraser       },
];

export default function Draw() {
  const { latestFrame, videoRef, status } = useHandTracker();

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef  = useRef<HTMLCanvasElement | null>(null);
  const rafRef        = useRef<number>(0);
  const frameRef      = useRef(latestFrame);
  frameRef.current    = latestFrame;

  const [color,     setColor]     = useState("#000000");
  const [brushSize, setBrushSize] = useState(5);
  const [tool,      setTool]      = useState<Tool>("pen");

  const colorRef  = useRef(color);
  const brushRef  = useRef(brushSize);
  const toolRef   = useRef(tool);
  colorRef.current  = color;
  brushRef.current  = brushSize;
  toolRef.current   = tool;

  // Smooth cursor position
  const smoothRef = useRef<{ x: number; y: number } | null>(null);
  // Last committed ink point (for line drawing)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  // Point buffer for bezier smoothing
  const ptBufRef  = useRef<{ x: number; y: number }[]>([]);
  // Was pointing last frame?
  const wasPointRef = useRef(false);

  // Undo stack — stores ImageData snapshots of the ink canvas
  const undoStackRef = useRef<ImageData[]>([]);

  useEffect(() => {
    const ink = document.createElement("canvas");
    ink.width  = 1280;
    ink.height = 720;
    inkCanvasRef.current = ink;
    return () => { inkCanvasRef.current = null; };
  }, []);

  function pushUndo() {
    const ink = inkCanvasRef.current;
    if (!ink) return;
    const ctx = ink.getContext("2d");
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, ink.width, ink.height);
    undoStackRef.current.push(snap);
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
  }

  function undo() {
    const ink = inkCanvasRef.current;
    if (!ink) return;
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    ink.getContext("2d")?.putImageData(snap, 0, 0);
  }

  function clearCanvas() {
    pushUndo();
    const ink = inkCanvasRef.current;
    if (!ink) return;
    ink.getContext("2d")?.clearRect(0, 0, ink.width, ink.height);
  }

  useEffect(() => {
    if (status === "iframe") return;

    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function drawSpray(inkCtx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string) {
      const density = Math.max(30, size * 3);
      const radius  = size * 2.5;
      inkCtx.fillStyle = col;
      inkCtx.globalCompositeOperation = "source-over";
      for (let i = 0; i < density; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r     = Math.sqrt(Math.random()) * radius;
        const x     = cx + Math.cos(angle) * r;
        const y     = cy + Math.sin(angle) * r;
        const dotR  = Math.random() * 1.2 + 0.3;
        inkCtx.beginPath();
        inkCtx.arc(x, y, dotR, 0, Math.PI * 2);
        inkCtx.fill();
      }
    }

    function drawHighlighter(inkCtx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number, col: string) {
      inkCtx.save();
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.globalAlpha  = 0.28;
      inkCtx.lineCap      = "square";
      inkCtx.lineJoin     = "round";
      inkCtx.strokeStyle  = col;
      inkCtx.lineWidth    = size * 5;
      inkCtx.beginPath();
      inkCtx.moveTo(from.x, from.y);
      inkCtx.lineTo(to.x, to.y);
      inkCtx.stroke();
      inkCtx.restore();
    }

    function render() {
      rafRef.current = requestAnimationFrame(render);

      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;
      if (!W || !H) return;

      if (canvas!.width !== W || canvas!.height !== H) {
        canvas!.width  = W;
        canvas!.height = H;
        const ink = inkCanvasRef.current;
        if (ink && (ink.width !== W || ink.height !== H)) {
          const tmp = document.createElement("canvas");
          tmp.width = W; tmp.height = H;
          if (ink.width > 0 && ink.height > 0) {
            tmp.getContext("2d")?.drawImage(ink, 0, 0, W, H);
          }
          ink.width = W; ink.height = H;
          if (tmp.width > 0 && tmp.height > 0) {
            ink.getContext("2d")?.drawImage(tmp, 0, 0);
          }
        }
      }

      // 1. White background
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, W, H);

      // 2. Ink strokes
      const ink = inkCanvasRef.current;
      if (ink) ctx!.drawImage(ink, 0, 0);

      // 3. Hand + drawing
      const frame = frameRef.current;
      if (frame && frame.hands.length > 0) {
        const hand    = frame.hands[0];
        const tip     = hand.landmarks[8];  // index tip
        const lm      = hand.landmarks;
        // Pen-down: index finger is extended in any direction.
        // Measure tip distance from wrist vs knuckle distance from wrist —
        // if the tip is significantly further out, the finger is extended.
        const d = (a: typeof tip, b: typeof tip) =>
          Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
        const tipToWrist = d(lm[8], lm[0]);
        const mcpToWrist = d(lm[5], lm[0]);
        const isPoint = tipToWrist > mcpToWrist * 1.25;
        const rawX    = (1 - tip.x) * W;
        const rawY    = tip.y * H;
        const hcolor  = hand.handedness === "Left" ? "#e5a000" : "#4f46e5";

        // Exponential smoothing for cursor position
        const ALPHA = 0.45;
        if (!smoothRef.current) smoothRef.current = { x: rawX, y: rawY };
        smoothRef.current.x = ALPHA * rawX + (1 - ALPHA) * smoothRef.current.x;
        smoothRef.current.y = ALPHA * rawY + (1 - ALPHA) * smoothRef.current.y;
        const tx = smoothRef.current.x;
        const ty = smoothRef.current.y;

        const inkCtx = ink?.getContext("2d") ?? null;
        const currentTool = toolRef.current;
        const currentColor = colorRef.current;
        const currentSize = brushRef.current;

        if (isPoint && inkCtx) {
          // Push undo snapshot on stroke start
          if (!wasPointRef.current) {
            pushUndo();
            ptBufRef.current = [];
            lastPtRef.current = { x: tx, y: ty };
          }

          if (currentTool === "spray") {
            drawSpray(inkCtx, tx, ty, currentSize, currentColor);
          } else if (currentTool === "eraser") {
            const lp = lastPtRef.current;
            if (lp) {
              inkCtx.beginPath();
              inkCtx.globalCompositeOperation = "destination-out";
              inkCtx.strokeStyle = "rgba(0,0,0,1)";
              inkCtx.lineWidth   = currentSize * 4;
              inkCtx.lineCap     = "round";
              inkCtx.lineJoin    = "round";
              inkCtx.moveTo(lp.x, lp.y);
              inkCtx.lineTo(tx, ty);
              inkCtx.stroke();
              inkCtx.globalCompositeOperation = "source-over";
            }
            lastPtRef.current = { x: tx, y: ty };
          } else if (currentTool === "highlighter") {
            const lp = lastPtRef.current;
            if (lp) drawHighlighter(inkCtx, lp, { x: tx, y: ty }, currentSize, currentColor);
            lastPtRef.current = { x: tx, y: ty };
          } else {
            // Pen — bezier-smoothed via point buffer
            const buf = ptBufRef.current;
            buf.push({ x: tx, y: ty });
            if (buf.length > 6) buf.shift();

            if (buf.length >= 2) {
              inkCtx.globalCompositeOperation = "source-over";
              inkCtx.strokeStyle = currentColor;
              inkCtx.lineWidth   = currentSize;
              inkCtx.lineCap     = "round";
              inkCtx.lineJoin    = "round";
              inkCtx.beginPath();
              inkCtx.moveTo(buf[0].x, buf[0].y);

              if (buf.length === 2) {
                inkCtx.lineTo(buf[1].x, buf[1].y);
              } else {
                for (let i = 1; i < buf.length - 1; i++) {
                  const mx = (buf[i].x + buf[i + 1].x) / 2;
                  const my = (buf[i].y + buf[i + 1].y) / 2;
                  inkCtx.quadraticCurveTo(buf[i].x, buf[i].y, mx, my);
                }
                inkCtx.lineTo(buf[buf.length - 1].x, buf[buf.length - 1].y);
              }
              inkCtx.stroke();
              // Keep last 2 points for continuity
              ptBufRef.current = buf.slice(-2);
            }
          }

          wasPointRef.current = true;
        } else {
          smoothRef.current = null;
          lastPtRef.current = null;
          ptBufRef.current  = [];
          wasPointRef.current = false;
        }

        // Skeleton
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
          ctx!.beginPath();
          ctx!.arc(x, y, r, 0, Math.PI * 2);
          ctx!.fillStyle = i === 8 ? hcolor : "#ffffff";
          ctx!.fill();
          ctx!.strokeStyle = i === 8 ? "rgba(0,0,0,0.5)" : hcolor;
          ctx!.lineWidth   = 1.5;
          ctx!.stroke();
        });

        // Cursor
        const isEraser    = currentTool === "eraser";
        const isHighlight = currentTool === "highlighter";
        const cursorColor = isEraser ? "rgba(80,80,80,0.7)" : currentColor;
        const cursorR     = isEraser   ? currentSize * 2
                          : isHighlight ? currentSize * 2.5
                          : Math.max(currentSize * 0.65, 6);

        ctx!.save();
        ctx!.globalAlpha = isPoint ? 1 : 0.45;
        if (!isEraser) {
          ctx!.shadowColor = cursorColor;
          ctx!.shadowBlur  = isPoint ? 14 : 4;
        }
        ctx!.beginPath();
        if (isHighlight) {
          ctx!.rect(tx - cursorR, ty - cursorR * 0.4, cursorR * 2, cursorR * 0.8);
        } else {
          ctx!.arc(tx, ty, cursorR, 0, Math.PI * 2);
        }
        ctx!.strokeStyle = cursorColor;
        ctx!.lineWidth   = 2;
        ctx!.stroke();
        if (isPoint) {
          ctx!.globalAlpha = isHighlight ? 0.18 : 0.1;
          ctx!.fillStyle   = cursorColor;
          ctx!.fill();
        }
        ctx!.restore();

      } else {
        smoothRef.current   = null;
        lastPtRef.current   = null;
        ptBufRef.current    = [];
        wasPointRef.current = false;
      }

      // 4. PiP camera
      const video = videoRef?.current;
      if (video && video.readyState >= 2) {
        const px = W - PIP_W - PIP_M;
        const py = H - PIP_H - PIP_M;

        ctx!.save();
        ctx!.shadowColor   = "rgba(0,0,0,0.35)";
        ctx!.shadowBlur    = 12;
        ctx!.shadowOffsetY = 3;
        ctx!.beginPath();
        (ctx! as CanvasRenderingContext2D).roundRect(px, py, PIP_W, PIP_H, PIP_R);
        ctx!.clip();
        ctx!.shadowColor   = "transparent";
        ctx!.shadowBlur    = 0;
        ctx!.shadowOffsetY = 0;
        ctx!.translate(px + PIP_W, py);
        ctx!.scale(-1, 1);
        ctx!.drawImage(video, 0, 0, PIP_W, PIP_H);
        ctx!.restore();

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

  if (status === "iframe") {
    const href = (() => {
      try { return window.location.href.split("/__replco")[0]; } catch { return "/"; }
    })();
    return (
      <Layout>
        <div className="h-full flex items-center justify-center">
          <div className="text-center px-6 max-w-sm">
            <div className="text-4xl mb-4">🎨</div>
            <p className="font-black text-white text-lg uppercase tracking-tight mb-2">Open in your browser</p>
            <p className="text-white/60 text-sm mb-6 font-medium leading-relaxed">
              Camera access is blocked in the embedded preview. Open the app directly to paint with your hand.
            </p>
            <a
              href={href} target="_blank" rel="noopener noreferrer"
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
          {/* Canvas */}
          <div className="relative flex-1 rounded-lg overflow-hidden border-2 border-border bg-white">
            <canvas ref={mainCanvasRef} className="absolute inset-0 w-full h-full" />
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="bg-black/10 text-black/60 px-4 py-2 rounded-md font-mono text-sm animate-pulse">LOADING MEDIAPIPE…</p>
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
            className="flex flex-col gap-3 items-center py-3 px-2 rounded-lg shrink-0"
            style={{ background: "#111114", border: "1.5px solid #2a2a2e", width: 52 }}
          >
            {/* Tools */}
            <div className="flex flex-col gap-1 w-full items-center">
              {TOOL_DEFS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setTool(id)}
                  title={label}
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                  style={
                    tool === id
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
              {BRUSH_SIZES.map((s) => {
                const dim = Math.max(s * 1.3, 6);
                return (
                  <button
                    key={s}
                    onClick={() => setBrushSize(s)}
                    title={`${s}px`}
                    className="rounded-full transition-all flex items-center justify-center"
                    style={{ width: 32, height: 32 }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width:           dim,
                        height:          dim,
                        backgroundColor: tool === "eraser" ? "rgba(255,255,255,0.35)" : color,
                        outline:         brushSize === s
                          ? `2px solid ${color === "#000000" || color === "#ffffff" ? "#888" : color}`
                          : "none",
                        outlineOffset:   2,
                        opacity:         brushSize === s ? 1 : 0.35,
                        transition:      "all 0.15s",
                        transform:       brushSize === s ? "scale(1.1)" : "scale(1)",
                      }}
                    />
                  </button>
                );
              })}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Color palette */}
            <div className="flex flex-col gap-1.5 items-center">
              {PALETTE.map((c) => {
                const active = color === c && tool !== "eraser";
                return (
                  <button
                    key={c}
                    onClick={() => { setColor(c); if (tool === "eraser") setTool("pen"); }}
                    title={c}
                    className="rounded-full transition-all"
                    style={{
                      width:         26,
                      height:        26,
                      backgroundColor: c,
                      outline:       active
                        ? `2px solid ${c === "#000000" || c === "#ffffff" ? "#888" : c}`
                        : "none",
                      outlineOffset: 2,
                      opacity:       active ? 1 : 0.5,
                      border:        c === "#000000" ? "1px solid rgba(255,255,255,0.15)"
                                   : c === "#ffffff" ? "1px solid rgba(0,0,0,0.15)"
                                   : undefined,
                      transform:     active ? "scale(1.18)" : "scale(1)",
                      transition:    "all 0.15s",
                    }}
                  />
                );
              })}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Undo + Clear */}
            <div className="flex flex-col gap-1 items-center">
              {[
                { Icon: Undo2,  label: "Undo",  action: undo,        hover: "rgba(99,91,246,0.2)", hoverColor: "#a5b4fc" },
                { Icon: Trash2, label: "Clear", action: clearCanvas, hover: "rgba(239,68,68,0.2)",  hoverColor: "rgb(239,68,68)" },
              ].map(({ Icon, label, action, hover, hoverColor }) => (
                <button
                  key={label}
                  onClick={action}
                  title={label}
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = hover;
                    (e.currentTarget as HTMLElement).style.color = hoverColor;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)";
                  }}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
