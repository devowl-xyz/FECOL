import { useRef, useEffect } from "react";
import { HandFrame } from "@/lib/hand-api";

interface Vec3 { x: number; y: number; z: number; }

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}
function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}
function project(v: Vec3, cx: number, cy: number, fov: number, camDist: number): [number, number] {
  const d = v.z + camDist;
  const s = fov / d;
  return [cx + v.x * s, cy - v.y * s];
}

// Unit cube verts
const VERTS: Vec3[] = [
  { x: -1, y: -1, z: -1 }, { x:  1, y: -1, z: -1 },
  { x:  1, y:  1, z: -1 }, { x: -1, y:  1, z: -1 },
  { x: -1, y: -1, z:  1 }, { x:  1, y: -1, z:  1 },
  { x:  1, y:  1, z:  1 }, { x: -1, y:  1, z:  1 },
];

// Each face: vertex indices + outward normal + base colour [r,g,b]
const FACES: { idx: [number,number,number,number]; nx: number; ny: number; nz: number; rgb: [number,number,number] }[] = [
  { idx: [4,5,6,7], nx:  0, ny:  0, nz:  1, rgb: [255, 229,   0] }, // front  — pure yellow
  { idx: [1,0,3,2], nx:  0, ny:  0, nz: -1, rgb: [255, 160,   0] }, // back   — deep amber
  { idx: [0,4,7,3], nx: -1, ny:  0, nz:  0, rgb: [255, 200,  30] }, // left   — golden yellow
  { idx: [5,1,2,6], nx:  1, ny:  0, nz:  0, rgb: [255, 240, 100] }, // right  — pale yellow
  { idx: [7,6,2,3], nx:  0, ny:  1, nz:  0, rgb: [255, 255, 160] }, // top    — soft cream-yellow
  { idx: [0,1,5,4], nx:  0, ny: -1, nz:  0, rgb: [180, 140, 255] }, // bottom — purple accent
];

// Apparent hand size: wrist (0) → middle-finger MCP (9).
// Larger value = hand is closer to camera.
// Typical range: ~0.08 (arm's length) … ~0.32 (hand filling frame)
function apparentHandSize(lms: HandFrame["hands"][0]["landmarks"]): number {
  const w = lms[0], m = lms[9];
  if (!w || !m) return 0.16;
  return Math.sqrt((w.x - m.x) ** 2 + (w.y - m.y) ** 2);
}

export function Scene3D({ frame }: { frame: HandFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    rotX: 0.4, rotY: 0.6,
    targetRotX: 0.4, targetRotY: 0.6,
    scale: 1, targetScale: 1,
    panX: 0, panY: 0,
    targetPanX: 0, targetPanY: 0,
    spinFast: false,
    shake: 0, targetShake: 0,
  });
  const frameRef = useRef<HandFrame | null>(null);
  frameRef.current = frame;
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = stateRef.current;
    let lastTime = performance.now();

    function draw(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      const hand = frameRef.current?.hands[0];
      if (hand) {
        if (hand.gesture === "open_hand") {
          // Pan: palm center (middle-finger MCP, lm9) drives translation
          // X is flipped to match the mirrored canvas feed
          const palm = hand.landmarks[9];
          if (palm) {
            state.targetPanX = (0.5 - palm.x) * W * 0.9;
            state.targetPanY = (palm.y - 0.5) * H * 0.9;
          }
          // Proximity zoom: apparent hand size → scale
          // Range 0.08 (far) … 0.32 (close) mapped to 0.4 … 2.2
          const sz = apparentHandSize(hand.landmarks);
          state.targetScale = 0.4 + Math.max(0, Math.min(1, (sz - 0.08) / 0.24)) * 1.8;
          state.spinFast = false;
          // Leave targetRotX/Y untouched — rotation holds wherever it was
          state.targetShake = 0;
        } else if (hand.gesture === "two_fingers") {
          // Pan: midpoint of index tip (8) and middle tip (12)
          // x is flipped to match the mirrored canvas
          const i8  = hand.landmarks[8];
          const i12 = hand.landmarks[12];
          if (i8 && i12) {
            const midX = (i8.x + i12.x) / 2;
            const midY = (i8.y + i12.y) / 2;
            state.targetPanX = (0.5 - midX) * W * 0.85;
            state.targetPanY = (midY - 0.5) * H * 0.85;
          }
          state.spinFast = false;
          state.targetScale = 1;
          state.targetShake = 0;
        } else if (hand.gesture === "point") {
          state.spinFast = true;
          state.targetScale = 1;
          state.targetPanX = 0;
          state.targetPanY = 0;
          state.targetShake = 0;
        } else if (hand.gesture === "pinch") {
          state.spinFast = false;
          state.targetScale = 1.4;
          state.targetPanX = 0;
          state.targetPanY = 0;
          state.targetShake = 0;
        } else if (hand.gesture === "fist") {
          // Squish + fast spin + shake
          state.spinFast = true;
          state.targetScale = 0.45;
          state.targetPanX = 0;
          state.targetPanY = 0;
          state.targetShake = 10;
        } else if (hand.gesture === "thumbs_up") {
          state.spinFast = false;
          state.targetScale = 1.6;
          state.targetRotX += dt * 1.5;
          state.targetPanX = 0;
          state.targetPanY = 0;
          state.targetShake = 0;
        } else {
          state.spinFast = false;
          state.targetScale = 1;
          state.targetPanX = 0;
          state.targetPanY = 0;
          state.targetShake = 0;
        }
      } else {
        state.spinFast = false;
        state.targetRotY += dt * 0.5;
        state.targetRotX += dt * 0.2;
        state.targetScale = 1;
        state.targetPanX = 0;
        state.targetPanY = 0;
        state.targetShake = 0;
      }

      const ease = 1 - Math.exp(-8 * dt);

      if (state.spinFast) {
        state.rotX += dt * 4;
        state.rotY += dt * 4;
      } else {
        state.rotX += (state.targetRotX - state.rotX) * ease;
        state.rotY += (state.targetRotY - state.rotY) * ease;
      }
      state.scale += (state.targetScale - state.scale) * ease;
      state.panX  += (state.targetPanX  - state.panX)  * ease;
      state.panY  += (state.targetPanY  - state.panY)  * ease;
      state.shake += (state.targetShake - state.shake)  * (1 - Math.exp(-12 * dt));

      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
      }

      ctx.clearRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = "rgba(98,91,246,0.06)";
      ctx.lineWidth = 1;
      const gs = 36;
      for (let x = 0; x <= W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Centre offset by pan + per-frame shake jitter
      const jx = state.shake > 0.5 ? (Math.random() - 0.5) * state.shake * 2 : 0;
      const jy = state.shake > 0.5 ? (Math.random() - 0.5) * state.shake * 2 : 0;
      const cx = W / 2 + state.panX + jx;
      const cy = H / 2 + state.panY + jy;

      const r = Math.min(W, H) * 0.26 * state.scale;
      const camDist = r * 5;
      const fov = r * 3.5;

      // Transform verts
      const tv = VERTS.map((v) => {
        let p = { x: v.x * r, y: v.y * r, z: v.z * r };
        p = rotateX(p, state.rotX);
        p = rotateY(p, state.rotY);
        return p;
      });

      // Sort faces back-to-front
      const sorted = FACES.map((f) => {
        const depth = f.idx.reduce((s, i) => s + tv[i].z, 0) / 4;
        return { ...f, depth };
      }).sort((a, b) => a.depth - b.depth);

      sorted.forEach(({ idx, depth, rgb }) => {
        const pts = idx.map((i) => project(tv[i], cx, cy, fov, camDist));

        const light = Math.max(0, Math.min(1, (depth / r + 1) / 2));

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();

        const [r0, g0, b0] = rgb;
        const alpha = 0.22 + light * 0.55;
        ctx.fillStyle = `rgba(${r0}, ${g0}, ${b0}, ${alpha})`;
        ctx.fill();

        const edgeAlpha = 0.35 + light * 0.45;
        ctx.strokeStyle = `rgba(${Math.round(r0 * 0.4 + 98 * 0.6)}, ${Math.round(g0 * 0.2 + 91 * 0.8)}, ${Math.round(b0 * 0.3 + 246 * 0.7)}, ${edgeAlpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Soft shadow (follows pan)
      const shadowY = cy + r * 0.85;
      const sg = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, r * 0.9);
      sg.addColorStop(0, "rgba(0,0,0,0.12)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, r * 0.9, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = sg;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border-2 border-border bg-[#FAFAF8] relative">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="font-bold text-xs tracking-widest uppercase bg-white/80 px-2 py-1 rounded border border-border/20 text-foreground backdrop-blur-sm">
          Viewport
        </span>
      </div>
    </div>
  );
}
