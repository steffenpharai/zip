---
description: Snapshot the Jetson state — services, models, uptime, GPU, network
argument-hint: (no arguments)
---

Connect to the Jetson and produce a compact status snapshot. Report:

1. **Reachability:** Try `ssh zip-jetson` (USB-C 192.168.55.1) first;
   fall back to `ssh zip-jetson-wifi` (192.168.86.47). Note which one
   worked.
2. **Uptime / load:** `uptime`
3. **Service states:**
   - `systemctl is-active zip-brain` + `systemctl is-enabled zip-brain`
   - `systemctl --user is-active openclaw-gateway` + `systemctl --user is-enabled openclaw-gateway`
   - `systemctl is-active ollama`
4. **GPU memory:** `nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader`
5. **Disk free:** `df -h ~`
6. **Active Ollama models:** `ollama list`
7. **default.target:** `systemctl get-default` (graphical = desktop, multi-user = headless)
8. **Robot wheels locked?** If zip-brain is active: curl `localhost:8080/health` and report `motion_lock.locked`.

Format the output as a structured markdown table. Total response under
20 lines.

If the Jetson is unreachable on both interfaces, output:
```
🔴 Jetson unreachable on both USB-C and Wi-Fi.
   Likely powered off, USB-C disconnected, or Wi-Fi router restarted.
   Power-cycle the Jetson to bring it back.
```
