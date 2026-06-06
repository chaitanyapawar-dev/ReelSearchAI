"use client";

import dynamic from "next/dynamic";
import type { FluidGlassMode } from "./FluidGlassWrapper";
import { cn } from "@/lib/utils";

const FluidGlass = dynamic(() => import("./FluidGlassWrapper"), {
  ssr: false,
  loading: () => null,
});

type ModeProps = {
  scale?: number;
  ior?: number;
  thickness?: number;
  chromaticAberration?: number;
  anisotropy?: number;
  transmission?: number;
  roughness?: number;
};

type Props = {
  mode: FluidGlassMode;
  className?: string;
  staticPosition?: boolean;
  enabled?: boolean;
  modeProps?: ModeProps;
};

export default function FluidGlassLazy({
  mode,
  className,
  staticPosition,
  enabled = true,
  modeProps,
}: Props) {
  if (!enabled) return null;
  return (
    <FluidGlass
      mode={mode}
      className={className}
      staticPosition={staticPosition}
      modeProps={modeProps}
    />
  );
}
