# ADR 0003 — UART at exactly 500000 baud

**Status:** Accepted (Phase 3.5)

## Context

Phase 3 left the UART between brain and UNO at the Arduino-default
115200 baud. With ~50-byte JSON setpoints arriving at 50 Hz from the
HUD, the round-trip latency was visibly bad — keydown → motor was
~150 ms. A 50-byte JSON message at 115200 baud is ~4.5 ms on the wire
alone; pile up streaming + processing and the total bloats.

The obvious fix was a higher baud rate. The naive picks were 460800 (a
"standard" high baud) or 921600 (USB UART common max). Picking these
without doing the math is a trap on AVR.

The ATmega328P's UART baud generator uses an integer register (UBRR).
At 16 MHz with U2X=1 (double-speed), the formula is `UBRR = (F_CPU / (8
* baud)) - 1`. **Rounding to nearest integer is the actual baud rate the
chip transmits.** Asking for 460800 ends up generating 500000 (UBRR=3,
8.5% off). The host expects 460800; the chip transmits 500000; you
read garbage and blame "noise."

## Decision

**The UART between the brain and the UNO runs at exactly 500000 baud.**
This is the rate that lands on a clean integer UBRR with zero baud-rate
error at 16 MHz.

Acceptable rates (zero error at 16 MHz, U2X=1):

| Baud | UBRR | Notes |
|---|---|---|
| 250000 | 7 | Half the win |
| 500000 | 3 | **Chosen** |
| 1000000 | 1 | Tested unstable across some USB-UART chips |
| 2000000 | 0 | Single-bit; doesn't work reliably |

**500000 is selected** because it's the highest rate that's stable
across the CH340 USB-UART used in the Elegoo dev cable. 1000000 worked
on bench but had intermittent framing errors with some cables.

This must be set in three places — keep them synchronized:

1. **UNO firmware** — `include/config.h`:
   ```c
   #ifndef SERIAL_BAUD
     #define SERIAL_BAUD 500000
   #endif
   ```
2. **Brain config** — env var `ZIP_UNO_BAUD=500000` (default), set in
   the systemd unit drop-in.
3. **Bench tools** — any manual `pio device monitor` or `screen
   /dev/ttyUSB0 …` must use `-b 500000`.

## Consequences

**Easier:**
- A 50-byte setpoint takes ~1 ms on the wire (vs. 4.5 ms at 115200).
  Total keydown → motor is now ~70 ms — feels responsive.
- 100 Hz UNO control loop now has headroom for more sensors per cycle.

**Harder:**
- **Baud-rate skew.** Anyone debugging with `screen` or `minicom` at
  115200 sees garbage. Every doc + workflow must mention 500000.
- **Cable sensitivity.** Cheap USB-UART cables are more lossy at higher
  baud. The CH340 has been fine; FTDI typically better still.
- **Future MCU swaps.** If we ever move to a different MCU (RP2040,
  ESP32), the UBRR math is different. The "exact 500000" property
  needs revalidation per chip.

## Forbidden rates

Do not use these even if they look standard:

- **460800** — UBRR rounds to 3 (= 500000 actual), 8.5% error. **Trap.**
- **921600** — UBRR rounds to 1 (= 1000000 actual), 8.5% error. **Trap.**
- **115200** — works, but throws away the latency win.

## Reference

- [reference_avr_baud_math.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_avr_baud_math.md)
- [reference_pio_define_shadow_trap.md](../../C:/Users/phara/.claude/projects/C--Zip/memory/reference_pio_define_shadow_trap.md)
  — why `-D SERIAL_BAUD=…` in `platformio.ini` is silently shadowed if
  `config.h` doesn't guard the macro.
