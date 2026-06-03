# ZIP V2 — Development Workflow

Per-layer how-to. For cold-start setup see
[`DEPLOY.md`](./DEPLOY.md).

## Editing the HUD (Next.js)

```bash
cd C:\Zip
npm install     # one time
npm run dev:local
# http://localhost:3000/v2 — hot-reloads
```

Changes you make in `app/v2/`, `components/v2/`, or `lib/v2/` are
picked up automatically. Type-check before pushing:

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Commit + push to `zip-v2`:

```bash
cd C:\Zip
git add app/v2 components/v2 lib/v2 ...
git commit -m "HUD: ..."
git push origin master
```

## Editing the Jetson brain (Python)

The Jetson runs `zip-brain` as a systemd service from `/home/zip/zip`,
which is a clone of the `zip-brain` repo. Edit locally in `C:\Zip\jetson/`,
push to GitHub, pull on the Jetson, restart the service:

```bash
# Edit
cd C:\Zip\jetson
# ... make changes in zip_brain/...

# Commit (this is its OWN git repo, not the outer zip-v2):
git add zip_brain/...
git commit -m "brain: ..."
git push origin main

# Pull + restart on Jetson:
ssh zip-jetson 'cd ~/zip && git pull && sudo systemctl restart zip-brain'
sleep 2
ssh zip-jetson 'curl -s http://localhost:8080/health | python3 -m json.tool'
```

Tail the logs:

```bash
ssh zip-jetson 'sudo journalctl -u zip-brain -f'
```

If you change `requirements.txt`, pip install after pulling:

```bash
ssh zip-jetson 'cd ~/zip && .venv/bin/pip install -r requirements.txt && sudo systemctl restart zip-brain'
```

## Updating the UNO firmware

Build on PC, flash from Jetson (since the shield's USB-B lives on the
Jetson in normal operation):

```bash
cd C:\Zip\robot\firmware\zip_robot_uno
pio run -e uno
scp .pio/build/uno/firmware.hex zip-jetson:/tmp/uno.hex
ssh zip-jetson '
  sudo systemctl stop zip-brain
  sudo avrdude -c arduino -p atmega328p -P /dev/ttyUSB0 -b 115200 \
    -U flash:w:/tmp/uno.hex:i
  sudo systemctl start zip-brain
'
```

**The bootloader baud is always 115200**, independent of the runtime
`SERIAL_BAUD`. Don't try to flash at 500000.

To tune runtime parameters without touching code, prefer build flags
in `platformio.ini` over editing the headers — the headers are also
the V1 reference and we want them stable. The runtime tuning we've
applied lives under the `; ---- V2 latency tuning` comment block in
`zip_robot_uno/platformio.ini`.

## Updating the ESP32-S3 STA camera firmware

```bash
# Ensure secrets.h exists locally (not in git):
cat C:\Zip\robot\firmware\zip_esp32_cam_sta\include\secrets.h
# Should #define ZIP_WIFI_SSID and ZIP_WIFI_PASSWORD

cd C:\Zip\robot\firmware\zip_esp32_cam_sta
pio run -e esp32cam_sta -t upload --upload-port COM4

# Confirm the chip rejoined Wi-Fi:
ssh zip-jetson 'curl -s http://zip-esp32-cam.local:81/health'
```

After every reflash the chip may land in bootloader (see
[`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md#esp32-s3-stuck-in-bootloader)). If
`/health` doesn't respond within ~10s, **press the physical RST button
on the ESP32 module**.

## Inspecting wire traffic

### UART (UNO ↔ Jetson)

The HUD's "LOG // UART" pane shows raw JSON in both directions. For
non-HUD debugging:

```bash
ssh zip-jetson 'sudo journalctl -u zip-brain -f | grep raw_'
```

Or hook `pio device monitor` directly if you stop the brain first.

### WebSocket (HUD ↔ Jetson)

Browser DevTools → Network → WS filter → click any `/ws` connection →
Messages tab.

Server-side: `journalctl -u zip-brain` shows accept/disconnect events
and message-type info logs.

### MJPEG

```bash
# Direct from ESP32:
curl -s http://zip-esp32-cam.local:81/stream | xxd | head

# Through Jetson proxy:
curl -s http://192.168.55.1:8080/cam/aft | xxd | head
```

## SSH config on the PC

`~/.ssh/config` should have:

```
Host zip-jetson
    HostName 192.168.55.1
    User zip
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 30
    ServerAliveCountMax 3
```

The Jetson is also reachable on home Wi-Fi at its DHCP-assigned IP, but
the USB-C bridge is the dev path.

## GitHub auth on Jetson

The `zip` user has `~/.netrc` populated from root's `gh` OAuth token.
This means `git clone https://github.com/...` works without prompts.

If you ever need to rotate the token:

```bash
ssh zip-jetson '
  TOKEN=$(sudo awk "/oauth_token:/ {print \$2}" /root/.config/gh/hosts.yml)
  umask 077
  cat > ~/.netrc <<EOF
machine github.com
  login steffenpharai
  password $TOKEN
machine api.github.com
  login steffenpharai
  password $TOKEN
EOF
'
```

The gh CLI on Jetson is 2.4 (too old for `gh auth token`); hence
parsing `/root/.config/gh/hosts.yml` directly.

## Tests we run before committing

```bash
# HUD typecheck (must pass clean)
cd C:\Zip && node_modules/.bin/tsc --noEmit

# UNO firmware compiles
cd C:\Zip\robot\firmware\zip_robot_uno && pio run -e uno

# ESP32 firmware compiles
cd C:\Zip\robot\firmware\zip_esp32_cam_sta && pio run -e esp32cam_sta

# zip-brain imports (no syntax errors)
ssh zip-jetson 'cd ~/zip && .venv/bin/python -c "import zip_brain; print(zip_brain.__version__)"'

# End-to-end smoke test (brain replies)
curl -s http://192.168.55.1:8080/health
```

CI is not set up yet — pre-commit checks are manual. Add CI in Phase
10 alongside internet reachability.

## Commit style

- Use the body of the commit message liberally to explain *why*, not
  just *what*. Future-you (or the next agent) will thank you.
- Branching: `master` on `zip-v2`, `main` on `zip-brain`. No branch
  conventions yet because we're solo on both repos. Once teammates
  show up, switch to feature branches + PRs.
- `Co-Authored-By: …` lines are not required but appreciated when AI
  assistance was substantial.
