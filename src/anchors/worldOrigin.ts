/// <reference types="webxr" />

import * as THREE from 'three';
import type { ImageTrackingResult } from '../webxr/renderer';

export type { ImageTrackingResult };

/**
 * The world origin used to position the nav scene. `anchor` is the
 * preferred path (XRAnchor survives reference-space updates), `fallback`
 * is a plain THREE.Group driven manually each frame when anchors are
 * unavailable.
 */
export type WorldOrigin =
  | { kind: 'anchor'; xrAnchor: XRAnchor; group: THREE.Group }
  | { kind: 'fallback'; group: THREE.Group };

/**
 * Create a world origin for a tracked image using an XRAnchor (which tracks
 * across reference-space updates). Use this when the device supports image
 * tracking + anchors.
 */
export async function createAnchorWorldOrigin(
  result: ImageTrackingResult,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  scene: THREE.Scene,
): Promise<WorldOrigin> {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  scene.add(group);

  // Decompose the marker transform (a column-major 4x4) into its
  // position and rotation quaternion; THREE.Matrix4.decompose() handles
  // the matrix→TRS conversion correctly.
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  result.transform.decompose(pos, quat, scale);

  const pose = new XRRigidTransform(
    { x: pos.x, y: pos.y, z: pos.z, w: 1 } as DOMPointInit,
    { x: quat.x, y: quat.y, z: quat.z, w: quat.w } as DOMPointInit,
  );

  if (typeof frame.createAnchor !== 'function') {
    throw new Error('frame.createAnchor is not supported on this device');
  }
  const xrAnchor = await frame.createAnchor(pose, refSpace);
  return { kind: 'anchor', xrAnchor, group };
}

/**
 * Create a placeholder world origin as a plain THREE.Group. The group's
 * matrix is set ONCE at first marker detection (see `bootstrap.ts`'s
 * `applyOriginFromPose`) and not updated per frame, so the scene stays
 * anchored to the room at the marker's first-detected position even
 * though the `local-floor` reference space moves with the camera. Use
 * this when the device does not support XRAnchor; the Recalibrate button
 * explicitly re-pins the matrix on demand.
 */
export function createFallbackWorldOrigin(scene: THREE.Scene): WorldOrigin {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  scene.add(group);
  return { kind: 'fallback', group };
}
