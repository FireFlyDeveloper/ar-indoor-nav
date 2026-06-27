/// <reference types="webxr" />

/**
 * WebXR session wrapper — lifecycle only.
 *
 * The WebXR image-tracking module spec is still a draft, so on the
 * `XRFrame` interface we locally declare the `getImageTrackingResults()`
 * member so the raw navigator.xr API can be consumed without `any`.
 *
 * Spec: https://immersive-web.github.io/webxr-image-tracking/
 *
 * The frame loop is **not** driven from this class. Callers pass the
 * returned `XRSession` to `renderer.xr.setSession(session)` and register
 * their animate callback via `renderer.setAnimationLoop(animate)`.
 */
declare global {
  interface XRImageTrackingResult {
    readonly index: number;
    readonly trackingState: 'tracked' | 'emulated' | 'paused';
    readonly measuredWidthInMeters?: number;
    readonly imageSpace: XRSpace;
  }

  interface XRFrame {
    getImageTrackingResults?(): XRImageTrackingResult[];
  }
}

/**
 * Per-frame callback signature for the caller-supplied animate closure.
 * Matches the `(timestamp, frame)` shape of `renderer.setAnimationLoop` minus
 * the timestamp (not needed by the project).
 */
export type FrameCallback = (frame: XRFrame, referenceSpace: XRReferenceSpace) => void;

export class WebXRSession {
  private _xrSession: XRSession | null = null;
  private _referenceSpace: XRReferenceSpace | null = null;

  /**
   * Requests an immersive-ar session and acquires a `local-floor` reference
   * space. The session and reference space are stored on the instance and
   * exposed via the `xrSession` / `referenceSpace` getters. Does **not**
   * start a frame loop — the caller is expected to pass the session to
   * `renderer.xr.setSession(session)` and register the per-frame callback
   * via `renderer.setAnimationLoop(animate)`.
   */
  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      throw new Error('WebXR is not available in this browser.');
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error('Immersive AR sessions are not supported on this device.');
    }

    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['image-tracking', 'anchors', 'hit-test'],
    });

    try {
      // `requestReferenceSpace` returns `XRReferenceSpace | XRBoundedReferenceSpace`.
      // 'local-floor' never returns XRBoundedReferenceSpace (spec), cast is sound.
      const refSpace = (await session.requestReferenceSpace('local-floor')) as XRReferenceSpace;

      this._xrSession = session;
      this._referenceSpace = refSpace;
    } catch (err) {
      await session.end();
      this._xrSession = null;
      this._referenceSpace = null;
      throw err;
    }
  }

  /** Ends the underlying XRSession, releasing XR resources. */
  async end(): Promise<void> {
    const session = this._xrSession;
    if (!session) return;
    this._xrSession = null;
    this._referenceSpace = null;
    await session.end();
  }

  get xrSession(): XRSession | null {
    return this._xrSession;
  }

  get referenceSpace(): XRReferenceSpace | null {
    return this._referenceSpace;
  }
}
