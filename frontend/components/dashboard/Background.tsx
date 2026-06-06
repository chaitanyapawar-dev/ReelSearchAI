"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useMotionSafe } from "@/lib/motion";

const Grainient = dynamic(() => import("@/components/backgrounds/Grainient"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-void" />,
});

export default function Background() {
  const { reduced } = useMotionSafe();

  return (
    <div className="pointer-events-none fixed inset-0 -z-50 overflow-hidden bg-void">
      {/* Layer 1 — Grainient */}
      {!reduced && (
        <div className="absolute inset-0">
          <Grainient
            color1="#5B8CFF"
            color2="#7B61FF"
            color3="#030712"
            timeSpeed={0.15}
            grainAmount={0.08}
            grainScale={3}
            grainAnimated
            warpStrength={0.8}
            warpAmplitude={30}
            blendSoftness={0.3}
            saturation={1.4}
            contrast={1.2}
            zoom={1.1}
          />
        </div>
      )}

      {reduced && <div className="absolute inset-0 bg-gradient-to-b from-void via-void-deep to-[#030712]" />}

      {/* Layer 2 — Radial atmospheric glow */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(91,140,255,0.18), transparent 40%),
            radial-gradient(circle at 80% 30%, rgba(123,97,255,0.18), transparent 40%),
            radial-gradient(circle at 50% 80%, rgba(0,209,255,0.08), transparent 50%)
          `,
        }}
      />

      {/* Layer 3 — Noise texture */}
      <div className="noise-overlay absolute inset-0" />

      {/* Layer 4 — Floating blur orbs */}
      {!reduced && (
        <>
          <motion.div
            className="absolute -left-40 top-[15%] h-[420px] w-[420px] rounded-full bg-primary-blue/25 blur-[120px]"
            animate={{ x: [0, 50, 0], y: [0, -40, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -right-32 top-[25%] h-[380px] w-[380px] rounded-full bg-electric-purple/25 blur-[110px]"
            animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-[10%] left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-accent-cyan/15 blur-[100px]"
            animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.65, 0.35] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}
    </div>
  );
}
