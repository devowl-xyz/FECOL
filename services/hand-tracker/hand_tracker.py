"""
Hand tracking module using MediaPipe.
Captures webcam frames and detects 21 hand landmarks per hand.
"""
import numpy as np
import threading
import time
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import mediapipe as mp
    mp_hands = mp.solutions.hands
    _MEDIAPIPE_AVAILABLE = True
except Exception as e:
    logger.warning("MediaPipe not available: %s — demo mode only", e)
    mp_hands = None
    _MEDIAPIPE_AVAILABLE = False


@dataclass
class Landmark:
    x: float
    y: float
    z: float


@dataclass
class HandData:
    landmarks: list[Landmark]
    handedness: str  # "Left" or "Right"
    pinch_distance: float = 0.0
    is_open: bool = False
    gesture: str = "unknown"

    def to_dict(self) -> dict:
        return {
            "landmarks": [{"x": lm.x, "y": lm.y, "z": lm.z} for lm in self.landmarks],
            "handedness": self.handedness,
            "pinch_distance": self.pinch_distance,
            "is_open": self.is_open,
            "gesture": self.gesture,
        }


@dataclass
class TrackingFrame:
    timestamp: float
    hands: list[HandData]
    width: int
    height: int
    jpeg_b64: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "hands": [h.to_dict() for h in self.hands],
            "width": self.width,
            "height": self.height,
            "jpeg_b64": self.jpeg_b64,
        }


def _compute_pinch_distance(landmarks: list[Landmark]) -> float:
    """Distance between index fingertip (8) and thumb tip (4)."""
    if len(landmarks) < 9:
        return 1.0
    thumb = landmarks[4]
    index = landmarks[8]
    return float(np.sqrt((thumb.x - index.x) ** 2 + (thumb.y - index.y) ** 2 + (thumb.z - index.z) ** 2))


def _is_hand_open(landmarks: list[Landmark]) -> bool:
    """Heuristic: hand is open if all fingertips are above (lower y value than) their MCP joints."""
    if len(landmarks) < 21:
        return False
    tips = [4, 8, 12, 16, 20]
    mcps = [2, 5, 9, 13, 17]
    extended = 0
    for tip, mcp in zip(tips[1:], mcps[1:]):  # skip thumb which has different axis
        if landmarks[tip].y < landmarks[mcp].y:
            extended += 1
    return extended >= 3


def _classify_gesture(landmarks: list[Landmark], handedness: str) -> str:
    """Classify hand gesture from landmarks."""
    if not landmarks:
        return "unknown"
    pinch = _compute_pinch_distance(landmarks)
    is_open = _is_hand_open(landmarks)
    if pinch < 0.05:
        return "pinch"
    if is_open:
        return "open_hand"
    # Pointing: index extended, others curled
    if len(landmarks) >= 21:
        index_up = landmarks[8].y < landmarks[6].y
        middle_down = landmarks[12].y > landmarks[10].y
        ring_down = landmarks[16].y > landmarks[14].y
        if index_up and middle_down and ring_down:
            return "point"
    return "fist"


class HandTracker:
    """Threaded webcam + MediaPipe hand tracker."""

    def __init__(self, camera_index: int = 0, max_hands: int = 2, target_fps: int = 30, send_frames: bool = False):
        self.camera_index = camera_index
        self.max_hands = max_hands
        self.target_fps = target_fps
        self.send_frames = send_frames

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._latest_frame: Optional[TrackingFrame] = None
        self._lock = threading.Lock()
        self._callbacks: list = []

        # History buffer for TDA Mapper
        self._landmark_history: list[list[float]] = []
        self._history_limit = 500

    def add_callback(self, cb):
        self._callbacks.append(cb)

    def remove_callback(self, cb):
        self._callbacks.discard(cb) if hasattr(self._callbacks, 'discard') else None
        if cb in self._callbacks:
            self._callbacks.remove(cb)

    def get_landmark_history(self) -> list[list[float]]:
        with self._lock:
            return list(self._landmark_history)

    @property
    def is_running(self) -> bool:
        return self._running

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info("HandTracker started on camera %d", self.camera_index)

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=3.0)
        logger.info("HandTracker stopped")

    def _capture_loop(self):
        if not _MEDIAPIPE_AVAILABLE:
            logger.warning("MediaPipe unavailable — running in demo mode")
            self._demo_loop()
            return

        try:
            import cv2 as _cv2
        except ImportError as e:
            logger.warning("cv2 unavailable (%s) — running in demo mode", e)
            self._demo_loop()
            return

        cap = _cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            logger.error("Failed to open camera %d — running in demo mode", self.camera_index)
            self._demo_loop()
            return

        cap.set(_cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(_cv2.CAP_PROP_FRAME_HEIGHT, 480)

        with mp_hands.Hands(
            model_complexity=0,
            min_detection_confidence=0.6,
            min_tracking_confidence=0.5,
            max_num_hands=self.max_hands,
        ) as hands:
            interval = 1.0 / self.target_fps
            while self._running:
                t0 = time.time()
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.05)
                    continue

                frame_rgb = _cv2.cvtColor(frame, _cv2.COLOR_BGR2RGB)
                result = hands.process(frame_rgb)
                h, w = frame.shape[:2]

                hand_data_list = []
                if result.multi_hand_landmarks and result.multi_handedness:
                    for hlm, hedness in zip(result.multi_hand_landmarks, result.multi_handedness):
                        landmarks = [
                            Landmark(lm.x, lm.y, lm.z)
                            for lm in hlm.landmark
                        ]
                        handedness = hedness.classification[0].label
                        pinch = _compute_pinch_distance(landmarks)
                        is_open = _is_hand_open(landmarks)
                        gesture = _classify_gesture(landmarks, handedness)

                        hand_data_list.append(HandData(
                            landmarks=landmarks,
                            handedness=handedness,
                            pinch_distance=pinch,
                            is_open=is_open,
                            gesture=gesture,
                        ))

                        flat = [v for lm in landmarks for v in (lm.x, lm.y, lm.z)]
                        with self._lock:
                            self._landmark_history.append(flat)
                            if len(self._landmark_history) > self._history_limit:
                                self._landmark_history.pop(0)

                jpeg_b64 = None
                if self.send_frames:
                    import base64
                    _, buf = _cv2.imencode(".jpg", frame, [_cv2.IMWRITE_JPEG_QUALITY, 60])
                    jpeg_b64 = base64.b64encode(buf.tobytes()).decode()

                tracking = TrackingFrame(
                    timestamp=time.time(),
                    hands=hand_data_list,
                    width=w,
                    height=h,
                    jpeg_b64=jpeg_b64,
                )

                with self._lock:
                    self._latest_frame = tracking

                for cb in list(self._callbacks):
                    try:
                        cb(tracking)
                    except Exception as e:
                        logger.warning("Callback error: %s", e)

                elapsed = time.time() - t0
                sleep_time = interval - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

        cap.release()

    def _demo_loop(self):
        """Generate synthetic hand data when no camera is available."""
        import math
        t = 0.0
        interval = 1.0 / self.target_fps
        while self._running:
            t += interval
            # Simulate a hand moving in a circle
            cx = 0.5 + 0.2 * math.cos(t)
            cy = 0.5 + 0.2 * math.sin(t)

            landmarks = []
            for i in range(21):
                angle = (i / 21) * math.pi * 2 + t
                landmarks.append(Landmark(
                    x=cx + 0.05 * math.cos(angle),
                    y=cy + 0.05 * math.sin(angle),
                    z=0.0,
                ))

            pinch = _compute_pinch_distance(landmarks)
            gesture = "open_hand" if math.sin(t) > 0 else "fist"

            hand = HandData(
                landmarks=landmarks,
                handedness="Right",
                pinch_distance=pinch,
                is_open=math.sin(t) > 0,
                gesture=gesture,
            )

            flat = [v for lm in landmarks for v in (lm.x, lm.y, lm.z)]
            with self._lock:
                self._landmark_history.append(flat)
                if len(self._landmark_history) > self._history_limit:
                    self._landmark_history.pop(0)

            tracking = TrackingFrame(
                timestamp=time.time(),
                hands=[hand],
                width=640,
                height=480,
            )

            with self._lock:
                self._latest_frame = tracking

            for cb in list(self._callbacks):
                try:
                    cb(tracking)
                except Exception as e:
                    logger.warning("Demo callback error: %s", e)

            time.sleep(interval)
