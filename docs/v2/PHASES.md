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

## In flight

Nothing right now. Last shipped item was the latency squeeze + this
documentation pass.

## Queued — next candidate phases

### Phase 4 — Voice loop

- Wake word: `openWakeWord`, custom "Hey Zip" model (locked decision).
- STT: `faster-whisper` (Medium) running on PC GPU.
- TTS: Piper local, or OpenAI Realtime if we want lower-latency cloud.
- Architecture: voice runs *client-side* (browser-side STT/TTS) so any
  client can speak, not just the PC. Robot-side mic is Phase 4.5 if we
  want it.
- Hooks needed in HUD: push-to-talk button, transcript display, agent
  message stream.

### Phase 5 — Agent skeleton

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
- **MASt3R-SLAM** for V1 SLAM (better than DROID-SLAM for indoor
  texture-poor rooms, lighter on VRAM).
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
