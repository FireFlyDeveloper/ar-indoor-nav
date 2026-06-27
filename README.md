# AR Indoor Nav

A web-based AR indoor navigation prototype that uses a printed image marker to anchor a virtual world, then places navigation arrows on real surfaces inside that world.

## Stack

- **MindAR** (`^1.2.5`) — image-target detection and tracking
- **WebXR** (Immersive AR + image-tracking module + hit-test module + anchors module) — for rendering the AR session on supported devices
- **three.js** (`^0.184.0`) — 3D rendering and scene graph
- **TypeScript** (`^5.5`) — strict-typed source
- **Vite 5** (`^5.4`) — dev server (with `@vitejs/plugin-basic-ssl` for HTTPS, required by WebXR) and production bundler
- **Vitest** (`^2.0`) — unit tests for pure-function modules

## Architecture

The app uses **three** Web-AR technologies together. They are not alternatives — each solves a different problem.

1. **MindAR** detects the printed marker at startup. The first detection captures the marker's pose in MindAR's camera space (the "where am I" question). The MindAR camera is then released so the same physical camera can be acquired by WebXR.
2. **WebXR immersive-ar** session (started from a user-gesture handler, the Launch button) takes over the camera and tracks the user's movement through space. It requests the `image-tracking`, `anchors`, and `hit-test` optional features.
3. **XRAnchor** (anchors module) locks the nav scene's world origin to the marker's WebXR pose so the authored nav graph does not drift as the user walks. A plain-`THREE.Group` matrix fallback is used on devices that do not support anchors.
4. **WebXR hit-test** is used as a SESSION FEATURE to find real surfaces in front of the user. When the user taps "Place marker on surface", a fresh surface hit is taken and a green marker mesh is dropped onto the surface (added to `NavScene.placed`). Hit-test does **not** determine the world origin — the origin is the marker; hit-test populates the scene with objects placed on surfaces.

```
        +--------------------------+
        |        bootstrap         |
        |   MindAR -> WebXR AR     |
        |   + hit-test for places  |
        +-----+--------------+-----+
              |              |
              v              v
   +----------------+   +--------------------+
   | MindarSession  |   | WebXRSession       |
   | (first-detect) |   | (immersive-ar)     |
   +----------------+   +-----+-----------+--+
                            |           |
                  +---------+           +----------+
                  v                                v
        +-------------------+         +----------------------+
        | XRAnchor world    |         | HitTestSession       |
        | origin (or Group  |         | (surface placement)  |
        | fallback)         |         +----------+-----------+
        +---------+---------+                    |
                  |                              v
                  v                    +-------------------+
        +-------------------+          | NavScene.placed   |
        | NavScene (graph,  |          | (user-placed      |
        | arrows, lighting) |          |  markers)         |
        +-------------------+          +-------------------+
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

Print the marker image at `public/card.png` (a sample card is shipped). In the running app:

1. Click **Start AR Navigation**. The app requests camera access and starts MindAR.
2. Point the camera at the printed marker. MindAR detects it and the status updates to "Marker detected".
3. Tap **Launch AR Session**. The browser hands off to WebXR immersive-ar. The nav scene is anchored to the marker's WebXR pose and appears in the camera view.
4. Tap **Place marker on surface** to drop a green marker on the real surface currently in view. The marker's world position is the surface hit returned by the WebXR hit-test module; the marker's local pose in the scene is whatever the hit-test source returned.
5. Tap **Recalibrate** at any time to re-pin the world origin to the current marker view (useful if the nav scene drifts as you walk).

The `public/targets.mind` file is a compiled MindAR target file generated from `public/card.png`. Both are checked into the repo so the app works out of the box on a fresh clone.

## Browser support

- **Android Chrome** (or any Chromium-based Android browser with WebXR + image-tracking + anchors + hit-test flags enabled) is the primary supported target.
- **iOS Safari is not supported.** WebXR immersive-ar sessions are unavailable on iOS, and MindAR cannot reliably hand off a camera to a non-existent WebXR session.
- Desktop browsers can run the dev server (the `MindarSession` itself works on desktop) but will fail at the `requestSession('immersive-ar')` call.

Hit-test is requested as an *optional* feature, so the app still works on devices that lack hit-test support — the "Place marker on surface" button is just hidden in that case.

## Known limitations

- **Coordinate-space mismatch (v1).** MindAR reports the marker pose in MindAR's own internal camera frame, while WebXR reports it in the `local-floor` reference space. The bootstrap currently uses a *one-marker* approximation: it assumes the marker *is* the world origin and applies the WebXR-reported marker transform as the inverse origin. This is correct when the user's first WebXR view of the marker matches the MindAR detection frame, but will drift if the user moves between the two captures. For production, place a second reference marker at a known world position to compute the real MindAR↔WebXR handshake transform (`computeHandshakeOrigin` in `src/calibration/handshake.ts` is the v2 hook for this).
- **Handshake v1 is wired but the formula is the same as the single-marker fallback.** `computeHandshakeOrigin` currently returns the inverse of the WebXR marker pose (so the marker sits at the origin), which is mathematically the same as the fallback branch. The `mindarMarkerPose` field on the `Calibration` input is accepted but unused; the v2 implementation will consume it for a real MindAR↔WebXR alignment. The bootstrap already invokes `computeHandshakeOrigin` on the first tracked frame and on Recalibrate, so swapping in a real v2 formula is a one-line change.
- **MindAR pose is single-frame.** The handshake module only captures the first detection pose; lost-target recovery re-pins to the current frame (drift).
- **Hit-test anchoring.** Surface hits are stored in the `local-floor` reference space and dropped into the `NavScene.placed` group, which is parented to the world origin. If the user recalibrates mid-session, previously placed markers retain their absolute world position rather than moving with the nav scene. v2 should re-anchor placed markers to the new origin.
- **No iOS path.** See *Browser support*.
- **HTTPS required.** Browsers will not grant camera access (or WebXR sessions) to plain HTTP origins, which is why the dev server uses `@vitejs/plugin-basic-ssl`'s self-signed cert. You will need to accept the cert warning on first visit.

## File map

```
src/
├── main.ts                  # Entry point; calls bootstrap() and surfaces errors to the UI.
├── bootstrap.ts             # Wires MindAR -> WebXR handoff, world origin, hit-test, nav scene, and frame loop.
├── mindar/
│   ├── mindarSession.ts     # MindarSession class — starts/stops the MindAR camera and reports first detection.
│   └── mind-ar.d.ts         # Minimal type declarations for the `mind-ar` package (no upstream types).
├── webxr/
│   ├── webxrSession.ts      # WebXRSession class — requests an immersive-ar session with image-tracking, anchors, hit-test.
│   └── renderer.ts          # createXRRenderer + getImageTrackingResults (raw XRFrame API; three.js r0.184 doesn't expose it).
├── hit-test/
│   ├── hitTestSession.ts    # HitTestSession class — wraps XRHitTestSource; poll() returns the current surface hit.
│   └── hitTestSession.test.ts
├── anchors/
│   └── worldOrigin.ts       # XRAnchor-backed world origin with a Group-matrix fallback path.
├── calibration/
│   ├── originTransform.ts   # Pure helpers: computeOriginTransform / applyOriginTransform.
│   ├── originTransform.test.ts
│   └── handshake.ts         # v2 hook: computeHandshakeOrigin from a MindAR<->WebXR pose pair.
├── scene/
│   ├── navGraph.ts          # Hard-coded 4-node (A-D) nav graph + line geometry.
│   ├── arrows.ts            # makeArrow / makeStartMarker / makeEndMarker / makePlacedMarker meshes.
│   └── scene.ts             # createNavScene — assembles graph, markers, arrows, lighting, and a `placed` group.
└── nav/
    ├── pathfinding.ts       # aStar + heuristic + neighbors over a NavGraph.
    └── pathfinding.test.ts

public/
├── README.txt               # Marker-placeholder instructions.
├── card.png                 # Shipped example marker image.
└── targets.mind             # Compiled MindAR target file (generated from card.png).

scripts/
└── deploy.sh                # Builds and serves dist/ on port 5174.
```

## License

MIT.
