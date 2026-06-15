import { Link } from "wouter";

export default function Landing() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0a0a0c", color: "#f0f0e8" }}
    >
      {/* Nav bar */}
      <header className="flex items-center justify-between px-8 py-5" style={{ borderBottom: "1px solid #1e1e22" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md overflow-hidden"
            style={{ border: "1.5px solid rgba(255,255,255,0.1)", boxShadow: "2px 2px 0 rgba(0,0,0,0.6)" }}
          >
            <img src="/logo.png" alt="Fecol" className="w-full h-full object-cover" />
          </div>
          <span className="font-black text-lg tracking-tight uppercase" style={{ color: "#f0f0e8" }}>Fecol</span>
        </div>
        <Link href="/draw">
          <button
            className="px-5 py-2 rounded-md text-sm font-bold uppercase tracking-wider transition-all hover:brightness-110 active:scale-95"
            style={{ background: "linear-gradient(160deg,#FFE500,#FFBB00)", color: "#000", boxShadow: "0 2px 0 rgba(0,0,0,0.4)" }}
          >
            Open App →
          </button>
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-10">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
          style={{ background: "rgba(255,229,0,0.1)", border: "1px solid rgba(255,229,0,0.25)", color: "#FFE500" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFE500] animate-pulse inline-block" />
          Hand-gesture powered
        </div>

        {/* Headline */}
        <div className="max-w-3xl">
          <h1
            className="text-6xl font-black uppercase tracking-tight leading-none mb-5"
            style={{ letterSpacing: "-0.02em" }}
          >
            Draw with{" "}
            <span
              style={{
                background: "linear-gradient(135deg,#FFE500 0%,#FFBB00 50%,#f97316 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              your hands
            </span>
          </h1>
          <p className="text-lg font-medium" style={{ color: "rgba(240,240,232,0.55)", lineHeight: 1.7 }}>
            Point your finger to paint. Gesture to switch tools.<br />
            Real-time hand tracking — no mouse, no touch.
          </p>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4">
          <Link href="/draw">
            <button
              className="px-8 py-4 rounded-lg text-base font-black uppercase tracking-wider transition-all hover:brightness-110 active:scale-95"
              style={{
                background: "linear-gradient(160deg,#FFE500,#FFBB00)",
                color: "#000",
                boxShadow: "0 4px 0 rgba(0,0,0,0.5), 0 0 40px rgba(255,229,0,0.2)",
              }}
            >
              Start Drawing →
            </button>
          </Link>
          <Link href="/control">
            <button
              className="px-8 py-4 rounded-lg text-base font-bold uppercase tracking-wider transition-all hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(240,240,232,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              Control Centre
            </button>
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          {[
            "☝ Pen · Highlighter · Spray",
            "⬜ Shapes & flood fill",
            "↩ Undo / Redo",
            "🎨 10 colours",
            "📷 Live hand skeleton",
          ].map((f) => (
            <span
              key={f}
              className="px-4 py-2 rounded-full text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(240,240,232,0.6)" }}
            >
              {f}
            </span>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs font-medium" style={{ color: "rgba(240,240,232,0.25)", borderTop: "1px solid #1e1e22" }}>
        Fecol — gesture-controlled creative canvas
      </footer>
    </div>
  );
}
