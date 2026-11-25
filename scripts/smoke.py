#!/usr/bin/env python3
"""Serve the repo on a free port and verify every asset the viewer needs.

Catches the failure modes a static site actually has: a missing vendor file, a
typo in the import map, a data file that is not valid JSON, or a path that only
works from the filesystem root.

    python scripts/smoke.py
"""

from __future__ import annotations

import http.server
import json
import socket
import threading
import urllib.request
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ASSETS = [
    "/",
    "/index.html",
    "/app.js",
    "/style.css",
    "/data/osi.json",
    "/data/cmdb.json",
    "/vendor/three.module.js",
    "/vendor/three.core.js",
    "/vendor/addons/controls/OrbitControls.js",
]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> int:
    port = free_port()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.log_message = lambda *a, **k: None
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    failures = []
    try:
        for path in ASSETS:
            url = f"http://127.0.0.1:{port}{path}"
            try:
                with urllib.request.urlopen(url, timeout=10) as r:
                    body = r.read()
                    code = r.status
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{path}: {exc}")
                print(f"FAIL {path:<44} {exc}")
                continue
            note = f"{code} {len(body)} B"
            if path.endswith(".json"):
                try:
                    data = json.loads(body)
                    note += f"  ({len(data.get('layers', data.get('cis', [])))} entries)"
                except json.JSONDecodeError as exc:
                    failures.append(f"{path}: invalid JSON ({exc})")
                    print(f"FAIL {path:<44} invalid JSON")
                    continue
            if path == "/" and b"importmap" not in body:
                failures.append("/: import map missing from index.html")
            print(f"ok   {path:<44} {note}")
    finally:
        httpd.shutdown()

    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" -", f)
        return 1
    print(f"\nOK: {len(ASSETS)} assets served correctly on port {port}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
