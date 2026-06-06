"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, LayoutGroup } from "framer-motion";
import { GitHubIcon } from "@/components/ui/BrandIcons";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/lib/constants";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import FluidGlassLazy from "./FluidGlassLazy";
import { useMotionSafe } from "@/lib/motion";

const SECTION_IDS = ["features", "workflow", "architecture", "opensource"] as const;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("features");
  const { reduced } = useMotionSafe();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      const y = window.scrollY + 120;
      for (const id of [...SECTION_IDS].reverse()) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= y) {
          setActive(id);
          break;
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0, filter: "blur(8px)" }}
      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-5 md:px-6"
    >
      <nav
        className={cn(
          "liquid-glass-nav relative flex w-full max-w-5xl items-center justify-between px-4 py-2.5 md:px-6 md:py-3",
          "transition-all duration-500",
          scrolled && "scale-[0.98] shadow-[0_12px_48px_rgba(91,140,255,0.15)]"
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full opacity-50">
          <FluidGlassLazy mode="bar" enabled={!reduced} staticPosition className="!h-full" />
        </div>

        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <motion.span
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-cyan via-primary-blue to-electric-purple"
            animate={{
              boxShadow: [
                "0 0 20px rgba(91,140,255,0.45)",
                "0 0 36px rgba(0,209,255,0.55)",
                "0 0 20px rgba(91,140,255,0.45)",
              ],
            }}
            transition={{ duration: 3.5, repeat: Infinity }}
          >
            <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_white]" />
          </motion.span>
          <span className="font-display text-sm font-semibold tracking-[0.12em] text-white md:text-[15px]">
            REEL SAVER AI
          </span>
        </Link>

        <LayoutGroup>
          <ul className="relative z-10 hidden items-center gap-1 md:flex">
            {NAV_LINKS.filter((l) => !("external" in l && l.external)).map((link) => {
              const id = link.href.replace("#", "");
              const isActive = active === id;
              return (
                <li key={link.label} className="relative">
                  <a
                    href={link.href}
                    onClick={() => setActive(id)}
                    className={cn(
                      "relative z-10 block rounded-full px-4 py-2 text-sm transition-all duration-300",
                      isActive ? "text-white" : "text-white/50 hover:text-white/90 hover:scale-105"
                    )}
                  >
                    {link.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/[0.08] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                  </a>
                </li>
              );
            })}
            <li>
              <a
                href={NAV_LINKS.find((l) => "external" in l)?.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full px-4 py-2 text-sm text-white/50 transition hover:text-white hover:drop-shadow-[0_0_8px_rgba(91,140,255,0.6)]"
              >
                GitHub
              </a>
            </li>
          </ul>
        </LayoutGroup>

        <div className="relative z-10 flex items-center gap-2">
          <AnimatedButton href="/app" className="hidden sm:inline-flex text-sm">
            Launch App
          </AnimatedButton>
          <a
            href="#opensource"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-md transition hover:border-cyan-400/30 hover:shadow-[0_0_20px_rgba(91,140,255,0.25)] md:hidden"
            aria-label="GitHub"
          >
            <GitHubIcon />
          </a>
        </div>
      </nav>
    </motion.header>
  );
}
