---
name: WebGL in Replit preview
description: Replit's preview iframe has no GPU, so WebGL/Three.js/R3F contexts fail with "Error creating WebGL context". Canvas 2D must be used for any 3D rendering in hand-control-ui.
---

The Replit preview sandbox cannot create a WebGL context (no GPU, VENDOR=0xffff). Any library that requires WebGL (Three.js, React Three Fiber, Babylon.js, etc.) will throw "Error creating WebGL context" at runtime in the preview pane.

**Why:** The sandbox uses a software-rendered iframe without hardware acceleration.

**How to apply:** For the hand-control-ui viewport, all 3D rendering must use the HTML5 Canvas 2D API with a custom software renderer (rotation matrices, perspective projection, painter's algorithm). Three.js may still be imported for geometry math utilities if needed, but not for rendering.
