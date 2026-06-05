---
description: Deploy the current zip-v2/brain submodule SHA to the Jetson and verify
argument-hint: (no arguments — deploys the locally-checked-out submodule SHA)
---

Use the `brain-deployer` subagent to:

1. Read the current submodule SHA (`cd zip-v2/brain && git rev-parse HEAD`)
2. Push it to the Jetson, restart the `zip-brain` systemd unit, and
   verify clean startup
3. Confirm wheels are still locked post-deploy

Spawn the agent with:

> Deploy submodule SHA `<sha>` to the Jetson. Confirm clean restart, no
> exceptions in journal, WebSocket reachable, and wheels still locked.
> Report verdict in the standard format.

After the agent reports, summarize the result in 3 lines:
- ✅/❌ Deploy outcome
- Brain `/health` snapshot (protocol_version, uno_connected, clients)
- Safety confirmation (wheels locked? true/false)

If the agent reports `jetson-unreachable`, do NOT retry — instruct the
human to power-cycle the Jetson.
