import { useHandTracker } from "@/lib/hand-api";
import { Layout } from "@/components/layout";
import { HandSkeleton } from "@/components/hand-skeleton";
import { Scene3D } from "@/components/scene-3d";

const flatPanel = {
  background: "linear-gradient(160deg, #ffffff 0%, #f5f4ef 100%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95), 4px 4px 0px rgba(0,0,0,0.85)",
  border: "1.5px solid rgba(0,0,0,0.82)",
};

const statCard = {
  background: "linear-gradient(160deg, #ffffff 0%, #f5f4ef 100%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,1), 2px 2px 0px rgba(0,0,0,0.8)",
  border: "1.5px solid rgba(0,0,0,0.8)",
};

const CAMERA_STATUS: Record<string, { label: string; color: string; pulse: boolean }> = {
  loading:   { label: "LOADING",   color: "#888888", pulse: true  },
  ready:     { label: "CAMERA ON", color: "#FFE500", pulse: false },
  "no-camera": { label: "NO CAMERA", color: "#ef4444", pulse: false },
  iframe:    { label: "PREVIEW",   color: "#888888", pulse: false },
  error:     { label: "ERROR",     color: "#ef4444", pulse: false },
};

export default function Dashboard() {
  const { latestFrame, fps, status, videoRef, detections } = useHandTracker();
  const currentGesture = latestFrame?.hands[0]?.gesture || "none";
  const camStatus = CAMERA_STATUS[status] ?? CAMERA_STATUS.loading;
  const isTracking = status === "ready" && (latestFrame?.hands.length ?? 0) > 0;

  return (
    <Layout>
      <div className="h-full flex flex-col p-6 gap-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between ui-float-in">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Control Center</h2>
            <p className="text-muted-foreground font-medium">Real-time gesture topology analysis.</p>
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-0 rounded-md overflow-hidden" style={statCard}>
            <div className="flex flex-col items-end px-4 py-2.5 border-r border-black/10">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Camera</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-2 w-2">
                  {camStatus.pulse && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                      style={{ background: camStatus.color }} />
                  )}
                  <span className="relative inline-flex rounded-full h-2 w-2"
                    style={{ background: camStatus.color }} />
                </span>
                <span className="font-bold text-xs">{camStatus.label}</span>
              </div>
            </div>
            <div className="flex flex-col items-end px-4 py-2.5 border-r border-black/10">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Tracking</span>
              <span className="font-bold text-xs mt-0.5" style={{ color: isTracking ? "#22c55e" : "#888" }}>
                {isTracking ? `${latestFrame!.hands.length} HAND${latestFrame!.hands.length > 1 ? "S" : ""}` : "NONE"}
              </span>
            </div>
            <div className="flex flex-col items-end px-4 py-2.5 border-r border-black/10">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">FPS</span>
              <span className="font-mono font-bold text-xs mt-0.5">{fps}</span>
            </div>
            <div className="flex flex-col items-end px-4 py-2.5">
              <span className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest">Gesture</span>
              <span className="font-bold text-xs uppercase mt-0.5 text-foreground">
                {currentGesture.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        {/* Detected Objects panel */}
        {detections.length > 0 && (
          <div className="flex flex-col gap-2 ui-float-in ui-delay-2">
            <h3 className="font-bold uppercase tracking-tight text-xs text-muted-foreground">
              Detected Objects
            </h3>
            <div className="flex flex-wrap gap-2">
              {detections.map((d) => (
                <div
                  key={d.tracker_id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded gesture-pop"
                  style={statCard}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    #{d.tracker_id}
                  </span>
                  <span className="font-bold text-xs uppercase">{d.class_name}</span>
                  <span
                    className="text-[9px] font-bold"
                    style={{ color: "#22c55e" }}
                  >
                    {(d.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feed + Viewport */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
          <div className="flex flex-col gap-2 ui-float-in ui-delay-1">
            <h3 className="font-bold uppercase tracking-tight text-xs text-muted-foreground">Input Feed</h3>
            <div className="flex-1 relative rounded-xl overflow-hidden p-2" style={flatPanel}>
              <HandSkeleton frame={latestFrame} videoRef={videoRef} status={status} detections={detections} />
            </div>
          </div>

          <div className="flex flex-col gap-2 ui-float-in ui-delay-2">
            <h3 className="font-bold uppercase tracking-tight text-xs text-muted-foreground">Output Space</h3>
            <div className="flex-1 relative rounded-xl overflow-hidden p-2" style={flatPanel}>
              <Scene3D frame={latestFrame} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
