#!/usr/bin/env python3
"""
ROCOS HMI URDF Test Server.

Serves URDF model files, robot info/state, and mesh assets for the
frontend dev workflow.  Uses only Python stdlib — no pip install required.

Endpoints:
  GET  /api/robot/urdf          — return the currently loaded URDF file
  POST /api/robot/urdf          — upload a new URDF file (multipart/form-data)
  GET  /api/robot/urdf/mesh     — serve a mesh file (?path=...)

  GET  /api/robot/info          — robot joint metadata
  GET  /api/robot/disconnect    — disconnect (no-op for mock)
  GET  /api/robot/state         — current joint states + poses (animated mock)
  GET  /api/robot/enabled       — whether the robot is enabled
  POST /api/robot/enable        — enable the robot
  POST /api/robot/disable       — disable the robot

Usage:
  python3 server/urdf_server.py                    # default port 8080
  python3 server/urdf_server.py --port 9090        # custom port
  python3 server/urdf_server.py --urdf my_robot.urdf  # custom URDF file
"""

import argparse
import cgi
import json
import math
import mimetypes
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
DEFAULT_URDF = MODELS_DIR / "simple_arm.urdf"


# ── URDF file management ──────────────────────────────────────────

class UrdfStore:
    """Holds the currently active URDF file path and content."""

    def __init__(self, urdf_path: Path):
        self.path = urdf_path
        self.content = ""

    def load(self) -> str:
        if self.path.exists():
            self.content = self.path.read_text(encoding="utf-8")
        else:
            self.content = ""
        return self.content

    def save(self, text: str, filename: str = "uploaded.urdf") -> Path:
        dest = MODELS_DIR / filename
        dest.write_text(text, encoding="utf-8")
        self.path = dest
        self.content = text
        return dest

    def reload(self) -> str:
        return self.load()

    def joint_names(self) -> list[str]:
        """Extract joint names from the URDF XML."""
        if not self.content:
            return []
        try:
            root = ET.fromstring(self.content)
            return [j.get("name", "") for j in root.findall("joint")
                    if j.get("type", "fixed") not in ("fixed",)]
        except ET.ParseError:
            return []


store: UrdfStore | None = None


# ── Mock robot state ──────────────────────────────────────────────

class RobotStateSimulator:
    """Generates animated joint states for the currently loaded URDF."""

    def __init__(self):
        self._start = time.time()
        self._enabled = False

    @property
    def enabled(self) -> bool:
        return self._enabled

    def enable(self):
        self._enabled = True

    def disable(self):
        self._enabled = False

    def snapshot(self) -> dict:
        """Return a RobotState dict matching the frontend ApiResponse<RobotState>."""
        names = store.joint_names() if store else []
        t = time.time() - self._start

        joint_states = []
        for i, name in enumerate(names):
            # Each joint oscillates at a slightly different freq / phase
            freq = 0.25 + i * 0.15
            phase = i * 1.2
            position = math.sin(t * freq * math.pi + phase) * 0.8
            joint_states.append({
                "name": name,
                "position": position,
                "velocity": math.cos(t * freq * math.pi + phase) * 0.3,
                "torque": 0.0,
                "load_torque": 0.0,
                "status": 2 if self._enabled else 0,
            })

        return {
            "joint_states": joint_states,
            "flange_pose": {
                "position": {"x": 0.0, "y": 0.0, "z": 0.8},
                "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
            },
            "tool_pose": {
                "position": {"x": 0.0, "y": 0.0, "z": 0.9},
                "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
            },
            "hw_state": {
                "current_cycle_time": 20,
                "min_cycle_time": 10,
                "max_cycle_time": 100,
            },
        }


simulator = RobotStateSimulator()


# ── Create default URDF if missing ─────────────────────────────────

def ensure_default_urdf():
    """Write a simple 3-DOF arm URDF if none exists."""
    DEFAULT_URDF.parent.mkdir(parents=True, exist_ok=True)
    if DEFAULT_URDF.exists():
        return
    DEFAULT_URDF.write_text("""<?xml version="1.0"?>
<robot name="simple_arm">

  <link name="base_link">
    <visual>
      <geometry>
        <box size="0.2 0.2 0.05"/>
      </geometry>
      <material name="gray">
        <color rgba="0.4 0.4 0.4 1.0"/>
      </material>
    </visual>
  </link>

  <joint name="joint_1" type="revolute">
    <parent link="base_link"/>
    <child link="link_1"/>
    <origin xyz="0 0 0.025" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="100" velocity="1.0"/>
  </joint>

  <link name="link_1">
    <visual>
      <geometry>
        <cylinder radius="0.04" length="0.3"/>
      </geometry>
      <material name="blue">
        <color rgba="0.2 0.4 0.8 1.0"/>
      </material>
    </visual>
  </link>

  <joint name="joint_2" type="revolute">
    <parent link="link_1"/>
    <child link="link_2"/>
    <origin xyz="0 0 0.15" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0" effort="50" velocity="1.0"/>
  </joint>

  <link name="link_2">
    <visual>
      <geometry>
        <cylinder radius="0.03" length="0.25"/>
      </geometry>
      <material name="green">
        <color rgba="0.2 0.7 0.3 1.0"/>
      </material>
    </visual>
  </link>

  <joint name="joint_3" type="revolute">
    <parent link="link_2"/>
    <child link="link_3"/>
    <origin xyz="0 0 0.125" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0" effort="50" velocity="1.0"/>
  </joint>

  <link name="link_3">
    <visual>
      <geometry>
        <box size="0.04 0.04 0.15"/>
      </geometry>
      <material name="red">
        <color rgba="0.8 0.2 0.2 1.0"/>
      </material>
    </visual>
  </link>

</robot>
""")
    print(f"[init] Created default URDF: {DEFAULT_URDF}")


# ── Robot info builder ────────────────────────────────────────────

def build_joint_infos() -> list[dict]:
    """Build joint_infos from URDF joint names."""
    names = store.joint_names() if store else []
    return [
        {
            "name": name,
            "cnt_per_unit": 1000,
            "torque_per_unit": 1,
            "ratio": 100,
            "zero_offset": 0,
            "unit_name": "rad",
        }
        for name in names
    ]


# ── HTTP Handler ──────────────────────────────────────────────────

class UrdfRequestHandler(BaseHTTPRequestHandler):
    """Handles URDF + robot API requests with CORS for Vite dev server."""

    def log_message(self, format, *args):
        sys.stderr.write(f"[server] {self.command} {args[0]}\n")

    # ── CORS ──────────────────────────────────────────────────

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ── Routing ───────────────────────────────────────────────

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        params = parse_qs(parsed.query)

        handlers = {
            "/api/robot/urdf": self._handle_get_urdf,
            "/api/robot/urdf/mesh": lambda: self._handle_get_mesh(params),
            "/api/robot/info": self._handle_robot_info,
            "/api/robot/state": self._handle_robot_state,
            "/api/robot/disconnect": self._handle_disconnect,
            "/api/robot/enabled": self._handle_enabled,
        }
        handler = handlers.get(path)
        if handler:
            handler()
        else:
            self._json_error(404, f"Not found: {path}")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        handlers = {
            "/api/robot/urdf": self._handle_post_urdf,
            "/api/robot/enable": self._handle_enable,
            "/api/robot/disable": self._handle_disable,
        }
        handler = handlers.get(path)
        if handler:
            handler()
        else:
            self._json_error(404, f"Not found: {path}")

    # ── GET /api/robot/urdf ───────────────────────────────────

    def _handle_get_urdf(self):
        content = store.reload()
        if not content:
            self._json_error(404, "No URDF file loaded")
            return
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.end_headers()
        self.wfile.write(content.encode("utf-8"))

    # ── POST /api/robot/urdf ──────────────────────────────────

    def _handle_post_urdf(self):
        content_type = self.headers.get("Content-Type", "")

        if "multipart/form-data" in content_type:
            _, pdict = cgi.parse_header(content_type)
            pdict["boundary"] = pdict["boundary"].encode()
            pdict["CONTENT-LENGTH"] = int(self.headers.get("Content-Length", 0))
            form = cgi.parse_multipart(self.rfile, pdict)

            file_data = form.get("file")
            if not file_data or not file_data[0]:
                self._json_error(400, "No file field in upload")
                return

            raw = file_data[0]
            text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            filename = self._safe_filename(form.get("filename", ["uploaded.urdf"])[0])
        else:
            length = int(self.headers.get("Content-Length", 0))
            text = self.rfile.read(length).decode("utf-8")
            filename = "uploaded.urdf"

        saved = store.save(text, filename)
        print(f"[server] URDF saved: {saved} ({len(text)} bytes)")
        self._json_response({"path": str(saved)})

    # ── GET /api/robot/urdf/mesh?path=... ─────────────────────

    def _handle_get_mesh(self, params):
        mesh_path = params.get("path", [None])[0]
        if not mesh_path:
            self._json_error(400, "Missing ?path= parameter")
            return

        # Normalise: strip leading slashes so path joining works.
        clean = mesh_path.lstrip("/")

        # Search strategy (first match wins):
        #   1. Relative to URDF directory
        #   2. Flat filename in URDF directory
        #   3. Recursive search in URDF directory
        #   4. Recursive search in URDF parent directory
        #   5. Recursive search in models/ directory
        urdf_dir = store.path.parent if store else MODELS_DIR
        candidate = self._find_mesh(clean, urdf_dir)

        if candidate is None:
            self._json_error(404, f"Mesh not found: {mesh_path}")
            return

        mime, _ = mimetypes.guess_type(str(candidate))
        if not mime:
            mime = "application/octet-stream"

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(candidate.stat().st_size))
        self.end_headers()
        self.wfile.write(candidate.read_bytes())

    # ── GET /api/robot/info ───────────────────────────────────

    def _handle_robot_info(self):
        joint_infos = build_joint_infos()
        self._json_response({"joint_infos": joint_infos})

    # ── GET /api/robot/state ──────────────────────────────────

    def _handle_robot_state(self):
        self._json_response(simulator.snapshot())

    # ── GET /api/robot/disconnect ─────────────────────────────

    def _handle_disconnect(self):
        simulator.disable()
        self._json_response(None)

    # ── GET /api/robot/enabled ────────────────────────────────

    def _handle_enabled(self):
        self._json_response({"enabled": simulator.enabled})

    # ── POST /api/robot/enable ────────────────────────────────

    def _handle_enable(self):
        simulator.enable()
        print("[server] Robot enabled")
        self._json_response(None)

    # ── POST /api/robot/disable ───────────────────────────────

    def _handle_disable(self):
        simulator.disable()
        print("[server] Robot disabled")
        self._json_response(None)

    # ── Mesh file search ──────────────────────────────────────

    @staticmethod
    def _find_mesh(clean_path: str, urdf_dir: Path) -> Path | None:
        """Try to locate a mesh file using a cascade of strategies."""
        filename = Path(clean_path).name

        # 1. Exact relative to URDF directory
        candidate = urdf_dir / clean_path
        if candidate.exists():
            return candidate

        # 2. Flat filename in URDF directory
        candidate = urdf_dir / filename
        if candidate.exists():
            return candidate

        # 3. Recursive search in URDF directory tree
        candidate = UrdfRequestHandler._search_by_name(urdf_dir, filename)
        if candidate:
            return candidate

        # 4. Recursive search in URDF parent directory tree
        candidate = UrdfRequestHandler._search_by_name(urdf_dir.parent, filename)
        if candidate:
            return candidate

        # 5. Recursive search in models/ directory
        candidate = UrdfRequestHandler._search_by_name(MODELS_DIR, filename)
        if candidate:
            return candidate

        return None

    @staticmethod
    def _search_by_name(root: Path, filename: str) -> Path | None:
        """Recursively search for a file by name under root (case-insensitive)."""
        if not root.exists():
            return None
        pattern = filename.lower()
        for entry in root.rglob("*"):
            if entry.is_file() and entry.name.lower() == pattern:
                return entry
        return None

    # ── Helpers ───────────────────────────────────────────────

    def _json_response(self, data):
        """Send a successful JSON ApiResponse envelope."""
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        body = {"success": True, "code": 0, "message": "ok", "data": data}
        self.wfile.write(json.dumps(body).encode())

    def _json_error(self, status: int, message: str):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        body = {"success": False, "code": status, "message": message, "data": None}
        self.wfile.write(json.dumps(body).encode())

    @staticmethod
    def _safe_filename(name: str) -> str:
        name = os.path.basename(name)
        return re.sub(r"[^\w.\-]", "_", name) or "uploaded.urdf"


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ROCOS HMI URDF Test Server")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--urdf", type=str, default=None)
    args = parser.parse_args()

    ensure_default_urdf()

    urdf_path = Path(args.urdf) if args.urdf else DEFAULT_URDF
    if not urdf_path.is_absolute():
        urdf_path = Path.cwd() / urdf_path

    global store
    store = UrdfStore(urdf_path)
    store.load()

    print(f"[server] URDF      : {store.path}")
    print(f"[server] Joints    : {store.joint_names()}")
    print(f"[server] Listening : http://0.0.0.0:{args.port}")
    print(f"[server] Ready.")

    server = HTTPServer(("0.0.0.0", args.port), UrdfRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
