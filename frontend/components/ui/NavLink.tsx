// frontend/components/ui/NavLink.tsx

"use client";
import React, { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}

export default function NavLink({ href, children, active }: NavLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const relX = e.clientX - (rect.left + rect.width / 2);
    const relY = e.clientY - (rect.top + rect.height / 2);
    const strength = 0.08; // magnetic strength
    x.set(relX * strength);
    y.set(relY * strength);
  };
  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const translate = useMotionTemplate`${x}px ${y}px`;

  return (
    <motion.a
      href={href}
      ref={ref}
      className={`relative px-4 py-2 rounded-full text-sm transition-all duration-300 ${active ? "bg-white/10 border border-white/15 shadow-[0_0_20px_rgba(59,130,255,0.18)]" : "text-white/70 hover:text-white"}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ translateX: x, translateY: y }}
      whileHover={{ scale: 1.04, color: "#fff" }}
    >
      {children}
      {/* underline beam */}
      <span className="absolute left-0 bottom-0 h-0.5 w-full bg-gradient-to-r from-cyan-400 via-purple-500 to-cyan-400 scale-x-0 origin-left transition-transform duration-300 ease-out" />
    </motion.a>
  );
}
