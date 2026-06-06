"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { Cpu } from "lucide-react";

const INPUTS = ["Instagram Reel Stream", "Speech Layer", "Visual Frames", "Caption Metadata"];
const OUTPUTS = ["Semantic Search Results", "Visual Similarity Matching", "Conversational AI Retrieval", "Ranked Memory Responses"];

const TECH = ["FastAPI", "Whisper", "EasyOCR", "BLIP", "CLIP", "ChromaDB", "Ollama", "Next.js"];

function FlowLine({ vertical = false }: { vertical?: boolean }) {
  // Mobile uses vertical lines, desktop uses horizontal
  // Flow is always LEFT -> CENTER -> RIGHT or TOP -> BOTTOM
  return (
    <div className={`relative ${vertical ? 'w-[1px] h-16 my-4 mx-auto' : 'h-[1px] w-[60px] lg:w-[100px] mx-2'} flex-shrink-0`}>
      {/* Neural Beam Line */}
      <div 
        className="absolute inset-0"
        style={{
          background: vertical 
            ? "linear-gradient(180deg, transparent, rgba(120,200,255,0.8), transparent)"
            : "linear-gradient(90deg, transparent, rgba(120,200,255,0.8), transparent)",
          filter: "blur(0.5px)"
        }}
      />
      
      {/* Moving Energy Particle */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: "6px",
          height: "6px",
          backgroundColor: "#fff",
          boxShadow: "0 0 12px rgba(120,220,255,0.9)",
          top: vertical ? 0 : "50%",
          left: vertical ? "50%" : 0,
          marginTop: vertical ? 0 : "-3px",
          marginLeft: vertical ? "-3px" : 0,
        }}
        animate={{
          [vertical ? "top" : "left"]: ["0%", "100%"]
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear"
        }}
      />
    </div>
  );
}

function NodeCard({ text, isOutput }: { text: string; isOutput?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: isOutput ? 20 : -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      className="flex items-center justify-center h-[64px] rounded-[22px] px-8 transition-all duration-300 w-full lg:w-[260px]"
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        backgroundColor: "rgba(255,255,255,0.045)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 0 20px rgba(90,120,255,0.08), inset 0 1px 1px rgba(255,255,255,0.12)",
      }}
      whileHover={{
        y: -3,
        borderColor: "rgba(140,180,255,0.28)",
      }}
    >
      <p className="text-white/[0.88] font-medium tracking-[-0.02em] text-sm sm:text-base text-center">
        {text}
      </p>
    </motion.div>
  );
}

export default function Architecture() {
  return (
    <section id="architecture" className="relative w-full max-w-7xl mx-auto px-8 py-32 section-cinema overflow-hidden">
      
      {/* Title & Typography */}
      <div className="mb-24 flex flex-col items-center text-center relative z-20">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-[48px] md:text-[72px] font-[700] tracking-[-0.04em] leading-[0.92]"
          style={{
            background: "linear-gradient(to bottom, rgba(255,255,255,1), rgba(180,190,255,0.8))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          AI Memory Engine
        </motion.h2>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-[16px] md:text-[18px] text-white/55 leading-relaxed max-w-3xl mx-auto"
        >
          A multimodal cognition pipeline that transforms raw reels into searchable memory, semantic intelligence, and contextual reasoning.
        </motion.p>
      </div>

      {/* Main Layout Container */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="flex flex-col lg:flex-row items-center justify-center w-full max-w-6xl mx-auto relative z-10"
      >
        
        {/* Left — Inputs */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4 w-full lg:w-auto z-20">
          {INPUTS.map((item) => (
            <NodeCard key={item} text={item} />
          ))}
        </motion.div>

        {/* Desktop Left-to-Center Flow */}
        <div className="hidden lg:flex shrink-0">
          <FlowLine />
        </div>
        {/* Mobile Top-to-Center Flow */}
        <div className="flex lg:hidden shrink-0">
          <FlowLine vertical />
        </div>

        {/* Center — Core */}
        <motion.div variants={fadeUp} className="relative flex flex-col items-center justify-center py-10 lg:py-0 shrink-0 z-10">
          
          {/* Subtle Neural Background Particles behind Architecture */}
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(120,180,255,0.15) 0%, transparent 60%)",
              filter: "blur(80px)",
            }}
          />

          {/* Animated Orbital Rings */}
          <motion.div
            className="absolute w-[300px] h-[300px] md:w-[400px] md:h-[400px] rounded-full border pointer-events-none"
            style={{ borderColor: "rgba(120,180,255,0.18)" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute w-[260px] h-[260px] md:w-[340px] md:h-[340px] rounded-full border pointer-events-none"
            style={{ borderColor: "rgba(120,180,255,0.18)" }}
            animate={{ rotate: -360 }}
            transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
          />

          {/* Core Processing Unit */}
          <div
            className="relative flex flex-col items-center justify-center w-[180px] h-[180px] md:w-[240px] md:h-[240px] rounded-full z-30"
            style={{
              background: "radial-gradient(circle at 30% 30%, rgba(120,180,255,0.35), transparent 40%), linear-gradient(135deg, rgba(80,120,255,0.18), rgba(140,80,255,0.22))",
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 0 80px rgba(80,120,255,0.18), 0 0 120px rgba(120,80,255,0.12), inset 0 1px 1px rgba(255,255,255,0.15)",
            }}
          >
            <Cpu size={42} strokeWidth={1.5} className="text-cyan-300 mb-2 md:mb-3" />
            <p className="font-display font-semibold text-white tracking-tight text-sm md:text-base">
              AI Processing Core
            </p>
            <p className="mt-1 text-[10px] md:text-[11px] text-white/50 tracking-wider uppercase text-center px-4">
              Multimodal reasoning engine
            </p>
          </div>
        </motion.div>

        {/* Desktop Center-to-Right Flow */}
        <div className="hidden lg:flex shrink-0">
          <FlowLine />
        </div>
        {/* Mobile Center-to-Bottom Flow */}
        <div className="flex lg:hidden shrink-0">
          <FlowLine vertical />
        </div>

        {/* Right — Outputs */}
        <motion.div variants={fadeUp} className="flex flex-col gap-4 w-full lg:w-auto z-20">
          {OUTPUTS.map((item) => (
            <NodeCard key={item} text={item} isOutput />
          ))}
        </motion.div>
      </motion.div>

      {/* Tech Stack Pills */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mt-24 flex flex-wrap justify-center gap-3 relative z-20"
      >
        {TECH.map((t) => (
          <motion.span
            key={t}
            className="rounded-full px-4 py-2 text-sm text-white/45 transition-colors duration-300 cursor-default"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            whileHover={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.8)",
            }}
          >
            {t}
          </motion.span>
        ))}
      </motion.div>

    </section>
  );
}
