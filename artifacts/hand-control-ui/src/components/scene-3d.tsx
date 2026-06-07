import { useRef, useEffect, useState, useCallback } from "react";
import { HandFrame } from "@/lib/hand-api";
import { Mesh, Vertex, makeCube, makeIcosphere, makeNgon, parseOBJ, cloneMesh } from "@/lib/mesh";

// ── 3-D math ──────────────────────────────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number; }

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x, y: v.y*c - v.z*s, z: v.y*s + v.z*c };
}
function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x*c + v.z*s, y: v.y, z: -v.x*s + v.z*c };
}
function project(v: Vec3, cx: number, cy: number, fov: number, cd: number): [number,number] {
  const d = v.z + cd;
  const s = fov / d;
  return [cx + v.x*s, cy - v.y*s];
}

function apparentHandSize(lms: Vertex[]): number {
  const w = lms[0], m = lms[9];
  if (!w || !m) return 0.16;
  return Math.sqrt((w.x-m.x)**2 + (w.y-m.y)**2);
}

// ── Edit-mode mesh operations ─────────────────────────────────────────────────

function sculptMesh(
  mesh: Mesh,
  fingerScreenX: number, fingerScreenY: number,
  pushStrength: number,
  cx: number, cy: number, fov: number, camDist: number,
  rX: number, rY: number, r: number,
) {
  const BRUSH = r * 0.55;
  for (const v of mesh.verts) {
    let p: Vec3 = { x: v.x*r, y: v.y*r, z: v.z*r };
    p = rotateX(p, rX);
    p = rotateY(p, rY);
    const [px, py] = project(p, cx, cy, fov, camDist);
    const dist = Math.sqrt((px - fingerScreenX)**2 + (py - fingerScreenY)**2);
    const influence = Math.max(0, 1 - dist / BRUSH);
    if (influence < 0.02) continue;
    const len = Math.sqrt(v.x**2 + v.y**2 + v.z**2) || 1;
    v.x += (v.x / len) * pushStrength * influence;
    v.y += (v.y / len) * pushStrength * influence;
    v.z += (v.z / len) * pushStrength * influence;
  }
}

function flattenMesh(mesh: Mesh, strength: number) {
  const meanY = mesh.verts.reduce((s, v) => s + v.y, 0) / mesh.verts.length;
  for (const v of mesh.verts) v.y += (meanY - v.y) * strength;
}

// ── Main component ────────────────────────────────────────────────────────────

type MeshType = "cube" | "icosphere" | "ngon" | "custom";

function freshMesh(type: MeshType, custom: Mesh | null): Mesh {
  switch (type) {
    case "icosphere": return makeIcosphere(1);
    case "ngon":      return makeNgon(6);
    case "custom":    return custom ? cloneMesh(custom) : makeCube();
    default:          return makeCube();
  }
}

export function Scene3D({ frame }: { frame: HandFrame | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [meshType, setMeshType]   = useState<MeshType>("cube");
  const [customMesh, setCustomMesh] = useState<Mesh | null>(null);

  const meshRef  = useRef<Mesh>(makeCube());
  const frameRef = useRef<HandFrame | null>(null);
  frameRef.current = frame;

  const stateRef = useRef({
    rotX: 0.4, rotY: 0.6,
    targetRotX: 0.4, targetRotY: 0.6,
    scale: 1, targetScale: 1,
    panX: 0, panY: 0,
    targetPanX: 0, targetPanY: 0,
    spinFast: false,
    shake: 0, targetShake: 0,
    // physics
    velX: 0, velY: 0,
    thrown: false,
    gravityOn: false,
    gravityPulse: 0,
    // edit mode
    editMode: false,
    editTool: "",
  });

  const prevPalmsRef    = useRef<{ lx:number; ly:number; rx:number; ry:number }|null>(null);
  const prevPalmTimeRef = useRef(0);
  const throwCooldown   = useRef(0);
  const editPrevRef     = useRef<{ x:number; y:number }|null>(null);
  const rafRef          = useRef(0);

  // Reset mesh when type or custom source changes
  useEffect(() => {
    meshRef.current = freshMesh(meshType, customMesh);
    const s = stateRef.current;
    s.thrown = false; s.velX = 0; s.velY = 0;
    s.panX = 0; s.panY = 0; s.targetPanX = 0; s.targetPanY = 0;
  }, [meshType, customMesh]);

  const handleOBJImport = useCallback((text: string) => {
    const m = parseOBJ(text);
    if (m) { setCustomMesh(m); setMeshType("custom"); }
    else alert("Could not parse OBJ — ensure the file has valid v and f entries.");
  }, []);

  // ── Canvas render loop ────────────────────────────────────────────────────

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

      // ── Two-hand / edit-mode detection ──────────────────────────────────
      const hands = frameRef.current?.hands ?? [];

      const anchorHand = hands.find(h => h.gesture === "pinch");
      const toolHand   = anchorHand != null ? hands.find(h => h !== anchorHand) : null;
      const inEditMode = anchorHand != null && toolHand != null;

      throwCooldown.current = Math.max(0, throwCooldown.current - dt);

      if (inEditMode) {
        state.editMode = true;
        state.thrown = false; state.velX = 0; state.velY = 0;
        state.targetShake = 0;
        // Gravity never auto-on in edit mode
        const prevG = state.gravityOn;
        state.gravityOn = false;
        if (prevG) state.gravityPulse = 1.6;

        const tool = toolHand!.gesture;
        const lms  = toolHand!.landmarks;
        state.editTool = tool;

        // Compute draw params for sculpt projection
        const r       = Math.min(W, H) * 0.26 * state.scale;
        const camDist = r * 5;
        const fov     = r * 3.5;
        const cx      = W / 2 + state.panX;
        const cy      = H / 2 + state.panY;

        if (tool === "open_hand") {
          // a. Rotate
          const palm = lms[9], idx = lms[8];
          if (palm && idx) {
            state.targetRotY = -(idx.x - palm.x) * Math.PI * 7;
            state.targetRotX =  (idx.y - palm.y) * Math.PI * 7;
          }
          editPrevRef.current = null;
        } else if (tool === "point") {
          // b. Sculpt — inflate/deflate vertices near index fingertip
          const tip = lms[8];
          if (tip && editPrevRef.current) {
            const dy = tip.y - editPrevRef.current.y;
            if (Math.abs(dy) > 0.002) {
              // Hand moving UP (dy < 0) → inflate; DOWN → deflate
              const push = -(dy) * 0.45;
              sculptMesh(
                meshRef.current,
                (1 - tip.x) * W, tip.y * H, push,
                cx, cy, fov, camDist, state.rotX, state.rotY, r,
              );
            }
          }
          editPrevRef.current = lms[8] ? { x: lms[8].x, y: lms[8].y } : null;
        } else if (tool === "two_fingers") {
          // c. Scale by pivot point (palm drives scale)
          const palm = lms[9];
          if (palm && editPrevRef.current) {
            const dy = palm.y - editPrevRef.current.y;
            state.targetScale = Math.max(0.25, Math.min(3.5, state.targetScale * (1 + (-dy) * 3)));
          }
          editPrevRef.current = lms[9] ? { x: lms[9].x, y: lms[9].y } : null;
        } else if (tool === "three_fingers") {
          // d. Flatten toward median Y
          flattenMesh(meshRef.current, 0.04);
          editPrevRef.current = null;
        } else {
          editPrevRef.current = null;
        }
      } else {
        state.editMode = false;
        state.editTool = "";
        editPrevRef.current = null;

        // ── Two-hand physics ───────────────────────────────────────────
        const leftHand  = hands.find(h => h.handedness === "Left");
        const rightHand = hands.find(h => h.handedness === "Right");
        const bothOpen  = leftHand?.gesture === "open_hand" && rightHand?.gesture === "open_hand";

        const prevG = state.gravityOn;
        state.gravityOn = bothOpen;
        if (state.gravityOn !== prevG) state.gravityPulse = 1.6;

        let palmVelX = 0, palmVelY = 0;

        if (bothOpen && leftHand && rightHand) {
          const lp = leftHand.landmarks[9];
          const rp = rightHand.landmarks[9];
          if (lp && rp) {
            const elapsed = (now - prevPalmTimeRef.current) / 1000;
            if (prevPalmsRef.current && elapsed > 0.01 && elapsed < 0.25) {
              const prev = prevPalmsRef.current;
              palmVelX = ((-(lp.x - prev.lx) + -(rp.x - prev.rx)) / 2) / elapsed;
              palmVelY = (( (lp.y - prev.ly) +  (rp.y - prev.ry)) / 2) / elapsed;
            }
            prevPalmsRef.current = { lx: lp.x, ly: lp.y, rx: rp.x, ry: rp.y };
            prevPalmTimeRef.current = now;
          }
          const speed = Math.sqrt(palmVelX**2 + palmVelY**2);
          if (speed > 1.8 && throwCooldown.current <= 0) {
            state.velX =  palmVelX * W * 0.55;
            state.velY = -palmVelY * H * 0.55;
            state.thrown = true;
            throwCooldown.current = 0.9;
          }
        } else {
          prevPalmsRef.current = null;
          if (state.thrown && hands[0]?.gesture === "fist") {
            state.thrown = false; state.velX = 0; state.velY = 0;
            state.targetPanX = 0; state.targetPanY = 0;
          }
        }

        // Physics
        if (state.thrown) {
          if (state.gravityOn) state.velY += 380 * dt;
          state.velX *= Math.exp(-(state.gravityOn ? 0.5 : 1.4) * dt);
          state.velY *= Math.exp(-(state.gravityOn ? 0.3 : 1.4) * dt);
          state.targetPanX = state.panX + state.velX * dt;
          state.targetPanY = state.panY + state.velY * dt;
          const r_est = Math.min(W, H) * 0.26 * state.scale;
          const mX = W/2 - r_est, mY = H/2 - r_est;
          if (Math.abs(state.targetPanX) > mX) { state.targetPanX = Math.sign(state.targetPanX)*mX; state.velX *= -0.62; }
          if (Math.abs(state.targetPanY) > mY) { state.targetPanY = Math.sign(state.targetPanY)*mY; state.velY *= -0.55; state.velX *= 0.84; }
          state.targetRotY += (state.velX / (W*0.5)) * dt * 5;
          state.targetRotX += (state.velY / (H*0.5)) * dt * 5;
          if (!state.gravityOn && Math.abs(state.velX) < 8 && Math.abs(state.velY) < 8)
            { state.thrown = false; state.velX = 0; state.velY = 0; }
        }

        // ── Single-hand gesture controls ───────────────────────────────
        if (!state.thrown && !bothOpen) {
          const hand = frameRef.current?.hands[0];
          if (hand) {
            if (hand.gesture === "open_hand") {
              const palm = hand.landmarks[9], idx = hand.landmarks[8];
              if (palm) { state.targetPanX = (0.5-palm.x)*W*0.9; state.targetPanY = (palm.y-0.5)*H*0.9; }
              if (palm && idx) { state.targetRotY = -(idx.x-palm.x)*Math.PI*7; state.targetRotX = (idx.y-palm.y)*Math.PI*7; }
              const sz = apparentHandSize(hand.landmarks);
              state.targetScale = 0.4 + Math.max(0, Math.min(1, (sz-0.08)/0.24)) * 1.8;
              state.spinFast = false; state.targetShake = 0;
            } else if (hand.gesture === "two_fingers") {
              const i8 = hand.landmarks[8], i12 = hand.landmarks[12];
              if (i8 && i12) {
                state.targetPanX = (0.5-(i8.x+i12.x)/2)*W*0.85;
                state.targetPanY = (((i8.y+i12.y)/2)-0.5)*H*0.85;
              }
              state.spinFast = false; state.targetScale = 1; state.targetShake = 0;
            } else if (hand.gesture === "point") {
              state.spinFast = true; state.targetScale = 1; state.targetPanX = 0; state.targetPanY = 0; state.targetShake = 0;
            } else if (hand.gesture === "pinch") {
              state.spinFast = false; state.targetScale = 1.4; state.targetPanX = 0; state.targetPanY = 0; state.targetShake = 0;
            } else if (hand.gesture === "fist") {
              state.spinFast = true; state.targetScale = 0.45; state.targetPanX = 0; state.targetPanY = 0; state.targetShake = 10;
            } else if (hand.gesture === "thumbs_up") {
              state.spinFast = false; state.targetScale = 1.6; state.targetRotX += dt*1.5; state.targetPanX = 0; state.targetPanY = 0; state.targetShake = 0;
            } else {
              state.spinFast = false; state.targetScale = 1; state.targetPanX = 0; state.targetPanY = 0; state.targetShake = 0;
            }
          } else {
            state.spinFast = false; state.targetRotY += dt*0.5; state.targetRotX += dt*0.2;
            state.targetScale = 1; state.targetPanX = 0; state.targetPanY = 0; state.targetShake = 0;
          }
        }
      }

      state.gravityPulse = Math.max(0, state.gravityPulse - dt*3);

      // ── Easing ──────────────────────────────────────────────────────────
      const ease    = 1 - Math.exp(-8*dt);
      const posEase = state.thrown ? 1 : ease;

      if (state.spinFast) { state.rotX += dt*4; state.rotY += dt*4; }
      else { state.rotX += (state.targetRotX - state.rotX)*ease; state.rotY += (state.targetRotY - state.rotY)*ease; }

      state.scale  += (state.targetScale - state.scale)*ease;
      state.panX   += (state.targetPanX  - state.panX)*posEase;
      state.panY   += (state.targetPanY  - state.panY)*posEase;
      state.shake  += (state.targetShake - state.shake)*(1 - Math.exp(-12*dt));

      // ── Resize ──────────────────────────────────────────────────────────
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

      ctx.clearRect(0, 0, W, H);

      // Edit mode tint
      if (state.editMode) {
        ctx.fillStyle = "rgba(139,92,246,0.04)";
        ctx.fillRect(0, 0, W, H);
      }

      // Gravity pulse flash
      if (state.gravityPulse > 0) {
        const a = state.gravityPulse * 0.11;
        ctx.fillStyle = state.gravityOn ? `rgba(139,92,246,${a})` : `rgba(255,200,0,${a})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Subtle grid — single batched path (not one ctx.stroke() per line)
      ctx.strokeStyle = state.editMode ? "rgba(139,92,246,0.10)" : "rgba(98,91,246,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gs = 36;
      for (let x = 0; x <= W; x += gs) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
      for (let y = 0; y <= H; y += gs) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
      ctx.stroke();

      // Centre
      const jx = state.shake > 0.5 ? (Math.random()-0.5)*state.shake*2 : 0;
      const jy = state.shake > 0.5 ? (Math.random()-0.5)*state.shake*2 : 0;
      const cx = W/2 + state.panX + jx;
      const cy = H/2 + state.panY + jy;

      const r       = Math.min(W, H) * 0.26 * state.scale;
      const camDist = r * 5;
      const fov     = r * 3.5;

      // Transform + project all vertices upfront
      // (vertices are shared across many faces — compute once, reuse everywhere)
      const mesh = meshRef.current;
      const fc = mesh.faces.length;
      const denseMesh = fc > 80;
      const nv = mesh.verts.length;

      const tv: Vec3[] = new Array(nv);
      const pvx = new Float32Array(nv);
      const pvy = new Float32Array(nv);
      const cosRX = Math.cos(state.rotX), sinRX = Math.sin(state.rotX);
      const cosRY = Math.cos(state.rotY), sinRY = Math.sin(state.rotY);
      for (let vi = 0; vi < nv; vi++) {
        const v = mesh.verts[vi];
        // rotateX
        const rx = v.x*r, ry0 = v.y*r, rz0 = v.z*r;
        const ry = ry0*cosRX - rz0*sinRX, rz = ry0*sinRX + rz0*cosRX;
        // rotateY
        const fx = rx*cosRY + rz*sinRY, fy = ry, fz = -rx*sinRY + rz*cosRY;
        tv[vi] = { x: fx, y: fy, z: fz };
        const d = fz + camDist;
        const s = fov / d;
        pvx[vi] = cx + fx*s;
        pvy[vi] = cy - fy*s;
      }

      // Back-face culling + depth sort (index pairs, no object allocation)
      const faceOrder: [number, number][] = [];
      for (let fi = 0; fi < fc; fi++) {
        const idxs = mesh.faces[fi].indices;
        const a = tv[idxs[0]], bv = tv[idxs[1]], cv = tv[idxs[2]];
        if (a && bv && cv) {
          const e1x = bv.x - a.x, e1y = bv.y - a.y;
          const e2x = cv.x - a.x, e2y = cv.y - a.y;
          if (e1x * e2y - e1y * e2x <= 0) continue; // back-facing: skip
        }
        let depth = 0;
        for (let k = 0; k < idxs.length; k++) depth += tv[idxs[k]]?.z ?? 0;
        faceOrder.push([fi, depth / idxs.length]);
      }
      faceOrder.sort((a, b) => a[1] - b[1]);

      if (!denseMesh) {
        // Sparse mesh: per-face fill + stroke (best visual quality)
        for (let oi = 0; oi < faceOrder.length; oi++) {
          const fi = faceOrder[oi][0];
          const depth = faceOrder[oi][1];
          const { indices, color } = mesh.faces[fi];
          const [r0, g0, b0] = color;
          const light = Math.max(0, Math.min(1, (depth/r + 1) / 2));
          const alpha = 0.22 + light * 0.55;

          ctx.beginPath();
          ctx.moveTo(pvx[indices[0]], pvy[indices[0]]);
          for (let k = 1; k < indices.length; k++) ctx.lineTo(pvx[indices[k]], pvy[indices[k]]);
          ctx.closePath();

          ctx.fillStyle = state.editMode
            ? `rgba(${Math.round(r0*0.75+139*0.25)},${Math.round(g0*0.75+92*0.25)},${Math.round(b0*0.75+246*0.25)},${alpha})`
            : `rgba(${r0},${g0},${b0},${alpha})`;
          ctx.fill();

          const edgeA = 0.35 + light * 0.45 + (state.editMode ? 0.08 : 0);
          ctx.strokeStyle = `rgba(${Math.round(r0*0.4+98*0.6)},${Math.round(g0*0.2+91*0.8)},${Math.round(b0*0.3+246*0.7)},${edgeA})`;
          ctx.lineWidth = state.editMode ? 1.5 : 2;
          ctx.stroke();
        }
      } else {
        // Dense mesh: depth-bucket batching
        // Groups faces into 16 depth slabs → one fill() per slab instead of per face
        // Reduces the costliest canvas operation by ~10x
        let minD = Infinity, maxD = -Infinity;
        for (let oi = 0; oi < faceOrder.length; oi++) {
          const d = faceOrder[oi][1];
          if (d < minD) minD = d;
          if (d > maxD) maxD = d;
        }
        const dRange = maxD - minD || 1;
        const NUM_BUCKETS = 16;
        const bucketOi: number[][] = Array.from({ length: NUM_BUCKETS }, () => []);
        for (let oi = 0; oi < faceOrder.length; oi++) {
          const b = Math.min(NUM_BUCKETS - 1, Math.floor((faceOrder[oi][1] - minD) / dRange * NUM_BUCKETS));
          bucketOi[b].push(oi);
        }

        for (let b = 0; b < NUM_BUCKETS; b++) {
          const group = bucketOi[b];
          if (group.length === 0) continue;

          let sumD = 0, sumR = 0, sumG = 0, sumB = 0;
          ctx.beginPath();
          for (const oi of group) {
            const [fi, depth] = faceOrder[oi];
            sumD += depth;
            const { indices, color } = mesh.faces[fi];
            sumR += color[0]; sumG += color[1]; sumB += color[2];
            ctx.moveTo(pvx[indices[0]], pvy[indices[0]]);
            for (let k = 1; k < indices.length; k++) ctx.lineTo(pvx[indices[k]], pvy[indices[k]]);
            ctx.closePath();
          }
          const n = group.length;
          const light = Math.max(0, Math.min(1, (sumD / n / r + 1) / 2));
          const alpha = 0.22 + light * 0.55;
          const cr = Math.round(sumR / n), cg = Math.round(sumG / n), cb = Math.round(sumB / n);
          ctx.fillStyle = state.editMode
            ? `rgba(${Math.round(cr*0.75+139*0.25)},${Math.round(cg*0.75+92*0.25)},${Math.round(cb*0.75+246*0.25)},${alpha})`
            : `rgba(${cr},${cg},${cb},${alpha})`;
          ctx.fill();
        }
      }

      // Soft shadow
      const airFactor = state.thrown ? Math.max(0, 1 - Math.abs(state.panY)/(H*0.4)) : 1;
      if (airFactor > 0) {
        const shadowY = H/2 + (state.thrown ? H*0.42 : state.panY + r*0.85);
        const sg = ctx.createRadialGradient(cx, shadowY, 0, cx, shadowY, r*0.9);
        sg.addColorStop(0, `rgba(0,0,0,${0.12*airFactor})`);
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.ellipse(cx, shadowY, r*0.9, r*0.18, 0, 0, Math.PI*2);
        ctx.fillStyle = sg;
        ctx.fill();
      }

      // Draw sculpt brush cursor when sculpting
      if (state.editMode && frameRef.current?.hands) {
        const toolH = frameRef.current.hands.find(h => h.gesture !== "pinch");
        if (toolH?.gesture === "point") {
          const tip = toolH.landmarks[8];
          if (tip) {
            const bx = (1 - tip.x) * W;
            const by = tip.y * H;
            ctx.beginPath();
            ctx.arc(bx, by, r*0.55, 0, Math.PI*2);
            ctx.strokeStyle = "rgba(139,92,246,0.5)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border-2 border-border bg-[#FAFAF8] relative">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Viewport label */}
      <div className="absolute top-3 left-3 pointer-events-none z-10">
        <span className="font-bold text-xs tracking-widest uppercase bg-white/80 px-2 py-1 rounded border border-border/20 text-foreground backdrop-blur-sm">
          Viewport
        </span>
      </div>

      {/* Toolbar — pushed below the label row */}
      <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
        <MeshToolbar meshType={meshType} onMeshChange={setMeshType} onOBJImport={handleOBJImport} />
      </div>

      {/* HUD */}
      <SceneHUD stateRef={stateRef} />

      {/* Edit hint */}
      <div className="absolute bottom-3 left-3 pointer-events-none z-10">
        <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Pinch + Open Hand = Edit Mode
        </span>
      </div>
    </div>
  );
}

// ── Mesh toolbar ──────────────────────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  background: "linear-gradient(160deg,#ffffff 0%,#f5f4ef 100%)",
  border: "1.5px solid rgba(0,0,0,0.75)",
  boxShadow: "1px 1px 0 rgba(0,0,0,0.6)",
  padding: "3px 9px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  borderRadius: 3,
  color: "#000",
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "#FFE500",
  boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.8), 1px 1px 0 rgba(0,0,0,0.6)",
};

function MeshToolbar({
  meshType,
  onMeshChange,
  onOBJImport,
}: {
  meshType: MeshType;
  onMeshChange: (t: MeshType) => void;
  onOBJImport: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const t = ev.target?.result as string; if (t) onOBJImport(t); };
    reader.readAsText(file);
    e.target.value = "";
  };

  const shapes: { key: MeshType; label: string }[] = [
    { key: "cube",      label: "Cube"   },
    { key: "icosphere", label: "Sphere" },
    { key: "ngon",      label: "Prism"  },
  ];

  return (
    <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none z-10">
      <div
        className="flex items-center gap-1 pointer-events-auto px-2 py-1 rounded"
        style={{
          background: "rgba(255,255,255,0.92)",
          border: "1.5px solid rgba(0,0,0,0.7)",
          boxShadow: "2px 2px 0 rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
      >
        {shapes.map(({ key, label }) => (
          <button key={key} style={meshType === key ? btnActive : btnBase} onClick={() => onMeshChange(key)}>
            {label}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: "rgba(0,0,0,0.18)", margin: "0 2px" }} />
        <button style={btnBase} onClick={() => fileRef.current?.click()}>Import OBJ</button>
        <input ref={fileRef} type="file" accept=".obj" style={{ display: "none" }} onChange={handleFile} />
      </div>
    </div>
  );
}

// ── HUD ───────────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  open_hand:    "ROTATE",
  point:        "SCULPT",
  two_fingers:  "SCALE",
  three_fingers:"FLATTEN",
};

function SceneHUD({ stateRef }: { stateRef: React.RefObject<{ editMode: boolean; editTool: string; gravityOn: boolean; thrown: boolean }> }) {
  const [info, setInfo] = useState({ editMode: false, editTool: "", gravityOn: false, thrown: false });
  const raf = useRef(0);

  useEffect(() => {
    function tick() {
      const s = stateRef.current;
      setInfo({ editMode: s.editMode, editTool: s.editTool, gravityOn: s.gravityOn, thrown: s.thrown });
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [stateRef]);

  const badges: { label: string; bg: string; color: string }[] = [];
  if (info.editMode) {
    badges.push({ label: "EDIT MODE", bg: "rgba(139,92,246,0.92)", color: "#fff" });
    const tl = TOOL_LABELS[info.editTool];
    if (tl) badges.push({ label: tl, bg: "rgba(0,0,0,0.78)", color: "rgba(255,255,255,0.9)" });
  } else {
    if (info.thrown)    badges.push({ label: "IN FLIGHT",  bg: "rgba(255,229,0,0.92)",    color: "#000" });
    if (info.gravityOn) badges.push({ label: "GRAVITY ON", bg: "rgba(139,92,246,0.92)",   color: "#fff" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="absolute bottom-3 right-3 pointer-events-none flex flex-col items-end gap-1 z-10">
      {badges.map(b => (
        <span key={b.label}
          className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
          style={{ background: b.bg, border: "1px solid rgba(0,0,0,0.4)", boxShadow: "1px 1px 0 rgba(0,0,0,0.3)", color: b.color }}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
