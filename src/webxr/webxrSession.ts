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
  private _frameHandle: number | null = null;
  private _onFrameCallback: FrameCallback | null = null;

  /** Requests an immersive-ar session and starts the frame loop, invoking `onFrame` each XR frame. */
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

    try {
      // `requestReferenceSpace` returns `XRReferenceSpace | XRBoundedReferenceSpace`.
      // 'local-floor' never returns XRBoundedReferenceSpace (spec), cast is sound.
      const refSpace = (await session.requestReferenceSpace(
        'local-floor'
      )) as XRReferenceSpace;

      this._xrSession = session;
      this._referenceSpace = refSpace;
      this._onFrameCallback = onFrame;

      // rAF is one-shot; _onFrame re-registers itself to keep the loop running.
      this._frameHandle = session.requestAnimationFrame(this._onFrame);
    } catch (err) {
      await session.end();
      this._xrSession = null;
      this._referenceSpace = null;
      this._frameHandle = null;
      this._onFrameCallback = null;
      throw err;
    }
  }

  // rAF is one-shot — this method re-registers itself each tick to keep the loop alive.
  private _onFrame = (_time: number, frame: XRFrame): void => {
    const cb = this._onFrameCallback;
    const refSpace = this._referenceSpace;
    const session = this._xrSession;
    if (cb === null || refSpace === null || session === null) {
      return;
    }
    cb(frame, refSpace);
    this._frameHandle = session.requestAnimationFrame(this._onFrame);
  };

  /** Cancels the frame loop and ends the underlying XRSession, releasing XR resources. */
  async end(): Promise<void> {
    const session = this._xrSession;
    if (!session) return;
    if (this._frameHandle !== null) {
      session.cancelAnimationFrame(this._frameHandle);
    }
    this._xrSession = null;
    this._referenceSpace = null;
    this._frameHandle = null;
    this._onFrameCallback = null;
    await session.end();
  }

  get xrSession(): XRSession | null {
    return this._xrSession;
  }

  get referenceSpace(): XRReferenceSpace | null {
    return this._referenceSpace;
  }
}
