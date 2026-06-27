import * as THREE from 'three';

/** A matched pair of marker poses captured by MindAR and WebXR at the calibration instant. */
export type Calibration = {
  mindarMarkerPose: THREE.Matrix4;
  webxrMarkerPose: THREE.Matrix4;
  timestamp: number;
};

/**
 * @deprecated The MindAR↔WebXR handshake is no longer part of the v2
 * architecture. The world origin is now established by a user-tapped
 * hit-test, not by a marker pose. The v1 single-marker approximation
 * (where `webxrMarkerPose` was used as the inverse origin) is the
 * historical artifact preserved by this function — it returns the
 * identity matrix because the bootstrap now reads the hit pose
 * directly from `XRHitTestResult.getPose(refSpace)` and feeds it into
 * `createAnchorWorldOrigin` (or the Group fallback). The function is
 * retained for backwards compatibility with any external callers and
 * to document the evolution in-tree.
 *
 * NOTE: `mindarMarkerPose` and `webxrMarkerPose` are accepted and ignored.
 */
export function computeHandshakeOrigin(_c: Calibration): THREE.Matrix4 {
  return new THREE.Matrix4();
}
