"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search, LayoutDashboard, Library, Cpu, Settings, Bot, Network, BarChart3, ArrowRight, Command,
} from "lucide-react";

const COMMANDS = [
  { label: "Go to Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Reel Library", icon: Library, href: "/library" },
  { label: "AI Search", icon: Search, href: "/search" },
  { label: "Processing Pipeline", icon: Cpu, href: "/processing" },
  { label: "Settings & System", icon: Settings, href: "/settings" },
  { label: "AI Copilot", icon: Bot, href: "/copilot" },
  { label: "Memory Graph", icon: Network, href: "/memory" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const router = useRouter();

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelectedIdx(0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open ? setOpen(false) : handleOpen();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      if (e.key === "ArrowUp") setSelectedIdx((i) => Math.max(i - 1, 0));
      if (e.key === "Enter" && filtered[selectedIdx]) {
        router.push(filtered[selectedIdx].href);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIdx, router]);

  useEffect(() => setSelectedIdx(0), [query]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            className="fixed left-1/2 top-[20%] z-[100] w-full max-w-[560px] -translate-x-1/2"
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="overflow-hidden rounded-[28px]"
              style={{
                background: "rgba(8, 12, 28, 0.92)",
                backdropFilter: "blur(40px)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset, 0 32px 80px rgba(0,0,0,0.6), 0 0 80px rgba(91,140,255,0.1)",
              }}
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
                <Search className="h-4 w-4 text-white/40 shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search commands..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                />
                <div className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/30">
                  <Command className="h-2.5 w-2.5" />K
                </div>
              </div>

              {/* Results */}
              <div className="p-2 max-h-[320px] overflow-y-auto scrollbar-none">
                {filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-white/30">No results</p>
                ) : (
                  filtered.map((cmd, i) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.href}
                        onClick={() => { router.push(cmd.href); setOpen(false); }}
                        onMouseEnter={() => setSelectedIdx(i)}
                        className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left ${
                          selectedIdx === i ? "bg-white/[0.08] text-white" : "text-white/60 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 border border-white/10">
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <span className="text-sm font-medium flex-1">{cmd.label}</span>
                        {selectedIdx === i && (
                          <ArrowRight className="h-3.5 w-3.5 text-white/40" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-4 border-t border-white/[0.06] px-5 py-3">
                <span className="text-[10px] text-white/25 uppercase tracking-widest">Navigate with ↑↓  ·  Enter to open  ·  Esc to close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
