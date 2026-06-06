"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GlassSidebar from "@/components/app/GlassSidebar";
import PlatformTopbar from "@/components/app/PlatformTopbar";
import CommandPalette from "@/components/app/CommandPalette";
import { Bot, X, Search, Sparkles } from "lucide-react";
import BackendProvider, { useBackend } from "@/components/app/BackendProvider";

const SUGGESTIONS = [
  "Find reels about AI startups",
  "Show recent coding tutorials",
  "Clips with motivational content",
];

const ACTIVITY = [
  { time: "2m ago", msg: "Indexed: React 19 Features", dot: "bg-[#5B8CFF]" },
  { time: "9m ago", msg: "Search: startup marketing tips", dot: "bg-cyan-400" },
  { time: "18m ago", msg: "Transcribed 3 audio tracks", dot: "bg-violet-400" },
  { time: "1h ago", msg: "CLIP embeddings refreshed", dot: "bg-emerald-400" },
];

function AIAssistantPanel({ onClose }: { onClose: () => void }) {
  const { status } = useBackend();
  const isOnline = status.fastapi;

  return (
    <motion.aside
      key="ai-panel"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 284, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="hidden xl:flex flex-col h-full overflow-hidden shrink-0 relative"
      style={{
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(5, 8, 22, 0.68)",
        backdropFilter: "blur(32px) saturate(160%)",
        WebkitBackdropFilter: "blur(32px) saturate(160%)",
      }}
    >
      {/* Soft radial glow behind the AI core */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(91,140,255,0.10) 0%, rgba(123,97,255,0.05) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="flex-1 overflow-y-auto scrollbar-none p-5 space-y-6 min-w-[284px] relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Animated AI core icon */}
            <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-[#5B8CFF] to-[#7B61FF] flex items-center justify-center shadow-[0_0_20px_rgba(91,140,255,0.4)]">
              <Bot className="h-4 w-4 text-white" />
              <motion.div
                className="absolute inset-0 rounded-xl border-2 border-[#5B8CFF]/60"
                animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.1, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/90">AI Assistant</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <motion.div
                  className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-rose-500"}`}
                  style={{ boxShadow: isOnline ? "0 0 8px rgba(52,211,113,0.8)" : "0 0 8px rgba(244,63,94,0.8)" }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-[10px] uppercase tracking-widest text-white/30">
                  {isOnline ? "Online" : "Offline"}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Quick search */}
        <div className="rounded-2xl p-4 space-y-2 relative glass-sheen overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">Quick Search</p>
          {SUGGESTIONS.map((s) => (
            <button key={s}
              className="w-full text-left rounded-xl px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-200 flex items-center gap-2 group">
              <Search className="h-3 w-3 text-white/25 shrink-0 group-hover:text-[#5B8CFF] transition-colors" />
              {s}
            </button>
          ))}
        </div>

        {/* AI Activity */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-4">AI Activity</p>
          <div className="space-y-3.5">
            {ACTIVITY.map((item, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 pulse-dot ${item.dot}`} />
                <div>
                  <p className="text-xs text-white/65 leading-snug">{item.msg}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Memory stats */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 mb-4">Memory Stats</p>
          <div className="space-y-3">
            {[
              { label: "Reels Indexed", value: isOnline ? status.reelCount.toString() : "--" },
              { label: "Vectors Stored", value: isOnline ? (status.reelCount * 12).toLocaleString() : "--" },
              { label: "Transcripts", value: isOnline ? status.reelCount.toString() : "--" },
              { label: "Avg Match Score", value: isOnline ? "91%" : "--" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center justify-between">
                <span className="text-xs text-white/35">{stat.label}</span>
                <span className="text-xs font-semibold text-white/75">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* AI hint */}
        <div className="rounded-2xl p-4"
          style={{ background: "linear-gradient(135deg, rgba(91,140,255,0.08), rgba(123,97,255,0.08))", border: "1px solid rgba(91,140,255,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-[#5B8CFF]" />
            <span className="text-[10px] uppercase tracking-widest text-[#5B8CFF]/80">Copilot</span>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">Chat with your entire reel memory. Ask questions, get citations.</p>
        </div>
      </div>
    </motion.aside>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <BackendProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Global CMD+K Palette */}
        <CommandPalette />

        {/* Fixed Sidebar */}
        <GlassSidebar />

        {/* Main area (offset by sidebar 72px) */}
        <div className="flex flex-1 flex-col pl-[72px] overflow-hidden">
          {/* Topbar */}
          <PlatformTopbar onTogglePanel={() => setPanelOpen((v) => !v)} />

          {/* Content row */}
          <div className="flex flex-1 overflow-hidden">
            {/* Page content */}
            <main className="flex-1 overflow-y-auto scrollbar-none">
              {children}
            </main>

            {/* Collapsible AI Panel */}
            <AnimatePresence>
              {panelOpen && <AIAssistantPanel onClose={() => setPanelOpen(false)} />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </BackendProvider>
  );
}
