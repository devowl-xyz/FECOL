import { useEffect, useRef, useState, useCallback } from "react";
import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type Landmark = { x: number; y: number; z: number };

export type Hand = {
  landmarks: Landmark[];
  handedness: "Left" | "Right";
  pinch_distance: number;
  is_open: boolean;
  gesture: "pinch" | "open_hand" | "point" | "fist" | "thumbs_up" | "two_fingers" | "unknown";
};

export type HandFrame = {
  timestamp: number;
  hands: Hand[];
  width: number;
  height: number;
};

export type TrackerStatus =
  | "loading"
  | "ready"
  | "no-camera"
  | "iframe"
  | "error";

// ── Gesture classification ────────────────────────────────────────────────────

function computePinchDistance(lms: Landmark[]): number {
  if (lms.length < 9) return 1;
  const t = lms[4], i = lms[8];
  return Math.sqrt((t.x - i.x) ** 2 + (t.y - i.y) ** 2 + (t.z - i.z) ** 2);
}

function isHandOpen(lms: Landmark[]): boolean {
  if (lms.length < 21) return false;
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  return tips.filter((t, i) => lms[t].y < lms[pips[i]].y).length >= 3;
}

function classifyGesture(lms: Landmark[]): Hand["gesture"] {
  if (lms.length < 21) return "unknown";

  const pinch = computePinchDistance(lms);
  if (pinch < 0.06) return "pinch";

  // Dead-zone margin — finger must cross PIP by this much to register up/down.
  // Eliminates flickering at the boundary.
  const M = 0.028;

  const indexUp    = lms[8].y  < lms[6].y  - M;
  const middleUp   = lms[12].y < lms[10].y - M;
  const ringUp     = lms[16].y < lms[14].y - M;
  const pinkyUp    = lms[20].y < lms[18].y - M;
  const indexDown  = lms[8].y  > lms[6].y  + M;
  const middleDown = lms[12].y > lms[10].y + M;
  const ringDown   = lms[16].y > lms[14].y + M;
  const pinkyDown  = lms[20].y > lms[18].y + M;

  // Thumbs up: thumb tip must clear its MCP by 7% of frame height AND
  // sit above the wrist — prevents a fist with a resting thumb triggering it.
  // All four fingers must be clearly curled (dead-zone enforced).
  const thumbWellUp = lms[4].y < lms[2].y - 0.07 && lms[4].y < lms[0].y;
  const allCurled   = indexDown && middleDown && ringDown && pinkyDown;
  if (thumbWellUp && allCurled) return "thumbs_up";

  // Two fingers (peace): index + middle clearly up, ring + pinky clearly down
  if (indexUp && middleUp && ringDown && pinkyDown) return "two_fingers";

  // Point: only index clearly up, middle clearly down
  if (indexUp && middleDown && ringDown) return "point";

  // Open hand: 3+ fingers clearly extended
  const extCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  if (extCount >= 3) return "open_hand";

  // Fist: all 4 fingertips must be clearly below their MCP knuckles.
  // Checking tip vs MCP (not just PIP) requires a genuine full curl —
  // a slightly bent or relaxed hand will not trigger this.
  // Landmark indices: Index MCP=5, Middle MCP=9, Ring MCP=13, Pinky MCP=17
  const F = 0.02; // minimum clearance past the knuckle
  const indexFist  = lms[8].y  > lms[5].y  + F;
  const middleFist = lms[12].y > lms[9].y  + F;
  const ringFist   = lms[16].y > lms[13].y + F;
  const pinkyFist  = lms[20].y > lms[17].y + F;
  if (indexFist && middleFist && ringFist && pinkyFist && !thumbWellUp) return "fist";

  return "unknown";
}

function mpResultToFrame(
  result: HandLandmarkerResult,
  width: number,
  height: number
): HandFrame {
  const hands: Hand[] = result.landmarks.map((lms, i) => {
    const landmarks: Landmark[] = lms.map((l) => ({ x: l.x, y: l.y, z: l.z }));
    const cat = result.handedness[i]?.[0]?.categoryName ?? "Right";
    const handedness: "Left" | "Right" = cat === "Left" ? "Left" : "Right";
    return {
      landmarks,
      handedness,
      pinch_distance: computePinchDistance(landmarks),
      is_open: isHandOpen(landmarks),
      gesture: classifyGesture(landmarks),
    };
  });
  return { timestamp: Date.now(), hands, width, height };
}

// Detect if running embedded in a sandboxed iframe (Replit preview)
function isEmbeddedIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin check threw — definitely in an iframe
    return true;
  }
}

// ── Main browser hand-tracker hook ───────────────────────────────────────────

export function useHandTracker() {
  const [isConnected, setIsConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<HandFrame | null>(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState<TrackerStatus>("loading");

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const framesRef = useRef(0);
  const lastFpsRef = useRef(Date.now());

  // WebSocket to Python backend (for TDA Mapper accumulation)
  const connectWs = useCallback(() => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/hand-api/ws`);
      wsRef.current = ws;
      ws.onopen = () => setIsConnected(true);
      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWs, 4000);
      };
      ws.onerror = () => ws.close();
    } catch {
      // ignore in iframe
    }
  }, []);

  useEffect(() => {
    // If we're embedded in an iframe (Replit preview panel), camera won't work
    if (isEmbeddedIframe()) {
      setStatus("iframe");
      connectWs(); // Still connect WS for the status indicator
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        // Try GPU first, fall back to CPU
        let landmarker: HandLandmarker | null = null;
        for (const delegate of ["GPU", "CPU"] as const) {
          try {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate,
              },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            break; // success
          } catch {
            if (delegate === "CPU") throw new Error("Both GPU and CPU delegates failed");
            // try next
          }
        }

        if (cancelled || !landmarker) { landmarker?.close(); return; }
        landmarkerRef.current = landmarker;

        // Open webcam
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        videoRef.current = video;

        await new Promise<void>((res) => {
          video.onloadedmetadata = () => { video.play(); res(); };
        });

        if (cancelled) return;
        setStatus("ready");
        startDetectionLoop(landmarker, video);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("Permission") ||
          msg.includes("NotFound") ||
          msg.includes("NotAllowed") ||
          msg.includes("Requested device not found")
        ) {
          setStatus("no-camera");
        } else {
          setStatus("error");
          console.error("MediaPipe init error:", err);
        }
      }
    }

    connectWs();
    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
      wsRef.current?.close();
    };
  }, [connectWs]);

  function startDetectionLoop(landmarker: HandLandmarker, video: HTMLVideoElement) {
    function detect() {
      rafRef.current = requestAnimationFrame(detect);
      if (video.readyState < 2) return;
      const now = performance.now();
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;

      const result = landmarker.detectForVideo(video, now);
      const frame = mpResultToFrame(result, video.videoWidth, video.videoHeight);

      setLatestFrame(frame);

      framesRef.current++;
      const elapsed = Date.now() - lastFpsRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((framesRef.current * 1000) / elapsed));
        framesRef.current = 0;
        lastFpsRef.current = Date.now();
      }

      // Forward landmarks to Python for TDA accumulation
      if (wsRef.current?.readyState === WebSocket.OPEN && frame.hands.length > 0) {
        wsRef.current.send(JSON.stringify({ cmd: "landmarks", data: frame }));
      }
    }
    detect();
  }

  return { isConnected, latestFrame, fps, status, videoRef };
}

export async function calibrateHandApi(cameraIndex: number, enabled: boolean) {
  const res = await fetch("/hand-api/calibrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ camera_index: cameraIndex, enabled }),
  });
  if (!res.ok) throw new Error("Failed to calibrate hand api");
  return res.json();
}
