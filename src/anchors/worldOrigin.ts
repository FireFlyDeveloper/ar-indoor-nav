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
 * Create a world origin for a tracked image, preferring an XRAnchor (which
 * tracks across reference-space updates) and falling back to a plain
 * THREE.Group whose matrix is driven manually when the anchors feature is
 * unavailable or frame.createAnchor is not implemented.
 */
export async function createWorldOrigin(
  result: ImageTrackingResult,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  scene: THREE.Scene,
  supportsAnchors: boolean,
): Promise<WorldOrigin> {
  const group = new THREE.Group();
  group.name = 'worldOrigin';
  scene.add(group);

  if (supportsAnchors && typeof frame.createAnchor === 'function') {
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

    const xrAnchor = await frame.createAnchor(pose, refSpace);
    return { kind: 'anchor', xrAnchor, group };
  }

  return { kind: 'fallback', group };
}

/**
 * For a fallback origin (no XRAnchor), copy the inverse of the latest
 * image-tracking transform into the group's local matrix each frame. The
 * group therefore represents a frame whose origin sits at the marker, so
 * authoring in the marker's local frame matches what the user sees. No-op
 * for anchor origins (the XRAnchor system drives the pose) or when no
 * tracking result is available this frame.
 */
export function updateFallbackOrigin(
  origin: WorldOrigin,
  result: ImageTrackingResult | null,
): void {
  if (origin.kind !== 'fallback' || result === null) return;

  origin.group.matrix.copy(result.transform).invert();
  origin.group.matrixAutoUpdate = false;
  origin.group.updateMatrixWorld(true);
}
