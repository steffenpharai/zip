#!/usr/bin/env python3
"""
Query ESP32 Camera Health Endpoint
Usage: python query_health.py [IP_ADDRESS]
Default IP: 192.168.4.1
"""

import sys
import json
import urllib.request
import urllib.error
from typing import Dict, Any

def query_health(ip: str = "192.168.4.1") -> Dict[str, Any]:
    """Query the /health endpoint and return parsed JSON."""
    url = f"http://{ip}/health"
    
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = response.read().decode('utf-8')
            return json.loads(data)
    except urllib.error.URLError as e:
        print(f"Error connecting to {ip}: {e}")
        print("Make sure:")
        print("  1. ESP32 is powered on")
        print("  2. You're connected to the WiFi AP")
        print("  3. IP address is correct")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        print(f"Response: {data}")
        sys.exit(1)

def print_camera_diagnostics(health: Dict[str, Any]):
    """Print detailed camera diagnostics."""
    camera = health.get("camera", {})
    
    print("\n" + "="*60)
    print("  CAMERA DIAGNOSTICS")
    print("="*60)
    
    status = camera.get("status", "UNKNOWN")
    init_ok = camera.get("init_ok", False)
    error = camera.get("last_error", "Unknown")
    error_code = camera.get("error_code", 0)
    error_code_name = camera.get("error_code_name", "ESP_OK")
    
    print(f"Status:        {status}")
    print(f"Initialized:   {'YES' if init_ok else 'NO'}")
    print(f"Last Error:    {error}")
    if error_code != 0:
        print(f"Error Code:    0x{error_code:x} ({error_code_name})")
    
    print(f"\nStatistics:")
    print(f"  Captures:    {camera.get('captures', 0)}")
    print(f"  Failures:    {camera.get('failures', 0)}")
    last_capture_ms = camera.get("last_capture_ms", 0)
    last_frame_bytes = camera.get("last_frame_bytes", 0)
    idle_ms = camera.get("idle_ms", 0)
    if last_capture_ms > 0:
        print(f"  Last Capture: {last_capture_ms} ms, {last_frame_bytes} bytes")
    if idle_ms > 0:
        print(f"  Idle Time:    {idle_ms} ms")
    
    # Diagnosis
    print(f"\nDiagnosis:")
    if status == "NOT_INITIALIZED":
        print("  ❌ Camera not initialized")
        print("  Possible causes:")
        print("    - Camera init failed in setup()")
        print("    - Camera resume failed after WiFi init")
        print("    - No saved config for resume")
    elif status == "INIT_FAILED":
        print("  ❌ Camera initialization failed")
        print(f"  Error: {error}")
        print("  Possible causes:")
        print("    - Camera hardware not connected")
        print("    - Pin configuration mismatch")
        print("    - PSRAM not detected")
        print("    - Power supply issues")
    elif status == "OK":
        print("  ✅ Camera is operational")
    else:
        print(f"  ⚠️  Camera status: {status}")

def print_uart_diagnostics(health: Dict[str, Any]):
    """Print UART diagnostics."""
    uart = health.get("uart", {})
    
    print("\n" + "="*60)
    print("  UART DIAGNOSTICS")
    print("="*60)
    
    init_ok = uart.get("init_ok", False)
    print(f"Initialized:   {'YES' if init_ok else 'NO'}")
    print(f"RX Pin:        GPIO{uart.get('rx_pin', '?')}")
    print(f"TX Pin:        GPIO{uart.get('tx_pin', '?')}")
    
    print(f"\nStatistics:")
    print(f"  RX Bytes:      {uart.get('rx_bytes', 0)}")
    print(f"  TX Bytes:      {uart.get('tx_bytes', 0)}")
    print(f"  RX Frames:     {uart.get('rx_frames', 0)}")
    print(f"  TX Frames:     {uart.get('tx_frames', 0)}")
    print(f"  Framing Errors: {uart.get('framing_errors', 0)}")
    print(f"  Buffer Overflows: {uart.get('buffer_overflows', 0)}")
    print(f"  RX Available:  {uart.get('rx_available', 0)} bytes")
    
    last_rx_ts = uart.get("last_rx_ts", 0)
    last_tx_ts = uart.get("last_tx_ts", 0)
    idle_ms = uart.get("idle_ms", 0)
    if last_rx_ts > 0:
        print(f"  Last RX:       {last_rx_ts} ms ago")
    if last_tx_ts > 0:
        print(f"  Last TX:       {last_tx_ts} ms ago")
    if idle_ms > 0:
        print(f"  Idle Time:     {idle_ms} ms")
    
    rx_bytes = uart.get("rx_bytes", 0)
    rx_frames = uart.get("rx_frames", 0)
    buffer_overflows = uart.get("buffer_overflows", 0)
    
    print(f"\nDiagnosis:")
    if not init_ok:
        print("  ❌ UART not initialized")
        print("  Check:")
        print("    - UART initialization in setup()")
        print("    - Boot guard expired")
    elif rx_bytes == 0:
        print("  ⚠️  No data received from Arduino UNO")
        print("  Check:")
        print("    - Arduino UNO is powered on")
        print("    - Shield slide-switch in 'cam' position")
        print("    - UART pins connected correctly")
    elif rx_bytes > 0 and rx_frames == 0:
        print("  ⚠️  Data received but no complete frames")
        print("  This is normal if:")
        print("    - Only partial data received")
        print("    - Arduino hasn't sent complete JSON frames yet")
        print("    - Frame parser waiting for { } boundaries")
    elif buffer_overflows > 0:
        print(f"  ⚠️  Buffer overflows detected ({buffer_overflows})")
        print("  UART RX buffer may be too small or data arriving too fast")
    else:
        print(f"  ✅ UART communication active ({rx_frames} frames)")

def print_system_info(health: Dict[str, Any]):
    """Print system information."""
    print("\n" + "="*60)
    print("  SYSTEM INFORMATION")
    print("="*60)
    
    chip = health.get("chip", {})
    print(f"Model:         {chip.get('model', '?')}")
    print(f"Revision:      {chip.get('revision', '?')}")
    print(f"Cores:         {chip.get('cores', '?')}")
    print(f"Frequency:     {chip.get('freq_mhz', '?')} MHz")
    flash_mb = chip.get("flash_size_mb", 0)
    if flash_mb > 0:
        print(f"Flash:         {flash_mb} MB")
    
    psram = health.get("psram", {})
    detected = psram.get("detected", False)
    print(f"\nPSRAM:")
    print(f"  Detected:   {'YES' if detected else 'NO'}")
    if detected:
        total = psram.get("bytes", 0)
        free = psram.get("free", 0)
        used = psram.get("used", 0)
        print(f"  Total:      {total:,} bytes ({total/(1024*1024):.2f} MB)")
        print(f"  Free:       {free:,} bytes ({free/(1024*1024):.2f} MB)")
        print(f"  Used:       {used:,} bytes ({used/(1024*1024):.2f} MB)")
        if not detected:
            print("  ⚠️  PSRAM not detected - camera may not work")
    else:
        print("  ❌ PSRAM not detected - camera requires PSRAM")
    
    heap = health.get("heap", {})
    print(f"\nHeap:")
    free = heap.get("free", 0)
    min_free = heap.get("min_free", 0)
    largest = heap.get("largest_free_block", 0)
    print(f"  Free:       {free:,} bytes ({free/1024:.2f} KB)")
    print(f"  Min Free:   {min_free:,} bytes ({min_free/1024:.2f} KB)")
    if largest > 0:
        print(f"  Largest:    {largest:,} bytes ({largest/1024:.2f} KB)")
    
    wifi = health.get("wifi", {})
    print(f"\nWiFi:")
    status = wifi.get("status", "UNKNOWN")
    init_ok = wifi.get("init_ok", False)
    print(f"  Status:     {status}")
    print(f"  Initialized: {'YES' if init_ok else 'NO'}")
    print(f"  Mode:       {wifi.get('mode', '?')}")
    print(f"  SSID:       {wifi.get('ssid', '?')}")
    print(f"  IP:         {wifi.get('ip', '?')}")
    print(f"  TX Power:   {wifi.get('tx_power', 0)} dBm")
    print(f"  Stations:   {wifi.get('stations', 0)}")
    uptime_ms = wifi.get("uptime_ms", 0)
    if uptime_ms > 0:
        uptime_sec = uptime_ms / 1000
        print(f"  Uptime:     {uptime_sec:.1f} seconds")
    last_error = wifi.get("last_error", "")
    if last_error and last_error != "OK":
        print(f"  Last Error: {last_error}")
    
    # WiFi diagnosis
    if status == "ERROR" or status == "TIMEOUT":
        print(f"\n  ❌ WiFi {status}")
        if last_error:
            print(f"  Error: {last_error}")
    elif status == "INITIALIZING":
        print(f"\n  ⚠️  WiFi still initializing...")
    elif status == "AP_ACTIVE":
        print(f"\n  ✅ WiFi AP active")

def main():
    ip = sys.argv[1] if len(sys.argv) > 1 else "192.168.4.1"
    
    print(f"Querying health endpoint at http://{ip}/health...")
    
    health = query_health(ip)
    
    print_camera_diagnostics(health)
    print_uart_diagnostics(health)
    print_system_info(health)
    
    print("\n" + "="*60)
    print("  RAW JSON")
    print("="*60)
    print(json.dumps(health, indent=2))

if __name__ == "__main__":
    main()

