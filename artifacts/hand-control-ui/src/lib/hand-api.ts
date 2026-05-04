import { useEffect, useRef, useState, useCallback } from "react";

export type Landmark = { x: number; y: number; z: number };

export type Hand = {
  landmarks: Landmark[];
  handedness: "Left" | "Right";
  pinch_distance: number;
  is_open: boolean;
  gesture: "pinch" | "open_hand" | "point" | "fist" | "unknown";
};

export type HandFrame = {
  timestamp: number;
  hands: Hand[];
  width: number;
  height: number;
};

type FrameMessage = {
  type: "frame";
  data: HandFrame;
};

export function useHandTracker() {
  const [isConnected, setIsConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<HandFrame | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [fps, setFps] = useState(0);
  const framesCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/hand-api/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as FrameMessage;
        if (message.type === "frame") {
          setLatestFrame(message.data);
          
          framesCountRef.current++;
          const now = Date.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            setFps(framesCountRef.current);
            framesCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }
        }
      } catch (err) {
        console.error("Failed to parse hand frame", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connect, 3000); // Reconnect attempt
    };

    ws.onerror = (error) => {
      console.error("Hand tracker WebSocket error:", error);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, latestFrame, fps };
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
