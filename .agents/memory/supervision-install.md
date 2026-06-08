---
name: Supervision + PyTorch CPU install order
description: Correct pip install sequence for supervision + ultralytics on Replit (no GPU, headless OpenCV required)
---

## The rule

Always install CPU-only builds. Default `pip install ultralytics` pulls CUDA PyTorch (~1.5 GB) and exceeds Replit's disk quota.

**Correct order:**
```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install torchvision --index-url https://download.pytorch.org/whl/cpu
pip install supervision ultralytics
# If opencv-python (non-headless) was pulled in as a dep, swap it:
pip uninstall -y opencv-python
pip install opencv-python-headless --force-reinstall
```

**Why:**
- `pip install ultralytics` without pre-installed torch resolves to the CUDA build (torchvision + nvidia-* libs = ~1.5 GB). Disk quota is hit.
- `opencv-python` (non-headless) requires `libxcb.so.1` which is missing in Replit's Nix environment. supervision imports cv2, so it fails with ImportError on libxcb.
- Installing CPU torch FIRST makes pip's resolver reuse it and skip the CUDA packages.

**How to apply:**
Whenever adding supervision or ultralytics to a Python service in this project, follow the exact order above. Check with `python3 -c "import supervision; import ultralytics"` to confirm both import cleanly.

## ByteTrack deprecation (supervision >= 0.28)

`sv.ByteTrack()` raises a FutureWarning in supervision 0.28.0. It still works but will be removed in 0.30.0.
Prefer `sv.BOTSORT()` with a fallback:
```python
try:
    tracker = sv.BOTSORT()
except AttributeError:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        tracker = sv.ByteTrack()
```
