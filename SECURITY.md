# Security policy

Zip is a small project, but the maintainers take security seriously
because it drives physical hardware — a bug here can mean an off-leash
robot.

## Scope

This policy covers code in this repository (`steffenpharai/zip`) and its
submodule (`steffenpharai/zip-brain`). It does not cover third-party
dependencies (file issues with their maintainers) or hardware vendors.

In-scope concerns:

- **Motion safety:** anything that lets the robot drive without explicit
  client intent (deadman bypass, wheels-locked bypass, motion gateway
  bypass, firmware command injection).
- **Network exposure:** the brain's WebSocket and HTTP endpoints have no
  auth and are intended for trusted LAN only. A bug that lets a hostile
  LAN client trigger unintended motion or exfiltrate camera frames is
  in-scope.
- **Secret leakage:** any code path that logs, transmits, or commits
  Wi-Fi credentials, OpenAI keys, or OpenClaw gateway tokens.
- **Supply chain:** anything that pulls or executes attacker-controlled
  code during build or install.

Out of scope (for now):

- The lack of auth on the brain's WebSocket itself. By design, the brain
  listens on a trusted LAN. Wrapping it in mTLS is on the roadmap but not
  yet implemented; reports of "the brain has no auth" will be marked WAI.
- Local-host bypasses that require shell on the Jetson.

## Reporting

Email **pharaisteffen@gmail.com** with subject prefix `[Zip security]`.

Include:

1. A clear description of the vulnerability.
2. Steps to reproduce (the more specific, the faster the fix).
3. The version / commit SHA you tested against.
4. Whether you've shared the finding with anyone else.

You'll get an initial response within 72 hours. A fix or formal "WAI"
ruling within 30 days for high-severity reports, longer for lower
severity.

## Coordinated disclosure

If you'd like to write up the finding publicly after a fix lands, we'll
work with you on the timing and credit. Don't post until we've shipped
a patched release.

## Hardening checklist (for maintainers)

When adding endpoints to the brain or HUD that accept input:

- [ ] Validate every numeric input range (`v ∈ [-1, 1]`, `w ∈ [-1, 1]`,
      `ttl_ms ∈ [50, 1000]`, etc.).
- [ ] Don't trust client-provided IDs as paths or filenames.
- [ ] Rate-limit at the gateway (the motion gateway already does this for
      drive — copy the pattern for new motion-adjacent endpoints).
- [ ] Default to safe (locked / disabled / dry-run) and require explicit
      opt-in, never opt-out.
- [ ] Log any motion command at INFO so post-incident review is possible.

## Known accepted risks

- The brain's WebSocket is unauthenticated on the LAN. **Accepted** until
  we have a multi-user story. Mitigation: bind to the USB-C link
  (`192.168.55.1`) for trusted dev; Wi-Fi exposure is a deliberate choice
  for now.
- The ESP32-S3 camera firmware joins home Wi-Fi using a plaintext PSK in
  `secrets.h`. **Accepted** — that file is gitignored and replaced by
  every developer locally.
- Firmware over-the-air updates are not implemented. **Accepted** — all
  firmware flashing is over physical USB.
- OpenAI API keys in HUD `.env` are exposed to client-side code paths
  used in legacy V1 routes (`app/api/realtime/*`). **Accepted** — those
  routes are dormant in V2; should be removed when the V2 cockpit
  formally drops them.
