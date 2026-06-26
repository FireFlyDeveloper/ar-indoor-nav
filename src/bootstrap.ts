import { MindarSession } from './mindar/mindarSession';
import { WebXRSession } from './webxr/webxrSession';
import { createXRRenderer, getImageTrackingResults } from './webxr/renderer';
import { updateFallbackOrigin, type WorldOrigin } from './anchors/worldOrigin';
import { createNavScene } from './scene/scene';
import { computeHandshakeOrigin } from './calibration/handshake';
import * as THREE from 'three';

const TARGET_URL = '/targets.mind';
const TARGET_INDEX = 0;

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
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
    const nav = createNavScene();
    scene.add(nav.root);

    // World origin: a fallback Group at (0,0,0). Real anchor path is wired below.
    const worldOrigin: WorldOrigin = { kind: 'fallback', group: new THREE.Group() };
    worldOrigin.group.name = 'worldOrigin';
    scene.add(worldOrigin.group);
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
      // If we still have a MindAR pose, recompute the real handshake from
      // it and the current WebXR marker pose. Otherwise fall back to the
      // legacy behaviour: treat the current WebXR marker as the origin.
      if (mindarMarkerPose) {
        const handshake = computeHandshakeOrigin({
          mindarMarkerPose,
          webxrMarkerPose: lastResult.transform.clone(),
          timestamp: Date.now(),
        });
        worldOrigin.group.matrix.copy(handshake);
        ui.textContent = 'Recalibrated (handshake) to current marker view.';
      } else {
        worldOrigin.group.matrix.copy(lastResult.transform).invert();
        ui.textContent = 'Recalibrated (marker-as-origin) to current marker view.';
      }
      worldOrigin.group.matrixAutoUpdate = false;
      worldOrigin.group.updateMatrixWorld(true);
    };

    // Bind the WebXR session to the three.js renderer
    await webxr.start((frame, refSpace) => {
      const results = getImageTrackingResults(frame, refSpace);
      lastResult = results.find((r) => r.index === TARGET_INDEX) ?? null;

      if (!originReady && lastResult) {
        if (mindarMarkerPose) {
          // Proper handshake: real alignment using both MindAR and WebXR poses.
          const handshake = computeHandshakeOrigin({
            mindarMarkerPose,
            webxrMarkerPose: lastResult.transform.clone(),
            timestamp: Date.now(),
          });
          worldOrigin.group.matrix.copy(handshake);
          ui.textContent = 'AR active. Walk to follow the path.';
        } else {
          // No MindAR pose captured (race condition? shouldn't happen in normal
          // flow) — fall back to treating the marker as the world origin.
          worldOrigin.group.matrix.copy(lastResult.transform).invert();
          ui.textContent = 'AR active (no handshake — using marker as origin).';
        }
        worldOrigin.group.matrixAutoUpdate = false;
        worldOrigin.group.updateMatrixWorld(true);
        originReady = true;
      } else if (originReady) {
        updateFallbackOrigin(worldOrigin, lastResult);
      }
      renderer.render(scene, camera);
    });

    renderer.xr.setSession(webxr.xrSession!);
  }
}
