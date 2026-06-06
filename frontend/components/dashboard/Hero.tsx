"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { HolographicCard } from "@/components/ui/HolographicCard";
import { TECH_PILLS, GITHUB_URL } from "@/lib/constants";
import { fadeUp, staggerContainer } from "@/lib/motion";
import FluidGlassLazy from "./FluidGlassLazy";
import { useMotionSafe } from "@/lib/motion";

const LENS_PROPS = {
  scale: 0.32,
  ior: 1.2,
  thickness: 8,
  chromaticAberration: 0.18,
  anisotropy: 0.02,
  transmission: 1,
  roughness: 0,
};

const holographicCards = [
  { label: "Speech", value: "Whisper", x: "8%", y: "12%" },
  { label: "Vision", value: "CLIP + BLIP", x: "auto", y: "38%", right: "6%" },
  { label: "Memory", value: "ChromaDB", x: "12%", y: "62%" },
];

export default function Hero() {
  const { reduced } = useMotionSafe();

  return (
    <section className="section-cinema relative flex min-h-screen items-center pt-24">
      <div className="mx-auto grid w-full max-w-6xl gap-16 lg:grid-cols-2 lg:items-center">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="relative z-10"
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium tracking-wide text-cyan-200/90 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            Multimodal Reel Memory Engine
          </motion.p>

          <motion.h1
            variants={fadeUp}
            custom={1}
            className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl"
          >
            A Multimodal Brain
            <br />
            <span className="text-gradient-hero">For Instagram Reels</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-7 max-w-lg text-lg leading-relaxed text-white/50"
          >
            Search speech, visuals, captions, OCR, and meaning — a local AI memory system
            that understands everything you save.
          </motion.p>

          <motion.div variants={fadeUp} custom={3} className="mt-10 flex flex-wrap gap-4">
            <AnimatedButton href="#workflow">
              Explore Workflow
              <ArrowRight className="h-4 w-4" />
            </AnimatedButton>
            <AnimatedButton href={GITHUB_URL} variant="ghost" external>
              <GitHubIcon />
              View GitHub
            </AnimatedButton>
          </motion.div>

          <motion.div variants={fadeUp} custom={4} className="mt-12 flex flex-wrap gap-2">
            {TECH_PILLS.map((pill, i) => (
              <motion.span
                key={pill}
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 3 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-white/45 backdrop-blur-md"
              >
                {pill}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto aspect-square w-full max-w-xl"
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(91,140,255,0.35),transparent_65%)] blur-[100px]" />

          <div className="relative h-full min-h-[360px] w-full md:min-h-[480px]">
            <FluidGlassLazy mode="lens" enabled={!reduced} modeProps={LENS_PROPS} />

            {!reduced &&
              Array.from({ length: 12 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="absolute h-1 w-1 rounded-full bg-cyan-300/60"
                  style={{
                    left: `${50 + 42 * Math.cos((i / 12) * Math.PI * 2)}%`,
                    top: `${50 + 42 * Math.sin((i / 12) * Math.PI * 2)}%`,
                  }}
                  animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2 + i * 0.2, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}

            {holographicCards.map((card, i) => (
              <motion.div
                key={card.label}
                className="absolute"
                style={{
                  top: card.y,
                  left: card.x !== "auto" ? card.x : undefined,
                  right: card.right,
                }}
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
              >
                <HolographicCard className="px-4 py-3" delay={i} glow={i === 1 ? "violet" : "cyan"}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{card.label}</p>
                  <p className="mt-1 text-sm font-medium text-white/90">{card.value}</p>
                </HolographicCard>
              </motion.div>
            ))}

            <motion.div
              className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/25"
              animate={{ rotate: 360 }}
              transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-400/15"
              animate={{ rotate: -360 }}
              transition={{ duration: 36, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
