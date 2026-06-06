"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUp } from "@/lib/motion";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  className?: string;
  id?: string;
  eyebrow?: string;
};

export function SectionHeader({ title, subtitle, className, id, eyebrow }: SectionHeaderProps) {
  return (
    <motion.div
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={fadeUp}
      className={cn("mb-16 text-center md:mb-20", className)}
    >
      {eyebrow && (
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-accent-cyan/80">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/45 md:text-lg">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
