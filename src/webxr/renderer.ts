/// <reference types="webxr" />

import * as THREE from 'three';

export type ImageTrackingResult = {
  index: number;
  transform: THREE.Matrix4;
  trackingState: 'tracked' | 'emulated' | 'paused';
};

/**
 * Create a WebGLRenderer wired up for WebXR and append it to the container.
 * `renderer.xr.enabled = true` is required for the render-loop's XR frame
 * scheduling to take over.
 */
export function createXRRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Read tracked images for the current XR frame using the raw `XRFrame`
 * API (the three.js r0.184 WebXRManager does not expose
 * `getImageTrackingResults`). Returns an empty array on browsers that
 * don't implement the image-tracking module.
 */
export function getImageTrackingResults(
  frame: XRFrame,
  refSpace: XRReferenceSpace,
): ImageTrackingResult[] {
  const raw = frame.getImageTrackingResults?.();
  if (!raw) return [];

  const out: ImageTrackingResult[] = [];
  for (const r of raw) {
    if (r.trackingState === 'paused') continue;
    const pose = frame.getPose(r.imageSpace, refSpace);
    if (!pose) continue;
    out.push({
      index: r.index,
      transform: new THREE.Matrix4().fromArray(pose.transform.matrix),
      trackingState: r.trackingState,
    });
  }
  return out;
}
