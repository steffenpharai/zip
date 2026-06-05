---
description: Deploy the k-NN-init bake.py to Jetson and verify splat renders correctly
argument-hint: [scan-id]  e.g. "livedemo" or "test001" (defaults to "livedemo")
---

The argument is the scan ID to test. Default: `livedemo`.

Use the `splat-debugger` subagent to:

1. scp `jarvis/splat-lab/scripts/bake.py.knn-init-from-pc` to the
   Jetson as `~/splat-lab/scripts/bake.py`
2. Run `./launcher.sh $1` on the Jetson (where `$1` is the scan ID,
   default `livedemo`)
3. Confirm the bake completed without errors
4. Validate the resulting PLY with `validate_ply.py`
5. Report whether the splat is expected to render (k-NN scale stats,
   no coplanar collapse)

Note that the actual browser render verification requires a human to
open `http://localhost:8090/$1/` in Chromium (via the `jetson-splat`
SSH tunnel from `.claude/launch.json`). After the agent reports the
deploy, prompt the human:

```
🔭 Manual step: open http://localhost:8090/<scan-id>/ in Chromium
   (via the jetson-splat SSH tunnel). The splat should render with
   visible colors and shapes, not as black or dark silhouette.

   Report back with: "renders" / "still black" / "looks wrong because…"
```

If the agent reports `not-yet-verified` and the deploy succeeded, the
ball is in the human's court. Don't claim success on the user's behalf.
