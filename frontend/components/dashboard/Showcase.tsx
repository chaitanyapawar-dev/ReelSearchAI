"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Eye, MessageSquare } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HolographicCard } from "@/components/ui/HolographicCard";
import { fadeUp, staggerContainer } from "@/lib/motion";

function SemanticSearchDemo() {
  const [phase, setPhase] = useState(0);
  const query = "discipline motivation reel";
  const scores = [92, 78, 65];

  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % 4), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-5 space-y-3">
      <div className="relative h-9 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-3">
        <p className="text-xs leading-9 text-white/50">
          {query.slice(0, phase >= 1 ? query.length : Math.floor(phase * query.length))}
          {phase === 0 && <span className="animate-pulse">|</span>}
        </p>
        {phase === 2 && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 0.8 }}
          />
        )}
      </div>
      {scores.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-primary-blue"
              animate={{ width: phase >= 3 ? `${w}%` : "0%" }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-cyan-300/70">{phase >= 3 ? `${w}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function VisualDemo() {
  const labels = ["Scene", "Action", "Object"];
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setVisible((v) => (v + 1) % 4), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {labels.map((l, i) => (
        <motion.div
          key={l}
          className="relative overflow-hidden rounded-xl border border-violet-400/20 bg-violet-500/10 p-2.5 text-center"
          animate={{
            borderColor: visible > i ? "rgba(0,209,255,0.4)" : "rgba(139,92,246,0.2)",
            boxShadow: visible > i ? "0 0 20px rgba(91,140,255,0.2)" : "none",
          }}
        >
          <p className="text-[9px] uppercase tracking-wider text-white/45">{l}</p>
          <AnimatePresence>
            {visible > i && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-[10px] font-medium text-cyan-300"
              >
                detected
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

function ChatDemo() {
  const full = "Your library emphasizes consistency, delayed gratification, and deep work…";
  const [len, setLen] = useState(0);
  const [thinking, setThinking] = useState(true);

  useEffect(() => {
    if (thinking) {
      const t = setTimeout(() => setThinking(false), 1200);
      return () => clearTimeout(t);
    }
    if (len < full.length) {
      const t = setTimeout(() => setLen((l) => l + 1), 28);
      return () => clearTimeout(t);
    }
    const reset = setTimeout(() => {
      setLen(0);
      setThinking(true);
    }, 3000);
    return () => clearTimeout(reset);
  }, [len, thinking, full.length]);

  return (
    <div className="mt-5 space-y-2">
      <div className="rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] p-3 text-[10px] text-white/45">
        What do my reels teach about discipline?
      </div>
      <div className="rounded-2xl rounded-br-md border border-cyan-400/25 bg-cyan-500/10 p-3 text-[10px] text-cyan-100/85">
        {thinking ? (
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-cyan-400"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </span>
        ) : (
          <>
            {full.slice(0, len)}
            <span className="animate-pulse">|</span>
          </>
        )}
      </div>
    </div>
  );
}

const CARDS = [
  { title: "Semantic Search", icon: Search, Demo: SemanticSearchDemo, glow: "cyan" as const },
  { title: "Visual AI Understanding", icon: Eye, Demo: VisualDemo, glow: "violet" as const },
  { title: "AI Memory Chat", icon: MessageSquare, Demo: ChatDemo, glow: "blue" as const },
];

export default function Showcase() {
  return (
    <section className="section-cinema">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          eyebrow="Live Preview"
          title="Interactive Demo"
          subtitle="Simulated AI activity — search, vision, and conversational memory in motion."
        />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-6 md:grid-cols-3"
        >
          {CARDS.map((card, i) => {
            const Icon = card.icon;
            const Demo = card.Demo;
            return (
              <motion.div key={card.title} variants={fadeUp} custom={i * 0.12}>
                <HolographicCard className="h-full p-6" glow={card.glow}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-blue/30 to-electric-purple/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                      <Icon className="h-5 w-5 text-cyan-300" />
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-medium text-white">{card.title}</h3>
                      <motion.p
                        className="text-[10px] uppercase tracking-widest text-emerald-400/80"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        Live
                      </motion.p>
                    </div>
                  </div>
                  <Demo />
                </HolographicCard>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
