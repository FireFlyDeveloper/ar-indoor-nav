import { MindARThree } from 'mind-ar';
import * as THREE from 'three';

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
 * IMPORTANT: MindAR holds the camera exclusively. `stop()` MUST be awaited
 * before any code path requests a new WebXR session, otherwise WebXR will
 * fail to acquire the camera.
 */
export class MindarSession {
  private mindar: MindARThree | null = null;
  private anchorGroup: THREE.Group | null = null;
  private renderLoopActive: boolean = false;
  private _detected: boolean = false;

  public get detected(): boolean {
    return this._detected;
  }

  public async start(
    targetSrc: string,
    onDetect: (pose: MindarPose) => void,
  ): Promise<void> {
    if (this.mindar !== null) {
      throw new Error('MindarSession.start() called while already running. Call stop() first.');
    }

    this.mindar = new MindARThree({
      container: document.body,
      imageTargetSrc: targetSrc,
    });

    const anchor = this.mindar.addAnchor(0);
    this.anchorGroup = anchor.group;

    anchor.onTargetFound = () => {
      this._detected = true;
      if (this.anchorGroup === null) return;

      this.anchorGroup.updateMatrixWorld(true);

      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      this.anchorGroup.matrixWorld.decompose(position, quaternion, scale);

      onDetect({ position, quaternion });
    };

    anchor.onTargetLost = () => {
      this._detected = false;
    };

    await this.mindar.start();

    const renderer = this.mindar.renderer;
    const scene = this.mindar.scene;
    const camera = this.mindar.camera;

    this.renderLoopActive = true;
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
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

    const domElement = renderer.domElement;
    if (domElement.parentNode !== null) {
      domElement.parentNode.removeChild(domElement);
    }

    await this.mindar.stop();

    this.anchorGroup = null;
    this._detected = false;
    this.mindar = null;
  }
}
