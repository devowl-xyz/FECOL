import { useRef, useEffect } from "react";
import { HandFrame } from "@/lib/hand-api";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
}

function project(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  fov: number
): [number, number, number] {
  const depth = z + 4;
  const scale = fov / depth;
  return [cx + x * scale, cy - y * scale, scale];
}

const ICOSA_VERTS: Vec3[] = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const len = Math.sqrt(1 + phi * phi);
  return raw.map(([x, y, z]) => ({ x: x / len, y: y / len, z: z / len }));
})();

const ICOSA_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

export function Scene3D({ frame }: { frame: HandFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    rotX: 0.3,
    rotY: 0.4,
    scale: 1,
    targetRotX: 0.3,
    targetRotY: 0.4,
    targetScale: 1,
    spinFast: false,
    particles: [] as Particle[],
    hue: 245,
    targetHue: 245,
  });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = stateRef.current;
    let lastTime = performance.now();

    function rotateX(v: Vec3, a: number): Vec3 {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
    }
    function rotateY(v: Vec3, a: number): Vec3 {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
    }

    function draw(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const hand = frame?.hands[0];
      if (hand) {
        if (hand.gesture === "open_hand") {
          const idx = hand.landmarks[8];
          if (idx) {
            state.targetRotX = (idx.y - 0.5) * Math.PI * 2;
            state.targetRotY = (idx.x - 0.5) * Math.PI * 2;
          }
          state.spinFast = false;
          state.targetScale = 1;
          state.targetHue = 245;
        } else if (hand.gesture === "point") {
          state.spinFast = true;
          state.targetScale = 1;
          state.targetHue = 320;
        } else if (hand.gesture === "pinch") {
          state.spinFast = false;
          state.targetScale = 1.5;
          state.targetHue = 280;
        } else if (hand.gesture === "fist") {
          state.spinFast = false;
          state.targetScale = 0.5;
          state.targetHue = 245;
        } else {
          state.spinFast = false;
          state.targetScale = 1;
          state.targetHue = 245;
        }
      } else {
        state.spinFast = false;
        state.targetRotY += dt * 0.3;
        state.targetRotX += dt * 0.15;
        state.targetScale = 1;
        state.targetHue = 245;
      }

      if (state.spinFast) {
        state.rotX += dt * 5;
        state.rotY += dt * 5;
      } else {
        state.rotX += (state.targetRotX - state.rotX) * (1 - Math.exp(-8 * dt));
        state.rotY += (state.targetRotY - state.rotY) * (1 - Math.exp(-8 * dt));
      }
      state.scale += (state.targetScale - state.scale) * (1 - Math.exp(-8 * dt));
      state.hue += (state.targetHue - state.hue) * (1 - Math.exp(-6 * dt));

      // Resize to display
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      ctx.clearRect(0, 0, W, H);

      // Grid background
      ctx.strokeStyle = "rgba(98,91,246,0.07)";
      ctx.lineWidth = 1;
      const gridStep = 40;
      for (let gx = 0; gx <= W; gx += gridStep) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy <= H; gy += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      const cx = W / 2;
      const cy = H / 2;
      const fov = Math.min(W, H) * 0.6;
      const baseR = Math.min(W, H) * 0.42 * state.scale;

      // Transform verts
      const transformed = ICOSA_VERTS.map((v) => {
        let r = { x: v.x * baseR, y: v.y * baseR, z: v.z * baseR };
        r = rotateX(r, state.rotX);
        r = rotateY(r, state.rotY);
        return r;
      });

      // Sort faces by depth (painter's algo)
      const faceDepths = ICOSA_FACES.map((face) => {
        const depth = (transformed[face[0]].z + transformed[face[1]].z + transformed[face[2]].z) / 3;
        return { face, depth };
      }).sort((a, b) => a.depth - b.depth);

      const color1 = `hsl(${state.hue}, 80%, 55%)`;
      const color2 = `hsl(${(state.hue + 30) % 360}, 85%, 65%)`;

      faceDepths.forEach(({ face, depth }) => {
        const [a, b, c] = face;
        const [ax, ay] = project(transformed[a].x, transformed[a].y, transformed[a].z, cx, cy, fov);
        const [bx, by] = project(transformed[b].x, transformed[b].y, transformed[b].z, cx, cy, fov);
        const [ccx, ccy] = project(transformed[c].x, transformed[c].y, transformed[c].z, cx, cy, fov);

        const light = (depth / baseR + 1) / 2;
        const alpha = 0.15 + light * 0.35;

        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(ccx, ccy);
        ctx.closePath();

        const grad = ctx.createLinearGradient(ax, ay, ccx, ccy);
        grad.addColorStop(0, color1.replace(")", `, ${alpha})`).replace("hsl", "hsla"));
        grad.addColorStop(1, color2.replace(")", `, ${alpha * 0.6})`).replace("hsl", "hsla"));
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = `hsla(${state.hue}, 85%, 70%, ${0.4 + light * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Contact shadow
      const shadowY = cy + Math.min(W, H) * 0.3;
      const shadowGrad = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, baseR * 0.8);
      shadowGrad.addColorStop(0, "rgba(0,0,0,0.15)");
      shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.ellipse(cx, shadowY, baseR * 0.8, baseR * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = shadowGrad;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [frame]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border-2 border-border shadow-md bg-[#FAFAF8] relative">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute top-4 left-4 pointer-events-none">
        <h3 className="font-bold text-lg tracking-tight uppercase bg-white/80 px-2 py-1 rounded backdrop-blur-sm shadow-sm border border-border/10 text-foreground">
          Viewport
        </h3>
      </div>
    </div>
  );
}
