import { useRef, useEffect } from "react";
import { HandFrame } from "@/lib/hand-api";

// MediaPipe hand landmark connections
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
];

export function HandSkeleton({ frame }: { frame: HandFrame | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize webcam
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user", width: 640, height: 480 } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Draw landmarks
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !frame) return;

    // Match canvas internal resolution to actual display size to avoid blurriness
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw hands
    frame.hands.forEach(hand => {
      const isLeft = hand.handedness === "Left";
      const color = isLeft ? "#FF90E8" : "#625BF6"; // Primary pink for left, secondary purple for right

      // Draw connections
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      
      HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const start = hand.landmarks[startIdx];
        const end = hand.landmarks[endIdx];
        
        if (start && end) {
          ctx.beginPath();
          ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
          ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
          ctx.stroke();
        }
      });

      // Draw landmarks
      hand.landmarks.forEach((landmark, i) => {
        ctx.beginPath();
        ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
        ctx.fillStyle = i === 8 ? "#FFF" : color; // Highlight index finger tip (8)
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      
      // Draw gesture label
      if (hand.landmarks[0]) {
        ctx.fillStyle = "#000";
        ctx.fillRect(hand.landmarks[0].x * canvas.width - 10, hand.landmarks[0].y * canvas.height + 20, 100, 24);
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 14px Montserrat, sans-serif";
        ctx.fillText(hand.gesture.replace("_", " ").toUpperCase(), hand.landmarks[0].x * canvas.width - 5, hand.landmarks[0].y * canvas.height + 36);
      }
    });
  }, [frame]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border-2 border-border shadow-md">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-50 grayscale"
      />
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {!frame && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="bg-black/80 text-white px-4 py-2 rounded-md font-mono text-sm">WAITING FOR TRACKER DATA...</p>
        </div>
      )}
    </div>
  );
}
