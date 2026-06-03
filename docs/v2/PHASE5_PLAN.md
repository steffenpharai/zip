# Phase 5 — Mapping, localization & trajectory planning (fusion-first)

Status: **planned**. This supersedes the earlier "MASt3R-SLAM" lock — see
"Decision reversal" below.

## Goal

The robot drives through indoor rooms, builds a map it can plan paths on, and
shows that map + its pose + planned trajectories live in the HUD. The map must
be good enough to **plan and drive a trajectory**, not just look pretty.

## Guiding principle

The capability that gives trajectory planning is the **occupancy map + planner
layer built on top of the pose/point-cloud** — and that layer is
*sensor-independent*. So we build it once, feed it from the cheap sensors we
already have, and swap/upgrade the front-end later without touching it.

Build order is therefore **easy + useful first, heavy + accurate last**: get a
working navigate-the-room loop from the existing sensors before bringing the
GPU / PyTorch / visual SLAM online.

## What we already have (don't buy anything to start)

| Sensor | Gives | Weakness | Role |
| --- | --- | --- | --- |
| MPU6050 IMU (on UNO, `imu.getYaw()`) | orientation, angular rate | cheap 6-axis, no compass → heading drift; accel→position unusable alone | heading + motion prediction + (later) VIO |
| HC-SR04 + pan servo | metric range, sweepable to an angular scan | narrow noisy cone, slow sweep | **metric occupancy input + mono scale anchor** |
| BOW cam (C615, mono) | geometry, object IDs, loop closure | mono → scale ambiguous | visual front-end + perception (Phase 4) |
| AFT cam (ESP32 OV2640) | 2nd viewpoint / rear | low fps over WiFi, unsynced | rear coverage / extra mapping views |
| Commanded v,w | translation prior | **no wheel encoders** → open-loop, slip uncorrected | dead-reckoning prior |
| Line sensors ×3 | floor reflectance | 1-bit | minor (floor/edge) |

Fusion is the whole trick: each sensor covers another's blind spot (IMU good at
orientation/bad at position; ultrasonic good at metric distance/bad at coverage;
camera good at coverage/bad at scale).

## Firmware gaps to close (found in `zip_robot_uno`)

- **IMU is not exposed at runtime.** `imu.getYaw()` is only used inside the
  init spin-calibration. Need a command/telemetry path to stream yaw (+ accel/
  gyro if RAM allows) to the brain.
- **`CommandHandler::handleServo()` is a stub** (`(void)msg;`). The servo sweep
  needs it implemented (set pan angle on command).
- No wheel encoders on the Elegoo V4.0 base — odometry stays commanded-only.

## Architecture (fits the existing brain, no ROS)

```
UNO firmware:  IMU telem (N=24?) + servo setAngle (N=300 impl) + ultrasonic (N=21)
   ⇅ UART
brain:
   uno_link        parse imu/servo/ultra → bus
   mapping.py      fuse IMU+odom → 2D pose; servo-sweep ultra → occupancy grid
   planner.py      A*/grid plan → v,w waypoints → motion gateway
   (later) slam.py mono VIO + Depth-Anything cloud + loop closure → correct pose
   bus topics:     sensor.imu, sensor.scan, map.pose, map.occupancy, plan.path
   WS envelopes:   imu, scan, pose, occupancy, path  + client cmd: goto/explore
HUD:
   viewport renders occupancy grid + pose + planned path; click-to-set-goal
```

## Deliverables (sequenced, each independently verifiable)

### 5.0 — Sensor plumbing (no GPU, no torch)
- UNO: expose IMU (yaw at minimum; accel/gyro if RAM permits); implement
  `handleServo` so the brain can command pan angle.
- brain `uno_link`: parse + publish `sensor.imu`; add a servo command path.
- HUD: heading indicator + a live "radar" sweep of the servo+ultrasonic.
- **Verify:** HUD shows real heading turning with the robot, and a radar arc of
  metric distances as the servo sweeps.

### 5.1 — Dead-reckoned pose + occupancy seed
- brain `mapping.py`: fuse IMU heading + commanded v,w → 2D pose; accumulate
  servo-sweep ranges into a 2D occupancy grid (free/occupied/unknown).
- HUD: render the occupancy grid + robot pose in the 3D/2D viewport.
- **Verify:** drive the robot manually; a rough room map builds and the pose
  tracks (drift expected — corrected in 5.3).

### 5.2 — Trajectory planning
- brain `planner.py`: A*/grid planner on the occupancy map; `motion.go_to(x,y)`
  emits v,w setpoints to the existing motion gateway; reactive ultrasonic stop.
- HUD: click a goal in the map → shows planned path → robot drives it.
- **Verify:** click-to-drive autonomous navigation on the rough map.

### 5.3 — Visual layer (accuracy + richness; GPU/torch enters here)
- mono VIO (now the IMU is available) for better pose; Depth Anything V2
  (already cached) for a denser colored cloud; visual loop closure to correct
  5.1 dead-reckoning drift.
- Toggle against perception for the GPU budget (drive-and-scan vs stop-and-scan).
- **Verify:** map drift visibly corrected; denser reconstruction in the HUD.

### 5.4 — AFT camera coverage (optional)
- ESP32 OV2640 as a rear viewpoint for coverage / rear obstacle awareness.

## Upgrade path (when the new camera arrives)

A camera that is **RGB-D + IMU** (e.g. Intel RealSense D435i) is the real
unlock: metric depth directly (kills mono scale ambiguity and the Depth-Anything
approximation) + hardware IMU. The swap touches only the front-end (5.3); the
occupancy + planner + HUD layers (5.1/5.2) are unchanged. IMU alone (mono+IMU
camera) gets scale help but still estimates depth — RGB-D is the bigger win for
mapping/navigation.

## Decision reversal: MASt3R-SLAM un-locked

The original V2 plan locked MASt3R-SLAM. That was decided before we knew the
platform is an indoor toy car with a single mono webcam on an 8 GB Orin Nano.
MASt3R-SLAM descends from MASt3R (ViT-Large, ~2 GB weights) and is real-time
only on 3090/4090-class GPUs; on this hardware it would be memory-starved at
~1-3 fps with a brutal PyTorch + custom-CUDA bring-up — and it's still mono.
Dense neural reconstruction stays an **offline PC job** (Phase 11, RTX 4070 Ti).
Real-time on-robot mapping uses the fusion approach above. Revisit a neural SLAM
front-end only after the RGB-D+IMU camera upgrade, if at all.

## Honest limitations

Cheap IMU drifts (no magnetometer); no wheel encoders (open-loop odometry,
uncorrected slip); ultrasonic is a single narrow noisy beam swept slowly. The
*fusion* is what makes it usable despite each part being cheap, and the visual
loop closure (5.3) is what tames the accumulated drift.
