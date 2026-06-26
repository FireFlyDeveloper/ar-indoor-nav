import * as THREE from 'three';

/**
 * Compute the world→marker transform T such that applying T to the marker's
 * world pose yields identity. This is the calibration origin transform.
 */
export function computeOriginTransform(markerWorldPose: THREE.Matrix4): THREE.Matrix4 {
  return markerWorldPose.clone().invert();
}

/**
 * Apply the origin transform T to an XR-derived matrix, re-expressing the
 * pose in the marker's local frame.
 */
export function applyOriginTransform(xrMatrix: THREE.Matrix4, T: THREE.Matrix4): THREE.Matrix4 {
  return T.clone().multiply(xrMatrix);
}
