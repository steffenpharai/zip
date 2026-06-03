# ZIP V2 — Phase Plan

Single source of truth for what's done, in flight, and queued. Update this
when a phase ships, when a decision changes, or when a new phase emerges.

## Done

### Phase 0 — Firmware baseline ✅

Verified the existing V1 firmware on both chips by rebuilding from source via
PlatformIO and re-uploading. Captured the JSON protocol contract that V2
inherits unchanged.

- UNO `zip_robot_uno` rebuilt + reflashed (21,860 bytes), responds with
  `{hello_ok}` to `{"N":0,"H":"ping"}` and full sensor reads.
- ESP32 `zip_esp32_cam` rebuilt cleanly (proves toolchain works). This
  firmware is now *deprecated* and replaced by `zip_esp32_cam_sta` in Phase
  3.3.

### Phase 1 — Jetson bringup ✅

Got the Jetson Orin Nano Super on the network, characterized its software
stack, set up key-based SSH, brought up `/dev/ttyUSB0` to the UNO with the
same JSON protocol the PC used.

- Captured state: [`JETSON_FACTS.md`](./JETSON_FACTS.md).
- Bringup steps: [`JETSON_BRINGUP.md`](./JETSON_BRINGUP.md).
- Two gotchas surfaced: `ch341.ko` is not in the L4T kernel (we built it
  from upstream), and the `brltty` udev rule eats CH340 devices. Both are
  documented in [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md).

### Phase 2 — Brain service + Web HUD ✅

Built the on-robot Python service (`zip-brain` repo) and the operator
console HUD (`app/v2/`).

- `zip_brain` service runs as a `systemd` unit; FastAPI + uvicorn + asyncio
  pubsub bus. Three internal subsystems: `uno_link`, `motion_gateway`,
  `control_plane` (WebSocket). See
  [`PROTOCOLS.md`](./PROTOCOLS.md#websocket-jetson--clients).
- Web HUD: cockpit-style layout with 3D world view (R3F), telemetry
  panels, drive panel, UART console. Manual drive from WASD or virtual
  joystick. End-to-end keydown→motor at ~70 ms (optimized; see below).
- Deploy via `git clone` from GitHub + `pip install -r requirements.txt`
  + `systemctl restart`. Auto-starts on boot.

### Phase 3 — Camera pipeline ✅

Two cameras, both rendering live in the HUD.

- **3.1** Logitech C615 USB UVC → Jetson `/dev/video0` → GStreamer
  `v4l2src ! multipartmux ! fdsink` → FastAPI `/cam/bow` (zero-transcode
  MJPEG passthrough).
- **3.2** HUD: replaced the placeholder camera bezel with a real
  `<img src>` to the multipart MJPEG endpoint. Live indicator, label slot,
  auto-reconnect on error. Cache-bust only on error (StrictMode-safe).
- **3.3** ESP32-S3 OV2640 STA-mode firmware (`zip_esp32_cam_sta`) — joins
  the home Wi-Fi, advertises `zip-esp32-cam.local`, serves MJPEG on
  `:81/stream` via ESP-IDF `esp_http_server` (Arduino `WebServer.h` was
  way too slow). Jetson proxies `/cam/aft` → ESP32 via aiohttp.

Frame rate: BOW ~15 fps real-time, AFT ~12 fps over Wi-Fi (both at
640×480 / quality 12).

### Phase 3.5 — Drive latency squeeze ✅

After Phase 3 the operator could feel the keystroke→motion gap. Walked
the whole chain and cut it from ~300 ms to ~70 ms in two rounds.

Round 1:
- HUD `useDriveTick`: rAF poll for axes changes (was a 50 ms `setInterval`
  tick wait).
- UNO ramp: 12 → 30 PWM/step at 50 Hz (600 → 1500 PWM/s).
- UNO `KICKSTART_BOOST` 25 → 40 to break static friction on the first pulse.

Round 2:
- HUD `useDriveInput`: dispatches `onAxesChange` *synchronously* from the
  keydown handler. The first setpoint leaves in the same DOM task as the
  key press, no rAF or React render wait.
- UNO `TASK_CONTROL_LOOP_HZ` 50 → 100 (halves loop-tick wait, doubles
  effective ramp velocity to 3000 PWM/s).
- UART 115200 → 500000 baud (50-byte setpoint: 4.5 ms → 1.0 ms on the
  wire). 500000 = UBRR=3 (U2X=1) on the ATmega328P @ 16 MHz, which is
  *exactly* what UBRR=3 produces — zero baud error. (The first attempt
  targeted 460800, but 460800 rounds to the same UBRR=3 setting and is
  8.5% off the requested rate, well past UART tolerance, so it produced
  pure line noise in both directions.)

Final budget: ~70 ms keydown → motor at full target PWM.

### Phase 4 — Perception (object detection) ✅

The robot now sees. YOLO11-nano runs on the Jetson, detections overlay the
BOW camera in the HUD, and confident sightings are captured to a gallery.

- **Inference on the Jetson** (per the "Jetson is the brain" lock): YOLO11n
  via `onnxruntime-gpu` with the **TensorRT execution provider (FP16)** and a
  persistent engine cache — the multi-minute engine build happens once. CUDA
  EP then OpenCV-DNN CPU are automatic fallbacks, so the brain always boots.
- **Camera fanout hub**: `/dev/video0` is single-open, so Phase 3's
  one-pipeline-per-consumer model broke whenever two things wanted the camera.
  `camera.py` now captures once per camera and fans frames out to all MJPEG
  clients *and* the perception loop. Also fixes the latent two-tabs bug.
- **Brain**: new `perception.py` task + `detector.py` (pluggable backend) pull
  frames from the hub, run detection off the event loop (executor), and
  publish `perception.detections` (5 Hz) + `perception.snapshot` on the bus.
  Snapshots dedupe per-label with a cooldown.
- **HUD**: `DetectionOverlay` (SVG boxes scaled via viewBox to match
  object-contain), `SnapshotGallery` (captured object crops), detections
  reported into the event log. Runtime on/off toggle frees the GPU for SLAM.

The on-Jetson environment bring-up (finding the right onnxruntime-gpu wheel,
building + benchmarking the TRT engine) was done by a **delegated Claude Code
agent running headless on the Jetson itself**, while the PC-side code was
built in parallel — see DEV_WORKFLOW.

## In flight

Nothing right now. Last shipped item was Phase 4 perception.

## Queued — next candidate phases

> **Roadmap re-sequenced (indoor mapping robot).** The vision is an indoor
> robot that drives the office/rooms, identifies objects, maps + reconstructs
> the space, and is viewable/controllable remotely. Perception (Phase 4)
> shipped first as the fast, low-risk, high-value win. SLAM is the autonomy
> spine and comes next. **Voice moved late** — it's additive, not load-bearing
> for the core "see / map / patrol / watch remotely" loop.

### Phase 5 — Mapping, localization & trajectory planning (fusion-first)

Full plan: [`PHASE5_PLAN.md`](./PHASE5_PLAN.md).

- **MASt3R-SLAM un-locked** — too heavy for an 8 GB Orin Nano with a single
  mono webcam (real-time only on 3090/4090-class GPUs). Dense neural
  reconstruction moves to the offline PC path (Phase 11).
- Instead: **fuse the sensors we already have** — MPU6050 IMU (heading),
  servo-swept HC-SR04 (metric occupancy), commanded odometry — into a 2D pose +
  occupancy map, then a grid planner for trajectories. No GPU/torch to start.
- The camera (mono VIO + Depth-Anything cloud + loop closure) is layered *last*
  for accuracy/richness, after a working navigate-the-room loop exists.
- The occupancy + planner + HUD layers are sensor-independent, so a future
  RGB-D+IMU camera swaps only the front-end.

### Phase 6 — Anchored detections

- Fuse perception + SLAM: pin detections to map coordinates. "I see a chair"
  becomes "there's a chair in the NE corner." "Where did you last see X."
- Persisted to SQLite as a queryable object registry.

### Phase 7 — Autonomous exploration

- Frontier-based coverage so the robot drives itself through the rooms,
  mapping as it goes. Reactive obstacle stop via ultrasonic + visual clearance.

### Phase 8 — Cloud reachability + auth

- Tailscale Funnel / Cloudflare Tunnel: HUD + camera reachable from anywhere
  ("check on my space when I'm not home"). Auth from here on; `*` CORS locked.

### Phase 9 — Voice loop (moved later)

- Conversational layer. Local-only on the Jetson per the "robot stays
  autonomous" lock: Pipecat-style cascade (Parakeet/whisper STT → local
  Qwen-Instruct with tool calls → Piper TTS), or a full-duplex speech model.
  Push-to-talk first, wake word ("Hey Zip") after. Additive — slots in
  whenever; doesn't block the mapping spine.

### Phase 10 — Agent skeleton (formerly Phase 5)

- LLM brain via Claude API on the Jetson (per the locked-in hybrid LLM
  decision — local model is too tight on the 8 GB Jetson when SLAM
  also needs VRAM).
- Tool registry: `motion.drive`, `motion.stop`, `motion.macro`,
  `vision.describe`, `speak`, `memory.*`. Permission tiers (READ /
  WRITE / ACT) carried over from V1.
- Agent runs as its own systemd unit on the Jetson; talks to the
  control plane via the internal bus.

### Phase 6 — Local LLM for fast paths

- Qwen 2.5 3B via Ollama on Jetson, for routing + simple verbal
  responses ("yes", "stopping", "OK") and offline-tolerant behaviour.

### Phase 7 — SLAM + map

- MASt3R-SLAM TensorRT engine on the Jetson, fed from the BOW camera.
- World model: sparse map + named regions, persisted to SQLite.
- Robot pose published on the internal bus, consumed by the HUD's
  3D viewport.

### Phase 8 — Goal-directed driving

- Short-horizon planner on Jetson; `motion.go_to(name|pose)` tool.
- Reactive obstacle stop via ultrasonic + visual front clearance.

### Phase 9 — Item registry

- YOLO11 TRT detections anchored to map coordinates, persisted as a
  queryable database. "Where did you last see X" becomes a tool call.

### Phase 10 — Internet reachability

- Tailscale Funnel or Cloudflare Tunnel: the HUD reachable from any
  device, anywhere.
- Auth from this phase onward; `*` CORS gets locked down.

### Phase 11 — Dense reconstruction

- Gaussian-Splat training on the PC (RTX 4070 Ti SUPER) from a recorded
  exploration lap. Splat served back to the HUD's 3D viewport.

### Phase 12 — Autonomous behaviours

- Schedules, patrols, find-and-report, idle wandering.

### Phase 13 — Personality + polish

- Voice tuning, persistent journal, mobile-friendly HUD layout.

## Decisions locked in (do not relitigate without good reason)

- **Jetson is the brain from day 1.** Originally we considered a
  PC-as-brain split; the user (correctly) called this out as wrong —
  the robot must remain autonomous when the PC is off.
- **PC/web is observability + control only.** Never a runtime
  dependency of the robot.
- **Hybrid LLM**, weighted toward API (Claude). Local model only for
  routing + offline-tolerant basic responses.
- **Wake word + conversation** voice style; "Hey Zip".
- ~~**MASt3R-SLAM** for V1 SLAM~~ — **REVERSED** (Phase 5 planning). Too heavy
  for an 8 GB Orin Nano + mono webcam. V1 mapping is sensor-fusion
  (IMU + servo-swept ultrasonic + odometry) with the camera layered last;
  dense neural reconstruction is an offline PC job (Phase 11). See
  [`PHASE5_PLAN.md`](./PHASE5_PLAN.md).
- **Manual flash of new firmware via existing toolchain** (PlatformIO
  + avrdude); no OTA in V1.
- **`secrets.h` is gitignored everywhere.** Templates go in
  `secrets.example.h`.

## Decisions still open

- **Audio host**: PC speakers, browser audio, or I²S on the robot? V1
  starts with browser audio (so any client gets voice). Robot-side I²S
  is a deferred decision.
- **Motion planner library**: hand-rolled local planner, or pull in a
  ROS 2 nav stack? Lean toward hand-rolled at first to keep
  dependencies small.
- **State persistence**: SQLite is the default for world model + agent
  memory. Vector index inside SQLite via `sqlite-vss`, or external
  Chroma? Probably sqlite-vss first.
