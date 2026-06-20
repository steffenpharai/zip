# Zip — pitch

> A vision-first AI/robotics platform that runs locally, sees the
> world, reconstructs it in 3D, and drives a real robot — all from a
> $70 chassis, a $250 edge AI module, and the PC you already own.

---

## TL;DR for impatient readers

- **Problem.** Consumer/prosumer robots are dumb. Programmable platforms
  for "build your own" are deep-tech-only. The gap between Roomba and
  Boston Dynamics is empty.
- **Solution.** **Zip** is a layered AI/robotics stack: vision-first
  agent (depth + perception + 3D reconstruction) on an NVIDIA Jetson,
  a real-time motor-control firmware, and a Next.js cockpit. The robot
  body is optional — the agent works alone.
- **Why now.** Vision models small enough to run on $250 of edge GPU
  shipped in 2024-2026 (YOLO11, DAv2, DA3, Gaussian Splatting in
  real-time). ChatGPT trained the market to expect "AI products," not
  "AI features." The bill of materials hits an inflection point.
- **Why us.** We chose **edge-first, no-cloud-required, layered
  intentionally** when most companies chose cloud-tethered + closed.
  The architecture (UNO owns time → Jetson owns intent → PC is just a
  window) survives scale to fleets of robots in homes with no central
  outage risk.
- **Traction.** Phase 5.3a shipped: depth + perception + occupancy
  mapping + A* planning + click-to-go + wheel safety lock. Jarvis live
  dashboard streams RGB+depth+detections at ~7 FPS. 3D Gaussian Splat
  pipeline produces valid PLYs (one render bug remaining; fix staged).
- **Development model.** Autonomous AI agents drive the dev loop:
  Claude Code with project-specific subagents and slash commands. A
  solo developer ships at small-team velocity.
- **Status.** Active development.

---

## The problem

The home/prosumer robot market is bifurcated:

| | Roomba-class | Build-your-own |
|---|---|---|
| Smart? | Cleans the floor; can't perceive | Yes, if you have a PhD |
| Hackable? | Sealed | Yes, if you have a lab |
| Local AI? | No (vendor cloud) | Yes, if you can wire it |
| Vision? | Bumper + IR | Yes, if you ship custom YOLO/SLAM |
| Costs to start | $300 + cloud subscription | $5k + months of integration |
| Who can use it | Anyone | <500 engineers globally |

**The gap is the market.** There's no "Arduino-of-perceptive-robots"
— no $400-tier platform where:

- The robot perceives (depth + objects) in real time
- The compute lives on the robot, not in someone else's cloud
- The platform is hackable AND ships with sensible defaults
- A developer can iterate with AI agents (Claude / Codex / Cursor),
  not just by hand

**Zip is filling that gap.**

---

## The solution

Zip is a **layered stack** that you can run any layer of:

```
┌─────────────────────────────────────────────────────────┐
│  Operator HUD                                           │
│  Next.js 16 + React 19 cockpit                          │
│  Drive input, 3D viewport, telemetry, camera feeds      │
│  (runs on the PC you already own)                       │
└────────────────────┬────────────────────────────────────┘
                     │ WebSocket (sticky bus topics)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Jarvis (the brain)                                     │
│  Python / asyncio + FastAPI on Jetson Orin Nano Super   │
│                                                         │
│  Vision-first:                                          │
│    YOLO11n TensorRT FP16  →  ~34 ms detection           │
│    Depth Anything V2 ONNX →  ~143 ms depth              │
│    Depth Anything 3 → 3D Gaussian Splat reconstruction  │
│                                                         │
│  Robot-side (when robot is around):                     │
│    UART link (500 kbaud JSON) to motor MCU              │
│    Motion gateway (rate limit, deadman, safety lock)    │
│    Occupancy mapping + A* + pure-pursuit follower       │
└────────────────────┬────────────────────────────────────┘
                     │ UART
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Real-time motor control                                │
│  ATmega328P firmware on the Elegoo Smart Car chassis    │
│  100 Hz control loop, hardware deadman, motion macros   │
└─────────────────────────────────────────────────────────┘
```

The strict layering is the differentiator:

- **The HUD knows nothing about hardware.** Swap the robot.
- **Jarvis works without the robot.** Vision-first; reconstructs your
  living room without driving anywhere.
- **The MCU owns safety.** Brain crash, Wi-Fi drop, kernel panic →
  wheels stop in 300 ms. Deterministic by design.

---

## Why now

Three curves crossed in 2024-2026 that make this product possible
today and impossible 18 months ago:

1. **Edge AI compute got 4× cheaper.** The Jetson Orin Nano Super
   ($249) replaced the Orin Nano ($499) in 2024. Same memory class,
   2× the compute. Affordable to put on a $70 chassis.

2. **Vision models got small enough.** YOLO11n (2.6 M params) hits
   30+ FPS at FP16 on a Jetson. Depth Anything V2 Small (28 M params)
   hits 7 FPS at 518². Depth Anything 3 Small (80 M params, Apache
   2.0) produces depth + poses + intrinsics per frame in 250 ms.
   None of this existed at this size 2 years ago.

3. **Consumers expect AI products.** ChatGPT taught the mass market
   what "AI products" feel like (vs. "products with AI inside"). A
   robot that *understands* what it sees, not just senses, is now a
   credible category.

The window: **a 12-24 month head start before the obvious incumbents
(iRobot, Anker, Roborock) realize "AI-native, local-first" is a real
category.**

---

## Why us

This is **a private project run as if it were a public startup**.

What's intentional and differentiated:

| Choice | Most teams pick | We chose | Why |
|---|---|---|---|
| Compute tier | Cloud + thin client | Edge-first, no-cloud-required | Privacy, latency, no outage risk |
| Architecture | Monolithic ROS or "Python everywhere" | Strict 3-tier (MCU / Jetson / PC) | Determinism, safety, swappability |
| Safety defaults | "Hope" | Wheels locked by default | Real-world driving safety |
| Software stack | Whatever the engineer prefers | Next.js + asyncio + ATmega C++ | Each at the right altitude for its job |
| Dev process | Hire 5 people | Solo + AI agent collaboration | The only sustainable model for hardware/software/firmware breadth |
| Open vs closed | Closed for moat | Open architecture, ADR-tracked | Trust, audit, community pull |
| LLM strategy | Cloud-tethered chatbot | Vision-first; LLM deferred for hybrid | We're not the 11,243rd chatbot wrapper |

The architecture decisions live in [`docs/adr/`](./docs/adr/) — every
choice has a rationale, a trade-off, and a supersession path.

---

## Traction

What's working today (commit-and-screenshot, not slideware):

| Capability | Status | Evidence |
|---|---|---|
| Real-time RGB + depth + YOLO overlay | ✅ Shipping | `live_stream.py` daemon on Jetson, ~7 FPS sustained |
| Object detection (YOLO11n COCO-80) | ✅ Shipping | 34 ms inference, 30 FPS headroom |
| Monocular depth (Depth Anything V2) | ✅ Shipping | 143 ms inference at 518² |
| Occupancy mapping (IMU + radar) | ✅ Shipping | 5 cm grid, sticky bus topic, HUD overlay |
| A* trajectory planning + click-to-go | ✅ Shipping | Brain-side planner, HUD MapView |
| Motion safety (deadman + wheels lock) | ✅ Shipping | ADR 0005 + firmware watchdog |
| 3D Gaussian Splat reconstruction | 🔄 1 bug | DA3 → PLY working, browser render fix staged |
| Local LLM agent (OpenClaw + Qwen) | ⏸️ Deferred | Installed; strategic pivot to hybrid PC brain |

**Measured robot-side latency:** ~70 ms keydown → motor PWM (after
Phase 3.5 UART + control loop tuning). Faster than most consumer
robots that round-trip to a cloud.

**Phase progression:**

```
Phase 0    → 1     → 2-3   → 3.5  → 4         → 5.0   → 5.1     → 5.2     → 5.3a       → 5.4
Bring-up   manual   cameras latency perception IMU+    mapping   planner   depth+safety   queued
                                              radar              A*+pure
                                                                 pursuit
```

Plus a parallel Jarvis track (vision-first labs shipping
independently of the robot).

---

## Market

**Adjacent markets we touch:**

- **Robot vacuums.** $17 B by 2030, but commodity. Buyers want
  smarter, not cheaper.
- **Home security cameras.** $25 B by 2028. Local-AI cameras are the
  growing segment.
- **Educational robotics.** $4 B today, mostly LEGO-class. The "real
  hardware, real AI" tier is empty.
- **Maker / hobbyist robotics.** Existing platforms (Niryo, Yahboom,
  TurtleBot) lack the depth-perception story.
- **Service robot SDKs / platforms.** Boston Dynamics' Spot SDK is
  closed and $75 k. There's no Spot-for-houses.

We're not pitching "compete with Boston Dynamics." We're pitching
"the Arduino moment for perceptive robots" — a hackable, AI-native
platform that ecosystem partners build on.

---

## Vision (3-5 years)

A future where:

- Every house has at least one Zip-class robot.
- It runs **locally** — your floor plan, your face, your routine
  never leave the device unless you opt in.
- Developers ship robot skills the way they ship mobile apps — install,
  permission, run.
- The robot's brain is a thin reflex model on the device; the heavy
  agentic work runs on a per-home edge server (your gaming PC, today).
- The bill of materials drops to ~$300 retail through volume.
- A community of skill developers earns from skills the way mobile
  devs earn from apps.

For the long-form picture, see [`docs/VISION.md`](./docs/VISION.md).

---

## Team & development model

**The current team is one founder, leveraging autonomous AI agents
as the development force-multiplier.** This is not a constraint; it's
a deliberate operating model:

- Hardware design, Python brain, TypeScript HUD, C++ firmware,
  ML/vision pipelines, docs, devops — all break a single human's
  bandwidth.
- AI agents (Claude Code / Codex / Cursor) close the gap. The repo is
  instrumented for this: per-component `CLAUDE.md`, project-specific
  subagents (robot-tester, firmware-builder, splat-debugger,
  brain-deployer), slash commands (`/jetson-status`, `/deploy-brain`,
  `/verify-splat`, `/autonomous-dev`), permission allowlists,
  three-immovable-rules guardrails enforced by skills.
- See [`.claude/README.md`](./.claude/README.md) for the autonomous-dev
  setup.

**The team scales by hiring AI-native engineers, not just engineers.**
A 3-person team running this stack with AI agents matches a 10-person
team running it without.

For the team composition we'd grow into, see
[`docs/TEAM.md`](./docs/TEAM.md).

---

## Roadmap

For the rolled-up phase tracking, see [`docs/ROADMAP.md`](./docs/ROADMAP.md).

Headline next steps:

| When | What | Why |
|---|---|---|
| Now | Splat black-render fix verification | Unblock 3D reconstruction shipping |
| Q3 2026 | Phase 6 — anchored object locations | Enables "go to the chair" instructions |
| Q3 2026 | Hybrid PC brain (LLM tier) | Unblocks capable agentic skills |
| Q4 2026 | Phase 7 — SLAM | Multi-room navigation |
| Q4 2026 | Skill SDK design | Set up the developer ecosystem |
| 2027 | Pilot deployments (5-20 homes) | Real-world traction data |
| 2027-28 | Custom-PCB hardware platform | Drop BOM to ~$300 |

---

## Status

Active development.

- **Strategic (vertical partner):** if you're an iRobot / Anker /
  educational-robotics / home-security player and want to white-label
  or partner on the AI-native layer.

The platform is private but **the architecture is publishable** —
everything load-bearing is in `docs/` with rationale. We can give a
deep-dive demo (live Jetson, live HUD, live splat reconstruction) on
short notice.

---

## Read more

| Audience | Doc |
|---|---|
| **Investor / strategic** | This file (PITCH.md) + [`docs/VISION.md`](./docs/VISION.md) + [`docs/TRACTION.md`](./docs/TRACTION.md) |
| **Engineer / contributor** | [`AGENTS.md`](./AGENTS.md) + [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) + [`docs/adr/`](./docs/adr/) |
| **Operator** | [`README.md`](./README.md) + [`zip-v2/docs/DEPLOY.md`](./zip-v2/docs/DEPLOY.md) |
| **AI agent** | [`AGENTS.md`](./AGENTS.md) + [`.claude/README.md`](./.claude/README.md) |

---

## Contact

**Steffen Pharai** — pharaisteffen@gmail.com

For a live demo, schedule via email. The robot lives on a desk in the
Eastern US time zone; the Jetson can be brought up + screen-shared on
30 minutes' notice.
