import { MindarSession } from './mindar/mindarSession';
import { WebXRSession } from './webxr/webxrSession';
import { createXRRenderer, getImageTrackingResults } from './webxr/renderer';
import {
  createAnchorWorldOrigin,
  createFallbackWorldOrigin,
  type WorldOrigin,
} from './anchors/worldOrigin';
import { computeHandshakeOrigin } from './calibration/handshake';
import { HitTestSession } from './hit-test/hitTestSession';
import { createNavScene } from './scene/scene';
import { makePlacedMarker } from './scene/arrows';
import * as THREE from 'three';

const TARGET_URL = '/targets.mind';
const TARGET_INDEX = 0;

/**
 * Bootstrap the AR navigation app.
 *
 * The full architecture uses THREE technologies, each with a distinct role:
 *
 *   1. MindAR (marker detection). At startup we use MindAR to detect the
 *      printed marker and capture its pose in MindAR's camera space. This
 *      answers "where am I".
 *
 *   2. WebXR immersive-ar session. Started from a user-gesture handler
 *      (the Launch button) per the browser's user-gesture requirement.
 *      The session drives camera tracking and accepts the
 *      `image-tracking`, `anchors`, and `hit-test` optional features.
 *
 *   3. XRAnchor (world stability). The world origin of the nav scene is
 *      pinned to the marker's first-detected pose via `frame.createAnchor`,
 *      so the nav scene does not drift as the user walks. The browser
 *      tracks the anchor via visual-inertial odometry and we read its
 *      pose each frame from `frame.getPose(anchor.anchorSpace, refSpace)`.
 *      A plain-`THREE.Group` matrix fallback is used only when the
 *      device does not expose `frame.createAnchor` (or it throws). The
 *      fallback is user-relative and will appear to "follow me" as the
 *      user walks — documented honestly in the fallback docstring.
 *
 *   4. WebXR hit-test (optional surface-placement feature). A separate
 *      hit-test session is acquired for the SAME WebXR session and is
 *      used to place user-chosen AR Objects (a `makePlacedMarker` green
 *      sphere) onto real surfaces in front of the user via the
 *      "Place marker on surface" button. Hit-test does NOT establish
 *      the world origin and is NOT used to place navigation arrows —
 *      those are authored from the nav graph in `src/scene/scene.ts`
 *      and live under `NavScene.root` (see `nav.placed` for the
 *      group that receives user-tapped markers).
 *
 * Two-stage UX:
 *   1. User clicks #start → MindAR camera starts, scans for the marker.
 *   2. When the marker is detected, a #launchAr button appears. The user
 *      MUST click it to hand off to WebXR — browsers require the session
 *      request to come from a user-gesture handler. Auto-handoff from
 *      MindAR's onTargetFound callback is blocked by SecurityError on all
 *      current browsers.
 *   3. After the WebXR session starts and the origin locks, the
 *      #placeOnSurface button becomes available. Each click drops a
 *      placed marker at the most recent hit-test surface hit.
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

  // Captured at MindAR detection, consumed by the WebXR handshake frame.
  let mindarMarkerPose: THREE.Matrix4 | null = null;
  let mindar: MindarSession | null = null;

  startBtn.onclick = async () => {
    startBtn.style.display = 'none';
    launchArBtn.style.display = 'none';
    recalBtn.style.display = 'none';
    placeBtn.style.display = 'none';
    ui.textContent = 'Starting camera — point at the marker.';
    mindar = new MindarSession();
    try {
      await mindar.start(TARGET_URL, (pose) => {
        ui.textContent = 'Marker detected. Tap "Launch AR" to start navigation.';
        // Capture the MindAR marker pose (position + quaternion, unit scale)
        // so the WebXR handshake frame can use it for real alignment.
        mindarMarkerPose = new THREE.Matrix4().compose(
          pose.position,
          pose.quaternion,
          new THREE.Vector3(1, 1, 1),
        );
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
    if (!mindar) return;
    launchArBtn.style.display = 'none';
    placeBtn.style.display = 'none';
    await handoffToWebXR(mindar);
  };

  async function handoffToWebXR(mindar: MindarSession) {
    // Release MindAR's camera before requesting WebXR
    try {
      await mindar.stop();
    } catch (err) {
      ui.textContent = `MindAR stop failed: ${(err as Error).message}`;
      return;
    }

    // Probe whether this browser supports the features we need.
    // If image-tracking is missing, fall back gracefully: the WebXR
    // session can still start (it'll just track world, not the marker).
    // If immersive-ar is missing entirely, give up cleanly.
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
    // marker's world pose, tracked stably by the browser). The effective
    // transform on the nav scene is nav.root.matrix * worldOrigin.matrix
    // = marker's first-detected pose, which is world-stable.
    //
    // For the fallback path (no XRAnchor), the world-origin group's
    // matrix is set ONCE at first marker detection to inverse(marker
    // pose), and never updated per frame. Because `local-floor` is
    // camera-anchored, the resulting origin is user-relative and the
    // scene will drift as the user walks. The Recalibrate button can
    // re-pin on demand.
    //
    // The world origin is created LAZILY on the first frame that
    // contains a tracked marker, because XRAnchor requires an XRFrame
    // to be created and we only have one inside the animation-loop
    // callback. Before the first marker is seen, worldOrigin is null.
    const nav = createNavScene();
    scene.add(nav.root);
    nav.root.position.set(0, 0, 0);

    const webxr = new WebXRSession();

    // Hit-test session: a SESSION FEATURE used to drop 3D objects onto
    // real surfaces. It is independent of the world origin and is
    // attached to the same WebXR session once it starts.
    const hitTest = new HitTestSession();
    let lastHit: THREE.Matrix4 | null = null;
    let hitTestReady = false;

    let worldOrigin: WorldOrigin | null = null;
    let originReady = false;
    let lastResult: ReturnType<typeof getImageTrackingResults>[number] | null = null;
    // Re-anchoring queue: when the user taps Recalibrate on the anchor
    // path, we mark `recalibrateRequested`; the next frame destroys the
    // old anchor and creates a new one from that frame's marker pose.
    // The old anchor's deletion must be scheduled, not immediate, because
    // XRAnchor.delete() may only be called outside the frame callback
    // that produced its pose.
    let recalibrateRequested = false;

    // Recalibrate handler:
    //   - fallback: re-pin the matrix immediately from the current
    //     marker view (or the last seen one).
    //   - anchor: queue a re-anchor for the next frame, since we need
    //     a live XRFrame to call createAnchor.
    recalBtn.style.display = 'block';
    recalBtn.onclick = () => {
      if (!worldOrigin) {
        ui.textContent = 'Cannot recalibrate — no marker has been seen yet.';
        return;
      }
      if (worldOrigin.kind === 'fallback') {
        applyOriginFromPose(worldOrigin, mindarMarkerPose, lastResult?.transform ?? null);
        ui.textContent = mindarMarkerPose
          ? 'Recalibrated (handshake) to current marker view.'
          : lastResult
            ? 'Recalibrated (marker-as-origin) to current marker view.'
            : 'Cannot recalibrate — no marker in view.';
      } else {
        recalibrateRequested = true;
        ui.textContent = 'Recalibrating to the next marker view…';
      }
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
    // `local-floor` space we use for world tracking.
    try {
      const viewerSpace = await webxr.xrSession!.requestReferenceSpace('viewer');
      hitTestReady = await hitTest.start(webxr.xrSession!, viewerSpace);
      if (hitTestReady) {
        placeBtn.style.display = 'block';
        ui.textContent =
          'AR active. Tap "Place marker on surface" to drop markers, or walk to follow the path.';
      } else {
        ui.textContent =
          'AR active. Hit-test is not supported on this device — only the marker-anchored path is available.';
      }
    } catch (err) {
      // hit-test is optional; if it fails we still render the anchored scene.
      hitTestReady = false;
      ui.textContent = `AR active. Hit-test init failed: ${(err as Error).message}`;
    }

    renderer.setAnimationLoop(async (_timestamp, frame) => {
      if (!frame) return;
      const refSpace = webxr.referenceSpace;
      if (!refSpace) return;

      const results = getImageTrackingResults(frame, refSpace);
      lastResult = results.find((r) => r.index === TARGET_INDEX) ?? null;

      // --- Establish or re-establish the world origin -----------------
      if (!originReady && lastResult) {
        // First-detection path: try XRAnchor first, fall back to Group
        // if the device doesn't expose frame.createAnchor or it throws.
        worldOrigin = await tryCreateWorldOrigin(
          lastResult,
          frame,
          refSpace,
          scene,
          mindarMarkerPose,
        );
        if (worldOrigin.kind === 'fallback') {
          // Fallback: pin the matrix once and never update. This is the
          // explicit v1 limitation — the matrix is user-relative.
          applyOriginFromPose(worldOrigin, mindarMarkerPose, lastResult.transform);
        }
        // For the anchor kind, the matrix is driven per-frame below
        // from frame.getPose(anchor.anchorSpace, refSpace).
        if (!hitTestReady) {
          ui.textContent =
            worldOrigin.kind === 'anchor'
              ? mindarMarkerPose
                ? 'AR active. Walk to follow the path.'
                : 'AR active (no handshake — XRAnchor tracking the marker).'
              : mindarMarkerPose
                ? 'AR active. Walk to follow the path.'
                : 'AR active (no handshake — using marker as origin).';
        }
        if (worldOrigin.kind === 'fallback') {
          // Surface the limitation honestly: the scene will follow the
          // user because we couldn't create a real anchor.
          ui.textContent += ' (using Group fallback — scene may follow you as you walk)';
        }
        originReady = true;
      } else if (recalibrateRequested && lastResult) {
        // Re-anchor path: only meaningful on the anchor kind. For the
        // fallback kind the recalibrate handler already re-pinned the
        // matrix synchronously.
        if (worldOrigin && worldOrigin.kind === 'anchor') {
          try {
            // The old anchor can be deleted at any time (not inside the
            // frame that produced it). The new anchor must be created
            // inside the frame callback, which we are in.
            worldOrigin.xrAnchor.delete();
          } catch {
            // ignore: anchor may already be released
          }
          worldOrigin = await tryCreateWorldOrigin(
            lastResult,
            frame,
            refSpace,
            scene,
            mindarMarkerPose,
          );
          ui.textContent =
            worldOrigin.kind === 'anchor'
              ? 'Recalibrated to new XRAnchor.'
              : 'Recalibrate fell back to Group — scene may follow you as you walk.';
        }
        recalibrateRequested = false;
      }

      // --- Drive the anchor pose into the world-origin group ----------
      // The anchor's pose in refSpace is the marker's world pose as
      // tracked by the browser. Copy it into the group's matrix every
      // frame; this is what makes the world origin world-stable.
      if (worldOrigin && worldOrigin.kind === 'anchor') {
        const anchorPose = frame.getPose(worldOrigin.xrAnchor.anchorSpace, refSpace);
        if (anchorPose) {
          worldOrigin.group.matrix.fromArray(anchorPose.transform.matrix);
        }
      }

      // Poll hit-test for the most recent surface hit. We update lastHit
      // every frame (not just on tap) so the user can pan the camera to
      // aim, then tap to drop the marker at the last position.
      if (hitTestReady) {
        const hit = hitTest.poll(frame, refSpace);
        if (hit) lastHit = hit.transform;
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
 *
 * The `mindarMarkerPose` is plumbed through for the handshake path on
 * the fallback kind only — the anchor kind has no handshake concept
 * (the browser handles the alignment internally via VIO).
 */
async function tryCreateWorldOrigin(
  result: ReturnType<typeof getImageTrackingResults>[number],
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  scene: THREE.Scene,
  _mindarMarkerPose: THREE.Matrix4 | null,
): Promise<WorldOrigin> {
  if (typeof frame.createAnchor === 'function') {
    try {
      return await createAnchorWorldOrigin(result, frame, refSpace, scene);
    } catch (err) {
      console.warn(
        'createAnchorWorldOrigin failed; falling back to Group:',
        (err as Error).message,
      );
    }
  }
  return createFallbackWorldOrigin(scene);
}

/**
 * Pin the fallback world origin to the current WebXR marker view. When a
 * MindAR pose is available the (currently v1) handshake transform is used;
 * otherwise we fall back to using the marker as the origin directly.
 *
 * If no transform is supplied (no marker in view), the call is a no-op.
 *
 * Note: this is only meaningful for the `fallback` kind of world origin.
 * For the `anchor` kind, the bootstrap drives the group matrix from
 * `frame.getPose(xrAnchor.anchorSpace, refSpace)` every frame — this
 * function is not called on that path.
 */
function applyOriginFromPose(
  origin: WorldOrigin,
  mindarMarkerPose: THREE.Matrix4 | null,
  webxrMarkerPose: THREE.Matrix4 | null,
): void {
  if (origin.kind !== 'fallback') return;
  if (!webxrMarkerPose) return;
  if (mindarMarkerPose) {
    const handshake = computeHandshakeOrigin({
      mindarMarkerPose,
      webxrMarkerPose: webxrMarkerPose.clone(),
      timestamp: Date.now(),
    });
    origin.group.matrix.copy(handshake);
  } else {
    origin.group.matrix.copy(webxrMarkerPose).invert();
  }
  origin.group.matrixAutoUpdate = false;
  origin.group.updateMatrixWorld(true);
}
