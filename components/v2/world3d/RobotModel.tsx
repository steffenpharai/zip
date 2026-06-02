"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Low-poly chassis suggesting the Elegoo Smart Car V4:
 *  - flat oval/rectangular base
 *  - 4 wheels
 *  - a small "head" suggesting the ultrasonic + servo
 *  - a dim cyan undercarriage glow
 *
 * Wheels spin at a rate proportional to the |v,w| magnitude. No real-time
 * wheel telemetry yet — Phase 4 hooks here.
 */
export function RobotModel({
  axes,
  yaw,
}: {
  /** -1..1 unit axes for v, w */
  axes: { v: number; w: number };
  /** Current robot yaw in radians (Phase 7+ will be real). */
  yaw?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const wheelsRef = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (group.current && yaw != null) {
      group.current.rotation.y = yaw;
    }
    if (wheelsRef.current) {
      const wheelSpin =
        Math.sign(axes.v) * (Math.abs(axes.v) + Math.abs(axes.w) * 0.5) * 6;
      wheelsRef.current.children.forEach((w, i) => {
        // alternate direction for differential turn feel
        const sgn = i % 2 === 0 ? 1 : -1;
        const turn = axes.w * 2 * sgn;
        w.rotation.x += (wheelSpin + turn) * dt;
      });
    }
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      {/* base chassis */}
      <mesh position={[0, 0.18, 0]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[1.4, 0.18, 1.85]} />
        <meshStandardMaterial
          color="#0F2030"
          metalness={0.4}
          roughness={0.45}
          emissive="#0A1A24"
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* edge stripe */}
      <mesh position={[0, 0.29, 0]}>
        <boxGeometry args={[1.42, 0.012, 1.87]} />
        <meshBasicMaterial color="#27B4CD" toneMapped={false} />
      </mesh>
      {/* top deck (electronics) */}
      <mesh position={[0, 0.36, -0.1]}>
        <boxGeometry args={[1.05, 0.12, 1.05]} />
        <meshStandardMaterial color="#091621" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* sensor head */}
      <mesh position={[0, 0.5, 0.62]}>
        <boxGeometry args={[0.5, 0.22, 0.32]} />
        <meshStandardMaterial color="#0B1822" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* "eyes" (ultrasonic) */}
      <mesh position={[-0.13, 0.5, 0.79]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 24]} />
        <meshStandardMaterial color="#1A2A36" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0.13, 0.5, 0.79]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 24]} />
        <meshStandardMaterial color="#1A2A36" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* status LED (cyan) */}
      <mesh position={[0, 0.435, -0.55]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color="#6FE0FF" toneMapped={false} />
      </mesh>
      <pointLight
        position={[0, 0.45, -0.55]}
        intensity={1.8}
        distance={0.9}
        color="#6FE0FF"
      />
      {/* undercarriage glow */}
      <pointLight
        position={[0, 0.04, 0]}
        intensity={1.2}
        distance={1.6}
        color="#27B4CD"
      />

      {/* wheels */}
      <group ref={wheelsRef}>
        <Wheel pos={[-0.78, 0.16, 0.65]} />
        <Wheel pos={[0.78, 0.16, 0.65]} />
        <Wheel pos={[-0.78, 0.16, -0.65]} />
        <Wheel pos={[0.78, 0.16, -0.65]} />
      </group>
    </group>
  );
}

function Wheel({ pos }: { pos: [number, number, number] }) {
  return (
    <group position={pos}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.16, 28]} />
        <meshStandardMaterial color="#1A1F2E" metalness={0.1} roughness={0.85} />
      </mesh>
      {/* hub */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.18, 16]} />
        <meshStandardMaterial color="#27B4CD" emissive="#27B4CD" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}
