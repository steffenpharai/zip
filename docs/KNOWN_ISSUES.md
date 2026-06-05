# Known issues

All the gotchas that bit us once. If you're debugging something weird,
search here first — chances are it's listed.

## Firmware / UNO

### PIO `-D` shadow trap

**Symptom:** `platformio.ini` has `build_flags = -DSERIAL_BAUD=500000`
but the firmware still runs at 115200 (or whatever was in `config.h`).
Identical binary size, no build failure. Pure runtime mystery.

**Cause:** `-D` is a *macro definition*. If a header already does an
unguarded `#define SERIAL_BAUD 115200`, the include order wins; the
build-flag is silently shadowed.

**Fix:** Guard every header constant with `#ifndef`:

```c
// in include/config.h
#ifndef SERIAL_BAUD
  #define SERIAL_BAUD 500000
#endif
```

Then `-DSERIAL_BAUD=…` in `platformio.ini` actually takes effect.

**Reference:** [reference_pio_define_shadow_trap.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_pio_define_shadow_trap.md)

### AVR baud math (16 MHz)

**Symptom:** Firmware compiled for 460800 baud — UART returns nothing
or returns garbage at that rate. Setting 500000 fixes it. Picking
"oddball" rates is a coin flip.

**Cause:** At 16 MHz the UBRR register only takes integer values. For
"standard" baud rates the rounding can be enormous:

| Requested | UBRR (U2X=1) | Actual baud | Error |
|---|---|---|---|
| 250000 | 7 | 250000 | 0% |
| 460800 | 3.34 → **3** | 500000 | **+8.5%** |
| 500000 | 3 | 500000 | 0% |
| 1000000 | 1 | 1000000 | 0% |

**Fix:** Use only rates that land on integer UBRR. 250000, 500000, or
1000000 are safe. **Never 460800** even though it looks "standard" —
the UNO will actually transmit at 500000, causing the host to read
garbage.

**Reference:** [reference_avr_baud_math.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_avr_baud_math.md)

### Motor STBY pin

**Symptom:** Motor commands accepted, no motor motion. PWM looks right
on the pin. No errors anywhere.

**Cause:** TB6612FNG H-bridge requires its `STBY` pin (D3 on the Elegoo
shield) to be HIGH to enable output. If it's low, the driver outputs
nothing regardless of PWM/direction inputs.

**Fix:** Firmware enforces STBY=HIGH in every motor write. If you're
adding direct motor control, do the same. See `src/main.cpp` in `uno/`
firmware.

## Firmware / ESP32-S3

### GPIO0 latch from CH340 connector

**Symptom:** Camera firmware uploads fine, ESP32 enters bootloader, but
on subsequent boots it stays in bootloader mode. Wi-Fi never comes up.

**Cause:** The Elegoo shield has a 4-pin "CH340→GPIO0" connector
intended for the v1 wired-bridge use case. When plugged, it pulls GPIO0
LOW at boot, which signals "stay in bootloader."

**Fix:** **Leave the 4-pin connector unplugged.** The ESP32 in v2
operates standalone over Wi-Fi; it doesn't need a UART link to the UNO.

**Reference:** [reference_esp32_flash_hardware.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_esp32_flash_hardware.md)

### Camera XCLK = 10 MHz (not 20 MHz)

**Symptom:** With XCLK at 20 MHz, Wi-Fi throughput drops dramatically;
MJPEG `:81/stream` stalls or stutters.

**Cause:** 20 MHz XCLK couples into the Wi-Fi antenna via PCB traces or
the OV2640 ribbon cable.

**Fix:** Use XCLK = 10 MHz. Frame rate is acceptable (~15-25 FPS at
VGA). This is documented in the firmware config; don't "optimize" it.

## Jetson

### brltty hijacks CH340 device

**Symptom:** `/dev/ttyUSB0` disappears within seconds of plugging in
the UNO's USB cable. `dmesg` shows brltty grabbing the device "for
Braille support."

**Cause:** JP6.x Ubuntu 22.04 ships `brltty` enabled by default, which
has a udev rule claiming CH340-family USB-UART chips on the assumption
they might be a Braille display.

**Fix:** Rename the brltty udev rule so it stops matching:

```bash
sudo mv /usr/lib/udev/rules.d/85-brltty.rules \
        /usr/lib/udev/rules.d/85-brltty.rules.disabled
sudo udevadm control --reload
# unplug + replug the UNO
```

**Reference:** [reference_jetson_brltty_ch340_gotcha.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_jetson_brltty_ch340_gotcha.md)

### L4T kernel doesn't ship ch341.ko

**Symptom:** Even with brltty disabled, no `/dev/ttyUSB0` appears.
`lsmod | grep ch34` shows nothing. `modprobe ch341` fails.

**Cause:** NVIDIA's L4T kernel modules don't include the `ch341` driver
for the CH340 USB-UART chip. The Elegoo UNO clone uses CH340.

**Fix:** Build `ch341.ko` from upstream Linux source against the
matching L4T kernel headers. See the brltty reference for the exact
commands. Once built and `insmod`-ed, `/dev/ttyUSB0` shows up on
plug-in.

### Read-only home + snapshot directory

**Symptom:** `zip-brain` systemd unit can't write to `~/zip-snapshots/`
— `PermissionError: read-only file system`.

**Cause:** The systemd unit has `ProtectHome=read-only`. Snapshots
can't go to `~`.

**Fix:** Snapshots already go to `/var/lib/zip/snapshots/` via
`StateDirectory=zip`. If you're adding a new write path on the brain,
either use `StateDirectory` (gives you `/var/lib/<unit>/`) or
`/tmp/...` (with `PrivateTmp=true` it's per-unit).

**Reference:** [reference_jetson_perception_deploy.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_jetson_perception_deploy.md)

## Brain (Python)

### onnxruntime-gpu needs the right wheel

**Symptom:** `ImportError: cannot use CUDAExecutionProvider`. Or
detector silently falls back to CPU and runs at 1 FPS.

**Cause:** PyPI's `onnxruntime-gpu` doesn't ship a Jetson wheel.
The general CUDA wheel doesn't link against Jetson's CUDA libraries.

**Fix:** Install from the NVIDIA Jetson PyPI mirror:

```bash
.venv/bin/pip install onnxruntime-gpu \
  --index-url https://pypi.jetson-ai-lab.io/jp6/cu126/
```

Use the JetPack-matching index URL (jp6/cu126 for JetPack 6.2 with
CUDA 12.6, jp6/cu122 for CUDA 12.2 system, etc.).

The venv must be `--system-site-packages` so it inherits numpy 1.26 from
the system; mismatched numpy versions silently break onnxruntime.

### CameraHub upstream subprocess zombies

**Symptom:** After many HUD reconnects, multiple GStreamer pipelines
appear in `ps aux`, slowly eating GPU.

**Cause:** The CameraHub reference-counts subscribers, but a poorly
disconnected client (e.g. browser tab crash) can leave the count off.

**Fix:** Brain restart (`sudo systemctl restart zip-brain`) clears
everything. Long-term: the camera lifecycle code is being tightened.

## HUD (Next.js)

### Sticky topic latency

**Symptom:** After HUD reconnect, the motion lock badge shows blank for
1-2 seconds before populating.

**Cause:** This is **expected** — the brain sends sticky topic snapshots
on subscribe, but the round-trip takes the WebSocket handshake +
network + serialize time. Not a bug.

**Mitigation:** The HUD's `useServerMessageBus` retains the last value
locally so subsequent re-renders are instant; only the first paint
after connect is "blank."

### .pio dirs balloon repo size

**Symptom:** `git status` shows `.pio/` untracked but huge. Disk usage
is high.

**Cause:** PlatformIO build cache. Already gitignored via `.pio/`
globally.

**Fix:** `rm -rf zip-v2/firmware/*/.pio/` periodically. It rebuilds
in ~30 s for the UNO, longer for ESP32.

### Next.js 16 `next lint` is broken

**Symptom:** `npm run lint` exits with an error about CLI args.

**Cause:** Known Next.js 16.1.1 bug. Linting still runs as part of
`next build`.

**Workaround:** The `lint` script in `package.json` is a placeholder
that exits 0 with a message. Don't try to "fix" it — wait for upstream.

## Jarvis / splat-lab

### Black render in SuperSplat viewer

**Symptom:** DA3 → PLY pipeline produces a structurally-valid PLY, the
PlayCanvas WebGPU viewer loads it without error, **the splat renders
fully black**. Test cubes render fine; the issue is data-shaped.

**Cause:** DA3-backprojected Gaussians live on a sampled 2.5D depth
manifold. Adjacent pixels become near-coplanar Gaussians. PlayCanvas's
WebGPU tile compositor multiplies transmittance per layer (T *= 1−α).
With dense co-planar layers and α≈0.99, transmittance underflows to ~0
after a few layers. Everything behind renders black. The rasterizer
is mathematically correct — the data is the failure mode.

**Fix:** k-NN init for Gaussian scale (the standard 3DGS initialization).
See `jarvis/splat-lab/scripts/bake.py.knn-init-from-pc` for the
459-line refactor. Not yet verified on the Jetson; that's the next
concrete goal.

Full root-cause analysis with bisect evidence in
[jarvis/splat-lab/REPORT.md.pc-mirror](../jarvis/splat-lab/REPORT.md.pc-mirror).

### HTTP isn't secure context

**Symptom:** Browser at `http://192.168.55.1:8090/` won't enable WebGPU
or `SharedArrayBuffer`. Splat viewer fails to initialize.

**Cause:** Chrome only treats `https://` and `localhost` as secure
contexts. The Jetson's LAN IP doesn't qualify.

**Fix:** SSH-tunnel `localhost:8090 → Jetson:8090`. The
`.claude/launch.json` `jetson-splat` entry does this:

```bash
ssh -L 8090:127.0.0.1:8090 -L 8443:127.0.0.1:8443 -N zip-jetson
# then open http://localhost:8090/ in Chromium
```

### nginx `add_header` strips parent

**Symptom:** Only some routes have COOP/COEP/CORP headers; the
SuperSplat viewer fails on some pages but not others.

**Cause:** nginx's `add_header` in a nested `location {}` block
silently strips parent-block `add_header` directives — not merges.

**Fix:** Re-emit all isolation headers explicitly inside every
`location` block that needs them. The splat-lab nginx site config
does this.

## Jarvis / llm

### Ollama OOM with `num_ctx` ≥ 24576

**Symptom:** Loading the model fails with `cudaMalloc failed` on the
Jetson. Other Qwen3-4B users report 32k contexts working fine on other
hardware.

**Cause:** Ollama (llama.cpp under the hood) grabs a large contiguous
CUDA buffer for the KV cache. On the 8 GB Jetson with the desktop GUI
running, available GPU memory is ~6 GB; the dense KV cache for 24576
context overflows.

**Fix:** Cap context at 16384 (the OpenClaw minimum) with reduced
batch (256). The custom `zip-jarvis` Ollama Modelfile bakes both:

```
FROM qwen3:4b-instruct-2507-q4_K_M
PARAMETER num_ctx 16384
PARAMETER num_batch 256
```

Also: `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q4_0`,
`OLLAMA_MAX_LOADED_MODELS=1` in the systemd drop-in (q4_0 KV cache is
required to fit 16384 ctx; q8_0 caps at 4096).

For extra headroom: go headless (`systemctl set-default
multi-user.target`) to free ~700 MB of GPU memory used by gdm/desktop.

**Reference:** [reference_openclaw_jetson_deploy.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_openclaw_jetson_deploy.md)

### Nemotron / hybrid model OOM

**Symptom:** NVIDIA's Nemotron-3-Nano-4B-Hybrid promises small KV
cache but OOMs worse than Qwen3-4B on the same Jetson.

**Cause:** llama.cpp / Ollama have a known bug
([Ollama #12692](https://github.com/ollama/ollama/issues/12692),
[llama.cpp #16416](https://github.com/ggerganov/llama.cpp/issues/16416),
[#20570](https://github.com/ggerganov/llama.cpp/issues/20570)): the
Mamba-hybrid recurrent-state buffer is mis-sized. Hybrids OOM worse than
dense models on llama.cpp.

**Fix:** Don't use hybrids on this stack. Tiny-KV benefits are only
realized on vLLM / TRT-LLM (which don't run well on 8 GB anyway). Stick
with Qwen3-4B-2507 + the tuning above.

## General

### Windows path mojibake in git status

**Symptom:** `git status` shows files like `C\357\200\272Zip…` which
look broken but the actual on-disk name is `CZipjetson-splat-lab`.

**Cause:** Bash/MSYS encodes invalid-on-Windows chars (specifically `:`
in this case) using PUA code-points (U+F03A), then renders them via the
octal escape `\357\200\272` (= 0xEF 0x80 0xBA UTF-8 = U+F03A). PowerShell
shows the same files as plain `CZip…` without the colon.

**Fix:** If you spot these in `git status`, they're real files but with
weird names. PowerShell can delete via wildcard:

```powershell
Get-ChildItem -LiteralPath 'C:\Zip' -Force |
  Where-Object { $_.Name -like '*Zipjetson*' } |
  Remove-Item -LiteralPath { $_.FullName } -Recurse -Force
```

### CRLF warnings on commit

**Symptom:** Every `git add` on Windows shows dozens of warnings like
`LF will be replaced by CRLF the next time Git touches it`.

**Cause:** Git is normalizing line endings per the repo's `.gitattributes`
(or core.autocrlf if set globally).

**Fix:** Cosmetic — no action needed. Files commit fine.
