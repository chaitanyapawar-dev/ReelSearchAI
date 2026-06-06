"use client";

import React, { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Plane } from "@react-three/drei";

/**
 * Simple FluidGlass refraction layer.
 * Renders a semi‑transparent plane with transmission, thickness and
 * chromatic‑aberration parameters matching the design spec.
 */
export default function FluidGlass({ mode = "bar", barProps = {} }) {
  const {
    scale = 0.22,
    transmission = 1,
    thickness = 18,
    ior = 1.18,
    roughness = 0,
    chromaticAberration = 0.08,
    anisotropy = 0.02,
  } = barProps;

  const materialProps = useMemo(
    () => ({
      transmission,
      thickness,
      ior,
      roughness,
      envMapIntensity: 1,
    }),
    [transmission, thickness, ior, roughness]
  );

  return (
    <Canvas
      frameloop="never"
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <Plane args={[scale, 0.2]} rotation={[0, 0, 0]}>
          <meshPhysicalMaterial attach="material" {...materialProps} />
        </Plane>
      </Suspense>
    </Canvas>
  );
}
