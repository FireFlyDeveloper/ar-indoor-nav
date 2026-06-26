import * as THREE from 'three';

/** A matched pair of marker poses captured by MindAR and WebXR at the calibration instant. */
export type Calibration = {
  mindarMarkerPose: THREE.Matrix4;
  webxrMarkerPose: THREE.Matrix4;
  timestamp: number;
};

/**
 * v1: Compute the world→marker origin transform from a single WebXR marker pose
 * (i.e. the inverse of the marker pose, so the marker becomes the world origin).
 *
 * NOTE: This is NOT a real MindAR↔WebXR alignment. MindAR's camera space and
 * WebXR's `local-floor` reference space are different coordinate systems, and
 * a single marker provides no constraint to map one into the other. The
 * `mindarMarkerPose` is accepted and stored in `Calibration` for a future v2
 * implementation that will use it (e.g. with a second reference marker) to
 * derive a real handshake transform. For v1 the function simply returns
 * `M_webxr^-1`, matching the single-marker fallback the bootstrap uses
 * directly.
 */
export function computeHandshakeOrigin(c: Calibration): THREE.Matrix4 {
  return c.webxrMarkerPose.clone().invert();
}
