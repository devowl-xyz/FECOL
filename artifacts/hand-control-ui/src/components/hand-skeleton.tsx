import { useRef, useEffect, RefObject } from "react";
import { HandFrame, TrackerStatus } from "@/lib/hand-api";
import { ExternalLink } from "lucide-react";

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

interface Props {
  frame: HandFrame | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  status: TrackerStatus;
}

export function HandSkeleton({ frame, videoRef, status }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (status === "iframe" || status === "no-camera" || status === "error") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      rafRef.current = requestAnimationFrame(render);
      const video = videoRef.current;
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;
      if (canvas!.width !== W || canvas!.height !== H) {
        canvas!.width = W;
        canvas!.height = H;
      }
      ctx!.clearRect(0, 0, W, H);

      // Draw mirrored webcam feed
      if (video && video.readyState >= 2) {
        ctx!.save();
        ctx!.translate(W, 0);
        ctx!.scale(-1, 1);
        ctx!.drawImage(video, 0, 0, W, H);
        ctx!.restore();
      }

      if (!frame) return;

      frame.hands.forEach((hand) => {
        const color = hand.handedness === "Left" ? "#FF90E8" : "#625BF6";

        // Connections
        ctx!.lineWidth = 3;
        ctx!.strokeStyle = color;
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
          ctx!.beginPath();
          ctx!.arc((1 - lm.x) * W, lm.y * H, i === 8 ? 7 : 5, 0, Math.PI * 2);
          ctx!.fillStyle = i === 8 ? "#ffffff" : color;
          ctx!.fill();
          ctx!.strokeStyle = "rgba(0,0,0,0.6)";
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
        });

        // Gesture label near wrist
        const wrist = hand.landmarks[0];
        if (wrist) {
          const lx = (1 - wrist.x) * W;
          const ly = wrist.y * H + 28;
          const label = hand.gesture.replace(/_/g, " ").toUpperCase();
          ctx!.font = "bold 13px 'Montserrat', sans-serif";
          const tw = ctx!.measureText(label).width;
          ctx!.fillStyle = "rgba(0,0,0,0.75)";
          ctx!.beginPath();
          (ctx! as CanvasRenderingContext2D).roundRect(lx - 6, ly - 16, tw + 12, 22, 4);
          ctx!.fill();
          ctx!.fillStyle = color;
          ctx!.fillText(label, lx, ly);
        }
      });
    }

    render();
    return () => cancelAnimationFrame(rafRef.current);
  }, [frame, videoRef, status]);

  // Iframe — camera blocked by browser sandbox
  if (status === "iframe") {
    return (
      <div className="relative w-full h-full bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-border shadow-md flex items-center justify-center">
        <div className="text-center px-6 py-8 max-w-sm">
          <div className="text-4xl mb-4">📷</div>
          <p className="font-black text-white text-lg uppercase tracking-tight mb-2">
            Open in your browser
          </p>
          <p className="text-white/60 text-sm mb-6 font-medium leading-relaxed">
            Camera access is blocked in the embedded preview. Open the app directly in your browser to enable real-time hand tracking.
          </p>
          <a
            href={window.location.href.split("/__replco")[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#FF90E8] text-black font-bold px-5 py-2.5 rounded-md text-sm uppercase tracking-wider hover:bg-[#ff7ee4] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open App
          </a>
        </div>
      </div>
    );
  }

  if (status === "no-camera") {
    return (
      <div className="relative w-full h-full bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-border shadow-md flex items-center justify-center">
        <div className="text-center px-6 py-6 max-w-xs">
          <p className="font-bold text-[#FF90E8] text-base uppercase mb-2">Camera Not Found</p>
          <p className="text-white/60 text-sm font-medium leading-relaxed">
            Allow camera access in your browser and reload the page.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="relative w-full h-full bg-[#0a0a0a] rounded-lg overflow-hidden border-2 border-border shadow-md flex items-center justify-center">
        <p className="text-white/60 font-mono text-sm">Tracker error — check console.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border-2 border-border shadow-md">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="bg-black/80 text-white px-4 py-2 rounded-md font-mono text-sm animate-pulse">
            LOADING MEDIAPIPE...
          </p>
        </div>
      )}
      {status === "ready" && !frame && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="bg-black/80 text-white px-4 py-2 rounded-md font-mono text-sm animate-pulse">
            SHOW YOUR HANDS...
          </p>
        </div>
      )}
    </div>
  );
}
