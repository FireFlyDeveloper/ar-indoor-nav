# AR Indoor Nav

A web-based AR indoor navigation prototype that uses WebXR hit-test to anchor a virtual world on a user-chosen horizontal surface, then renders a 3D navigation path relative to that anchor.

## Stack

- **MindAR** (`^1.2.5`) — image-target detection and tracking (optional plumbing, no longer drives the world origin)
- **WebXR** (Immersive AR + anchors module + hit-test module) — for rendering the AR session and establishing a world-stable world origin
- **three.js** (`^0.184.0`) — 3D rendering and scene graph
- **TypeScript** (`^5.5`) — strict-typed source
- **Vite 5** (`^5.4`) — dev server (with `@vitejs/plugin-basic-ssl` for HTTPS, required by WebXR) and production bundler
- **Vitest** (`^2.0`) — unit tests for pure-function modules

## Architecture

The app uses TWO Web-AR technologies together. They are not alternatives — each solves a different problem.

1. **MindAR** scans for the printed marker at startup. MindAR is now optional plumbing: it is kept in the flow because (a) it is harmless to boot and stop, and (b) the user may want to use marker-based calibration in the future. The world origin is **not** derived from the marker pose — image-tracking has been dropped.

2. **WebXR immersive-ar** session (started from a user-gesture handler, the Launch button) takes over the camera and tracks the user’s movement through space. It requests the `anchors` and `hit-test` optional features (image-tracking is intentionally NOT requested).

3. **Hit-test (world origin source)**. The user taps a horizontal surface in front of the camera; the first hit’s pose is captured in the next XR frame and used to create an `XRAnchor` via `frame.createAnchor(pose, refSpace)`. The anchor tracks across reference-space updates so the nav scene does not drift as the user walks. The bootstrap drives the world-origin group’s matrix from `frame.getPose(anchor.anchorSpace, refSpace)` each frame. A plain-`THREE.Group` matrix fallback is used only when the device does not expose `frame.createAnchor` (or it throws); the fallback is user-relative because `local-floor` is camera-anchored, so on those devices the scene will appear to follow the user as they walk.

4. **Hit-test (optional surface-placement feature)**. The same hit-test session is polled every frame to remember the most recent surface hit, so the "Place marker on surface" button can drop a `makePlacedMarker` (green sphere) at the last aim. Hit-test is not used to place navigation arrows — those are authored from the nav graph in `src/scene/scene.ts` and live under `NavScene.root` (see `nav.placed` for the group that receives user-tapped markers).

```
        +--------------------------+
        |        bootstrap         |
        |   MindAR -> WebXR AR     |
        +-----+--------------+-----+
              |              |
              v              v
   +----------------+   +--------------------+
   | MindarSession  |   | WebXRSession       |
   | (optional)     |   | (immersive-ar)     |
   +----------------+   +-----+-----------+--+
                            |           |
                  +---------+           +----------+
                  v                                v
        +-------------------+         +----------------------+
        | XRAnchor world    |         | HitTestSession       |
        | origin (or Group  |         |  (per-frame poll:    |
        | fallback)         |         |   world origin +     |
        +---------+---------+         |   placed markers)    |
                  |                   +----------+-----------+
                  v                              |
        +-------------------+                    v
        | NavScene (graph,  |          +-------------------+
        | arrows, lighting, |          | NavScene (graph,  |
        |  destination      |          | arrows, lighting,  |
        |  marker)          |          |  destination       |
        +-------------------+          |  marker)           |
                                       +-------------------+
```

## Setup

Requires Node.js 18+. The repo ships with `package-lock.json`; use `npm` for reproducible installs.

```bash
npm install         # install deps
npm run dev         # HTTPS dev server on https://localhost:5173 (basic-ssl self-signed)
npm run test        # run the vitest suite
npm run build       # type-check (tsc --noEmit) and bundle to dist/
npm run preview     # serve the built dist/ locally
```

## Usage

Print the marker image at `public/card.png` (a sample card is shipped; it is no longer required, but a marker is shipped for future use). In the running app:

1. Click **Start AR Navigation**. The app requests camera access and starts MindAR (scanning is optional; you can launch WebXR without a marker).
2. Click **Launch AR Session**. The browser hands off to WebXR immersive-ar. The status updates to "AR active. Tap a horizontal surface to place the path."
3. **Tap anywhere on the screen** to place the world origin. The first hit-test result in the next frame is captured, an `XRAnchor` is created from it (if the device supports the anchors module), and the world origin group is driven from the anchor each frame (world-stable). On devices without `frame.createAnchor`, the world origin is a frozen Group matrix (user-relative; the scene may follow you as you walk). The nav scene is placed in the camera view either way.
4. Tap **Recalibrate** at any time to re-pin the world origin on the next surface hit (useful if the nav scene drifts or you want to move the path).
5. Tap **Place marker on surface** to drop a `makePlacedMarker` (green sphere) at the most recent hit-test surface hit, independent of the world origin.

The `public/targets.mind` file is a compiled MindAR target file generated from `public/card.png`. Both are checked into the repo so the app works out of the box on a fresh clone.

## Browser support

- **Android Chrome** (or any Chromium-based Android browser with WebXR + anchors + hit-test flags enabled) is the primary supported target.
- **iOS Safari is not supported.** WebXR immersive-ar sessions are unavailable on iOS, and MindAR cannot reliably hand off a camera to a non-existent WebXR session.
- Desktop browsers can run the dev server (the `MindarSession` itself works on desktop) but will fail at the `requestSession('immersive-ar')` call.

## Known limitations

- **Hit-test is required.** The new world-origin UX depends on the hit-test module (`hit-test` + `anchors` optional features). Devices that do not expose `frame.createAnchor` fall back to a frozen Group matrix (user-relative — the scene will follow the user as they walk); devices that do not expose hit-test at all cannot place the world origin and the app surfaces a clear error message. There is no marker-based fallback because image-tracking has been dropped by design.
- **Group fallback is user-relative.** When the device does not expose `frame.createAnchor` (or it throws), the bootstrap falls back to a plain `THREE.Group` whose matrix is pinned once at the first hit-test result. Because `local-floor` is a camera-anchored reference space that moves with the user, a frozen Group matrix is necessarily user-relative: the scene will appear to "follow me" as the user walks. The XRAnchor path is the canonical fix; the fallback is the documented limitation. The Recalibrate button re-pins the matrix on demand.
- **Hit-test for the world origin.** The first hit is captured inside the XR frame callback (the `XRFrame` reference is required by `frame.createAnchor`). A user tap sets a flag, the next frame consumes it and creates the anchor from the latest hit. The "Place marker on surface" button and the world-origin path share the same `XRHitTestSource`; the per-frame poll keeps `lastHit` fresh for both.
- **Hit-test-placed markers share the same hit-test source.** The "Place marker on surface" button uses the most recent hit from the same per-frame poll that drives the world origin. Recalibrating does not affect placed markers, and placing a marker does not move the world origin.
- **Handshake v1 is deprecated.** `computeHandshakeOrigin` in `src/calibration/handshake.ts` is retained as a no-op that returns the identity matrix. The MindAR↔WebXR handshake is no longer part of the v2 architecture; the world origin is now established by a user-tapped hit-test, not by a marker pose. The function is kept for backwards compatibility with any external callers and to document the evolution in-tree.
- **MindAR is optional plumbing.** The marker scan is no longer required and is not used to seed the world origin. MindAR is kept in the flow because (a) it is harmless to boot and stop, and (b) the user may want to use marker-based calibration in the future. The `public/targets.mind` target file is checked in for the same reason.
- **No iOS path.** See _Browser support_.
- **HTTPS required.** Browsers will not grant camera access (or WebXR sessions) to plain HTTP origins, which is why the dev server uses `@vitejs/plugin-basic-ssl`’s self-signed cert. You will need to accept the cert warning on first visit.

## File map

```
src/
├── main.ts                  # Entry point; calls bootstrap() and surfaces errors to the UI.
├── bootstrap.ts             # Wires MindAR -> WebXR handoff, hit-test-driven world origin, nav scene, and frame loop.
├── mindar/
│   ├── mindarSession.ts     # MindarSession class — starts/stops the MindAR camera and reports first detection. (Optional plumbing; not used for the world origin.)
│   └── mind-ar.d.ts         # Minimal type declarations for the `mind-ar` package (no upstream types).
├── webxr/
│   ├── webxrSession.ts      # WebXRSession class — requests an immersive-ar session with anchors + hit-test (no image-tracking).
│   └── renderer.ts          # createXRRenderer helper (three.js r0.184 WebXR wiring).
├── hit-test/
│   ├── hitTestSession.ts      # HitTestSession class — wraps XRHitTestSource; poll() returns the current surface hit. Used for both the world origin and placed markers.
│   └── hitTestSession.test.ts
├── anchors/
│   └── worldOrigin.ts       # XRAnchor-backed world origin (seeded by a hit-test pose) with a Group-matrix fallback path.
├── calibration/
│   ├── originTransform.ts   # Pure helpers: computeOriginTransform / applyOriginTransform.
│   ├── originTransform.test.ts
│   └── handshake.ts         # Deprecated: no-op computeHandshakeOrigin (returns identity). Retained for backwards compatibility.
├── scene/
│   ├── navGraph.ts          # Hard-coded 4-node (A-D) nav graph + line geometry.
│   ├── arrows.ts            # makeArrow / makeStartMarker / makeEndMarker / makePlacedMarker meshes.
│   └── scene.ts             # createNavScene — assembles graph, markers, arrows, lighting.
└── nav/
    ├── pathfinding.ts       # aStar + heuristic + neighbors over a NavGraph.
    └── pathfinding.test.ts

public/
├── README.txt               # Marker-placeholder instructions.
├── card.png                 # Shipped example marker image (no longer required; kept for future marker use).
└── targets.mind             # Compiled MindAR target file (generated from card.png; kept for future marker use).

scripts/
└── deploy.sh                # Builds and serves dist/ on port 5174.
```

## License

MIT.
