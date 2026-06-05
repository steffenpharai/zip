# Vision — what Zip is, in 5 years

> The short pitch lives in [`PITCH.md`](../PITCH.md). This is the
> long-form why.

## The thesis

**Every home will have a perceptive AI agent that lives in physical
space.** Not a chatbot in a phone. Not a smart speaker on a counter.
A *thing* that sees the room, knows where the chair is, recognizes
you, and can act on what it sees.

This already exists in research labs. It already exists, partially,
in $75 k Boston Dynamics Spots. What doesn't exist is the **$400
retail tier** where this is a product, not a project.

Zip is the platform that fills that tier.

## What we believe

### 1. Local-first AI wins in the home

Cloud-tethered AI products fight three structural problems:

- **Latency.** The round-trip from your living room to AWS and back
  is ~50-200 ms before any compute. A perceptive agent that takes
  half a second to notice you walked into the room *feels broken*.
- **Privacy.** Households will not put always-on cameras + microphones
  in their homes that pipe to a vendor cloud. They tolerate it from
  Ring because they have to. They will not for a *general* home
  agent.
- **Outage risk.** When AWS us-east-1 sneezes, your robot is
  catatonic. This is not okay for a product that's supposed to "live"
  in your house.

Zip runs everything locally. Vision on the Jetson, control on the
MCU, HUD on the PC you already own. **The cloud is opt-in.**

### 2. Hardware is a feature, not a constraint

Most "AI in the home" products are software glued onto commodity
hardware (a phone, a smart display). The hardware doesn't help; it
just exists.

Zip uses the constraint of physical robotics as a forcing function:

- The Jetson + the chassis cost a known amount of money → focus on
  what's possible at that BOM, not on "ideal compute."
- The deterministic real-time motor controller (UNO) imposes
  strictness on the software architecture above it.
- The shared 8 GB of unified memory imposes discipline on what
  models we can run.

These constraints produce a *better* product than infinite compute
would. They force trade-off conversations early.

### 3. Strict layering survives scale

Most consumer-robotics startups die at one of three transitions:

1. **From demo to product** (the safety story breaks).
2. **From product to fleet** (the operations story breaks).
3. **From fleet to ecosystem** (the platform story breaks).

Zip's architecture is designed to survive all three:

- The UNO owns time → safety is provable at the chip level. No matter
  what the brain does, wheels stop within 300 ms. (Transition 1.)
- The brain is a standalone service per robot. No central server, no
  cloud, no "the whole fleet went down because we deployed a bad
  binary." (Transition 2.)
- The protocol between layers is documented, versioned, and
  ADR-tracked. Third-party skills can target the WebSocket layer
  without touching the chassis. (Transition 3.)

### 4. Vision-first beats voice-first for embodied AI

Voice assistants taught the market two things:

- That AI-products can be conversational.
- That conversation alone is a thin moat (rapid commoditization).

For an embodied agent, vision is the wider moat:

- It's hard. A 7 FPS depth-aware perception loop on $250 of hardware
  is a real engineering accomplishment.
- It's irreplicable from a phone or smart display. You need the
  hardware to mount the camera.
- It composes. Vision → mapping → planning → action is a stack
  where each layer adds value.
- It's defensible. The team that solves
  "low-cost-hardware perception at 60 fps" wins durable advantage.

We make the vision-first bet deliberately. The LLM piece comes later,
hybrid (edge reflex + LAN brain), and is *not* what the product is
sold on. (See [ADR 0006](./adr/0006-llm-on-jetson-deferred.md).)

## The 5-year roadmap

### Year 1 (2026)

- Ship the vision-first platform (Phase 5.3a → 6 → 7).
- Stand up a developer beta (5-10 early users).
- Custom hardware design (PCB, mount, power topology).

### Year 2 (2027)

- 50-100 unit pilot in real homes.
- Skill SDK with 3-5 launch partners building skills.
- First custom PCB run (drops BOM by ~50%).
- Hybrid LLM brain shipping (PC tier + edge reflex tier).

### Year 3 (2028)

- 1,000-unit launch with selected retail partner OR direct DTC.
- Skill marketplace open.
- iOS/Android companion app.
- ARR target: $1-3 M from hardware + skill marketplace cut.

### Year 4 (2029)

- 10,000+ units. Real-world traction.
- Vertical partnerships (elder care, security monitoring,
  educational/STEM).
- Second hardware generation.
- ARR target: $10-30 M.

### Year 5 (2030)

- 100,000+ units. Inflection point.
- Skill ecosystem revenue rivals hardware revenue.
- Strategic exits available (vertical roll-ups, big-tech
  acquisitions), or independent path with strong margins.

## What success looks like

Five years out, success looks like:

- **Every developer who wants to build "a thing that sees your
  house" reaches for Zip first.** Like Arduino but for perceptive
  robots.
- **A 14-year-old in their bedroom can clone the repo and have a
  splat reconstruction of their room running by dinner.**
- **Households trust the product enough to put it in their living
  room, not just in a workshop.** Privacy story is verifiable; outage
  story is "this never goes down."
- **The skill marketplace has 50+ working skills.** Some free, some
  paid, some open-source.
- **The architecture decisions still hold.** The ADRs we wrote in
  2026 still make sense. No major reversals; only extensions.

## What failure modes we're watching for

- **Premature scaling.** Pushing volume before the vision-fix bug is
  shipped, before the skill SDK is real, before the pilot data is
  solid. We resist this even with capital available.
- **Cloud creep.** Pressure (from partners, capital, or convenience)
  to add cloud dependencies. We resist; we add opt-in cloud only
  where the user explicitly turns it on.
- **Compute-tier inflation.** Pressure to move to $500+ Jetsons or
  custom GPU silicon "because we can." We resist; constraint is the
  forcing function.
- **Voice-first detour.** Pressure to "add Alexa-like voice." We
  resist; voice is a feature of the skill layer, not the platform's
  identity.
- **The hardware-vs-software founder split.** Single founder doing
  both works only because of AI agents in the dev loop. As we grow,
  preserve the discipline: hire AI-native, not just role-skilled.

## Why this is worth doing

Two reasons.

### Commercial

The market gap is real. $400-tier perceptive robots don't exist. The
unit economics work at that BOM. The supply chain (Jetson, Elegoo,
ESP32, off-the-shelf cameras) is available today. The model is
defensible (vision-first IP + skill ecosystem network effects).

Worst-case commercial outcome: a strategic acquisition by an
incumbent who sees the team's velocity and architecture and wants to
absorb both. Best-case: a $1-10 B independent company at maturity.

### Non-commercial

A house that *knows* what's in it without surrendering privacy to
five tech monopolies is a public good. Every additional household
that runs a local AI agent instead of a cloud-tethered one is one
fewer set of cameras and microphones feeding a centralized
surveillance infrastructure.

We're explicitly building a privacy-preserving alternative. That
matters to us, and we think it matters to enough households to
support the commercial story.

## What we're NOT building

To stay honest about scope:

- **Not a robot vacuum.** It cleans nothing.
- **Not a security camera.** It does no monitoring without an explicit
  skill that does that.
- **Not a phone replacement.** No screen. The HUD is for developers
  and operators, not end-users.
- **Not a humanoid.** Wheeled, low-cost chassis. Manipulation is a
  future direction, not Year 1.
- **Not a service robot.** No vertical-specific fit-out. The platform
  enables verticals; partners build them.
- **Not closed source forever.** We may open up specific layers
  (firmware, skill SDK) once the architectural bets are validated.

## Reading next

- [`PITCH.md`](../PITCH.md) — the short investor-facing pitch
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — the system picture
- [`docs/ROADMAP.md`](./ROADMAP.md) — phase tracking
- [`docs/TRACTION.md`](./TRACTION.md) — what's measured + shipped
- [`docs/TEAM.md`](./TEAM.md) — the autonomous-AI development model
- [`docs/adr/`](./adr/) — every load-bearing decision, with rationale

## Calibration

This document is intentionally bold. It's the 5-year vision, not the
6-month plan. The 6-month plan is in [`ROADMAP.md`](./ROADMAP.md) and
is much more conservative.

The gap between this vision and where the project is today is large.
That's the point. A vision document that's already achieved is a
status document.

We're building toward this with what we have, measuring against it,
and adjusting course as the market and technology tell us. The
discipline is in the ADRs — every direction change has a reason and
a record.
