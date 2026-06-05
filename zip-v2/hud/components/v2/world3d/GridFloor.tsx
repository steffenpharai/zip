"use client";

import { Grid } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/**
 * The "infinite-feeling" cockpit floor — two layered drei Grids (fine + coarse)
 * with cyan accents fading to dark. Below it, a faint horizon glow plane.
 */
export function GridFloor() {
  const horizonRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (horizonRef.current) {
      const t = clock.elapsedTime;
      // very subtle breathing
      (horizonRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.18 + Math.sin(t * 0.5) * 0.03;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <Grid
        args={[60, 60]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#173B4D"
        sectionSize={2.5}
        sectionThickness={1.0}
        sectionColor="#27B4CD"
        fadeDistance={28}
        fadeStrength={1.4}
        followCamera={false}
        infiniteGrid
      />
      {/* horizon glow */}
      <mesh ref={horizonRef} position={[0, 0.02, -10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[60, 12]} />
        <meshBasicMaterial color="#27B4CD" opacity={0.18} transparent />
      </mesh>
    </group>
  );
}
