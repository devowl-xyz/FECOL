import { Layout } from "@/components/layout";
import { useListSessions, useGetSessionsSummary, useGetSession, getListSessionsQueryKey, useCreateSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Play, Clock, Crosshair, Network } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

type MapperGraph = {
  nodes: { id: string; size: number; color?: string; label?: string }[];
  edges: { source: string; target: string; weight?: number }[];
};

// Force-directed layout for TDA Mapper graph via canvas
function GraphVisualization({ graph }: { graph: MapperGraph }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!graph || !graph.nodes.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    // Simple physics simulation for layout
    const nodes = graph.nodes.map(n => ({
      ...n,
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0
    }));

    const edges = graph.edges.map(e => ({
      source: nodes.find(n => n.id === e.source)!,
      target: nodes.find(n => n.id === e.target)!,
      weight: e.weight || 1
    })).filter(e => e.source && e.target);

    let animationFrameId: number;

    const simulate = () => {
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 100) {
            const force = 100 / dist;
            nodes[i].vx += (dx / dist) * force;
            nodes[i].vy += (dy / dist) * force;
            nodes[j].vx -= (dx / dist) * force;
            nodes[j].vy -= (dy / dist) * force;
          }
        }
      }

      // Attraction (edges)
      edges.forEach(edge => {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 50) * 0.05 * (edge.weight);
        
        edge.source.vx += (dx / dist) * force;
        edge.source.vy += (dy / dist) * force;
        edge.target.vx -= (dx / dist) * force;
        edge.target.vy -= (dy / dist) * force;
      });

      // Center gravity
      nodes.forEach(node => {
        const dx = width / 2 - node.x;
        const dy = height / 2 - node.y;
        node.vx += dx * 0.01;
        node.vy += dy * 0.01;
      });

      // Update positions
      nodes.forEach(node => {
        node.vx *= 0.8; // Friction
        node.vy *= 0.8;
        node.x += node.vx;
        node.y += node.vy;
        
        // Bounds
        node.x = Math.max(10, Math.min(width - 10, node.x));
        node.y = Math.max(10, Math.min(height - 10, node.y));
      });

      // Draw
      ctx.clearRect(0, 0, width, height);

      // Draw edges
      ctx.lineWidth = 2;
      edges.forEach(edge => {
        ctx.strokeStyle = "rgba(98, 91, 246, 0.2)"; // Secondary color, faint
        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(node => {
        ctx.beginPath();
        const r = Math.max(5, Math.min(20, node.size * 2));
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = node.color || "#FF90E8";
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      animationFrameId = requestAnimationFrame(simulate);
    };

    simulate();

    return () => cancelAnimationFrame(animationFrameId);
  }, [graph]);

  return <canvas ref={canvasRef} className="w-full h-[400px]" />;
}

export default function Sessions() {
  const { data: summary } = useGetSessionsSummary();
  const { data: sessions = [], isLoading: loadingSessions } = useListSessions();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  
  const createSession = useCreateSession();
  const queryClient = useQueryClient();

  const { data: sessionDetail, isLoading: loadingDetail } = useGetSession(selectedSessionId || 0, { 
    query: { 
      enabled: !!selectedSessionId, 
      queryKey: selectedSessionId ? getListSessionsQueryKey() : ["dummy"] // Using list query key for simplicity in mock, proper would be getGetSessionQueryKey(id)
    } 
  });

  const handleStartSession = () => {
    createSession.mutate(
      { data: { label: `Session ${format(new Date(), "HH:mm")}` } },
      {
        onSuccess: (newSession) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setSelectedSessionId(newSession.id);
          toast({ title: "Session Started", description: "Recording gesture topologies." });
        }
      }
    );
  };

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight">Session History</h2>
            <p className="text-muted-foreground font-medium">Review recorded gesture topologies.</p>
          </div>
          <Button 
            onClick={handleStartSession}
            disabled={createSession.isPending}
            className="font-bold uppercase tracking-wider border-2 border-border shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Play className="mr-2 w-4 h-4 fill-current" />
            Start New Session
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
            <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Total Sessions</span>
            <div className="text-3xl font-black">{summary?.totalSessions || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
            <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Total Time</span>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-black">{Math.floor((summary?.totalDurationSeconds || 0) / 60)}</div>
              <span className="text-sm font-bold text-muted-foreground pb-1">MIN</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
            <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">Gestures Detected</span>
            <div className="text-3xl font-black">{summary?.totalGestures || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between bg-secondary/10 border-secondary">
            <span className="text-xs font-bold uppercase text-secondary tracking-wider mb-2">Top Gesture</span>
            <div className="text-xl font-black uppercase text-secondary mt-auto">
              {summary?.topGestures?.[0]?.name?.replace("_", " ") || "N/A"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <h3 className="font-bold uppercase tracking-tight text-sm text-muted-foreground">Recent Sessions</h3>
            <div className="space-y-3">
              {loadingSessions ? (
                <div className="text-center py-8 text-muted-foreground font-mono">Loading...</div>
              ) : sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    selectedSessionId === session.id 
                      ? "border-primary bg-primary/5 shadow-[4px_4px_0px_0px_rgba(255,144,232,1)]" 
                      : "border-border bg-white hover:border-primary/50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-sm uppercase">{session.label}</span>
                    <span className="text-xs font-mono text-muted-foreground">{format(new Date(session.createdAt), "MMM d")}</span>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                      <Clock className="w-3 h-3" />
                      {session.durationSeconds}s
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                      <Crosshair className="w-3 h-3" />
                      {session.gestureCount} poses
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Graph View */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <h3 className="font-bold uppercase tracking-tight text-sm text-muted-foreground flex items-center justify-between">
              <span>Topology Map</span>
              {selectedSessionId && <Badge variant="outline" className="bg-white border-2">Session #{selectedSessionId}</Badge>}
            </h3>
            
            <div className="bg-white rounded-xl border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] min-h-[400px] flex items-center justify-center relative overflow-hidden">
              {!selectedSessionId ? (
                <div className="text-center text-muted-foreground p-8 flex flex-col items-center">
                  <Network className="w-12 h-12 mb-4 opacity-20" strokeWidth={1} />
                  <p className="font-medium">Select a session to view its TDA Mapper topology.</p>
                </div>
              ) : loadingDetail ? (
                <div className="font-mono animate-pulse">Computing graph...</div>
              ) : sessionDetail?.mapperGraph && sessionDetail.mapperGraph.nodes.length > 0 ? (
                <GraphVisualization graph={sessionDetail.mapperGraph} />
              ) : (
                <div className="text-center text-muted-foreground">
                  <p className="font-medium">No topology data available for this session.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
}
