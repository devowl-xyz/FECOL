import { useRef, useEffect, useState } from "react";
import { useHandTracker } from "@/lib/hand-api";
import { Layout } from "@/components/layout";
import {
  Trash2, Eraser, Paintbrush, ExternalLink,
  Highlighter, Sparkles, Undo2,
  Minus, Square, Circle, PaintBucket, Wand2,
} from "lucide-react";

// ── 1€ Filter (adaptive jitter suppressor) ──────────────────────────────────
// Référence: Casiez et al. 2012 "1€ Filter: A Simple Speed-based Low-pass Filter"
// Slow motion (twitches) → heavy smoothing; fast intentional strokes → near zero lag.
interface EuroAxis { val: number; deriv: number; t: number; }

function euroAlpha(cutoff: number, dt: number) {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
}

function euroStep(
  raw: number,
  axis: EuroAxis,
  nowSec: number,
  minCutoff: number,
  beta: number,
  dCutoff = 1.0,
): number {
  const dt   = Math.max(nowSec - axis.t, 0.001);
  axis.t     = nowSec;
  const aD   = euroAlpha(dCutoff, dt);
  const dRaw = (raw - axis.val) / dt;
  axis.deriv = aD * dRaw + (1 - aD) * axis.deriv;
  const cutoff = minCutoff + beta * Math.abs(axis.deriv);
  const a    = euroAlpha(cutoff, dt);
  axis.val   = a * raw + (1 - a) * axis.val;
  return axis.val;
}

// Presets: [minCutoff Hz, beta] in normalised (0-1) coordinate space
// Higher minCutoff = less lag but less smoothing; lower beta = smoother at speed
const SMOOTH_PRESETS: Array<{ label: string; minC: number; beta: number }> = [
  { label: "Off",    minC: 50,  beta: 10  }, // essentially passthrough
  { label: "Light",  minC: 2.5, beta: 4.0 },
  { label: "Medium", minC: 1.2, beta: 2.0 },
  { label: "Strong", minC: 0.5, beta: 0.8 },
];

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

type Tool = "pen" | "highlighter" | "spray" | "line" | "rect" | "circle" | "fill" | "eraser";

const TOOL_DEFS: { id: Tool; label: string; Icon: React.ElementType }[] = [
  { id: "pen",         label: "Pen",         Icon: Paintbrush   },
  { id: "highlighter", label: "Highlighter", Icon: Highlighter  },
  { id: "spray",       label: "Spray",       Icon: Sparkles     },
  { id: "line",        label: "Line",        Icon: Minus        },
  { id: "rect",        label: "Rectangle",   Icon: Square       },
  { id: "circle",      label: "Circle",      Icon: Circle       },
  { id: "fill",        label: "Fill",        Icon: PaintBucket  },
  { id: "eraser",      label: "Eraser",      Icon: Eraser       },
];

const SHAPE_TOOLS: Tool[] = ["line", "rect", "circle"];

// ── Flood fill ─────────────────────────────────────────────────────────────
function floodFill(
  inkCanvas: HTMLCanvasElement,
  mainCanvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  fillColorHex: string,
) {
  const w = inkCanvas.width;
  const h = inkCanvas.height;

  // Composite ink over white into a temp canvas so we fill what the user sees
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tmpCtx = tmp.getContext("2d")!;
  tmpCtx.fillStyle = "#ffffff";
  tmpCtx.fillRect(0, 0, w, h);
  tmpCtx.drawImage(inkCanvas, 0, 0);

  const imgData = tmpCtx.getImageData(0, 0, w, h);
  const data    = imgData.data;

  const sx = Math.max(0, Math.min(w - 1, Math.round(startX)));
  const sy = Math.max(0, Math.min(h - 1, Math.round(startY)));
  const si = (sy * w + sx) * 4;
  const tR = data[si], tG = data[si + 1], tB = data[si + 2];

  // Parse fill colour
  const fc = document.createElement("canvas");
  fc.width = fc.height = 1;
  const fCtx = fc.getContext("2d")!;
  fCtx.fillStyle = fillColorHex;
  fCtx.fillRect(0, 0, 1, 1);
  const fd   = fCtx.getImageData(0, 0, 1, 1).data;
  const fR = fd[0], fG = fd[1], fB = fd[2];

  if (tR === fR && tG === fG && tB === fB) return;

  const tol = 40;
  const match = (i: number) =>
    Math.abs(data[i]     - tR) <= tol &&
    Math.abs(data[i + 1] - tG) <= tol &&
    Math.abs(data[i + 2] - tB) <= tol;

  const visited = new Uint8Array(w * h);
  const stack   = [sx + sy * w];

  while (stack.length) {
    const pos = stack.pop()!;
    const x   = pos % w;
    const y   = (pos - x) / w;
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    if (visited[pos]) continue;
    const pi = pos * 4;
    if (!match(pi)) continue;
    visited[pos] = 1;
    data[pi]     = fR;
    data[pi + 1] = fG;
    data[pi + 2] = fB;
    data[pi + 3] = 255;
    stack.push(pos + 1, pos - 1, pos + w, pos - w);
  }

  // Write result back to ink canvas
  const inkCtx = inkCanvas.getContext("2d")!;
  inkCtx.clearRect(0, 0, w, h);
  inkCtx.putImageData(imgData, 0, 0);
}

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

  const [smoothLevel, setSmoothLevel] = useState(2); // 0=Off 1=Light 2=Medium 3=Strong
  const smoothLevelRef = useRef(smoothLevel);
  smoothLevelRef.current = smoothLevel;

  const euroRef  = useRef<{ x: EuroAxis; y: EuroAxis } | null>(null);
  const lastPtRef      = useRef<{ x: number; y: number } | null>(null);
  const ptBufRef       = useRef<{ x: number; y: number }[]>([]);
  const wasPointRef    = useRef(false);
  const shapeStartRef  = useRef<{ x: number; y: number } | null>(null);
  const shapeLastRef   = useRef<{ x: number; y: number } | null>(null);
  const fillDoneRef    = useRef(false);
  const undoStackRef   = useRef<ImageData[]>([]);

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
    const ink  = inkCanvasRef.current;
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

  function fillCanvas() {
    pushUndo();
    const ink = inkCanvasRef.current;
    if (!ink) return;
    const ctx = ink.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = colorRef.current;
    ctx.fillRect(0, 0, ink.width, ink.height);
  }

  useEffect(() => {
    if (status === "iframe") return;
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── helpers ──────────────────────────────────────────────────────────────
    function applyStrokeStyle(inkCtx: CanvasRenderingContext2D, col: string, size: number) {
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.strokeStyle = col;
      inkCtx.lineWidth   = size;
      inkCtx.lineCap     = "round";
      inkCtx.lineJoin    = "round";
      inkCtx.setLineDash([]);
    }

    function commitShape(inkCanvas: HTMLCanvasElement, from: {x:number;y:number}, to: {x:number;y:number}, t: Tool, col: string, size: number) {
      const inkCtx = inkCanvas.getContext("2d");
      if (!inkCtx) return;
      applyStrokeStyle(inkCtx, col, size);
      if (t === "line") {
        inkCtx.beginPath();
        inkCtx.moveTo(from.x, from.y);
        inkCtx.lineTo(to.x, to.y);
        inkCtx.stroke();
      } else if (t === "rect") {
        inkCtx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
      } else if (t === "circle") {
        const rx = Math.max(1, Math.abs(to.x - from.x) / 2);
        const ry = Math.max(1, Math.abs(to.y - from.y) / 2);
        const cx = (from.x + to.x) / 2;
        const cy = (from.y + to.y) / 2;
        inkCtx.beginPath();
        inkCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        inkCtx.stroke();
      }
    }

    function drawPreview(c: CanvasRenderingContext2D, from: {x:number;y:number}, to: {x:number;y:number}, t: Tool, col: string, size: number) {
      c.save();
      c.strokeStyle = col;
      c.lineWidth   = size;
      c.lineCap     = "round";
      c.lineJoin    = "round";
      c.setLineDash([7, 5]);
      c.globalAlpha = 0.75;
      if (t === "line") {
        c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
      } else if (t === "rect") {
        c.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
      } else if (t === "circle") {
        const rx = Math.max(1, Math.abs(to.x - from.x) / 2);
        const ry = Math.max(1, Math.abs(to.y - from.y) / 2);
        const cx = (from.x + to.x) / 2;
        const cy = (from.y + to.y) / 2;
        c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    }

    function drawSpray(inkCtx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string) {
      const density = Math.max(30, size * 3);
      const radius  = size * 2.5;
      inkCtx.fillStyle = col;
      inkCtx.globalCompositeOperation = "source-over";
      for (let i = 0; i < density; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r     = Math.sqrt(Math.random()) * radius;
        inkCtx.beginPath();
        inkCtx.arc(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, Math.random() * 1.2 + 0.3, 0, Math.PI * 2);
        inkCtx.fill();
      }
    }

    function drawHighlighter(inkCtx: CanvasRenderingContext2D, from: {x:number;y:number}, to: {x:number;y:number}, size: number, col: string) {
      inkCtx.save();
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.globalAlpha = 0.28;
      inkCtx.lineCap     = "square";
      inkCtx.lineJoin    = "round";
      inkCtx.strokeStyle = col;
      inkCtx.lineWidth   = size * 5;
      inkCtx.setLineDash([]);
      inkCtx.beginPath();
      inkCtx.moveTo(from.x, from.y);
      inkCtx.lineTo(to.x, to.y);
      inkCtx.stroke();
      inkCtx.restore();
    }

    // ── render loop ──────────────────────────────────────────────────────────
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
          if (ink.width > 0 && ink.height > 0) tmp.getContext("2d")?.drawImage(ink, 0, 0, W, H);
          ink.width = W; ink.height = H;
          if (tmp.width > 0 && tmp.height > 0) ink.getContext("2d")?.drawImage(tmp, 0, 0);
        }
      }

      // 1. Background
      ctx!.fillStyle = "#ffffff";
      ctx!.fillRect(0, 0, W, H);

      // 2. Ink layer
      const ink = inkCanvasRef.current;
      if (ink) ctx!.drawImage(ink, 0, 0);

      // 3. Hand + tools
      const frame = frameRef.current;
      if (frame && frame.hands.length > 0) {
        const hand = frame.hands[0];
        const tip  = hand.landmarks[8];
        const lm   = hand.landmarks;

        const d = (a: typeof tip, b: typeof tip) =>
          Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
        const isPoint = d(lm[8], lm[0]) > d(lm[5], lm[0]) * 1.25;

        const rawX  = (1 - tip.x) * W;
        const rawY  = tip.y * H;
        const hcolor = hand.handedness === "Left" ? "#e5a000" : "#4f46e5";

        // 1€ adaptive filter — normalised coords then scale to canvas
        const nowSec = performance.now() / 1000;
        const preset = SMOOTH_PRESETS[smoothLevelRef.current];
        if (!euroRef.current) {
          euroRef.current = {
            x: { val: 1 - tip.x, deriv: 0, t: nowSec - 0.016 },
            y: { val: tip.y,     deriv: 0, t: nowSec - 0.016 },
          };
        }
        const filtX = euroStep(1 - tip.x, euroRef.current.x, nowSec, preset.minC, preset.beta);
        const filtY = euroStep(tip.y,     euroRef.current.y, nowSec, preset.minC, preset.beta);
        const tx = filtX * W;
        const ty = filtY * H;

        const inkCtx       = ink?.getContext("2d") ?? null;
        const currentTool  = toolRef.current;
        const currentColor = colorRef.current;
        const currentSize  = brushRef.current;
        const isShape      = SHAPE_TOOLS.includes(currentTool);

        if (isPoint) {
          // ── Stroke start ────────────────────────────────────────────────
          if (!wasPointRef.current) {
            if (currentTool === "fill") {
              pushUndo();
              if (ink && canvas) floodFill(ink, canvas, tx, ty, currentColor);
              fillDoneRef.current = true;
            } else if (isShape) {
              pushUndo();
              shapeStartRef.current = { x: tx, y: ty };
            } else {
              pushUndo();
              ptBufRef.current  = [];
              lastPtRef.current = { x: tx, y: ty };
            }
          }

          if (isShape) {
            shapeLastRef.current = { x: tx, y: ty };
            // Preview on main canvas
            if (shapeStartRef.current) {
              drawPreview(ctx!, shapeStartRef.current, { x: tx, y: ty }, currentTool, currentColor, currentSize);
            }
          } else if (currentTool !== "fill" && inkCtx) {
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
                inkCtx.setLineDash([]);
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
              // Pen — bezier smoothing
              const buf = ptBufRef.current;
              buf.push({ x: tx, y: ty });
              if (buf.length > 6) buf.shift();
              if (buf.length >= 2) {
                applyStrokeStyle(inkCtx, currentColor, currentSize);
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
                ptBufRef.current = buf.slice(-2);
              }
            }
          }

          wasPointRef.current = true;
        } else {
          // ── Gesture released — commit shapes ──────────────────────────
          if (wasPointRef.current && isShape && shapeStartRef.current && shapeLastRef.current && ink) {
            commitShape(ink, shapeStartRef.current, shapeLastRef.current, currentTool, currentColor, currentSize);
          }
          euroRef.current       = null;
          lastPtRef.current     = null;
          ptBufRef.current      = [];
          shapeStartRef.current = null;
          shapeLastRef.current  = null;
          fillDoneRef.current   = false;
          wasPointRef.current   = false;
        }

        // Skeleton
        ctx!.lineWidth   = 2.5;
        ctx!.strokeStyle = `${hcolor}cc`;
        ctx!.lineCap     = "round";
        HAND_CONNECTIONS.forEach(([a, b]) => {
          const s = hand.landmarks[a]; const e = hand.landmarks[b];
          if (!s || !e) return;
          ctx!.beginPath();
          ctx!.moveTo((1 - s.x) * W, s.y * H);
          ctx!.lineTo((1 - e.x) * W, e.y * H);
          ctx!.stroke();
        });

        hand.landmarks.forEach((lmk, i) => {
          const x = (1 - lmk.x) * W, y = lmk.y * H;
          ctx!.beginPath(); ctx!.arc(x, y, i === 8 ? 6 : 4, 0, Math.PI * 2);
          ctx!.fillStyle   = i === 8 ? hcolor : "#ffffff"; ctx!.fill();
          ctx!.strokeStyle = i === 8 ? "rgba(0,0,0,0.5)" : hcolor;
          ctx!.lineWidth   = 1.5; ctx!.stroke();
        });

        // Cursor
        const isEraser    = currentTool === "eraser";
        const isHighlight = currentTool === "highlighter";
        const isFill      = currentTool === "fill";
        const cursorColor = isEraser ? "rgba(80,80,80,0.7)" : currentColor;
        const cursorR     = isEraser ? currentSize * 2 : isHighlight ? currentSize * 2.5 : Math.max(currentSize * 0.65, 6);

        ctx!.save();
        ctx!.globalAlpha = isPoint ? 1 : 0.45;
        if (!isEraser && !isFill) { ctx!.shadowColor = cursorColor; ctx!.shadowBlur = isPoint ? 14 : 4; }
        ctx!.beginPath();
        if (isHighlight) {
          ctx!.rect(tx - cursorR, ty - cursorR * 0.4, cursorR * 2, cursorR * 0.8);
        } else if (isFill) {
          ctx!.arc(tx, ty, 8, 0, Math.PI * 2);
        } else {
          ctx!.arc(tx, ty, cursorR, 0, Math.PI * 2);
        }
        ctx!.strokeStyle = cursorColor;
        ctx!.lineWidth   = 2;
        ctx!.stroke();
        if (isPoint && !isFill) {
          ctx!.globalAlpha = isHighlight ? 0.18 : 0.1;
          ctx!.fillStyle   = cursorColor; ctx!.fill();
        }
        if (isFill && isPoint) {
          ctx!.globalAlpha = 0.7;
          ctx!.fillStyle   = cursorColor; ctx!.fill();
        }
        ctx!.restore();

      } else {
        if (wasPointRef.current) {
          const currentTool = toolRef.current;
          if (SHAPE_TOOLS.includes(currentTool) && shapeStartRef.current && shapeLastRef.current && ink) {
            commitShape(ink, shapeStartRef.current, shapeLastRef.current, currentTool, colorRef.current, brushRef.current);
          }
        }
        euroRef.current       = null;
        lastPtRef.current     = null;
        ptBufRef.current      = [];
        shapeStartRef.current = null;
        shapeLastRef.current  = null;
        fillDoneRef.current   = false;
        wasPointRef.current   = false;
      }

      // 4. PiP camera
      const video = videoRef?.current;
      if (video && video.readyState >= 2) {
        const px = W - PIP_W - PIP_M;
        const py = H - PIP_H - PIP_M;
        ctx!.save();
        ctx!.shadowColor = "rgba(0,0,0,0.35)"; ctx!.shadowBlur = 12; ctx!.shadowOffsetY = 3;
        ctx!.beginPath(); (ctx! as CanvasRenderingContext2D).roundRect(px, py, PIP_W, PIP_H, PIP_R); ctx!.clip();
        ctx!.shadowColor = "transparent"; ctx!.shadowBlur = 0; ctx!.shadowOffsetY = 0;
        ctx!.translate(px + PIP_W, py); ctx!.scale(-1, 1); ctx!.drawImage(video, 0, 0, PIP_W, PIP_H);
        ctx!.restore();
        ctx!.save();
        ctx!.beginPath(); (ctx! as CanvasRenderingContext2D).roundRect(px, py, PIP_W, PIP_H, PIP_R);
        ctx!.strokeStyle = "rgba(0,0,0,0.18)"; ctx!.lineWidth = 1.5; ctx!.stroke();
        ctx!.restore();
      }
    }

    render();
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, videoRef]);

  if (status === "iframe") {
    const href = (() => { try { return window.location.href.split("/__replco")[0]; } catch { return "/"; } })();
    return (
      <Layout>
        <div className="h-full flex items-center justify-center">
          <div className="text-center px-6 max-w-sm">
            <div className="text-4xl mb-4">🎨</div>
            <p className="font-black text-white text-lg uppercase tracking-tight mb-2">Open in your browser</p>
            <p className="text-white/60 text-sm mb-6 font-medium leading-relaxed">
              Camera access is blocked in the embedded preview.
            </p>
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#FFE500] text-black font-bold px-5 py-2.5 rounded-md text-sm uppercase tracking-wider hover:bg-[#f5dc00] transition-colors">
              <ExternalLink className="w-4 h-4" /> Open App
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full flex flex-col p-6 gap-4" style={{ minHeight: 0 }}>
        <div className="shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Draw</h2>
            <p className="text-muted-foreground font-medium mt-0.5 text-sm">
              ☝ Point to paint · lift finger to commit shapes
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fillCanvas}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wider transition-all hover:brightness-110 active:scale-95"
              style={{ background: color, color: color === "#ffffff" || color === "#FFE500" ? "#000" : "#fff", border: color === "#ffffff" ? "1.5px solid rgba(0,0,0,0.15)" : "none" }}
            >
              <PaintBucket className="w-3.5 h-3.5" />
              Fill
            </button>
            <button
              onClick={clearCanvas}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wider transition-all"
              style={{ background: "rgba(239,68,68,0.15)", color: "rgb(239,68,68)", border: "1px solid rgba(239,68,68,0.3)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.25)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.15)"; }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
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
          <div className="flex flex-col gap-2.5 items-center py-3 px-2 rounded-lg shrink-0 overflow-y-auto"
            style={{ background: "#111114", border: "1.5px solid #2a2a2e", width: 52 }}>

            {/* Tools */}
            <div className="flex flex-col gap-1 w-full items-center">
              {TOOL_DEFS.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => setTool(id)} title={label}
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                  style={tool === id
                    ? { background: "linear-gradient(160deg,#FFE500,#FFBB00)", color: "#000" }
                    : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }
                  }>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Brush sizes */}
            <div className="flex flex-col gap-1 items-center">
              {BRUSH_SIZES.map((s) => (
                <button key={s} onClick={() => setBrushSize(s)} title={`${s}px`}
                  className="w-8 h-8 rounded flex items-center justify-center transition-all">
                  <div className="rounded-full transition-all"
                    style={{
                      width:         Math.max(s * 1.3, 5),
                      height:        Math.max(s * 1.3, 5),
                      backgroundColor: tool === "eraser" ? "rgba(255,255,255,0.35)" : color,
                      outline:       brushSize === s ? `2px solid ${color === "#000000" || color === "#ffffff" ? "#888" : color}` : "none",
                      outlineOffset: 2,
                      opacity:       brushSize === s ? 1 : 0.35,
                      transform:     brushSize === s ? "scale(1.1)" : "scale(1)",
                    }} />
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Palette */}
            <div className="flex flex-col gap-1.5 items-center">
              {PALETTE.map((c) => {
                const active = color === c && tool !== "eraser";
                return (
                  <button key={c} onClick={() => { setColor(c); if (tool === "eraser") setTool("pen"); }}
                    title={c} className="rounded-full transition-all"
                    style={{
                      width: 26, height: 26,
                      backgroundColor: c,
                      outline:       active ? `2px solid ${c === "#000000" || c === "#ffffff" ? "#888" : c}` : "none",
                      outlineOffset: 2,
                      opacity:       active ? 1 : 0.5,
                      border:        c === "#000000" ? "1px solid rgba(255,255,255,0.15)" : c === "#ffffff" ? "1px solid rgba(0,0,0,0.2)" : undefined,
                      transform:     active ? "scale(1.18)" : "scale(1)",
                      transition:    "all 0.15s",
                    }} />
                );
              })}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* Undo + Clear */}
            <div className="flex flex-col gap-1 items-center">
              {[
                { Icon: Undo2,  label: "Undo",  action: undo,        hover: "rgba(99,91,246,0.2)",  hc: "#a5b4fc" },
                { Icon: Trash2, label: "Clear", action: clearCanvas, hover: "rgba(239,68,68,0.2)", hc: "rgb(239,68,68)" },
              ].map(({ Icon, label, action, hover, hc }) => (
                <button key={label} onClick={action} title={label}
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = hover; (e.currentTarget as HTMLElement).style.color = hc; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.4)"; }}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            <div style={{ width: "100%", height: 1, background: "#2a2a2e" }} />

            {/* AI Smooth */}
            <div className="flex flex-col items-center gap-1">
              <button
                title={`AI Smooth: ${SMOOTH_PRESETS[smoothLevel].label} (click to cycle)`}
                onClick={() => setSmoothLevel(l => (l + 1) % SMOOTH_PRESETS.length)}
                className="w-9 h-9 rounded-md flex items-center justify-center transition-all relative"
                style={smoothLevel > 0
                  ? { background: "linear-gradient(160deg,#625BF6,#a855f7)", color: "#fff" }
                  : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }
                }
              >
                <Wand2 className="w-4 h-4" />
              </button>
              <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: smoothLevel > 0 ? "#a78bfa" : "rgba(255,255,255,0.2)" }}>
                {SMOOTH_PRESETS[smoothLevel].label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
