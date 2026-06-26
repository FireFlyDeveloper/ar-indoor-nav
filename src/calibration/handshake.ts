import * as THREE from 'three';

/** A matched pair of marker poses captured by MindAR and WebXR at the calibration instant. */
export type Calibration = {
  mindarMarkerPose: THREE.Matrix4;
  webxrMarkerPose:  THREE.Matrix4;
  timestamp: number;
};

/** Compute the world→marker origin transform from a MindAR↔WebXR pose pair (T = M_mindar * M_webxr^-1). */
export function computeHandshakeOrigin(c: Calibration): THREE.Matrix4 {
  return c.mindarMarkerPose.clone().multiply(c.webxrMarkerPose.clone().invert());
}
