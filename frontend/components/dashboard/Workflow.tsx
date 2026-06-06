"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Mic,
  ScanText,
  Eye,
  Layers,
  Database,
  Brain,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = {
  num: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  short: string;
  action: string;
};

const STEPS: Step[] = [
  { num: 1, title: "Reel Download", subtitle: "yt-dlp ingestion", icon: Download, short: "Download", action: "INGESTING" },
  { num: 2, title: "Whisper", subtitle: "Speech transcription", icon: Mic, short: "Whisper", action: "TRANSCRIBING" },
  { num: 3, title: "OCR", subtitle: "On-screen text", icon: ScanText, short: "OCR", action: "SCANNING" },
  { num: 4, title: "BLIP", subtitle: "Visual captions", icon: Eye, short: "BLIP", action: "CAPTIONING" },
  { num: 5, title: "CLIP", subtitle: "Semantic embeddings", icon: Layers, short: "CLIP", action: "EMBEDDING" },
  { num: 6, title: "ChromaDB", subtitle: "Vector retrieval", icon: Database, short: "ChromaDB", action: "STORING" },
  { num: 7, title: "Ollama", subtitle: "LLM re-ranking", icon: Brain, short: "Ollama", action: "REASONING" },
  { num: 8, title: "RAG Chat", subtitle: "Memory dialogue", icon: MessageCircle, short: "Chat", action: "RETRIEVING" },
];

function PipelineConnector({ active, reverse = false }: { active: boolean; reverse?: boolean }) {
  return (
    <div className="hidden lg:block shrink-0 w-[32px] h-[160px] relative">
      {/* Base faint line perfectly centered vertically */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 h-[1px] w-full bg-cyan-500/20" />
      
      {/* Animated pulse that travels across */}
      {active && (
        <motion.div
          className="absolute top-1/2 left-0 -translate-y-1/2 h-[2px] w-full bg-cyan-400 shadow-[0_0_8px_cyan]"
          initial={{ scaleX: 0, originX: reverse ? 1 : 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, ease: "linear" }}
        />
      )}
    </div>
  );
}

function VerticalConnector({ active }: { active: boolean }) {
  return (
    <div className="hidden lg:flex w-full justify-end">
      {/* 220px matches card width to align exact center of card 4 to card 5 */}
      <div className="w-[220px] h-12 relative flex justify-center">
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] h-full bg-cyan-500/20" />
        {active && (
          <motion.div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] h-full bg-cyan-400 shadow-[0_0_8px_cyan]"
            initial={{ scaleY: 0, originY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: [0, 1, 0] }}
            transition={{ duration: 0.6, ease: "linear" }}
          />
        )}
      </div>
    </div>
  );
}

function PipelineCard({ step, active, index }: { step: Step; active: boolean; index: number }) {
  const Icon = step.icon;
  // Removed staggered offset to ensure perfectly centered horizontal connectors
  const yOffset = "";

  return (
    <motion.div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden",
        "w-full sm:w-[calc(50%-16px)] lg:w-[220px]",
        "h-[160px] p-6 rounded-[26px] shrink-0"
      )}
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: active ? "1px solid rgba(34,211,238,0.5)" : "1px solid rgba(255,255,255,0.12)",
        boxShadow: active 
          ? "inset 0 1px 1px rgba(255,255,255,0.25), 0 8px 32px rgba(0,0,0,0.3), 0 0 16px rgba(34,211,238,0.2)"
          : "inset 0 1px 1px rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.22)",
      }}
      whileHover={{
        y: -4,
        scale: 1.03,
      }}
      transition={{
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
      animate={active ? { scale: 1.04 } : { scale: 1 }}
    >
      {/* Active Sheen */}
      {active && (
        <motion.div
          className="pointer-events-none absolute -left-[100%] top-0 h-full w-[200%] skew-x-12 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
      )}

      {/* Hover State Layers */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.3)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "26px",
        }}
      />
      
      {/* Top Section */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white transition-all duration-300",
            active
              ? "bg-cyan-500/30 border border-cyan-400/50 shadow-[0_0_12px_cyan]"
              : "bg-white/5 border border-white/10"
          )}
        >
          {step.num}
        </span>
        <div
          className={cn(
            "transition-all duration-300",
            active ? "text-cyan-300" : "text-white/40 group-hover:text-white/70"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {/* Center Section */}
      <div className="relative z-10">
        <h3 className={cn(
          "font-display text-[15px] font-bold tracking-wide transition-colors duration-300",
          active ? "text-white" : "text-white/90"
        )}>
          {step.title}
        </h3>
        <p className="mt-0.5 text-[11px] font-medium text-white/50 tracking-wider truncate">
          {step.short}
        </p>
      </div>

      {/* Bottom Section */}
      <div className="h-4 mt-auto relative z-10 flex items-end">
        <AnimatePresence mode="popLayout">
          {active ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold text-cyan-400"
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              {step.action}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-medium text-white/30"
            >
              <span className="h-1 w-1 rounded-full bg-white/20" />
              WAITING
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function Workflow() {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-cycle animation (1.2s per card)
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % STEPS.length);
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <section id="workflow" className="relative py-24 sm:py-32 overflow-hidden">
      {/* Minimal Ambient Lighting */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-8">
        
        {/* Typography Header */}
        <div className="mb-16 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 mb-6"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-white/80">
              Architecture
            </span>
          </motion.div>
          
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-[clamp(48px,5vw,84px)] font-bold tracking-[-0.02em] leading-tight"
          >
            <span className="bg-gradient-to-br from-white to-blue-200/80 bg-clip-text text-transparent">
              How The AI Thinks
            </span>
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-6 max-w-[720px] text-base md:text-[17px] text-white/60 leading-[1.6]"
          >
            A living AI cognition system processing multimodal information step-by-step. 
            Watch the continuous flow from raw data ingestion to deep reasoning.
          </motion.p>
        </div>

        {/* Pipeline Container - Centered, wrapped flow */}
        <div className="flex flex-col items-center max-w-[1040px] mx-auto w-full">
          
          {/* Row 1: Cards 1 to 4 */}
          <div className="flex flex-wrap lg:flex-nowrap justify-center w-full">
            {[0, 1, 2, 3].map((i) => (
              <React.Fragment key={STEPS[i].num}>
                <PipelineCard step={STEPS[i]} active={activeIndex === i} index={i} />
                {i < 3 && <PipelineConnector active={activeIndex === i + 1} />}
              </React.Fragment>
            ))}
          </div>

          {/* Vertical Connector between Row 1 (Card 4) and Row 2 (Card 5) for Desktop */}
          <VerticalConnector active={activeIndex === 4} />

          {/* Row 2: Cards 8 to 5 (Reversed for S-curve flow on Desktop) */}
          <div className="flex flex-wrap lg:flex-nowrap justify-center w-full lg:flex-row-reverse">
            {[4, 5, 6, 7].map((i) => {
              return (
                <React.Fragment key={STEPS[i].num}>
                  <PipelineCard step={STEPS[i]} active={activeIndex === i} index={i} />
                  {i < 7 && <PipelineConnector active={activeIndex === i + 1} reverse={true} />}
                </React.Fragment>
              );
            })}
          </div>

        </div>

      </div>
    </section>
  );
}
