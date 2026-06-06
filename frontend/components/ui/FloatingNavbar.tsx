"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/#architecture", label: "Architecture" },
  { href: "/#intelligence", label: "Intelligence" },
  { href: "/#demo", label: "Demo" },
  { href: "https://github.com/chaitanyapawar/REEL-SAVER-AI", label: "GitHub", external: true },
];

export default function FloatingNavbar() {
  const [activeSection, setActiveSection] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const sections = ["features", "workflow", "architecture", "intelligence", "demo"];
      const scrollY = window.scrollY + 120;
      for (const id of [...sections].reverse()) {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollY) {
          setActiveSection(id);
          return;
        }
      }
      setActiveSection("");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* ─── Single navbar fixed at top ─── */}
      <header
        className="fixed left-0 right-0 top-0 z-[100] flex justify-center px-4 pt-5 pointer-events-none"
        role="banner"
      >
        <nav
          className="pointer-events-auto w-full relative"
          style={{ maxWidth: "min(92%, 1400px)" }}
        >
          {/* Glass shell */}
          <div
            className="relative flex h-[78px] w-full items-center rounded-full px-6"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.11), rgba(255,255,255,0.04))",
              backdropFilter: "blur(30px) saturate(180%)",
              WebkitBackdropFilter: "blur(30px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow:
                "inset 0 1px 1px rgba(255,255,255,0.15), 0 10px 40px rgba(0,0,0,0.35), 0 0 80px rgba(82,39,255,0.18)",
            }}
          >
            {/* Inner top-sheen */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
              }}
            />

            {/* ─── 3-column grid: logo | links | cta ─── */}
            <div className="grid w-full items-center" style={{ gridTemplateColumns: "220px 1fr 220px" }}>

              {/* LEFT: Logo */}
              <Link href="/" className="flex items-center gap-3 group">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: "radial-gradient(circle at 35% 35%, #7CB8FF, #6E5BFF)",
                    boxShadow: "0 0 20px rgba(110,91,255,0.45), 0 0 8px rgba(124,184,255,0.3)",
                  }}
                >
                  <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                </span>
                <span className="flex flex-col">
                  <span
                    className="font-semibold tracking-widest text-white text-[13px]"
                    style={{ fontFamily: "var(--font-display, sans-serif)" }}
                  >
                    REEL SAVER AI
                  </span>
                  <span className="text-[10px] tracking-wide" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Multimodal Intelligence
                  </span>
                </span>
              </Link>

              {/* CENTER: Nav links — mathematically centered */}
              <ul className="hidden md:flex items-center justify-center gap-1">
                {NAV_LINKS.map((link) => {
                  const sectionId = link.href.replace("/#", "").replace("https://github.com/chaitanyapawar/REEL-SAVER-AI", "github");
                  const isActive = activeSection === sectionId;
                  return (
                    <li key={link.label} className="relative">
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        onClick={() => !link.external && setActiveSection(sectionId)}
                        className={cn(
                          "relative block rounded-full px-4 py-2 text-sm font-medium transition-all duration-300",
                          isActive
                            ? "text-white"
                            : "text-white/60 hover:text-white hover:scale-[1.04]"
                        )}
                        style={{
                          textShadow: isActive ? "0 0 12px rgba(110,168,255,0.6)" : undefined,
                        }}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="nav-active-pill"
                            className="absolute inset-0 -z-10 rounded-full"
                            style={{
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.12)",
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          />
                        )}
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>

              {/* RIGHT: CTA */}
              <div className="flex items-center justify-end gap-3">
                <motion.a
                  href="/app"
                  className="hidden sm:flex items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{
                    height: "44px",
                    padding: "0 24px",
                    background: "linear-gradient(135deg, #6EA8FF, #7C4DFF)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 24px rgba(110,168,255,0.35)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  whileHover={{ scale: 1.03, boxShadow: "0 0 36px rgba(110,168,255,0.5)" }}
                  whileTap={{ scale: 0.97 }}
                >
                  Launch App
                </motion.a>

                {/* Mobile hamburger */}
                <button
                  className="flex md:hidden h-9 w-9 items-center justify-center rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  onClick={() => setMobileOpen((o) => !o)}
                  aria-label="Toggle menu"
                >
                  <span className="sr-only">Menu</span>
                  <div className="flex flex-col gap-1.5">
                    <span
                      className={cn(
                        "block h-[1.5px] w-5 bg-white/80 transition-all duration-300 origin-center",
                        mobileOpen && "rotate-45 translate-y-[4.5px]"
                      )}
                    />
                    <span
                      className={cn(
                        "block h-[1.5px] w-5 bg-white/80 transition-all duration-300",
                        mobileOpen && "opacity-0"
                      )}
                    />
                    <span
                      className={cn(
                        "block h-[1.5px] w-5 bg-white/80 transition-all duration-300 origin-center",
                        mobileOpen && "-rotate-45 -translate-y-[4.5px]"
                      )}
                    />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* ─── Mobile dropdown ─── */}
          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                key="mobile-menu"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mt-2 rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(20,14,50,0.92), rgba(10,8,30,0.95))",
                  backdropFilter: "blur(30px) saturate(180%)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
                }}
              >
                <ul className="flex flex-col py-3 px-2">
                  {NAV_LINKS.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        onClick={() => setMobileOpen(false)}
                        className="block rounded-xl px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/6 transition-all duration-200"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                  <li className="mt-2 px-2">
                    <a
                      href="/app"
                      className="flex items-center justify-center rounded-full py-3 text-sm font-semibold text-white"
                      style={{
                        background: "linear-gradient(135deg, #6EA8FF, #7C4DFF)",
                      }}
                      onClick={() => setMobileOpen(false)}
                    >
                      Launch App
                    </a>
                  </li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      </header>

      {/* Subtle cursor reactive glow — very low opacity */}
      <CursorAura />
    </>
  );
}

// Lightweight inline cursor aura — no separate import needed
function CursorAura() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (ref.current) {
        ref.current.style.transform = `translate(${e.clientX - 280}px, ${e.clientY - 280}px)`;
      }
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-[1] h-[560px] w-[560px] rounded-full"
      style={{
        background:
          "radial-gradient(circle, rgba(91,140,255,0.12) 0%, rgba(123,77,255,0.07) 40%, transparent 70%)",
        willChange: "transform",
      }}
      aria-hidden
    />
  );
}
