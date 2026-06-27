import { MindarSession } from './mindar/mindarSession';
import { WebXRSession } from './webxr/webxrSession';
import { createXRRenderer } from './webxr/renderer';
import {
  createAnchorWorldOrigin,
  createFallbackWorldOrigin,
  type WorldOrigin,
} from './anchors/worldOrigin';
import { HitTestSession } from './hit-test/hitTestSession';
import { createNavScene } from './scene/scene';
import { makePlacedMarker } from './scene/arrows';
import * as THREE from 'three';

const TARGET_URL = '/targets.mind';

/**
 * Bootstrap the AR navigation app.
 *
 * The full architecture uses TWO technologies, each with a distinct role:
 *
 *   1. MindAR (marker detection). At startup we use MindAR to scan for
 *      the printed marker. MindAR is now optional plumbing — it is kept
 *      in the flow because (a) it's harmless to boot and stop, and
 *      (b) the user may want to use marker-based calibration in the
 *      future. The world origin is NO LONGER derived from the marker
 *      pose. This is the explicit, user-reported change: image-tracking
 *      has been dropped.
 *
 *   2. WebXR immersive-ar session. Started from a user-gesture handler
 *      (the Launch button) per the browser's user-gesture requirement.
 *      The session drives camera tracking and accepts the `anchors`
 *      and `hit-test` optional features (image-tracking is intentionally
 *      not requested — see `webxrSession.ts`).
 *
 *   3. Hit-test (world origin source). The user taps a horizontal
 *      surface in front of the camera; the first hit's pose is used
 *      to create an XRAnchor via `frame.createAnchor(pose, refSpace)`.
 *      The anchor tracks across reference-space updates so the nav
 *      scene does not drift as the user walks. A plain-`THREE.Group`
 *      matrix fallback is used only when the device does not expose
 *      `frame.createAnchor` (or it throws). The fallback is
 *      user-relative and will appear to "follow me" as the user walks
 *      — documented honestly in the fallback docstring.
 *
 *   4. WebXR hit-test (optional surface-placement feature). The SAME
 *      hit-test session is also polled every frame to remember the
 *      most recent surface hit, so the "Place marker on surface"
 *      button can drop a `makePlacedMarker` (green sphere) at the
 *      last aim. Hit-test is not used to place navigation arrows —
 *      those are authored from the nav graph in `src/scene/scene.ts`
 *      and live under `NavScene.root`.
 *
 * UX:
 *   1. User clicks #start → MindAR camera starts (no longer drives the
 *      world origin).
 *   2. User clicks #launchAr → WebXR session starts. The user is told
 *      to tap a horizontal surface.
 *   3. User taps anywhere on the screen → a hit-test runs in the next
 *      frame callback; the first hit's pose is used to create the
 *      XRAnchor. The status flips to "World origin placed. Walk to
 *      follow the path."
 *   4. User clicks #recalibrate → the next frame's first hit creates
 *      a NEW XRAnchor (the old one is released). The user can recalibrate
 *      as many times as they like.
 *   5. User clicks #placeOnSurface → a green sphere is dropped at the
 *      most recent hit (independent of the world origin anchor).
 *
 * Expects the following DOM elements: #ui (text), #start (button),
 * #launchAr (button, hidden by default), #recalibrate (button, hidden),
 * #placeOnSurface (button, hidden).
 */
export async function bootstrap() {
  const ui = document.getElementById('ui')!;
  const startBtn = document.getElementById('start') as HTMLButtonElement;
  const launchArBtn = document.getElementById('launchAr') as HTMLButtonElement;
  const recalBtn = document.getElementById('recalibrate') as HTMLButtonElement;
  const placeBtn = document.getElementById('placeOnSurface') as HTMLButtonElement;

  // MindAR session is kept around because the user may use it for
  // marker-based calibration later. The world origin is no longer
  // derived from a marker pose — image-tracking has been dropped.
  let mindar: MindarSession | null = null;
  // Set when MindAR reports a detection; the marker pose is exposed via
  // a status line but is not used to seed the world origin.
  let mindarMarkerSeen = false;

  startBtn.onclick = async () => {
    startBtn.style.display = 'none';
    launchArBtn.style.display = 'none';
    recalBtn.style.display = 'none';
    placeBtn.style.display = 'none';
    ui.textContent = 'Starting camera — point at the marker (optional).';
    mindar = new MindarSession();
    try {
      await mindar.start(TARGET_URL, () => {
        mindarMarkerSeen = true;
        ui.textContent =
          'Marker detected. (Marker is no longer required.) Tap "Launch AR" to start navigation.';
        // Show the Launch button so the user can hand off to WebXR
        // from a real user-gesture handler. We do NOT call handoffToWebXR
        // directly here — that would fail with SecurityError.
        launchArBtn.style.display = 'block';
      });
    } catch (err) {
      ui.textContent = `MindAR failed: ${(err as Error).message}`;
      startBtn.style.display = 'block';
    }
  };

  // The Launch button is the user-gesture entry point for WebXR.
  // WebXR's requestSession() must be called from a user-gesture handler
  // or the browser throws SecurityError.
  launchArBtn.onclick = async () => {
    launchArBtn.style.display = 'none';
    placeBtn.style.display = 'none';
    await handoffToWebXR(mindar, mindarMarkerSeen);
  };

  async function handoffToWebXR(_mindar: MindarSession | null, _mindarMarkerSeen: boolean) {
    // Release MindAR's camera before requesting WebXR. MindAR holds the
    // camera exclusively, so we MUST stop it (if it was ever started)
    // before WebXR can acquire it. We tolerate a null mindar (user
    // skipped the marker scan) and a stop failure (still try WebXR).
    if (_mindar) {
      try {
        await _mindar.stop();
      } catch (err) {
        ui.textContent = `MindAR stop failed: ${(err as Error).message}`;
        startBtn.style.display = 'block';
        return;
      }
    }

    // Probe whether this browser supports the features we need.
    // If immersive-ar is missing entirely, give up cleanly. The
    // hit-test and anchors features are requested as optional, so
    // the session will start even if the device doesn't expose them.
    try {
      if (!navigator.xr) {
        ui.textContent = 'WebXR is not available in this browser.';
        startBtn.style.display = 'block';
        return;
      }
      const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!arSupported) {
        ui.textContent = 'Immersive AR is not supported on this device/browser.';
        startBtn.style.display = 'block';
        return;
      }
    } catch (err) {
      ui.textContent = `WebXR probe failed: ${(err as Error).message}`;
      startBtn.style.display = 'block';
      return;
    }

    // Build the three.js scene + renderer
    const renderer = createXRRenderer(document.body);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      100,
    );

    // Architecture invariant: nav.root is positioned at (0,0,0) (set in
    // createNavScene). worldOrigin is a sibling of nav.root, NOT a parent.
    //
    // For the XRAnchor path, the world-origin group's matrix is driven
    // each frame to the anchor's current pose in `refSpace` (i.e. the
    // hit pose, tracked stably by the browser). The effective transform
    // on the nav scene is nav.root.matrix * worldOrigin.matrix = the
    // first hit's world pose, which is world-stable.
    //
    // For the fallback path (no XRAnchor), the world-origin group's
    // matrix is set ONCE at first user-tap-driven hit to that hit's
    // pose, and never updated per frame. Because `local-floor` is
    // camera-anchored, the resulting origin is user-relative and the
    // scene will drift as the user walks. The Recalibrate button can
    // re-pin on demand.
    const nav = createNavScene();
    scene.add(nav.root);
    nav.root.position.set(0, 0, 0);

    const webxr = new WebXRSession();

    // Hit-test session: a SESSION FEATURE used both to (a) drive the
    // world origin (via user-tap-driven hit + XRAnchor) and (b) drop 3D
    // objects onto real surfaces (via the "Place marker on surface"
    // button). It is attached to the same WebXR session once it starts.
    const hitTest = new HitTestSession();
    let lastHit: THREE.Matrix4 | null = null;
    let hitTestReady = false;

    let worldOrigin: WorldOrigin | null = null;
    let originReady = false;
    // The user-tap → world-origin queue. The actual hit-test and
    // XRAnchor creation have to happen inside an XR frame callback
    // (the `XRFrame` reference is required by the spec), so we cannot
    // create the anchor directly from the DOM event handler. We set
    // this flag from the tap handler and the frame loop consumes it.
    let placeOriginRequested = false;
    // The recalibrate flow is the same plumbing as place-origin: the
    // user taps the button, the flag is set, the next frame's first
    // hit creates a new anchor (or re-pins the Group fallback).
    let recalibrateRequested = false;

    // Recalibrate handler:
    //   - If we have no world origin yet, just request one (same effect
    //     as the very first user tap).
    //   - Otherwise, queue a re-anchor for the next frame.
    recalBtn.style.display = 'block';
    recalBtn.onclick = () => {
      if (!originReady) {
        placeOriginRequested = true;
        ui.textContent = 'Tap a horizontal surface to place the path.';
        return;
      }
      recalibrateRequested = true;
      ui.textContent = 'Recalibrating to the next surface view…';
    };

    // Place-on-surface handler: spawn a placed marker at the most
    // recent hit-test hit. If no hit has been observed yet (the user
    // hasn't pointed at a surface in a frame that hit), surface a
    // status message instead of failing silently.
    placeBtn.onclick = () => {
      if (!lastHit) {
        ui.textContent = 'Point the camera at a surface, then tap "Place marker on surface".';
        return;
      }
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      lastHit.decompose(pos, quat, scale);
      const marker = makePlacedMarker(pos);
      nav.placed.add(marker);
      ui.textContent = `Placed marker at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}).`;
    };

    // Bind the WebXR session to the three.js renderer, then register the
    // per-frame callback via renderer.setAnimationLoop — the canonical
    // three.js WebXR pattern. The renderer drives the XR frame clock
    // automatically once a session is attached.
    try {
      await webxr.start();
    } catch (err) {
      ui.textContent = `WebXR session failed: ${(err as Error).message}`;
      startBtn.style.display = 'block';
      return;
    }
    renderer.xr.setSession(webxr.xrSession!);

    // Acquire the hit-test source once the session is live. Hit-test
    // needs a viewer reference space, which is independent of the
    // `local-floor` space we use for world tracking. The hit-test
    // source is the input to BOTH the world-origin path and the
    // place-on-surface path.
    try {
      const viewerSpace = await webxr.xrSession!.requestReferenceSpace('viewer');
      hitTestReady = await hitTest.start(webxr.xrSession!, viewerSpace);
      if (hitTestReady) {
        placeBtn.style.display = 'block';
        if (!originReady) {
          ui.textContent = 'AR active. Tap a horizontal surface to place the path.';
        }
      } else {
        ui.textContent =
          'AR active. Hit-test is not supported on this device — the world origin cannot be placed.';
        startBtn.style.display = 'block';
        return;
      }
    } catch (err) {
      // hit-test is required for the new UX (it's the world origin
      // source). If it fails, surface the error and bail.
      ui.textContent = `AR active. Hit-test init failed: ${(err as Error).message}`;
      startBtn.style.display = 'block';
      return;
    }

    // User-tap → place-world-origin. The DOM event handler cannot call
    // `frame.createAnchor` directly (it needs a live XRFrame), so we
    // set a flag and the frame loop does the work.
    const onTapToPlaceOrigin = () => {
      if (originReady) return;
      placeOriginRequested = true;
      ui.textContent = 'Placing path on the first surface hit…';
    };
    // Use a pointerup listener on the renderer's canvas (or window as a
    // fallback) so any tap on the screen places the origin until the
    // origin is ready. After the origin is ready, taps are no-ops
    // (the world stays put; only Recalibrate moves it).
    window.addEventListener('pointerup', onTapToPlaceOrigin, { once: false });

    renderer.setAnimationLoop(async (_timestamp, frame) => {
      if (!frame) return;
      const refSpace = webxr.referenceSpace;
      if (!refSpace) return;

      // Poll hit-test every frame so `lastHit` is fresh for the
      // place-on-surface button AND so the origin/recalibrate handlers
      // can use the latest hit when their flags are set.
      if (hitTestReady) {
        const hit = hitTest.poll(frame, refSpace);
        if (hit) lastHit = hit.transform;
      }

      // --- Establish or re-establish the world origin -----------------
      if (!originReady && placeOriginRequested && lastHit) {
        // First-tap path: try XRAnchor first, fall back to Group if the
        // device doesn't expose frame.createAnchor or it throws.
        worldOrigin = await tryCreateWorldOrigin(lastHit, frame, refSpace, scene);
        if (worldOrigin.kind === 'fallback') {
          // Fallback: pin the matrix once and never update. This is the
          // explicit limitation — the matrix is user-relative.
          worldOrigin.group.matrix.copy(lastHit);
          worldOrigin.group.matrixAutoUpdate = false;
          worldOrigin.group.updateMatrixWorld(true);
        }
        // For the anchor kind, the matrix is driven per-frame below
        // from frame.getPose(anchor.anchorSpace, refSpace).
        if (worldOrigin.kind === 'fallback') {
          // Surface the limitation honestly: the scene will follow the
          // user because we couldn't create a real anchor.
          ui.textContent =
            'World origin placed (Group fallback — scene may follow you as you walk).';
        } else {
          ui.textContent = 'World origin placed. Walk to follow the path.';
        }
        originReady = true;
        placeOriginRequested = false;
      } else if (recalibrateRequested && originReady && lastHit) {
        // Re-anchor path: create a new anchor from the latest hit. For
        // the anchor kind we must release the old one (it can be deleted
        // at any time, not inside the frame that produced it). For the
        // fallback kind we re-pin the Group matrix to the latest hit.
        if (worldOrigin && worldOrigin.kind === 'anchor') {
          try {
            worldOrigin.xrAnchor.delete();
          } catch {
            // ignore: anchor may already be released
          }
        }
        worldOrigin = await tryCreateWorldOrigin(lastHit, frame, refSpace, scene);
        if (worldOrigin.kind === 'fallback') {
          worldOrigin.group.matrix.copy(lastHit);
          worldOrigin.group.matrixAutoUpdate = false;
          worldOrigin.group.updateMatrixWorld(true);
          ui.textContent = 'Recalibrated (Group fallback — scene may follow you as you walk).';
        } else {
          ui.textContent = 'Recalibrated to new XRAnchor.';
        }
        recalibrateRequested = false;
      }

      // --- Drive the anchor pose into the world-origin group ----------
      // The anchor's pose in refSpace is the first hit's world pose as
      // tracked by the browser. Copy it into the group's matrix every
      // frame; this is what makes the world origin world-stable.
      if (worldOrigin && worldOrigin.kind === 'anchor') {
        const anchorPose = frame.getPose(worldOrigin.xrAnchor.anchorSpace, refSpace);
        if (anchorPose) {
          worldOrigin.group.matrix.fromArray(anchorPose.transform.matrix);
        }
      }

      renderer.render(scene, camera);
    });
  }
}

/**
 * Create the world origin. Tries the XRAnchor path first (the only path
 * that produces a world-stable origin in `local-floor`); falls back to
 * a plain THREE.Group if `frame.createAnchor` is missing or throws.
 *
 * The XRAnchor must be created inside an XR frame callback; this
 * function is only called from `renderer.setAnimationLoop` where a
 * frame is available.
 */
async function tryCreateWorldOrigin(
  hitPose: THREE.Matrix4,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  scene: THREE.Scene,
): Promise<WorldOrigin> {
  if (typeof frame.createAnchor === 'function') {
    try {
      return await createAnchorWorldOrigin(hitPose, frame, refSpace, scene);
    } catch (err) {
      console.warn(
        'createAnchorWorldOrigin failed; falling back to Group:',
        (err as Error).message,
      );
    }
  }
  return createFallbackWorldOrigin(scene);
}
