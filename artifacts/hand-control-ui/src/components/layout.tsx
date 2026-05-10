import { Link, useLocation } from "wouter";
import { Hand, Settings, Activity, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHealthCheck } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  const navItems = [
    { href: "/", label: "Control", icon: Hand },
    { href: "/gestures", label: "Gestures", icon: FolderOpen },
    { href: "/sessions", label: "Sessions", icon: Activity },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary selection:text-primary-foreground">

      {/* Sidebar — dark so glows pop */}
      <aside className="w-60 flex flex-col justify-between shrink-0"
        style={{ background: "#111114", borderRight: "1px solid #2a2a2e" }}>

        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-5 gap-3"
            style={{ borderBottom: "1px solid #2a2a2e" }}>
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden"
              style={{
                boxShadow: "0 0 14px rgba(255,229,0,0.75), 0 0 32px rgba(255,229,0,0.3), 2px 2px 0 rgba(0,0,0,0.7)",
                border: "1.5px solid rgba(0,0,0,0.7)",
              }}
            >
              <img src="/logo.png" alt="Fecol" className="w-full h-full object-cover" />
            </div>
            <span
              className="font-black text-lg tracking-tight uppercase"
              style={{ color: "#f0f0e8", textShadow: "0 0 18px rgba(255,229,0,0.35)" }}
            >
              Fecol
            </span>
          </div>

          {/* Nav */}
          <nav className="p-3 space-y-1.5">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all duration-150 relative overflow-hidden cursor-pointer",
                      !isActive && "hover:bg-white/5"
                    )}
                    style={isActive ? {
                      background: "linear-gradient(160deg, #FFE500 0%, #FFBB00 100%)",
                      color: "#000",
                      boxShadow: "0 0 12px rgba(255,229,0,0.75), 0 0 28px rgba(255,229,0,0.3), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 0 rgba(0,0,0,0.5)",
                      border: "1px solid rgba(200,160,0,0.7)",
                    } : {
                      color: "rgba(220,215,200,0.55)",
                      border: "1px solid transparent",
                    }}
                  >
                    {/* active specular */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-md pointer-events-none" style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.28) 0%, transparent 50%)" }} />
                    )}
                    <Icon className="w-4 h-4 relative z-10" strokeWidth={isActive ? 2.5 : 2} />
                    <span className="relative z-10">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* API status */}
        <div className="p-5" style={{ borderTop: "1px solid #2a2a2e" }}>
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2.5 w-2.5">
              {health?.status === "ok" ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: "#FFE500", boxShadow: "0 0 6px rgba(255,229,0,0.8)" }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5"
                    style={{ background: "#FFE500", boxShadow: "0 0 8px rgba(255,229,0,1)" }} />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground" />
              )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(200,195,180,0.5)" }}>
              API {health?.status === "ok" ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto z-10 relative">
          {children}
        </div>
      </main>
    </div>
  );
}
