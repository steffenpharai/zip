---
description: Run an autonomous development cycle on a feature/fix/phase
argument-hint: "<description of what to build/fix>"  e.g. "land splat k-NN fix and verify in browser"
---

You're being asked to run an autonomous dev cycle. Follow this loop:

1. **Read the request.** $ARGUMENTS describes the goal. If unclear or
   ambiguous, **stop and ask one clarifying question**. Don't guess.

2. **Plan.** Write a TaskList with the discrete steps. Show it to the
   user before executing. If any task involves a "three immovable
   rules" risk (motion / baud / lock), flag it explicitly.

3. **Execute.** Work through tasks in order:
   - For research / understanding: use `Explore` subagent.
   - For firmware builds: use `firmware-builder` subagent.
   - For brain deploys: use `brain-deployer` subagent.
   - For splat verification: use `splat-debugger` subagent.
   - For local edits: use `Edit`/`Write` directly.

4. **Verify after every meaningful change.** Use `/verify-changes` or
   spawn `robot-tester`. Do NOT claim done without verification.

5. **Stop and ask** when:
   - About to push to remote
   - About to merge to master
   - About to unlock the wheels
   - About to bump any safety-critical default
   - About to add a new dependency to the brain
   - About to touch the motion gateway
   - Tests fail and the failure isn't obvious

6. **Commit incrementally.** One logical change per commit. Don't
   batch a 20-file diff into a single commit unless they're truly
   coupled.

7. **Report.** When done (or stuck), summarize:
   - What was done
   - What was verified
   - What was NOT done and why
   - Any follow-up issues that should be opened

## Read first

- [`AGENTS.md`](../../AGENTS.md) — the three rules + escalation policy
- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) — the system picture
- [`docs/ROADMAP.md`](../../docs/ROADMAP.md) — phase context
- [`docs/KNOWN_ISSUES.md`](../../docs/KNOWN_ISSUES.md) — before debugging

## Never do

- Bypass the motion gateway
- Change `ZIP_MOTION_LOCKED` default to `0`
- Force-push to master
- Commit secrets
- Skip verification because "the diff looks fine"
