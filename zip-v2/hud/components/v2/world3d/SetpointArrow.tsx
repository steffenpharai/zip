"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * 3D arrow showing the current drive setpoint vector. Lives in front of the
 * robot, scales/rotates with the unit axes. Glow intensifies with magnitude.
 */
export function SetpointArrow({ axes }: { axes: { v: number; w: number } }) {
  const group = useRef<THREE.Group>(null);
  const targetRef = useRef({ len: 0, yaw: 0 });

  useMemo(() => {
    const mag = Math.hypot(axes.v, axes.w);
    targetRef.current.len = Math.min(2.4, mag * 2.5);
    // Arrow points along combined vector — w is right, v is forward
    targetRef.current.yaw = Math.atan2(axes.w, Math.max(0.001, axes.v));
    return null;
  }, [axes.v, axes.w]);

  useFrame(() => {
    if (!group.current) return;
    const t = targetRef.current;
    const len = group.current.scale.z + (t.len - group.current.scale.z) * 0.18;
    group.current.scale.set(0.4, 0.4, Math.max(0.001, len));
    group.current.rotation.y = group.current.rotation.y + (t.yaw - group.current.rotation.y) * 0.18;
  });

  // Hide if magnitude is near zero
  const visible = Math.hypot(axes.v, axes.w) > 0.02;

  return (
    <group ref={group} position={[0, 0.32, 0]} visible={visible}>
      {/* shaft */}
      <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1, 16]} />
        <meshBasicMaterial color="#2EE59D" toneMapped={false} />
      </mesh>
      {/* head */}
      <mesh position={[0, 0, 1]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.28, 18]} />
        <meshBasicMaterial color="#2EE59D" toneMapped={false} />
      </mesh>
      {/* halo */}
      <pointLight position={[0, 0.0, 0.6]} intensity={2.5} distance={1.4} color="#2EE59D" />
    </group>
  );
}
