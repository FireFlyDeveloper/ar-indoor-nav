# AR Indoor Nav

A web-based AR indoor navigation prototype that uses an image target to anchor a virtual world and guides a user along a 3D path inside that world.

## Stack

- **MindAR** (`^1.2.5`) — image target detection and tracking
- **WebXR** (Immersive AR + image-tracking module) — for rendering the AR session on supported devices
- **three.js** (`^0.184.0`) — 3D rendering and scene graph
- **TypeScript** (`^5.5`) — strict-typed source
- **Vite 5** (`^5.4`) — dev server (with `@vitejs/plugin-basic-ssl` for HTTPS, required by WebXR) and production bundler
- **Vitest** (`^2.0`) — unit tests for pure-function modules

## Architecture

A `MindarSession` opens the camera and waits for a marker. On first detection it captures a pose in MindAR's own camera space, stops the MindAR session, then hands the user off to a `WebXRSession` (immersive-ar) which acquires the same camera and re-detects the marker via the WebXR image-tracking module. The bootstrap module aligns the two coordinate systems by treating the marker's pose as the world origin (v1 approximation; see *Known limitations*). A `three.js` scene containing a hand-built nav graph, A\* pathfinding, and arrow meshes is then rendered through the WebXR-enabled `WebGLRenderer`.

```
        +----------------------+
        |       bootstrap      |
        |  (MindAR → WebXR)    |
        +----------+-----------+
                   |
   +---------------+---------------+
   |                               |
   v                               v
+-----------+               +----------------+
| MindAR    |   handoff     | WebXRSession   |
| Session   |  ---------->  | (image-track)  |
+-----------+               +--------+-------+
                                      |
                                      v
                            +----------------+
                            | WorldOrigin    |
                            | (anchor |      |
                            |  fallback)     |
                            +--------+-------+
                                     |
                                     v
                            +----------------+
                            | NavScene       |
                            | (graph + A*)   |
                            +----------------+
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

The app expects a MindAR `.mind` target file at `public/targets.mind` and a corresponding image at `public/targets.png`. Until that file exists, the app will boot but will fail to detect any marker.

**Option A — train your own marker**

1. Pick a high-contrast image (a QR code, logo, business card, etc.).
2. Train it with the MindAR compiler: `npx mind-ar compile <your-image>.png`.
3. Copy the resulting `.mind` file to `public/targets.mind` and the source image to `public/targets.png`.
4. Print the source image and point the running app at it.

**Option B — use the MindAR example card**

1. Download `card.png` and `card.mind` from the MindAR examples repo.
2. Rename them to `targets.png` and `targets.mind` and place them in `public/`.
3. Print `targets.png` and scan it from the app.

In the running app: click **Start AR Navigation**, point the camera at the printed marker. The app will detect it via MindAR, hand off to WebXR, and render the nav path anchored to the marker. Click **Recalibrate** any time to re-pin the world origin to the current marker view.

## Browser support

- **Android Chrome** (or any Chromium-based Android browser with WebXR + image-tracking flags enabled) is the primary supported target.
- **iOS Safari is not supported.** WebXR immersive-ar sessions are unavailable on iOS, and MindAR cannot reliably hand off a camera to a non-existent WebXR session.
- Desktop browsers can run the dev server (the `MindarSession` itself works on desktop) but will fail at the `requestSession('immersive-ar')` call.

## Known limitations

- **Coordinate-space mismatch (v1).** MindAR reports the marker pose in MindAR's own internal camera frame, while WebXR reports it in the `local-floor` reference space. The bootstrap currently uses a *one-marker* approximation: it assumes the marker *is* the world origin and applies the WebXR-reported marker transform as the inverse origin. This is correct when the user's first WebXR view of the marker matches the MindAR detection frame, but will drift if the user moves between the two captures. For production, either (a) place a second reference marker at a known world position to compute the real MindAR↔WebXR handshake transform (`computeHandshakeOrigin` in `src/calibration/handshake.ts` is the v2 hook for this), or (b) drop the MindAR pre-step entirely and let the user tap a screen point to place the origin (hit-test path).
- **Handshake v1 is wired but the formula is the same as the single-marker fallback.** `computeHandshakeOrigin` currently returns the inverse of the WebXR marker pose (so the marker sits at the origin), which is mathematically the same as the fallback branch. The `mindarMarkerPose` field on the `Calibration` input is accepted but unused; the v2 implementation will consume it for a real MindAR↔WebXR alignment. The bootstrap already invokes `computeHandshakeOrigin` on the first tracked frame and on Recalibrate, so swapping in a real v2 formula is a one-line change.
- **MindAR pose is single-frame.** The handshake module only captures the first detection pose; lost-target recovery re-pins to the current frame (drift).
- **No iOS path.** See *Browser support*.
- **HTTPS required.** Browsers will not grant camera access (or WebXR sessions) to plain HTTP origins, which is why the dev server uses `@vitejs/plugin-basic-ssl`'s self-signed cert. You will need to accept the cert warning on first visit.
- **`.mind` file not bundled.** `public/targets.mind` must be supplied by the user; the repo ships with a `public/README.txt` placeholder only.

## File map

```
src/
├── main.ts                  # Entry point; calls bootstrap() and surfaces errors to the UI.
├── bootstrap.ts             # Wires MindAR → WebXR handoff, world origin, nav scene, and frame loop.
├── mindar/
│   ├── mindarSession.ts     # MindarSession class — starts/stops the MindAR camera and reports first detection.
│   └── mind-ar.d.ts         # Minimal type declarations for the `mind-ar` package (no upstream types).
├── webxr/
│   ├── webxrSession.ts      # WebXRSession class — requests an immersive-ar session and drives the XR frame loop.
│   └── renderer.ts          # createXRRenderer + getImageTrackingResults (raw XRFrame API; three.js r0.184 doesn't expose it).
├── anchors/
│   └── worldOrigin.ts       # XRAnchor-backed world origin with a Group-matrix fallback path.
├── calibration/
│   ├── originTransform.ts   # Pure helpers: computeOriginTransform / applyOriginTransform.
│   ├── originTransform.test.ts
│   └── handshake.ts         # v2 hook: computeHandshakeOrigin from a MindAR↔WebXR pose pair.
├── scene/
│   ├── navGraph.ts          # Hard-coded 4-node (A–D) nav graph + line geometry.
│   ├── arrows.ts            # makeArrow / makeStartMarker / makeEndMarker meshes.
│   └── scene.ts             # createNavScene — assembles graph, markers, arrows, and lights.
└── nav/
    ├── pathfinding.ts       # aStar + heuristic + neighbors over a NavGraph.
    └── pathfinding.test.ts

public/
├── README.txt               # Marker-placeholder instructions.
└── targets.mind             # (user-supplied) MindAR target file.

scripts/
└── deploy.sh                # Builds and serves dist/ on port 5174.
```

## License

MIT.
