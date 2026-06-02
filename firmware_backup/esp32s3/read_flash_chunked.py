"""
Robust full-flash reader for the ESP32-S3 (Elegoo SmartCar cam module).

Works around an ESP32-S3 USB-Serial/JTAG limitation: sustained stub reads are
reset by the chip watchdog after ~5 s of cumulative uptime (deterministically
near flash offset 0x6a000), which kills the whole stub connection. We read in
small chunks and, whenever a read fails (connection lost to the WDT reset),
reconnect and resume from the last good offset. Data already written is correct;
a failed chunk is simply retried after reconnect, so the output is exact.

Usage:
    python read_flash_chunked.py <port> <out.bin> [total_bytes] [chunk_bytes]
"""
import sys, time

try:
    from esptool import detect_chip
except ImportError:  # esptool 5.x layout
    from esptool.cmds import detect_chip


def connect(port):
    esp = detect_chip(port)
    name = esp.CHIP_NAME
    esp = esp.run_stub()
    return esp, name


def main():
    port  = sys.argv[1] if len(sys.argv) > 1 else "COM4"
    out   = sys.argv[2] if len(sys.argv) > 2 else "full.bin"
    total = int(sys.argv[3], 0) if len(sys.argv) > 3 else 0x400000   # 4 MB (all used partitions)
    chunk = int(sys.argv[4], 0) if len(sys.argv) > 4 else 0x10000    # 64 KB per read
    proactive = 0x40000   # voluntarily reconnect every 256 KB to stay under the WDT window

    print(f"Connecting to {port} ...", flush=True)
    esp, name = connect(port)
    print(f"Chip: {name}  stub running", flush=True)

    t0 = time.time()
    off = 0
    since_reconnect = 0
    reconnects = 0
    MAX_RECONNECTS = 400
    with open(out, "wb") as f:
        while off < total:
            n = min(chunk, total - off)

            # Proactive reconnect to reset the watchdog timer before it fires.
            if since_reconnect >= proactive:
                try: esp._port.close()
                except Exception: pass
                esp, _ = connect(port)
                reconnects += 1
                since_reconnect = 0

            try:
                data = esp.read_flash(off, n)
            except Exception as e:
                reconnects += 1
                if reconnects > MAX_RECONNECTS:
                    raise RuntimeError(f"too many reconnects at {off:#08x}: {e}")
                print(f"  reconnect #{reconnects} at {off:#08x} ({type(e).__name__})", flush=True)
                try: esp._port.close()
                except Exception: pass
                time.sleep(0.3)
                esp, _ = connect(port)
                since_reconnect = 0
                continue  # retry same offset

            f.write(data)
            off += n
            since_reconnect += n
            if off % 0x40000 == 0 or off == total:
                pct = 100 * off / total
                print(f"  {off:#08x} / {total:#08x}  ({pct:5.1f}%)  reconnects={reconnects}", flush=True)

    dt = time.time() - t0
    print(f"DONE: {off} bytes in {dt:.1f}s, {reconnects} reconnects -> {out}", flush=True)
    try: esp.hard_reset()
    except Exception: pass


if __name__ == "__main__":
    main()
