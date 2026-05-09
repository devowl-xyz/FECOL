import { useHandTracker } from "@/lib/hand-api";
import { Layout } from "@/components/layout";
import { HandSkeleton } from "@/components/hand-skeleton";
import { Scene3D } from "@/components/scene-3d";

export default function Dashboard() {
  const { isConnected, latestFrame, fps, status, videoRef } = useHandTracker();

  const currentGesture = latestFrame?.hands[0]?.gesture || "none";

  return (
    <Layout>
      <div className="h-full flex flex-col p-6 gap-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Control Center</h2>
            <p className="text-muted-foreground font-medium">Real-time gesture topology analysis.</p>
          </div>

          <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-md border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col items-end border-r border-border pr-4">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Status</span>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-primary shadow-[0_0_8px_rgba(255,229,0,0.8)]" : "bg-muted-foreground"}`} />
                <span className="font-bold text-sm">{isConnected ? "CONNECTED" : "CONNECTING..."}</span>
              </div>
            </div>

            <div className="flex flex-col items-end border-r border-border pr-4">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">FPS</span>
              <span className="font-mono font-bold text-sm">{fps}</span>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Active Gesture</span>
              <span className="font-bold text-sm text-primary uppercase">{currentGesture.replace(/_/g, " ")}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
          <div className="flex flex-col gap-2">
            <h3 className="font-bold uppercase tracking-tight text-sm text-muted-foreground">Input Feed</h3>
            <div className="flex-1 p-2 bg-white rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
              <HandSkeleton frame={latestFrame} videoRef={videoRef} status={status} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-bold uppercase tracking-tight text-sm text-muted-foreground">Output Space</h3>
            <div className="flex-1 p-2 bg-white rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
              <Scene3D frame={latestFrame} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
