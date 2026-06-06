"use client";

import { useEffect, useState } from "react";
import { motion, useSpring } from "framer-motion";

export default function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const x = useSpring(0, { stiffness: 120, damping: 28 });
  const y = useSpring(0, { stiffness: 120, damping: 28 });

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setEnabled(mq.matches);
    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ x, y }}
      aria-hidden
    >
      <div
        className="absolute -left-[280px] -top-[280px] h-[560px] w-[560px] rounded-full opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(91,140,255,0.22) 0%, rgba(123,97,255,0.12) 35%, transparent 70%)",
        }}
      />
    </motion.div>
  );
}
