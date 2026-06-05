"use client";

import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

import { GridFloor } from "./world3d/GridFloor";
import { RobotModel } from "./world3d/RobotModel";
import { SetpointArrow } from "./world3d/SetpointArrow";
import { SonarRing } from "./world3d/SonarRing";

/**
 * The hero element: a R3F canvas showing the robot in a void, on a cyan
 * grid floor, with a pulsing sonar ring and a green setpoint arrow.
 *
 * Phase 2 props: axes + ultrasonic. Future: pose, sparse SLAM points,
 * detected items, planned path.
 */
export function WorldView3D({
  axes,
  ultrasonicCm,
}: {
  axes: { v: number; w: number };
  ultrasonicCm: number | null;
}) {
  return (
    <Canvas
      shadows={false}
      camera={{ position: [3.4, 2.6, 4.6], fov: 36 }}
      dpr={[1, 1.7]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: true,
      }}
      style={{ background: "transparent" }}
    >
      {/* lighting */}
      <ambientLight intensity={0.18} color="#7FB8C9" />
      <directionalLight position={[3, 6, 4]} intensity={0.7} color="#BFE6F0" />
      <directionalLight position={[-4, 2, -2]} intensity={0.25} color="#27B4CD" />

      {/* scene */}
      <GridFloor />
      <SonarRing cm={ultrasonicCm} />
      <SetpointArrow axes={axes} />
      <RobotModel axes={axes} />

      {/* atmospheric fog at horizon */}
      <fog attach="fog" args={["#050B11", 6, 22]} />

      {/* post fx */}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={0.55}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.18}
          blendFunction={BlendFunction.SCREEN}
          mipmapBlur
        />
        <Vignette
          eskil={false}
          offset={0.2}
          darkness={0.78}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>
    </Canvas>
  );
}
