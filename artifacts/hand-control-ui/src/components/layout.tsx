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
      {/* Sidebar */}
      <aside className="w-60 border-r-2 border-border bg-sidebar flex flex-col justify-between shrink-0">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b-2 border-border gap-3">
            <div className="w-9 h-9 rounded-md bg-primary border-2 border-border flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <span className="font-black text-sm text-primary-foreground leading-none tracking-tighter">F/</span>
            </div>
            <span className="font-black text-lg tracking-tight uppercase">Fecol</span>
          </div>

          <nav className="p-3 space-y-0.5">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-all duration-150",
                    isActive
                      ? "bg-primary text-primary-foreground border-2 border-border shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border-2 border-transparent"
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t-2 border-border">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2.5 w-2.5">
              {health?.status === "ok" ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground"></span>
              )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
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
