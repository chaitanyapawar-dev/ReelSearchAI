"use client";

import { usePathname } from "next/navigation";
import { Search, Command, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useBackend } from "@/components/app/BackendProvider";

const BREADCRUMBS: Record<string, string[]> = {
  "/dashboard": ["Workspace", "Dashboard"],
  "/library": ["Workspace", "Reel Library"],
  "/search": ["Workspace", "AI Search"],
  "/processing": ["Workspace", "Processing"],
  "/settings": ["System", "Settings"],
  "/copilot": ["Intelligence", "AI Copilot"],
  "/memory": ["Intelligence", "Memory Graph"],
};

export default function PlatformTopbar({ onTogglePanel }: { onTogglePanel?: () => void }) {
  const pathname = usePathname();
  const { status } = useBackend();
  const isOnline = status?.fastapi ?? false;

  // Derive breadcrumb from pathname
  const segments = BREADCRUMBS[pathname ?? ""] ?? ["Workspace", "Dashboard"];

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-4 px-6 h-14 w-full glass-topbar"
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 flex-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-white/25">
          {segments[0]}
        </span>
        <span className="text-white/15 text-xs">/</span>
        <span className="text-[13px] font-semibold text-white/80 tracking-tight">
          {segments[1]}
        </span>
      </nav>

      {/* Global Search Trigger */}
      <button
        className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 transition-all duration-200 hover:bg-white/[0.06]"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
        }}
        onClick={() => {
          // Dispatch CMD+K
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
        }}
      >
        <Search className="h-3.5 w-3.5 text-white/30" />
        <span className="text-xs text-white/30 hidden sm:block">Search reels...</span>
        <div className="flex items-center gap-0.5 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/25 hidden sm:flex">
          <Command className="h-2.5 w-2.5" />K
        </div>
      </button>

      {/* System Status */}
      <div className="hidden md:flex items-center gap-2 rounded-xl px-3 py-1.5"
        style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
        <motion.div
          className={`h-1.5 w-1.5 rounded-full ${
            isOnline ? "bg-emerald-400" : "bg-rose-500"
          }`}
          style={{
            boxShadow: isOnline 
              ? "0 0 8px rgba(52,211,113,0.7)" 
              : "0 0 8px rgba(244,63,94,0.7)"
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-[11px] text-white/40 font-medium">
          {isOnline ? "AI Online" : "AI Offline"}
        </span>
      </div>

      {/* AI Panel Toggle */}
      {onTogglePanel && (
        <button
          onClick={onTogglePanel}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/[0.05] transition-all duration-200"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          title="Toggle AI Assistant"
        >
          <Zap className="h-3.5 w-3.5" />
          <span className="hidden sm:block">Assistant</span>
        </button>
      )}
    </header>
  );
}
