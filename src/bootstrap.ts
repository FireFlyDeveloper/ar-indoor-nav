import { MindarSession } from './mindar/mindarSession';
import { WebXRSession } from './webxr/webxrSession';
import { createXRRenderer, getImageTrackingResults } from './webxr/renderer';
import {
  createFallbackWorldOrigin,
  updateFallbackOrigin,
  type WorldOrigin,
} from './anchors/worldOrigin';
import { createNavScene } from './scene/scene';
import { computeHandshakeOrigin } from './calibration/handshake';
import * as THREE from 'three';

const TARGET_URL = '/targets.mind';
const TARGET_INDEX = 0;

/**
 * Bootstrap the AR navigation app.
 *
 * Two-stage UX:
 *   1. User clicks #start → MindAR camera starts, scans for the marker.
 *   2. When the marker is detected, a #launchAr button appears. The user
 *      MUST click it to hand off to WebXR — browsers require the session
 *      request to come from a user-gesture handler. Auto-handoff from
 *      MindAR's onTargetFound callback is blocked by SecurityError on all
 *      current browsers.
 *
 * Expects the following DOM elements: #ui (text), #start (button),
 * #launchAr (button, hidden by default), #recalibrate (button, hidden).
 */
export async function bootstrap() {
  const ui = document.getElementById('ui')!;
  const startBtn = document.getElementById('start') as HTMLButtonElement;
  const launchArBtn = document.getElementById('launchAr') as HTMLButtonElement;
  const recalBtn = document.getElementById('recalibrate') as HTMLButtonElement;

  // Captured at MindAR detection, consumed by the WebXR handshake frame.
  let mindarMarkerPose: THREE.Matrix4 | null = null;
  let mindar: MindarSession | null = null;

  startBtn.onclick = async () => {
    startBtn.style.display = 'none';
    launchArBtn.style.display = 'none';
    recalBtn.style.display = 'none';
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
    const nav = createNavScene();
    scene.add(nav.root);

    // World origin: fallback path (plain THREE.Group) since this build
    // does not wire up XRAnchor; the group's matrix is driven each frame
    // from the WebXR image-tracking result.
    const worldOrigin: WorldOrigin = createFallbackWorldOrigin(scene);
    nav.root.position.set(0, 0, 0);

    const webxr = new WebXRSession();
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

    renderer.setAnimationLoop((_timestamp, frame) => {
      if (!frame) return;
      const refSpace = webxr.referenceSpace;
      if (!refSpace) return;

      const results = getImageTrackingResults(frame, refSpace);
      lastResult = results.find((r) => r.index === TARGET_INDEX) ?? null;

      if (!originReady && lastResult) {
        applyOriginFromPose(worldOrigin, mindarMarkerPose, lastResult.transform);
        ui.textContent = mindarMarkerPose
          ? 'AR active. Walk to follow the path.'
          : 'AR active (no handshake — using marker as origin).';
        originReady = true;
      } else if (originReady) {
        updateFallbackOrigin(worldOrigin, lastResult);
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
