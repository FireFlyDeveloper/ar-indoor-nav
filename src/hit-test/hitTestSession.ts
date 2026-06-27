/// <reference types="webxr" />

import * as THREE from 'three';

/**
 * The WebXR Hit Test module spec is still a draft. `@types/webxr` ships
 * the surface used here (`XRHitTestSource`, `XRSession.requestHitTestSource`,
 * `XRFrame.getHitTestResults`, `XRHitTestResult.getPose`).
 *
 * Spec: https://immersive-web.github.io/hit-test/
 *
 * The hit-test module is used in this project ONLY for placing user-chosen
 * `makePlacedMarker` (a green sphere) onto real surfaces in front of the
 * user via the "Place marker on surface" button. It is NOT used to place
 * navigation arrows, path indicators, or destination markers — those
 * are authored from the nav graph in `src/scene/scene.ts` and live under
 * `NavScene.root`. The world origin is established by MindAR + XRAnchor
 * (see `src/anchors/worldOrigin.ts` and `src/mindar/mindarSession.ts`).
 */

/**
 * A single surface hit, returned in a three.js-friendly shape.
 * `transform` is the pose of the surface fragment in the supplied
 * reference space.
 */
export type HitResult = {
  transform: THREE.Matrix4;
};

/**
 * Wraps an `XRHitTestSource` and exposes a per-frame poll that returns
 * the first surface hit, if any. The session is the owner of the
 * source; `stop()` MUST be called to release it (sources hold GPU
 * resources in some implementations).
 *
 * Lifecycle:
 *   1. await session.requestHitTestSource({ space: viewerSpace })
 *   2. each frame: frame.getHitTestResults(source) → first match's pose
 *   3. source.cancel() when finished
 */
export class HitTestSession {
  private _source: XRHitTestSource | null = null;
  private _available: boolean = false;

  /**
   * Acquire a hit-test source anchored to the supplied space (typically
   * a viewer reference space). Returns `true` if the source was created,
   * `false` if the browser does not support the Hit Test module or
   * threw while creating the source.
   */
  public async start(session: XRSession, space: XRReferenceSpace): Promise<boolean> {
    if (typeof session.requestHitTestSource !== 'function') {
      this._available = false;
      return false;
    }
    try {
      const source = await session.requestHitTestSource({ space });
      this._source = source ?? null;
      this._available = this._source !== null;
      return this._available;
    } catch {
      this._source = null;
      this._available = false;
      return false;
    }
  }

  /**
   * Poll the active source for the current frame. Returns the first
   * surface hit (or `null` if none) as a three.js matrix in
   * `refSpace`.
   */
  public poll(frame: XRFrame, refSpace: XRReferenceSpace): HitResult | null {
    return pollHitTest(frame, refSpace, this._source);
  }

  public get available(): boolean {
    return this._available;
  }

  /**
   * Release the hit-test source. Idempotent; safe to call multiple times.
   */
  public stop(): void {
    if (this._source) {
      this._source.cancel();
      this._source = null;
    }
    this._available = false;
  }
}

/**
 * Pure helper: extract the first hit from `frame.getHitTestResults(source)`
 * and convert its pose to a three.js `Matrix4` expressed in `refSpace`.
 * Returns `null` when no hit is reported.
 *
 * The modern Hit Test API returns results that each carry a `getPose()`
 * method, unlike the legacy `XRHitResult.hitMatrix` field. The pose is
 * already in the space passed to `getPose`, so no further transformation
 * is needed.
 *
 * Exported (not just a method) so the test suite can exercise it without
 * an XRSession.
 */
export function pollHitTest(
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  source: XRHitTestSource | null,
): HitResult | null {
  if (!source) return null;
  const results = frame.getHitTestResults(source);
  if (results.length === 0) return null;

  const first = results[0]!;
  const pose = first.getPose(refSpace);
  if (!pose) return null;

  return { transform: new THREE.Matrix4().fromArray(pose.transform.matrix) };
}
