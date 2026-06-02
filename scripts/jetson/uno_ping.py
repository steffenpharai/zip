#!/usr/bin/env python3
"""Smallest possible Jetson-side UNO sanity ping over /dev/ttyUSB0.

Sends three of the documented JSON commands and prints raw responses.
Used during Phase 1 bringup to confirm Jetson↔UNO UART works the same way
the PC did. Not part of the runtime service — this is a one-shot probe.
"""
import serial
import time
import sys

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/ttyUSB0"
BAUD = 115200

with serial.Serial(PORT, BAUD, timeout=2) as p:
    # UNO auto-reset on DTR — wait for bootloader handoff + firmware init banner
    time.sleep(2.5)

    boot = b""
    deadline = time.time() + 1.5
    while time.time() < deadline:
        chunk = p.read(p.in_waiting or 1)
        if not chunk:
            break
        boot += chunk
    print("--- UNO boot banner ---")
    print(boot.decode(errors="replace"))

    commands = [
        b'{"N":0,"H":"ping"}\n',
        b'{"N":23,"H":"batt"}\n',
        b'{"N":21,"H":"u","D1":2}\n',
    ]
    for cmd in commands:
        p.write(cmd)
        time.sleep(0.2)

    resp = b""
    deadline = time.time() + 1.5
    while time.time() < deadline:
        chunk = p.read(p.in_waiting or 1)
        if chunk:
            resp += chunk
    print("--- responses (N=0 ping / N=23 batt / N=21 ultrasonic) ---")
    print(resp.decode(errors="replace"))
