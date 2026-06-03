# ZIP V2 — Wire Protocols

Every message that crosses a tier boundary. Update this *and* the
corresponding code together; the README's "single source of truth"
status holds only if the two stay in sync.

## Layers

```
HUD (Next.js/React)
   ⇅ WebSocket JSON envelopes — port 8080
zip-brain (FastAPI on Jetson, port 8080)
   ⇅ UART JSON lines — /dev/ttyUSB0 @ 500000 baud
UNO motion controller (Arduino, ATmega328P)

zip-brain (FastAPI on Jetson, port 8080)
   ⇅ HTTP multipart/x-mixed-replace — `/cam/{name}`
HUD <img>

zip-brain (aiohttp client)
   ⇅ HTTP multipart/x-mixed-replace — http://192.168.86.49:81/stream
ESP32-S3 OV2640 (ESP-IDF httpd)
```

## UART: zip-brain ↔ UNO (port 8080 internal · `/dev/ttyUSB0` @ 500000 baud)

JSON lines, one per command/response, terminated by `\n`. The protocol is
inherited from the V1 firmware unchanged.

### Commands (zip-brain → UNO)

| N | Purpose | Args | Response shape | Notes |
| --- | --- | --- | --- | --- |
| 0 | Hello/ping | `H:tag` | `{<tag>_ok}` | Handshake |
| 21 | Ultrasonic | `H:tag, D1:2` | `{<tag>_<cm>}` | Distance in cm, 0–400 |
| 22 | Line sensor | `H:tag, D1:0|1|2` | `{<tag>_<value>}` | 0=L, 1=M, 2=R |
| 23 | Battery | `H:tag` | `{<tag>_<mv>}` | Voltage in mV |
| 200 | Drive setpoint | `D1:v, D2:w, T:ttl_ms` | (none — fire-and-forget) | v,w in PWM units −255…255. TTL ≤ 500 ms. |
| 201 | Emergency stop | `H:tag` | `{<tag>_ok}` | Cancels macro + setpoint |
| 210 | Macro start | `D1:id, D2:intensity, T:ttl_ms` | `{<tag>_ok}` | id ∈ {1..4}: FIGURE_8, SPIN_360, WIGGLE, FORWARD_THEN_STOP |
| 211 | Macro cancel | `H:tag` | `{<tag>_ok}` | |
| 300 | Servo angle | `D1:angle` | `{<tag>_ok}` | 0–180° |
| 999 | Direct PWM | `D1:L, D2:R, H:tag` | `{<tag>_ok}` | Bypass motion controller. For tuning. |

Tag-on-response: the UNO echoes whichever `H:` we sent. The brain's
`uno_link.py` chooses tags that match its regex parsers exactly
(`batt`, `ultra`, etc.) — never `qbatt` or other prefixed variants. We
hit this bug in Phase 3 and it cost us 30 minutes of head-scratching.

### Safety

- **Deadman TTL.** Every `N=200` setpoint carries a TTL; if no new
  setpoint arrives within that window, the UNO halts the motors. The
  brain's `motion_gateway` re-sends every 100 ms to keep this alive
  while the operator holds an input.
- **Rate limit.** Setpoints in excess of 50 Hz are ignored. The brain's
  intake_loop respects this.
- **Hard-stop overrides**: `N=201`, `N=100` (legacy standby), `N=3 D1=9`
  (legacy stop) always halt immediately.

## WebSocket: Jetson ↔ Clients

`ws://<jetson-host>:8080/ws` — duplex. Client opens; server greets with
`hello`; bidirectional JSON thereafter. CORS is wide-open in Phase 3 and
will be locked down in Phase 10.

### Client → Server

| Message | Shape | Effect |
| --- | --- | --- |
| `drive` | `{type:"drive", id?, v, w, ttl_ms}` | Forwards to UNO `N=200`. `v`, `w` are PWM units −255…255. |
| `stop` | `{type:"stop", id?}` | Forwards to UNO `N=201`. |
| `macro` | `{type:"macro", id?, macro_id ∈ {1..4}, intensity 0..255, ttl_ms}` | Forwards to UNO `N=210`. |
| `ping` | `{type:"ping", id?}` | Server replies `pong`. |

If `id` is present, the server includes it in the matching `ack`/`pong`
reply so the client can correlate.

### Server → Client

| Message | Shape | When |
| --- | --- | --- |
| `hello` | `{type:"hello", protocol_version, service_version, uno_connected, uno_port, ts}` | On every new connection. |
| `telemetry` | `{type:"telemetry", battery_mv, ultrasonic_cm, ts}` | Each telemetry poll (default 250 ms). Replays latest on new subscribe. |
| `uno_status` | `{type:"uno_status", connected, port}` | On every UART link state change. Replays latest on new subscribe. |
| `uno_raw` | `{type:"uno_raw", direction:"in"|"out", line, ts}` | Every UART line in or out — used by the HUD's UART console. Does NOT replay. |
| `pong` | `{type:"pong", id?, ts}` | Reply to `ping`. |
| `ack` | `{type:"ack", id?, ok, error?}` | Reply to any non-`ping` command. |
| `error` | `{type:"error", error}` | Malformed inbound JSON. |

**Sticky topics**: `telemetry.sample` and `uno.status` are *replayed* to
new subscribers so a freshly-connected HUD doesn't sit at "—" for a
quarter of a second waiting for the next poll. `uno.raw_in/raw_out` are
streams, deliberately not replayed.

### Connection lifecycle hygiene

The HUD opens *two* WebSocket connections per browser tab:

1. The canonical state-bus connection (`useZipBrain`).
2. A parallel side-channel for pong/ack monitoring
   (`useParallelWsBus`).

Both must depend ONLY on `url` in their `useEffect` deps array. If they
include a state object that's recreated each render, the effect tears
down and rebuilds the socket every render, and the brain accumulates 90+
zombie clients within minutes. We hit this bug in Phase 3 — see
[`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md).

## HTTP: Camera streams

### `GET /cam/list` — registry

```json
[
  {"name": "bow", "label": "BOW · USB · C615",  "kind": "v4l2", "width": 640, "height": 480, "fps": 15, "stream": "/cam/bow"},
  {"name": "aft", "label": "AFT · WIFI · OV2640", "kind": "http", "width": 640, "height": 480, "fps": 15, "stream": "/cam/aft"}
]
```

The HUD polls this every 5 s as a brain heartbeat + camera discovery.

### `GET /cam/{name}` — multipart MJPEG

Response headers:

```
HTTP/1.1 200 OK
Content-Type: multipart/x-mixed-replace; boundary=zipmjpeg
Cache-Control: no-cache, no-store, must-revalidate
X-Accel-Buffering: no
Transfer-Encoding: chunked
```

Body:

```
--zipmjpeg\r\n
Content-Type: image/jpeg\r\n
Content-Length: <bytes>\r\n
\r\n
<JPEG bytes>\r\n
--zipmjpeg\r\n
...
```

The browser renders this natively in an `<img>` tag — no JS parser
needed.

### `GET /health` — brain status

```json
{
  "ok": true,
  "service": "zip-brain",
  "version": "0.2.0",
  "protocol": "v2.0",
  "uno_connected": true,
  "uno_port": "/dev/ttyUSB0",
  "clients": 0,
  "uptime_s": 1.1,
  "cameras": ["bow", "aft"]
}
```

## HTTP: ESP32 (`http://zip-esp32-cam.local:81/` or `http://192.168.86.49:81/`)

The ESP32-S3 STA firmware (`zip_esp32_cam_sta`) hosts three endpoints:

| Endpoint | Effect |
| --- | --- |
| `GET /` | Plain-text identity page |
| `GET /health` | JSON: `{ok, ssid, ip, rssi, uptime_ms, hostname}` |
| `GET /stream` | multipart/x-mixed-replace MJPEG, boundary `zipmjpeg`, 640×480 native |

mDNS hostname: `zip-esp32-cam.local`.

The brain proxies `/cam/aft` → this endpoint. The HUD never talks
directly to the ESP32 — that would require it to be on the home Wi-Fi
subnet, which we don't assume.

## Internal asyncio bus topics (inside zip-brain, not on the wire)

For implementor reference only — these topics are NOT exposed over the
network. They're the contract between the brain's own subsystems.

| Topic | Producer | Consumers | Sticky? |
| --- | --- | --- | --- |
| `motion.setpoint` | `motion_gateway` | `uno_link.writer` | no |
| `motion.stop` | `motion_gateway`, `control_plane` (E-stop) | `uno_link.writer` | no |
| `motion.macro` | `motion_gateway` | `uno_link.writer` | no |
| `client.motion.drive` | `control_plane.ws.inbound` | `motion_gateway.intake` | no |
| `client.motion.stop` | `control_plane.ws.inbound`, last-client-leaves | `motion_gateway` | no |
| `client.motion.macro` | `control_plane.ws.inbound` | `motion_gateway` | no |
| `uno.query` | `uno_link.telemetry_poller` | `uno_link.writer` | no |
| `uno.raw_in` | `uno_link.reader` | `control_plane.ws.outbound` | no |
| `uno.raw_out` | `uno_link.writer` | `control_plane.ws.outbound` | no |
| `uno.status` | `uno_link` (connect/disconnect) | `control_plane.lifespan`, `control_plane.ws.outbound` | **yes** |
| `telemetry.sample` | `uno_link.reader` | `control_plane.ws.outbound` | **yes** |
