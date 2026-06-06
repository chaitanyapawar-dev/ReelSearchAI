/* eslint-disable react/no-unknown-property */
"use client";

/**
 * Simplified FluidGlass — adapted from React Bits (MIT)
 * https://reactbits.dev/components/fluid-glass
 */
import * as THREE from "three";
import { memo, useEffect, useRef, useState } from "react";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import { MeshTransmissionMaterial, useFBO, useGLTF } from "@react-three/drei";
import { easing } from "maath";
import { cn } from "@/lib/utils";

useGLTF.preload("/assets/3d/lens.glb");
useGLTF.preload("/assets/3d/bar.glb");
useGLTF.preload("/assets/3d/cube.glb");

export type FluidGlassMode = "lens" | "bar" | "cube";

type ModeProps = {
  scale?: number;
  ior?: number;
  thickness?: number;
  anisotropy?: number;
  chromaticAberration?: number;
  transmission?: number;
  roughness?: number;
  color?: string;
  attenuationColor?: string;
  attenuationDistance?: number;
};

type FluidGlassWrapperProps = {
  mode?: FluidGlassMode;
  className?: string;
  modeProps?: ModeProps;
  /** Disable pointer follow (mobile / reduced motion) */
  staticPosition?: boolean;
};

const MODE_CONFIG = {
  lens: { glb: "/assets/3d/lens.glb", geometryKey: "Cylinder", lockToBottom: false },
  cube: { glb: "/assets/3d/cube.glb", geometryKey: "Cube", lockToBottom: false },
  bar: { glb: "/assets/3d/bar.glb", geometryKey: "Cube", lockToBottom: true },
} as const;

function PortalBackdrop() {
  return (
    <>
      <mesh position={[0, 0, -2]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial color="#0a0f2e" />
      </mesh>
      <mesh position={[2, 1, -1]}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.35} />
      </mesh>
      <mesh position={[-2.5, -0.5, -1]}>
        <sphereGeometry args={[1.8, 32, 32]} />
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.28} />
      </mesh>
    </>
  );
}

const GlassMesh = memo(function GlassMesh({
  mode,
  modeProps = {},
  staticPosition = false,
}: {
  mode: FluidGlassMode;
  modeProps?: ModeProps;
  staticPosition?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const config = MODE_CONFIG[mode];
  const { nodes } = useGLTF(config.glb);
  const buffer = useFBO();
  const { viewport } = useThree();
  const [scene] = useState(() => new THREE.Scene());
  const geoWidthRef = useRef(1);

  useEffect(() => {
    const node = nodes[config.geometryKey as keyof typeof nodes] as THREE.Mesh | undefined;
    const geo = node?.geometry;
    if (!geo) return;
    geo.computeBoundingBox();
    geoWidthRef.current = geo.boundingBox!.max.x - geo.boundingBox!.min.x || 1;
  }, [nodes, config.geometryKey]);

  useFrame((state, delta) => {
    const { gl, viewport: vp, pointer, camera } = state;
    const v = vp.getCurrentViewport(camera, [0, 0, 15]);

    const followPointer = !staticPosition && !config.lockToBottom;
    const destX = followPointer ? (pointer.x * v.width) / 2 : 0;
    const destY = config.lockToBottom
      ? -v.height / 2 + 0.15
      : followPointer
        ? (pointer.y * v.height) / 2
        : 0;

    easing.damp3(ref.current.position, [destX, destY, 15], 0.15, delta);

    if (modeProps.scale == null) {
      const maxWorld = v.width * (mode === "bar" ? 0.95 : 0.55);
      const desired = maxWorld / geoWidthRef.current;
      const cap = mode === "lens" ? 0.22 : mode === "cube" ? 0.18 : 0.12;
      ref.current.scale.setScalar(Math.min(cap, desired));
    }

    gl.setRenderTarget(buffer);
    gl.setClearColor(0x050816, 1);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
  });

  const {
    scale,
    ior = 1.15,
    thickness = mode === "bar" ? 10 : 5,
    anisotropy = 0.01,
    chromaticAberration = 0.1,
    transmission = 1,
    roughness = 0,
    color = "#ffffff",
    attenuationColor = "#ffffff",
    attenuationDistance = 0.25,
    ...extraMat
  } = modeProps;

  const defaultBarMat =
    mode === "bar"
      ? { transmission, roughness, color, attenuationColor, attenuationDistance }
      : {};

  return (
    <>
      {createPortal(<PortalBackdrop />, scene)}
      <mesh scale={[viewport.width, viewport.height, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} transparent />
      </mesh>
      <mesh
        ref={ref}
        scale={scale ?? (mode === "lens" ? 0.2 : mode === "cube" ? 0.16 : 0.1)}
        rotation-x={Math.PI / 2}
        geometry={(nodes[config.geometryKey as keyof typeof nodes] as THREE.Mesh | undefined)?.geometry}
      >
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={ior}
          thickness={thickness}
          anisotropy={anisotropy}
          chromaticAberration={chromaticAberration}
          {...defaultBarMat}
          {...extraMat}
        />
      </mesh>
    </>
  );
});

export default function FluidGlassWrapper({
  mode = "lens",
  className,
  modeProps,
  staticPosition = false,
}: FluidGlassWrapperProps) {
  return (
    <div className={cn("absolute inset-0 h-full w-full", className)}>
      <Canvas
        camera={{ position: [0, 0, 20], fov: 15 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        style={{ background: "transparent" }}
      >
        <GlassMesh mode={mode} modeProps={modeProps} staticPosition={staticPosition} />
      </Canvas>
    </div>
  );
}
