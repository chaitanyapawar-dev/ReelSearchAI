"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUp } from "@/lib/motion";

type HolographicCardProps = {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
  active?: boolean;
  glow?: "cyan" | "violet" | "blue";
};

const glowMap = {
  cyan: "from-cyan-400/30 via-blue-500/10 to-transparent",
  violet: "from-violet-400/30 via-purple-500/10 to-transparent",
  blue: "from-blue-400/30 via-indigo-500/10 to-transparent",
};

export function HolographicCard({
  children,
  className,
  hover = true,
  delay = 0,
  active = false,
  glow = "cyan",
}: HolographicCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      whileHover={
        hover
          ? {
              y: -8,
              scale: 1.02,
              rotateX: 2,
              rotateY: -2,
              transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
            }
          : undefined
      }
      className={cn(
        "group relative overflow-hidden rounded-[28px]",
        "border border-white/[0.08] bg-white/[0.04]",
        "backdrop-blur-[24px]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)]",
        "transition-[border-color,box-shadow] duration-500",
        hover && "hover:border-cyan-400/25 hover:shadow-[0_16px_64px_rgba(91,140,255,0.18),inset_0_1px_0_rgba(255,255,255,0.12)]",
        active && "border-cyan-400/35 shadow-[0_0_48px_rgba(0,209,255,0.15)]",
        className
      )}
    >
      {/* Specular top edge */}
      <div className="pointer-events-none absolute inset-x-[5%] top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />

      {/* Animated border sweep */}
      <motion.div
        className={cn(
          "pointer-events-none absolute -inset-px rounded-[28px] opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          `bg-gradient-to-br ${glowMap[glow]}`
        )}
        style={{ mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", maskComposite: "exclude", padding: 1 }}
      />

      {/* Internal glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary-blue/20 blur-3xl transition-opacity group-hover:opacity-100 opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[url('/noise.svg')] opacity-[0.04] mix-blend-soft-light" />

      {/* Light sweep on hover */}
      <motion.div
        className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/2 skew-x-12 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent opacity-0 group-hover:opacity-100"
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
      />

      <div className="relative z-[1]">{children}</div>
    </motion.div>
  );
}
