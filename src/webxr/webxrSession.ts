/// <reference types="webxr" />

/**
 * WebXR session wrapper.
 *
 * The WebXR image-tracking module spec is still a draft, so on the
 * `XRFrame` interface we locally declare the `getImageTrackingResults()`
 * member so the raw navigator.xr API can be consumed without `any`.
 *
 * Spec: https://immersive-web.github.io/webxr-image-tracking/
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

export type FrameCallback = (
  frame: XRFrame,
  referenceSpace: XRReferenceSpace
) => void;

export class WebXRSession {
  private _xrSession: XRSession | null = null;
  private _referenceSpace: XRReferenceSpace | null = null;

  async start(onFrame: FrameCallback): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      throw new Error('WebXR is not available in this browser.');
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error('Immersive AR sessions are not supported on this device.');
    }

    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['image-tracking', 'anchors', 'hit-test']
    });

    // `requestReferenceSpace` returns `XRReferenceSpace | XRBoundedReferenceSpace`;
    // we only need the base XRReferenceSpace API so a cast keeps the surface
    // narrow at the call site.
    const refSpace = (await session.requestReferenceSpace(
      'local-floor'
    )) as XRReferenceSpace;

    this._xrSession = session;
    this._referenceSpace = refSpace;

    session.requestAnimationFrame((_time, frame) => onFrame(frame, refSpace));
  }

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
