"use client";

import { motion } from "framer-motion";
import { Star, Copy, BookOpen } from "lucide-react";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { GITHUB_URL, DOCS_URL } from "@/lib/constants";
import { fadeUp } from "@/lib/motion";

const STACK = ["Python", "FastAPI", "Whisper", "CLIP", "ChromaDB", "Ollama", "Next.js"];

export default function OpenSource() {
  return (
    <section id="opensource" className="section-cinema">
      <div className="mx-auto max-w-3xl text-center">
        <SectionHeader
          eyebrow="Open Source"
          title="Built for Developers"
          subtitle="Fully local. Fully open-source. Built for experimentation, research, and scalable AI products."
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="flex flex-wrap justify-center gap-3"
        >
          <AnimatedButton href={GITHUB_URL} external>
            <GitHubIcon />
            View GitHub
          </AnimatedButton>
          <AnimatedButton href={GITHUB_URL} variant="ghost" external>
            <Copy className="h-4 w-4" />
            Clone Project
          </AnimatedButton>
          <AnimatedButton href={DOCS_URL} variant="ghost">
            <BookOpen className="h-4 w-4" />
            Read Documentation
          </AnimatedButton>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mt-10">
          <GlassCard hover={false} className="mx-auto max-w-sm p-6">
            <div className="flex items-center justify-center gap-3">
              <GitHubIcon className="h-8 w-8 text-white/70" />
              <div className="text-left">
                <p className="text-sm text-white/50">reel-saver-ai</p>
                <p className="flex items-center gap-1 text-lg font-semibold text-white">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  2.4k
                </p>
              </div>
            </div>
            <span className="mt-4 inline-block rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Open Source
            </span>
          </GlassCard>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mt-8 flex flex-wrap justify-center gap-2"
        >
          {STACK.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/50"
            >
              {t}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
