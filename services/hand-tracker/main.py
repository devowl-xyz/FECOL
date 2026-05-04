"""
Hand Control FastAPI backend.
Serves:
  - WebSocket /hand-api/ws  — real-time hand landmark stream
  - GET  /hand-api/status   — tracker status
  - POST /hand-api/calibrate — reset calibration / toggle frame sending
  - GET  /hand-api/mapper   — run TDA Mapper on landmark history
"""
import asyncio
import json
import logging
import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from hand_tracker import HandTracker, TrackingFrame
from tda_mapper_analysis import build_mapper_graph

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ── Global tracker ────────────────────────────────────────────────────────────
tracker = HandTracker(
    camera_index=0,
    max_hands=2,
    target_fps=30,
    send_frames=False,  # disabled by default to reduce bandwidth
)

# Active WebSocket connections
_ws_clients: set[WebSocket] = set()
_latest_frame_dict: dict = {}
_frame_lock = asyncio.Lock()


def _on_frame(frame: TrackingFrame):
    """Called from the tracker thread when a new frame is ready."""
    global _latest_frame_dict
    _latest_frame_dict = frame.to_dict()


tracker.add_callback(_on_frame)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    tracker.start()
    # Background task: broadcast frames to all connected WebSocket clients
    task = asyncio.create_task(_broadcast_loop())
    logger.info("Hand tracker started, broadcasting to WebSocket clients")
    yield
    tracker.stop()
    task.cancel()
    logger.info("Hand tracker stopped")


async def _broadcast_loop():
    """Broadcast latest frame to all connected WebSocket clients at ~30 fps."""
    while True:
        await asyncio.sleep(1 / 30)
        if not _ws_clients or not _latest_frame_dict:
            continue
        msg = json.dumps({"type": "frame", "data": _latest_frame_dict})
        dead = set()
        for ws in list(_ws_clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        _ws_clients.difference_update(dead)


# ── App ───────────────────────────────────────────────────────────────────────
BASE = "/hand-api"

app = FastAPI(title="Hand Control API", lifespan=lifespan, root_path="")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get(f"{BASE}/status")
async def status():
    return {
        "running": tracker.is_running,
        "history_frames": len(tracker.get_landmark_history()),
        "connected_clients": len(_ws_clients),
        "demo_mode": not tracker.is_running,
    }


class CalibrateRequest(BaseModel):
    send_frames: bool = False
    camera_index: int = 0


@app.post(f"{BASE}/calibrate")
async def calibrate(req: CalibrateRequest):
    """Restart tracker with new settings."""
    tracker.stop()
    tracker.camera_index = req.camera_index
    tracker.send_frames = req.send_frames
    tracker.start()
    return {"ok": True, "send_frames": req.send_frames, "camera_index": req.camera_index}


@app.get(f"{BASE}/mapper")
async def mapper_graph(n_cubes: int = 10, overlap: float = 0.3):
    """Run TDA Mapper on the accumulated landmark history."""
    history = tracker.get_landmark_history()
    graph = build_mapper_graph(history, n_cubes=n_cubes, overlap=overlap)
    return graph


@app.websocket(f"{BASE}/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    _ws_clients.add(ws)
    logger.info("WebSocket client connected (%d total)", len(_ws_clients))
    try:
        # Send initial hello
        await ws.send_text(json.dumps({"type": "connected", "data": {"status": "ok"}}))
        # Keep connection alive; broadcast loop handles sending frames
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_text(), timeout=30)
                data = json.loads(msg)
                # Handle client commands
                if data.get("cmd") == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
                elif data.get("cmd") == "toggle_frames":
                    tracker.send_frames = not tracker.send_frames
                    await ws.send_text(json.dumps({"type": "frames_toggled", "data": {"send_frames": tracker.send_frames}}))
            except asyncio.TimeoutError:
                # Send keepalive
                await ws.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.warning("WebSocket error: %s", e)
    finally:
        _ws_clients.discard(ws)


if __name__ == "__main__":
    port = int(os.environ.get("HAND_TRACKER_PORT", "8765"))
    logger.info("Starting Hand Control API on port %d", port)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
