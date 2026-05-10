import { useHandTracker } from "@/lib/hand-api";
import { Layout } from "@/components/layout";
import { HandSkeleton } from "@/components/hand-skeleton";
import { Scene3D } from "@/components/scene-3d";

const glowPanel = {
  background: "linear-gradient(160deg, #ffffff 0%, #f5f4ef 100%)",
  boxShadow: "0 0 0 1px rgba(255,229,0,0.18), 0 0 18px rgba(255,229,0,0.09), inset 0 1px 0 rgba(255,255,255,0.95), 4px 4px 0px rgba(0,0,0,0.85)",
  border: "1.5px solid rgba(0,0,0,0.82)",
};

const statCard = {
  background: "linear-gradient(160deg, #ffffff 0%, #f5f4ef 100%)",
  boxShadow: "0 0 0 1px rgba(255,229,0,0.12), 0 0 14px rgba(255,229,0,0.07), inset 0 1px 0 rgba(255,255,255,1), 2px 2px 0px rgba(0,0,0,0.8)",
  border: "1.5px solid rgba(0,0,0,0.8)",
};

export default function Dashboard() {
  const { isConnected, latestFrame, fps, status, videoRef } = useHandTracker();
  const currentGesture = latestFrame?.hands[0]?.gesture || "none";

  return (
    <Layout>
      <div className="h-full flex flex-col p-6 gap-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Control Center</h2>
            <p className="text-muted-foreground font-medium">Real-time gesture topology analysis.</p>
          </div>

          {/* Status bar — glowy 3D card */}
          <div className="flex items-center gap-0 rounded-md overflow-hidden" style={statCard}>
            <div className="flex flex-col items-end px-4 py-2.5 border-r border-black/10">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Status</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={isConnected ? {
                    background: "#FFE500",
                    boxShadow: "0 0 6px rgba(255,229,0,1), 0 0 14px rgba(255,229,0,0.6)",
                  } : { background: "#888" }}
                />
                <span className="font-bold text-xs">{isConnected ? "CONNECTED" : "CONNECTING..."}</span>
              </div>
            </div>
            <div className="flex flex-col items-end px-4 py-2.5 border-r border-black/10">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">FPS</span>
              <span className="font-mono font-bold text-xs mt-0.5">{fps}</span>
            </div>
            <div className="flex flex-col items-end px-4 py-2.5">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Gesture</span>
              <span
                className="font-bold text-xs uppercase mt-0.5"
                style={{ color: "#cc9900", textShadow: "0 0 8px rgba(255,229,0,0.6)" }}
              >
                {currentGesture.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        {/* Feed + Viewport */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
          <div className="flex flex-col gap-2">
            <h3 className="font-bold uppercase tracking-tight text-xs text-muted-foreground">Input Feed</h3>
            <div className="flex-1 relative rounded-xl overflow-hidden p-2" style={glowPanel}>
              <HandSkeleton frame={latestFrame} videoRef={videoRef} status={status} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-bold uppercase tracking-tight text-xs text-muted-foreground">Output Space</h3>
            <div className="flex-1 relative rounded-xl overflow-hidden p-2" style={glowPanel}>
              <Scene3D frame={latestFrame} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
