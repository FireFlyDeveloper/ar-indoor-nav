import { MindarSession } from './mindar/mindarSession';
import { WebXRSession } from './webxr/webxrSession';
import { createXRRenderer, getImageTrackingResults } from './webxr/renderer';
import { createFallbackWorldOrigin, type WorldOrigin } from './anchors/worldOrigin';
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
 *      pinned to the marker's WebXR pose via `frame.createAnchor`, so
 *      the nav scene does not drift as the user walks. A plain-Group
 *      fallback is used when anchors are unavailable.
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
    // The world-origin group's matrix is driven each frame to be the inverse
    // of the marker's WebXR pose. The effective transform on the nav scene
    // is therefore nav.root.matrix * worldOrigin.matrix = inverse(marker pose).
    // If createNavScene ever changes the nav.root position, the marker
    // anchoring will break silently.
    const nav = createNavScene();
    scene.add(nav.root);

    // World origin: using the Group fallback path. The XRAnchor path
    // (createAnchorWorldOrigin in src/anchors/worldOrigin.ts) is defined and
    // feature-detected, but requires the device to expose frame.createAnchor
    // with the image-tracking module. This v1 implementation always uses the
    // fallback; the XRAnchor path is reserved for v2.
    const worldOrigin: WorldOrigin = createFallbackWorldOrigin(scene);
    nav.root.position.set(0, 0, 0);

    const webxr = new WebXRSession();

    // Hit-test session: a SESSION FEATURE used to drop 3D objects onto
    // real surfaces. It is independent of the world origin and is
    // attached to the same WebXR session once it starts.
    const hitTest = new HitTestSession();
    let lastHit: THREE.Matrix4 | null = null;
    let hitTestReady = false;

    let originReady = false;
    let lastResult: ReturnType<typeof getImageTrackingResults>[number] | null = null;

    // Recalibrate handler: re-pin the world origin to the current
    // WebXR marker view (or the marker-as-origin fallback if no
    // image-tracking result is in frame).
    recalBtn.style.display = 'block';
    recalBtn.onclick = () => {
      applyOriginFromPose(worldOrigin, mindarMarkerPose, lastResult?.transform ?? null);
      ui.textContent = mindarMarkerPose
        ? 'Recalibrated (handshake) to current marker view.'
        : lastResult
          ? 'Recalibrated (marker-as-origin) to current marker view.'
          : 'Cannot recalibrate — no marker in view.';
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

    renderer.setAnimationLoop((_timestamp, frame) => {
      if (!frame) return;
      const refSpace = webxr.referenceSpace;
      if (!refSpace) return;

      const results = getImageTrackingResults(frame, refSpace);
      lastResult = results.find((r) => r.index === TARGET_INDEX) ?? null;

      if (!originReady && lastResult) {
        // Pin the world origin to the marker's first-detected view and
        // never update it per frame: the `local-floor` reference space
        // moves with the camera, so re-inverting a fresh marker pose
        // each frame would drag the scene with the user. Leaving the
        // matrix alone is what emulates an XRAnchor's stability. The
        // Recalibrate button can re-pin on demand.
        applyOriginFromPose(worldOrigin, mindarMarkerPose, lastResult.transform);
        if (!hitTestReady) {
          ui.textContent = mindarMarkerPose
            ? 'AR active. Walk to follow the path.'
            : 'AR active (no handshake — using marker as origin).';
        }
        originReady = true;
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
 * Pin the world origin to the current WebXR marker view. When a MindAR pose
 * is available the (currently v1) handshake transform is used; otherwise we
 * fall back to using the marker as the origin directly.
 *
 * If no transform is supplied (no marker in view), the call is a no-op.
 */
function applyOriginFromPose(
  origin: WorldOrigin,
  mindarMarkerPose: THREE.Matrix4 | null,
  webxrMarkerPose: THREE.Matrix4 | null,
): void {
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
