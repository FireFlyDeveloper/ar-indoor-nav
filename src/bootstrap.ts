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
 * Wires up the Start / Recalibrate UI, runs the MindAR → WebXR handoff,
 * builds the nav scene, and drives the XR frame loop. Expects the
 * following DOM elements to exist: `#ui` (text container), `#start`
 * (button), and `#recalibrate` (button). Errors from MindAR are surfaced
 * to `#ui`; errors from WebXR propagate to the caller (see `main.ts`).
 */
export async function bootstrap() {
  const ui = document.getElementById('ui')!;
  const startBtn = document.getElementById('start') as HTMLButtonElement;
  const recalBtn = document.getElementById('recalibrate') as HTMLButtonElement;

  // Captured at MindAR detection, consumed by the WebXR handshake frame.
  let mindarMarkerPose: THREE.Matrix4 | null = null;

  startBtn.onclick = async () => {
    startBtn.style.display = 'none';
    ui.textContent = 'Starting camera — point at the marker.';
    const mindar = new MindarSession();
    try {
      await mindar.start(TARGET_URL, (pose) => {
        ui.textContent = 'Marker detected — starting AR session.';
        // Capture the MindAR marker pose (position + quaternion, unit scale)
        // so the WebXR handshake frame can use it for real alignment.
        mindarMarkerPose = new THREE.Matrix4().compose(
          pose.position,
          pose.quaternion,
          new THREE.Vector3(1, 1, 1),
        );
        // Kick off handoff; do not await here so onDetect doesn't block
        handoffToWebXR(mindar, pose);
      });
    } catch (err) {
      ui.textContent = `MindAR failed: ${(err as Error).message}`;
      startBtn.style.display = '';
    }
  };

  async function handoffToWebXR(
    mindar: MindarSession,
    _pose: { position: THREE.Vector3; quaternion: THREE.Quaternion },
  ) {
    // Release MindAR's camera before requesting WebXR
    await mindar.stop();

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

    // Recalibrate handler: stores the latest MindAR-equivalent origin from the
    // current WebXR frame's image tracking result.
    recalBtn.style.display = '';
    recalBtn.onclick = () => {
      if (!lastResult) {
        ui.textContent = 'Cannot recalibrate — no marker in view.';
        return;
      }
      applyOriginFromPose(worldOrigin, mindarMarkerPose, lastResult.transform);
      ui.textContent = mindarMarkerPose
        ? 'Recalibrated (handshake) to current marker view.'
        : 'Recalibrated (marker-as-origin) to current marker view.';
    };

    // Bind the WebXR session to the three.js renderer, then register the
    // per-frame callback via renderer.setAnimationLoop — the canonical
    // three.js WebXR pattern. The renderer drives the XR frame clock
    // automatically once a session is attached.
    await webxr.start();
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
 */
function applyOriginFromPose(
  origin: WorldOrigin,
  mindarMarkerPose: THREE.Matrix4 | null,
  webxrMarkerPose: THREE.Matrix4,
): void {
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
