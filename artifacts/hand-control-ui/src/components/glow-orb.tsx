import { useRef, useEffect } from "react";

export function GlowOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    let t = 0;

    function draw() {
      t += 0.012;
      ctx!.clearRect(0, 0, W, H);

      // Outer halo rings — slow pulse
      const pulse = 0.7 + 0.3 * Math.sin(t * 0.8);
      for (let i = 3; i >= 1; i--) {
        const radius = (28 + i * 14) * pulse;
        const alpha = (0.04 + 0.03 * Math.sin(t + i)) * (4 - i);
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(255, 229, 0, ${alpha * 1.5})`);
        g.addColorStop(0.5, `rgba(255, 229, 0, ${alpha * 0.5})`);
        g.addColorStop(1, "rgba(255, 229, 0, 0)");
        ctx!.beginPath();
        ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx!.fillStyle = g;
        ctx!.fill();
      }

      // Orbiting purple ring (tilted ellipse)
      const ringA = 32 * pulse;
      const ringB = 10 * pulse;
      const ringAngle = t * 0.6;
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(ringAngle);
      ctx!.beginPath();
      ctx!.ellipse(0, 0, ringA, ringB, 0, 0, Math.PI * 2);
      ctx!.strokeStyle = `rgba(98, 91, 246, ${0.35 + 0.15 * Math.sin(t)})`;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();
      ctx!.restore();

      // Second ring, counter-rotating, different tilt
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(-t * 0.4 + 1.2);
      ctx!.beginPath();
      ctx!.ellipse(0, 0, ringA * 0.75, ringB * 1.4, Math.PI / 4, 0, Math.PI * 2);
      ctx!.strokeStyle = `rgba(255, 229, 0, ${0.2 + 0.1 * Math.sin(t * 1.3)})`;
      ctx!.lineWidth = 1;
      ctx!.stroke();
      ctx!.restore();

      // Core sphere with bright centre
      const coreR = 14 * pulse;
      const core = ctx!.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, coreR);
      core.addColorStop(0, "rgba(255, 255, 220, 0.95)");
      core.addColorStop(0.3, "rgba(255, 229, 0, 0.9)");
      core.addColorStop(0.7, "rgba(255, 180, 0, 0.6)");
      core.addColorStop(1, "rgba(255, 140, 0, 0)");
      ctx!.beginPath();
      ctx!.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx!.fillStyle = core;
      ctx!.fill();

      // Specular highlight dot
      ctx!.beginPath();
      ctx!.arc(cx - 4, cy - 4, 3.5, 0, Math.PI * 2);
      ctx!.fillStyle = "rgba(255,255,255,0.7)";
      ctx!.fill();

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={120}
      className="mx-auto opacity-90"
    />
  );
}
