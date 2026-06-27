/// <reference types="webxr" />

import * as THREE from 'three';

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
 * - `fallback` (no XRAnchor available): a plain THREE.Group whose matrix
 *   is set ONCE from the first hit-test pose and never updated per frame.
 *   Because `local-floor` is camera-anchored (moves with the user), a
 *   frozen matrix is necessarily user-relative, not world-stable. The
 *   scene will appear to "follow me" as the user walks. This path is
 *   only used when the device does not expose `frame.createAnchor` or
 *   it throws. The Recalibrate button re-pins the matrix on demand.
 */
export type WorldOrigin =
  | { kind: 'anchor'; xrAnchor: XRAnchor; group: THREE.Group }
  | { kind: 'fallback'; group: THREE.Group };

/**
 * Create a world origin from a user-tapped hit-test pose using an XRAnchor
 * (which tracks across reference-space updates). Use this when the device
 * supports the anchors module and `frame.createAnchor`.
 *
 * The XRAnchor must be created inside an XR frame callback (the
 * `XRFrame` reference is required by the spec). The caller passes the
 * current frame, refSpace, and the hit pose that will seed the anchor's
 * initial world position. The returned group's matrix is NOT set here —
 * the per-frame callback is responsible for reading the anchor's pose
 * via `frame.getPose(xrAnchor.anchorSpace, refSpace)` and writing it
 * into `group.matrix`.
 *
 * The `hitPose` is a column-major 4x4 in `refSpace`, as returned by
 * `XRHitTestResult.getPose(refSpace).transform.matrix`.
 *
 * Throws if `frame.createAnchor` is not a function on this device/build.
 */
export async function createAnchorWorldOrigin(
  hitPose: THREE.Matrix4,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  scene: THREE.Scene,
): Promise<WorldOrigin> {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  group.matrixAutoUpdate = false;
  scene.add(group);

  // Decompose the hit pose (a column-major 4x4) into its position and
  // rotation quaternion; THREE.Matrix4.decompose() handles the matrix→TRS
  // conversion correctly. We discard scale (hit-test poses are unit-scale).
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  hitPose.decompose(pos, quat, scale);

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
 * matrix is set ONCE from the first hit-test pose and not updated per frame.
 *
 * IMPORTANT: Because `local-floor` is a camera-anchored reference space
 * that moves with the user, a frozen Group matrix is necessarily
 * user-relative, not world-stable. As the user walks, the scene will
 * appear to drift with the camera. This is the explicit fallback for
 * devices that do not support XRAnchor. Use `createAnchorWorldOrigin`
 * whenever the device exposes `frame.createAnchor`.
 *
 * The Recalibrate button re-pins the matrix on demand (the user taps
 * "Recalibrate" and a new hit-test runs in the next frame, then a new
 * Group matrix is set from the latest hit).
 */
export function createFallbackWorldOrigin(scene: THREE.Scene): WorldOrigin {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  group.matrixAutoUpdate = false;
  scene.add(group);
  return { kind: 'fallback', group };
}
