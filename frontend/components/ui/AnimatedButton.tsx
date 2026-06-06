"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type AnimatedButtonProps = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  className?: string;
  external?: boolean;
};

export function AnimatedButton({
  children,
  href,
  onClick,
  variant = "primary",
  className,
  external,
}: AnimatedButtonProps) {
  const base = cn(
    "relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-medium",
    variant === "primary" &&
      "border border-white/10 bg-gradient-to-r from-primary-blue via-electric-purple to-electric-purple text-white shadow-[0_0_40px_rgba(91,140,255,0.35),inset_0_1px_0_rgba(255,255,255,0.2)]",
    variant === "ghost" &&
      "border border-white/12 bg-white/[0.04] text-white/90 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/[0.08]",
    className
  );

  const motionProps = {
    whileHover: { scale: 1.05, y: -2 },
    whileTap: { scale: 0.97 },
    transition: { type: "spring" as const, stiffness: 420, damping: 24 },
  };

  const inner = (
    <>
      {variant === "primary" && (
        <motion.span
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-white/20 to-cyan-400/0"
          animate={{ x: ["-120%", "120%"] }}
          transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5 }}
        />
      )}
      <span className="relative z-[1]">{children}</span>
    </>
  );

  if (href) {
    if (external) {
      return (
        <motion.a href={href} target="_blank" rel="noopener noreferrer" className={base} {...motionProps}>
          {inner}
        </motion.a>
      );
    }
    return (
      <motion.div {...motionProps} className="inline-block">
        <Link href={href} className={base}>
          {inner}
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.button type="button" onClick={onClick} className={base} {...motionProps}>
      {inner}
    </motion.button>
  );
}
