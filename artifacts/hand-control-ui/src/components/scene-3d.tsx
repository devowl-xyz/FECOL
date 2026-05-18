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

const VERTS: Vec3[] = [
  { x: -1, y: -1, z: -1 }, { x:  1, y: -1, z: -1 },
  { x:  1, y:  1, z: -1 }, { x: -1, y:  1, z: -1 },
  { x: -1, y: -1, z:  1 }, { x:  1, y: -1, z:  1 },
  { x:  1, y:  1, z:  1 }, { x: -1, y:  1, z:  1 },
];

const FACES: { idx: [number,number,number,number]; nx: number; ny: number; nz: number; rgb: [number,number,number] }[] = [
  { idx: [4,5,6,7], nx:  0, ny:  0, nz:  1, rgb: [255, 229,   0] },
  { idx: [1,0,3,2], nx:  0, ny:  0, nz: -1, rgb: [255, 160,   0] },
  { idx: [0,4,7,3], nx: -1, ny:  0, nz:  0, rgb: [255, 200,  30] },
  { idx: [5,1,2,6], nx:  1, ny:  0, nz:  0, rgb: [255, 240, 100] },
  { idx: [7,6,2,3], nx:  0, ny:  1, nz:  0, rgb: [255, 255, 160] },
  { idx: [0,1,5,4], nx:  0, ny: -1, nz:  0, rgb: [180, 140, 255] },
];

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
    // Two-hand physics
    velX: 0, velY: 0,
    thrown: false,
    gravityOn: false,
    gravityPulse: 0,
    twoHandMode: false,
  });
  const frameRef = useRef<HandFrame | null>(null);
  frameRef.current = frame;
  const rafRef = useRef<number>(0);

  // Velocity tracking for two-hand gestures
  const prevPalmsRef = useRef<{ lx: number; ly: number; rx: number; ry: number } | null>(null);
  const prevPalmTimeRef = useRef<number>(0);
  const throwCooldownRef = useRef<number>(0);
  const gravCooldownRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = stateRef.current;
    let lastTime = performance.now();

    function draw(now: number) {
      if (!canvas || !ctx) return;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      // ── Two-hand gesture detection ──────────────────────────────────────────
      const hands = frameRef.current?.hands ?? [];
      const leftHand  = hands.find(h => h.handedness === "Left");
      const rightHand = hands.find(h => h.handedness === "Right");
      const bothOpen  = leftHand?.gesture === "open_hand" && rightHand?.gesture === "open_hand";

      throwCooldownRef.current = Math.max(0, throwCooldownRef.current - dt);
      gravCooldownRef.current  = Math.max(0, gravCooldownRef.current  - dt);

      let palmVelX = 0, palmVelY = 0;

      if (bothOpen && leftHand && rightHand) {
        const lp = leftHand.landmarks[9];
        const rp = rightHand.landmarks[9];

        if (lp && rp) {
          const elapsed = (now - prevPalmTimeRef.current) / 1000;

          if (prevPalmsRef.current && elapsed > 0.01 && elapsed < 0.25) {
            const prev = prevPalmsRef.current;
            // Velocity in normalised coords/sec — flip X for mirror
            const lvx = -(lp.x - prev.lx) / elapsed;
            const lvy =  (lp.y - prev.ly) / elapsed;
            const rvx = -(rp.x - prev.rx) / elapsed;
            const rvy =  (rp.y - prev.ry) / elapsed;
            palmVelX = (lvx + rvx) / 2;
            palmVelY = (lvy + rvy) / 2;
          }

          prevPalmsRef.current = { lx: lp.x, ly: lp.y, rx: rp.x, ry: rp.y };
          prevPalmTimeRef.current = now;
        }

        state.twoHandMode = true;

        // Throw: fast swipe in any direction
        const speed = Math.sqrt(palmVelX ** 2 + palmVelY ** 2);
        if (speed > 1.8 && throwCooldownRef.current <= 0) {
          state.velX = palmVelX * W * 0.55;
          state.velY = palmVelY * H * 0.55;
          state.thrown = true;
          throwCooldownRef.current = 0.9;
        }

        // Gravity toggle: both hands push strongly downward (mostly vertical)
        if (
          palmVelY > 1.5 &&
          Math.abs(palmVelX) < palmVelY * 0.6 &&
          gravCooldownRef.current <= 0
        ) {
          state.gravityOn = !state.gravityOn;
          state.gravityPulse = 1.6;
          gravCooldownRef.current = 1.2;
        }
      } else {
        state.twoHandMode = false;
        prevPalmsRef.current = null;

        // Single-hand catch while cube is in flight
        const catchHand = hands[0];
        if (state.thrown && catchHand?.gesture === "fist") {
          state.thrown = false;
          state.velX = 0;
          state.velY = 0;
          state.targetPanX = 0;
          state.targetPanY = 0;
        }
      }

      // ── Physics update ──────────────────────────────────────────────────────
      if (state.thrown) {
        const r_est = Math.min(W, H) * 0.26 * state.scale;
        const margin = r_est;
        const maxX = W / 2 - margin;
        const maxY = H / 2 - margin;

        if (state.gravityOn) {
          state.velY += 380 * dt;
        }

        // Air resistance
        const fx = state.gravityOn ? 0.5 : 1.4;
        const fy = state.gravityOn ? 0.3 : 1.4;
        state.velX *= Math.exp(-fx * dt);
        state.velY *= Math.exp(-fy * dt);

        state.targetPanX = state.panX + state.velX * dt;
        state.targetPanY = state.panY + state.velY * dt;

        // Bounce
        if (Math.abs(state.targetPanX) > maxX) {
          state.targetPanX = Math.sign(state.targetPanX) * maxX;
          state.velX *= -0.62;
        }
        if (Math.abs(state.targetPanY) > maxY) {
          state.targetPanY = Math.sign(state.targetPanY) * maxY;
          state.velY *= -0.55;
          state.velX *= 0.84; // rolling friction on floor bounce
        }

        // Spin while airborne
        state.targetRotY += (state.velX / (W * 0.5)) * dt * 5;
        state.targetRotX += (state.velY / (H * 0.5)) * dt * 5;

        // Settle when still (gravity off only — with gravity on it stays on the floor)
        const stillX = Math.abs(state.velX) < 8;
        const stillY = Math.abs(state.velY) < 8;
        if (stillX && stillY && !state.gravityOn) {
          state.thrown = false;
          state.velX = 0;
          state.velY = 0;
        }
      }

      // ── Single-hand gesture controls (inactive while thrown or both open) ───
      if (!state.thrown && !bothOpen) {
        const hand = frameRef.current?.hands[0];
        if (hand) {
          if (hand.gesture === "open_hand") {
            const palm = hand.landmarks[9];
            const idx  = hand.landmarks[8];
            if (palm) {
              state.targetPanX = (0.5 - palm.x) * W * 0.9;
              state.targetPanY = (palm.y - 0.5) * H * 0.9;
            }
            if (palm && idx) {
              const relX = idx.x - palm.x;
              const relY = idx.y - palm.y;
              state.targetRotY = -relX * Math.PI * 7;
              state.targetRotX =  relY * Math.PI * 7;
            }
            const sz = apparentHandSize(hand.landmarks);
            state.targetScale = 0.4 + Math.max(0, Math.min(1, (sz - 0.08) / 0.24)) * 1.8;
            state.spinFast = false;
            state.targetShake = 0;
          } else if (hand.gesture === "two_fingers") {
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
      }

      // ── Easing ──────────────────────────────────────────────────────────────
      const ease = 1 - Math.exp(-8 * dt);

      // Physics mode uses a faster snap so physics feels responsive
      const posEase = state.thrown ? 1 : ease;

      if (state.spinFast) {
        state.rotX += dt * 4;
        state.rotY += dt * 4;
      } else {
        state.rotX += (state.targetRotX - state.rotX) * ease;
        state.rotY += (state.targetRotY - state.rotY) * ease;
      }
      state.scale += (state.targetScale - state.scale) * ease;
      state.panX  += (state.targetPanX  - state.panX)  * posEase;
      state.panY  += (state.targetPanY  - state.panY)  * posEase;
      state.shake += (state.targetShake - state.shake)  * (1 - Math.exp(-12 * dt));

      // Decay gravity pulse
      state.gravityPulse = Math.max(0, state.gravityPulse - dt * 3);

      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
      }

      ctx.clearRect(0, 0, W, H);

      // Gravity-pulse flash overlay
      if (state.gravityPulse > 0) {
        const alpha = state.gravityPulse * 0.12;
        ctx.fillStyle = state.gravityOn
          ? `rgba(139,92,246,${alpha})`
          : `rgba(255,200,0,${alpha})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Subtle grid
      ctx.strokeStyle = "rgba(98,91,246,0.06)";
      ctx.lineWidth = 1;
      const gs = 36;
      for (let x = 0; x <= W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      const jx = state.shake > 0.5 ? (Math.random() - 0.5) * state.shake * 2 : 0;
      const jy = state.shake > 0.5 ? (Math.random() - 0.5) * state.shake * 2 : 0;
      const cx = W / 2 + state.panX + jx;
      const cy = H / 2 + state.panY + jy;

      const r = Math.min(W, H) * 0.26 * state.scale;
      const camDist = r * 5;
      const fov = r * 3.5;

      const tv = VERTS.map((v) => {
        let p = { x: v.x * r, y: v.y * r, z: v.z * r };
        p = rotateX(p, state.rotX);
        p = rotateY(p, state.rotY);
        return p;
      });

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

      // Soft shadow (hides when cube is in the air)
      const airFactor = state.thrown ? Math.max(0, 1 - Math.abs(state.panY) / (H * 0.4)) : 1;
      if (airFactor > 0) {
        const shadowY = H / 2 + (state.thrown ? H * 0.42 : state.panY + r * 0.85);
        const sg = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, r * 0.9);
        sg.addColorStop(0, `rgba(0,0,0,${0.12 * airFactor})`);
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.ellipse(cx, shadowY, r * 0.9, r * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = sg;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border-2 border-border bg-[#FAFAF8] relative">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Static label */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="font-bold text-xs tracking-widest uppercase bg-white/80 px-2 py-1 rounded border border-border/20 text-foreground backdrop-blur-sm">
          Viewport
        </span>
      </div>

      {/* Two-hand mode HUD */}
      <TwoHandHUD frameRef={frameRef} stateRef={stateRef} />
    </div>
  );
}

// ── Two-hand HUD overlay (React state-driven, separate from canvas) ───────────

import { useState, useEffect as useEff, useRef as useR } from "react";

function TwoHandHUD({
  frameRef,
  stateRef,
}: {
  frameRef: React.RefObject<HandFrame | null>;
  stateRef: React.RefObject<{
    twoHandMode: boolean;
    gravityOn: boolean;
    thrown: boolean;
  }>;
}) {
  const [visible, setVisible] = useState(false);
  const [gravityOn, setGravityOn] = useState(false);
  const [thrown, setThrown] = useState(false);
  const rafRef = useR<number>(0);

  useEff(() => {
    function tick() {
      const s = stateRef.current;
      setVisible(s.twoHandMode);
      setGravityOn(s.gravityOn);
      setThrown(s.thrown);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stateRef]);

  if (!visible && !thrown) return null;

  return (
    <div className="absolute bottom-3 right-3 pointer-events-none flex flex-col items-end gap-1.5">
      {thrown && (
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{
            background: "rgba(255,229,0,0.9)",
            border: "1px solid rgba(0,0,0,0.5)",
            boxShadow: "1px 1px 0 rgba(0,0,0,0.4)",
            color: "#000",
          }}>
          IN FLIGHT
        </span>
      )}
      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
        style={{
          background: gravityOn ? "rgba(139,92,246,0.92)" : "rgba(255,255,255,0.88)",
          border: "1px solid rgba(0,0,0,0.5)",
          boxShadow: "1px 1px 0 rgba(0,0,0,0.4)",
          color: gravityOn ? "#fff" : "#555",
        }}>
        {gravityOn ? "GRAVITY ON" : "GRAVITY OFF"}
      </span>
      {visible && (
        <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{
            background: "rgba(0,0,0,0.78)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.9)",
          }}>
          TWO-HAND MODE
        </span>
      )}
    </div>
  );
}
