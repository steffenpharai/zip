#!/usr/bin/env python3
"""Tiny WebSocket reload broadcaster for the SuperSplat Viewer.

A producer (e.g. the splat trainer) calls touch_reload(scan_id) when a
new SOG bundle is written; connected browser clients receive {"type":"reload",
"scan_id":...} and reload the viewer iframe.

Usage:
    # Run as a service
    python ws_reload.py --port 8091

    # Trigger a reload from anywhere on the box
    curl -X POST http://localhost:8091/reload?scan_id=room1

Architecture: file-watch on ~/splat-lab/scenes/<scan_id>/live.sog (atomic
mv-based writes only — never partial). On mtime change broadcast to all WS
clients subscribed to that scan_id (or all if no filter).

Deps: aiohttp + watchfiles, both available in the splat-lab venv.
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

from aiohttp import web

LOG = logging.getLogger("ws_reload")
SCENES = Path.home() / "splat-lab" / "scenes"


class Hub:
    def __init__(self):
        self.clients: set[web.WebSocketResponse] = set()
        self.client_scans: dict[web.WebSocketResponse, str | None] = {}

    async def broadcast(self, msg: dict, scan_id: str | None = None):
        payload = json.dumps(msg)
        stale = []
        for ws in self.clients:
            if scan_id is not None and self.client_scans.get(ws) not in (None, scan_id):
                continue
            try:
                await ws.send_str(payload)
            except ConnectionResetError:
                stale.append(ws)
        for ws in stale:
            self.clients.discard(ws)
            self.client_scans.pop(ws, None)


async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    scan_id = request.query.get("scan_id")
    hub: Hub = request.app["hub"]
    hub.clients.add(ws)
    hub.client_scans[ws] = scan_id
    LOG.info("ws connect from %s scan_id=%s (n=%d)",
             request.remote, scan_id, len(hub.clients))
    try:
        await ws.send_str(json.dumps({"type": "hello", "scan_id": scan_id}))
        async for msg in ws:
            pass   # the server only broadcasts; client sends nothing
    finally:
        hub.clients.discard(ws)
        hub.client_scans.pop(ws, None)
        LOG.info("ws disconnect (n=%d)", len(hub.clients))
    return ws


async def reload_handler(request: web.Request) -> web.Response:
    """POST /reload?scan_id=room1[&tier=live|hero|phone]"""
    scan_id = request.query.get("scan_id")
    tier = request.query.get("tier", "live")
    msg = {"type": "reload", "scan_id": scan_id, "tier": tier, "ts": time.time()}
    await request.app["hub"].broadcast(msg, scan_id=scan_id)
    return web.json_response({"ok": True, "broadcast": msg,
                              "clients": len(request.app["hub"].clients)})


async def health_handler(request: web.Request) -> web.Response:
    return web.json_response({
        "ok": True,
        "clients": len(request.app["hub"].clients),
        "uptime_s": time.monotonic() - request.app["t_start"],
    })


async def watch_loop(app):
    """Background task: watch scenes/<*>/live.sog for atomic writes; broadcast."""
    try:
        from watchfiles import awatch, Change
    except ImportError:
        LOG.warning("watchfiles not installed — file-watch disabled "
                    "(POST /reload still works)")
        return
    LOG.info("watching %s for live.sog updates", SCENES)
    SCENES.mkdir(parents=True, exist_ok=True)
    last_seen: dict[Path, float] = {}
    async for changes in awatch(str(SCENES), recursive=True):
        for change, path in changes:
            p = Path(path)
            if p.name not in ("live.sog", "hero.sog", "phone.sog",
                              "scene.ply", "scene.compressed.ply"):
                continue
            # debounce: don't fire twice within 500 ms for same path
            now = time.monotonic()
            if now - last_seen.get(p, 0) < 0.5:
                continue
            last_seen[p] = now
            scan_id = p.parent.name
            tier = p.stem  # live / hero / phone
            LOG.info("file change %s tier=%s scan_id=%s", change.name, tier, scan_id)
            await app["hub"].broadcast(
                {"type": "reload", "scan_id": scan_id,
                 "tier": tier, "ts": time.time()},
                scan_id=scan_id,
            )


async def on_startup(app):
    app["t_start"] = time.monotonic()
    app["watch_task"] = asyncio.create_task(watch_loop(app))


async def on_cleanup(app):
    app["watch_task"].cancel()
    try:
        await app["watch_task"]
    except asyncio.CancelledError:
        pass


def build_app() -> web.Application:
    app = web.Application()
    app["hub"] = Hub()
    app.add_routes([
        web.get("/ws", ws_handler),
        web.post("/reload", reload_handler),
        web.get("/health", health_handler),
    ])
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8091)
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--log-level", default="INFO")
    args = p.parse_args()
    logging.basicConfig(level=args.log_level,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    web.run_app(build_app(), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
