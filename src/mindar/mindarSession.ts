import { MindARThree } from 'mind-ar';
import * as THREE from 'three';

/** A detected marker's pose in MindAR's own camera space (position + orientation). */
export type MindarPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

/**
 * High-level wrapper around the MindARThree SDK.
 *
 * Lifecycle:
 *   1. start(targetSrc, onDetect)  - initializes the camera, anchors, and render loop.
 *   2. stop()                     - tears everything down and releases the camera.
 *
 * Mounts the MindAR renderer's canvas to document.body; stop() detaches it.
 *
 * IMPORTANT: MindAR holds the camera exclusively. `stop()` MUST be awaited
 * before any code path requests a new WebXR session, otherwise WebXR will
 * fail to acquire the camera.
 */
export class MindarSession {
  private mindar: MindARThree | null = null;
  private anchorGroup: THREE.Group | null = null;
  private renderLoopActive: boolean = false;

  public async start(targetSrc: string, onDetect: (pose: MindarPose) => void): Promise<void> {
    if (this.mindar !== null) {
      throw new Error('MindarSession.start() called while already running. Call stop() first.');
    }

    try {
      this.mindar = new MindARThree({
        container: document.body,
        imageTargetSrc: targetSrc,
      });

      const anchor = this.mindar.addAnchor(0);
      this.anchorGroup = anchor.group;

      anchor.onTargetFound = () => {
        if (this.anchorGroup === null) return;

        this.anchorGroup.updateMatrixWorld(true);

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        this.anchorGroup.matrixWorld.decompose(position, quaternion, scale);

        onDetect({ position, quaternion });
      };

      anchor.onTargetLost = () => {
        // Intentionally a no-op: the bootstrap doesn't currently react to
        // target loss, but the SDK event is wired so future code can.
      };

      await this.mindar.start();

      const renderer = this.mindar.renderer;
      const scene = this.mindar.scene;
      const camera = this.mindar.camera;

      this.renderLoopActive = true;
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
      });
    } catch (err) {
      this.detachCanvas();
      if (this.mindar !== null) {
        await this.mindar.stop();
      }
      this.mindar = null;
      this.anchorGroup = null;
      this.renderLoopActive = false;
      throw err;
    }
  }

  public async stop(): Promise<void> {
    if (this.mindar === null) {
      return;
    }

    const renderer = this.mindar.renderer;

    if (this.renderLoopActive) {
      renderer.setAnimationLoop(null);
      this.renderLoopActive = false;
    }

    this.detachCanvas();
    await this.mindar.stop();

    this.anchorGroup = null;
    this.mindar = null;
  }

  private detachCanvas(): void {
    const el = this.mindar?.renderer.domElement;
    if (el?.parentNode) el.parentNode.removeChild(el);
  }
}
