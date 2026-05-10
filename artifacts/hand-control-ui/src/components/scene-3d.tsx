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

// Each face: vertex indices + outward normal direction
const FACES: { idx: [number,number,number,number]; nx: number; ny: number; nz: number }[] = [
  { idx: [4,5,6,7], nx:  0, ny:  0, nz:  1 }, // front
  { idx: [1,0,3,2], nx:  0, ny:  0, nz: -1 }, // back
  { idx: [0,4,7,3], nx: -1, ny:  0, nz:  0 }, // left
  { idx: [5,1,2,6], nx:  1, ny:  0, nz:  0 }, // right
  { idx: [7,6,2,3], nx:  0, ny:  1, nz:  0 }, // top
  { idx: [0,1,5,4], nx:  0, ny: -1, nz:  0 }, // bottom
];

export function Scene3D({ frame }: { frame: HandFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    rotX: 0.4, rotY: 0.6,
    targetRotX: 0.4, targetRotY: 0.6,
    scale: 1, targetScale: 1,
    spinFast: false,
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

      const hand = frameRef.current?.hands[0];
      if (hand) {
        if (hand.gesture === "open_hand") {
          const idx = hand.landmarks[8];
          if (idx) {
            state.targetRotX = (idx.y - 0.5) * Math.PI * 2;
            state.targetRotY = (idx.x - 0.5) * Math.PI * 2;
          }
          state.spinFast = false;
          state.targetScale = 1;
        } else if (hand.gesture === "point") {
          state.spinFast = true;
          state.targetScale = 1;
        } else if (hand.gesture === "pinch") {
          state.spinFast = false;
          state.targetScale = 1.4;
        } else if (hand.gesture === "fist") {
          state.spinFast = false;
          state.targetScale = 0.5;
        } else {
          state.spinFast = false;
          state.targetScale = 1;
        }
      } else {
        state.spinFast = false;
        state.targetRotY += dt * 0.5;
        state.targetRotX += dt * 0.2;
        state.targetScale = 1;
      }

      if (state.spinFast) {
        state.rotX += dt * 4;
        state.rotY += dt * 4;
      } else {
        state.rotX += (state.targetRotX - state.rotX) * (1 - Math.exp(-8 * dt));
        state.rotY += (state.targetRotY - state.rotY) * (1 - Math.exp(-8 * dt));
      }
      state.scale += (state.targetScale - state.scale) * (1 - Math.exp(-8 * dt));

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
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

      const cx = W / 2;
      const cy = H / 2;
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

      sorted.forEach(({ idx, depth }) => {
        const pts = idx.map((i) => project(tv[i], cx, cy, fov, camDist));

        // Light: brightest face closest to viewer
        const light = Math.max(0, Math.min(1, (depth / r + 1) / 2));

        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
        ctx.closePath();

        // Yellow face fill
        const alpha = 0.18 + light * 0.45;
        ctx.fillStyle = `rgba(255, 229, 0, ${alpha})`;
        ctx.fill();

        // Purple edge
        ctx.strokeStyle = `rgba(98, 91, 246, ${0.3 + light * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Soft shadow
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
