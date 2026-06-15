import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useHealthCheck } from "@workspace/api-client-react";

const navItems = [
  { href: "/draw",     label: "Draw",     img: "/nav-draw.png"     },
  { href: "/",         label: "Control",  img: "/nav-control.png"  },
  { href: "/gestures", label: "Gestures", img: "/nav-gestures.png" },
  { href: "/sessions", label: "Sessions", img: "/nav-sessions.png" },
  { href: "/settings", label: "Settings", img: "/nav-settings.png" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary selection:text-primary-foreground">

      {/* Sidebar */}
      <aside className="w-60 flex flex-col justify-between shrink-0"
        style={{ background: "#111114", borderRight: "1px solid #2a2a2e" }}>

        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-5 gap-3"
            style={{ borderBottom: "1px solid #2a2a2e" }}>
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden logo-breathe"
              style={{
                border: "1.5px solid rgba(0,0,0,0.7)",
                boxShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              }}
            >
              <img src="/logo.png" alt="Fecol" className="w-full h-full object-cover" />
            </div>
            <span className="font-black text-lg tracking-tight uppercase" style={{ color: "#f0f0e8" }}>
              Fecol
            </span>
          </div>

          {/* Nav */}
          <nav className="p-3 space-y-1.5">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all duration-200 relative overflow-hidden cursor-pointer",
                      !isActive && "hover:bg-white/5 hover:translate-x-1",
                      isActive && "nav-shimmer",
                    )}
                    style={isActive ? {
                      background: "linear-gradient(160deg, #FFE500 0%, #FFBB00 100%)",
                      color: "#000",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 0 rgba(0,0,0,0.5)",
                      border: "1px solid rgba(180,140,0,0.6)",
                    } : {
                      color: "rgba(220,215,200,0.55)",
                      border: "1px solid transparent",
                    }}
                  >
                    {isActive && (
                      <div className="absolute inset-0 rounded-md pointer-events-none"
                        style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.25) 0%, transparent 50%)" }} />
                    )}
                    <img
                      src={item.img}
                      alt={item.label}
                      className="w-5 h-5 relative z-10 object-contain rounded"
                      style={{ opacity: isActive ? 1 : 0.6 }}
                    />
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
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#FFE500]" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FFE500]" />
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
