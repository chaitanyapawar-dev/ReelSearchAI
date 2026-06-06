"use client";

import { motion } from "framer-motion";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Mic, ScanText, Boxes, BrainCircuit, MessageSquare, Captions, LucideIcon } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  points: string[];
  className: string;
  glow: "cyan" | "violet" | "blue";
  size: "large" | "medium" | "small";
  hasAmbientGlow?: boolean;
};

const FEATURES: Feature[] = [
  {
    icon: Mic,
    title: "Audio Intelligence",
    points: ["Speech transcription", "Multilingual understanding"],
    className: "md:col-span-2 md:row-span-1 min-h-[200px]",
    glow: "cyan",
    size: "large",
  },
  {
    icon: ScanText,
    title: "OCR Vision",
    points: ["On-screen text", "Subtitles & overlays"],
    className: "md:col-span-1 min-h-[180px]",
    glow: "violet",
    size: "medium",
    hasAmbientGlow: true,
  },
  {
    icon: Boxes,
    title: "Scene Understanding",
    points: ["Actions & objects", "Visual context"],
    className: "md:col-span-1 min-h-[180px]",
    glow: "blue",
    size: "medium",
  },
  {
    icon: BrainCircuit,
    title: "Semantic Memory",
    points: ["Contextual retrieval", "Meaning-based search"],
    className: "md:col-span-2 min-h-[200px]",
    glow: "violet",
    size: "large",
    hasAmbientGlow: true,
  },
  {
    icon: MessageSquare,
    title: "Conversational RAG",
    points: ["Natural questions", "AI summaries"],
    className: "md:col-span-1 min-h-[160px]",
    glow: "cyan",
    size: "small",
  },
  {
    icon: Captions,
    title: "Caption Intelligence",
    points: ["Hashtags", "Creator metadata"],
    className: "md:col-span-2 min-h-[160px]",
    glow: "blue",
    size: "small",
  },
];

export default function BentoFeatures() {
  return (
    <section id="features" className="relative section-cinema py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <SectionHeader
          eyebrow="Capabilities"
          title="AI That Understands Everything"
          subtitle="Multimodal capability matrix — every signal in your reels becomes searchable memory."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 gap-6 md:grid-cols-3 items-stretch"
        >
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                variants={fadeUp}
                custom={i * 0.08}
                className={cn("relative group flex flex-col h-full", f.className)}
              >
                {/* Subtle Ambient Glow Behind Important Cards */}
                {f.hasAmbientGlow && (
                  <div className="absolute inset-0 bg-cyan-500/10 blur-3xl opacity-40 pointer-events-none rounded-[28px]" />
                )}

                <div
                  className="relative flex h-full flex-col justify-between p-6 md:p-8 rounded-[28px] overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:border-cyan-300/30 hover:bg-white/[0.08]"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(30px)",
                    WebkitBackdropFilter: "blur(30px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow:
                      "0 0 0 1px rgba(255,255,255,0.04) inset, 0 10px 40px rgba(0,0,0,0.25), 0 0 50px rgba(72,125,255,0.12)",
                  }}
                >
                  {/* Premium Top Reflection Layer */}
                  <div 
                    className="absolute top-0 left-[-40%] w-[80%] h-[1px] opacity-50"
                    style={{
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)"
                    }}
                  />

                  <div>
                    <div className="flex items-start justify-between">
                      
                      {/* Premium Futuristic Icon Container */}
                      <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl flex items-center justify-center shadow-[0_0_20px_rgba(0,255,255,0.12)]">
                        <Icon className="w-5 h-5 text-cyan-200 opacity-90" />
                      </div>

                      {/* Active Status Badge */}
                      <motion.span
                        className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                      >
                        <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,113,0.8)]" />
                        Active
                      </motion.span>
                    </div>
                    
                    {/* Typography Hierarchy */}
                    <h3 className="mt-6 font-display font-semibold tracking-tight text-white text-xl">
                      {f.title}
                    </h3>
                  </div>
                  
                  <ul className="mt-4 space-y-2">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-center gap-2.5 text-sm leading-relaxed text-white/55">
                        <span className="h-px w-3 bg-gradient-to-r from-cyan-400/60 to-transparent" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
