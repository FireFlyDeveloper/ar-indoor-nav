/// <reference types="webxr" />

import * as THREE from 'three';
import type { ImageTrackingResult } from '../webxr/renderer';

export type { ImageTrackingResult };

/**
 * The world origin used to position the nav scene.
 *
 * - `anchor` (preferred): backed by an XRAnchor created via
 *   `frame.createAnchor(pose, refSpace)`. The browser tracks the anchor
 *   across reference-space updates (e.g. as the `local-floor` reference
 *   space moves with the camera), so the world origin stays world-stable.
 *   Each frame the bootstrap copies the anchor's current pose into the
 *   group's matrix via `frame.getPose(xrAnchor.anchorSpace, refSpace)`.
 *
 * - `fallback` (v1 limitation): a plain THREE.Group whose matrix is set
 *   ONCE at first marker detection and never updated per frame. Because
 *   `local-floor` is camera-anchored (moves with the user), a frozen
 *   matrix is necessarily user-relative, not world-stable. The scene
 *   will appear to "follow me" as the user walks. This path is only
 *   used when the device does not expose `frame.createAnchor` or it
 *   throws. The Recalibrate button re-pins the matrix on demand.
 */
export type WorldOrigin =
  | { kind: 'anchor'; xrAnchor: XRAnchor; group: THREE.Group }
  | { kind: 'fallback'; group: THREE.Group };

/**
 * Create a world origin for a tracked image using an XRAnchor (which tracks
 * across reference-space updates). Use this when the device supports image
 * tracking + anchors.
 *
 * The XRAnchor must be created inside an XR frame callback (the
 * `XRFrame` reference is required by the spec). The caller passes the
 * current frame, refSpace, and the result whose transform will seed the
 * anchor's initial pose. The returned group's matrix is NOT set here —
 * the per-frame callback is responsible for reading the anchor's pose
 * via `frame.getPose(xrAnchor.anchorSpace, refSpace)` and writing it
 * into `group.matrix`.
 *
 * Throws if `frame.createAnchor` is not a function on this device/build.
 */
export async function createAnchorWorldOrigin(
  result: ImageTrackingResult,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  scene: THREE.Scene,
): Promise<WorldOrigin> {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  group.matrixAutoUpdate = false;
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
 * `applyOriginFromPose`) and not updated per frame.
 *
 * IMPORTANT: Because `local-floor` is a camera-anchored reference space
 * that moves with the user, a frozen Group matrix is necessarily
 * user-relative, not world-stable. As the user walks, the scene will
 * appear to drift with the camera. This is the explicit v1 fallback
 * for devices that do not support XRAnchor. Use `createAnchorWorldOrigin`
 * whenever the device exposes `frame.createAnchor`.
 *
 * The Recalibrate button re-pins the matrix on demand when the marker
 * is back in view.
 */
export function createFallbackWorldOrigin(scene: THREE.Scene): WorldOrigin {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  group.matrixAutoUpdate = false;
  scene.add(group);
  return { kind: 'fallback', group };
}
