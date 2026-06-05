"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Two concentric pulsing rings centered on the robot, scaled by the most
 * recent ultrasonic reading. The outer ring sweeps outward and fades — the
 * inner ring shows the current "envelope" distance.
 *
 * cm is mapped to world units 1:1 / 100 (i.e. 1 meter = 1 unit, which is
 * what the rest of the scene is sized for).
 */
export function SonarRing({ cm }: { cm: number | null }) {
  const sweepRef = useRef<THREE.Mesh>(null);
  const envelopeRef = useRef<THREE.Mesh>(null);

  const target = cm == null ? 1.6 : Math.max(0.2, Math.min(2.5, cm / 100));
  const isCritical = cm != null && cm < 30;
  const color = isCritical ? "#FB7185" : "#27B4CD";

  useFrame(({ clock }) => {
    if (envelopeRef.current) {
      // ease toward target
      const current = envelopeRef.current.scale.x;
      const next = current + (target - current) * 0.08;
      envelopeRef.current.scale.set(next, 1, next);
      (envelopeRef.current.material as THREE.MeshBasicMaterial).color.set(color);
    }
    if (sweepRef.current) {
      // pulse: ring expands from 0.4 to 2.6 and fades
      const t = clock.elapsedTime % 2.2;
      const scale = 0.4 + (t / 2.2) * 2.2;
      sweepRef.current.scale.set(scale, 1, scale);
      const mat = sweepRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - t / 2.2) * 0.5;
      mat.color.set(color);
    }
  });

  return (
    <group position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* expanding sweep ring */}
      <mesh ref={sweepRef}>
        <ringGeometry args={[0.96, 1, 64]} />
        <meshBasicMaterial color={color} opacity={0.5} transparent depthWrite={false} />
      </mesh>
      {/* envelope ring */}
      <mesh ref={envelopeRef}>
        <ringGeometry args={[0.97, 1.0, 96]} />
        <meshBasicMaterial color={color} opacity={0.7} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}
