"""
YOLO + Supervision ByteTrack object detector.

Initialised lazily in a background thread so the server starts immediately
and detection becomes available once yolov8n.pt is downloaded / cached (~6 MB).
"""
import base64
import logging
import threading
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

try:
    import supervision as sv
    _SV_OK = True
except ImportError:
    sv = None  # type: ignore
    _SV_OK = False

try:
    from ultralytics import YOLO as _YOLO
    _YOLO_OK = True
except ImportError:
    _YOLO = None  # type: ignore
    _YOLO_OK = False

# MediaPipe-compatible hand connection pairs (21-landmark model)
_HAND_CONNECTIONS = [
    (0,1),(1,2),(2,3),(3,4),
    (0,5),(5,6),(6,7),(7,8),
    (5,9),(9,10),(10,11),(11,12),
    (9,13),(13,14),(14,15),(15,16),
    (13,17),(0,17),(17,18),(18,19),(19,20),
]
_PALETTE_HEX = ["#FFE500","#625BF6","#22c55e","#f97316","#ef4444","#06b6d4","#ec4899"]


class ObjectDetector:
    """
    Thread-safe, lazily-initialised YOLOv8n + Supervision ByteTrack detector.

    Typical usage (from the capture loop or a WebSocket handler)::

        detector = ObjectDetector()          # returns immediately
        dets = detector.detect_b64(jpeg_b64) # blocks until model ready (~first call only)
    """

    def __init__(
        self,
        model_name: str = "yolov8n.pt",
        frame_skip: int = 3,
        confidence: float = 0.35,
    ):
        self._model_name = model_name
        self._frame_skip = frame_skip
        self._confidence = confidence
        self._frame_count = 0

        # Cached results (updated by inference thread)
        self._cached_dets: list[dict] = []
        self._cached_sv: Optional[object] = None
        self._cached_names: dict[int, str] = {}
        self._lock = threading.Lock()

        # Loaded objects (None until _init completes)
        self._model = None
        self._tracker = None
        self._box_ann = None
        self._lbl_ann = None
        self._ready = threading.Event()

        if _YOLO_OK and _SV_OK:
            threading.Thread(target=self._init, daemon=True).start()
        else:
            logger.warning(
                "ObjectDetector: ultralytics=%s supervision=%s — detection disabled",
                _YOLO_OK, _SV_OK,
            )
            self._ready.set()

    # ── Initialisation ────────────────────────────────────────────────────────

    def _init(self) -> None:
        try:
            logger.info("ObjectDetector: loading %s …", self._model_name)
            model = _YOLO(self._model_name)
            # Single warmup pass so the first real call isn't slow
            model(np.zeros((32, 32, 3), dtype=np.uint8), verbose=False)

            try:
                tracker = sv.BOTSORT()
            except AttributeError:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", FutureWarning)
                    tracker = sv.ByteTrack()

            try:
                pal = sv.ColorPalette.from_hex(_PALETTE_HEX)
            except AttributeError:
                pal = sv.ColorPalette.DEFAULT

            box_ann = sv.BoxAnnotator(color=pal, thickness=2)
            lbl_ann = sv.LabelAnnotator(
                color=pal,
                text_color=sv.Color.BLACK,
                text_scale=0.45,
                text_thickness=1,
                text_padding=3,
            )

            with self._lock:
                self._model   = model
                self._tracker = tracker
                self._box_ann = box_ann
                self._lbl_ann = lbl_ann

            logger.info("ObjectDetector: ready (yolov8n + ByteTrack)")
        except Exception as exc:
            logger.warning("ObjectDetector init failed: %s — detection disabled", exc)
        finally:
            self._ready.set()

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def available(self) -> bool:
        return self._model is not None

    def detect_b64(self, jpeg_b64: str) -> list[dict]:
        """
        Decode a base64 JPEG sent from the browser, run YOLO + ByteTrack, and
        return a list of detection dicts.

        Blocks until the model is ready (only on the very first call after
        server start; subsequent calls return instantly).
        """
        self._ready.wait(timeout=60)
        if not self.available:
            return []
        try:
            import cv2
            jpg_bytes = base64.b64decode(jpeg_b64)
            arr       = np.frombuffer(jpg_bytes, dtype=np.uint8)
            frame     = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                return []
            return self._run_inference(frame)
        except Exception as exc:
            logger.warning("detect_b64 error: %s", exc)
            return []

    def process_frame(self, frame_bgr: np.ndarray) -> tuple[list[dict], np.ndarray]:
        """
        Run detection on a BGR frame every ``frame_skip`` frames; re-use cached
        detections otherwise (imperceptible at short skip intervals).

        Returns ``(detections, annotated_bgr)``.
        """
        if not self.available:
            return [], frame_bgr

        self._frame_count += 1
        if self._frame_count % self._frame_skip == 0:
            self._run_inference(frame_bgr)

        return list(self._cached_dets), self._draw_boxes(frame_bgr)

    def annotate_hands(self, frame_bgr: np.ndarray, hands: list) -> np.ndarray:
        """
        Draw supervision-style hand skeleton onto ``frame_bgr`` using OpenCV.
        ``hands`` is a list of ``HandData`` objects.
        """
        try:
            import cv2
        except ImportError:
            return frame_bgr

        h, w = frame_bgr.shape[:2]
        out = frame_bgr.copy()

        _BGR: dict[str, tuple[int, int, int]] = {
            "Left":  (0, 229, 255),
            "Right": (246, 91, 98),
        }
        for hand in hands:
            color = _BGR.get(hand.handedness, (200, 200, 200))
            pts = [(int(lm.x * w), int(lm.y * h)) for lm in hand.landmarks]

            for a, b in _HAND_CONNECTIONS:
                if a < len(pts) and b < len(pts):
                    cv2.line(out, pts[a], pts[b], color, 2, cv2.LINE_AA)

            for i, pt in enumerate(pts):
                dot_r = 7 if i == 8 else 5
                dot_c = (255, 255, 255) if i == 8 else color
                cv2.circle(out, pt, dot_r, dot_c, -1, cv2.LINE_AA)
                cv2.circle(out, pt, dot_r, (0, 0, 0), 1, cv2.LINE_AA)

            if pts:
                label = hand.gesture.replace("_", " ").upper()
                lx, ly = pts[0][0], pts[0][1] + 30
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.42, 1)
                cv2.rectangle(out, (lx-4, ly-th-4), (lx+tw+4, ly+4), (0,0,0), -1)
                cv2.putText(out, label, (lx, ly), cv2.FONT_HERSHEY_DUPLEX,
                            0.42, color, 1, cv2.LINE_AA)
        return out

    # ── Private helpers ───────────────────────────────────────────────────────

    def _run_inference(self, frame_bgr: np.ndarray) -> list[dict]:
        """Run YOLO + ByteTrack; update internal cache; return detections."""
        h, w = frame_bgr.shape[:2]
        try:
            results = self._model(
                frame_bgr, verbose=False, conf=self._confidence, iou=0.45
            )[0]
            sv_dets = sv.Detections.from_ultralytics(results)
            sv_dets = self._tracker.update_with_detections(sv_dets)

            det_list: list[dict] = []
            for i in range(len(sv_dets)):
                x1, y1, x2, y2 = sv_dets.xyxy[i]
                cls_id = int(sv_dets.class_id[i])
                conf   = float(sv_dets.confidence[i])
                tid    = (
                    int(sv_dets.tracker_id[i])
                    if sv_dets.tracker_id is not None
                    else self._frame_count + i
                )
                cls_name = results.names.get(cls_id, str(cls_id))
                det_list.append({
                    "class_name":     cls_name,
                    "confidence":     round(conf, 3),
                    "tracker_id":     tid,
                    "bbox":           [round(float(v), 1) for v in (x1, y1, x2, y2)],
                    "normalized_bbox": [
                        round(float(x1)/w, 4), round(float(y1)/h, 4),
                        round(float(x2)/w, 4), round(float(y2)/h, 4),
                    ],
                })

            with self._lock:
                self._cached_dets  = det_list
                self._cached_sv    = sv_dets
                self._cached_names = dict(results.names)

            return det_list
        except Exception as exc:
            logger.warning("YOLO inference error: %s", exc)
            return []

    def _draw_boxes(self, frame_bgr: np.ndarray) -> np.ndarray:
        """Annotate a frame copy with cached Supervision detections."""
        with self._lock:
            sv_dets = self._cached_sv
            dets    = self._cached_dets

        if sv_dets is None or len(sv_dets) == 0:
            return frame_bgr
        try:
            labels = [
                f"#{d['tracker_id']} {d['class_name']} {d['confidence']:.0%}"
                for d in dets
            ]
            out = frame_bgr.copy()
            out = self._box_ann.annotate(scene=out, detections=sv_dets)
            out = self._lbl_ann.annotate(scene=out, detections=sv_dets, labels=labels)
            return out
        except Exception as exc:
            logger.warning("Annotation error: %s", exc)
            return frame_bgr
