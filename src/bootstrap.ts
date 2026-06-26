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

  startBtn.onclick = async () => {
    startBtn.style.display = 'none';
    ui.textContent = 'Starting camera — point at the marker.';
    const mindar = new MindarSession();
    try {
      await mindar.start(TARGET_URL, (pose) => {
        ui.textContent = 'Marker detected — starting AR session.';
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
      // Treat current WebXR marker pose as the new reference; the inverse is the world origin.
      worldOrigin.group.matrix.copy(lastResult.transform).invert();
      worldOrigin.group.matrixAutoUpdate = false;
      worldOrigin.group.updateMatrixWorld(true);
      ui.textContent = 'Recalibrated to current marker view.';
    };

    // Bind the WebXR session to the three.js renderer
    await webxr.start((frame, refSpace) => {
      const results = getImageTrackingResults(frame, refSpace);
      lastResult = results.find((r) => r.index === TARGET_INDEX) ?? null;

      if (!originReady && lastResult) {
        // Initial alignment: assume the marker IS the world origin (placeholder for proper handshake)
        worldOrigin.group.matrix.copy(lastResult.transform).invert();
        worldOrigin.group.matrixAutoUpdate = false;
        worldOrigin.group.updateMatrixWorld(true);
        originReady = true;
        ui.textContent = 'AR active. Walk to follow the path.';
      } else if (originReady) {
        updateFallbackOrigin(worldOrigin, lastResult);
      }
      renderer.render(scene, camera);
    });

    renderer.xr.setSession(webxr.xrSession!);
  }
}

// Silence the "imported but unused" lint while keeping `computeHandshakeOrigin`
// available for the upcoming handshake work (Task 11).
void computeHandshakeOrigin;
