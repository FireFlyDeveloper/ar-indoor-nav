import { describe, it, expect } from 'vitest';
import { pollHitTest } from './hitTestSession';
import * as THREE from 'three';

/**
 * The hit-test pure helper is a thin wrapper around the raw WebXR API.
 * We test it with minimal mocks: a fake `XRFrame.getHitTestResults` and
 * a fake pose. The goal is to verify the contract (return first hit, or
 * null on no-hit / no-source), not the WebXR API itself.
 */
function makeFrameWithResults(
  results: ReadonlyArray<{ getPose: (space: XRReferenceSpace) => XRPose | undefined }>,
): XRFrame {
  return {
    getHitTestResults: () => results as unknown as XRHitTestResult[],
  } as unknown as XRFrame;
}

function makePose(matrix: THREE.Matrix4): XRPose {
  return {
    transform: {
      matrix: matrix.elements,
      inverse: { matrix: new Float32Array(16) },
      position: { x: 0, y: 0, z: 0, w: 1 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    } as unknown as XRRigidTransform,
  } as unknown as XRPose;
}

describe('pollHitTest', () => {
  it('returns null when source is null', () => {
    const frame = makeFrameWithResults([{ getPose: () => makePose(new THREE.Matrix4()) }]);
    expect(pollHitTest(frame, {} as XRReferenceSpace, null)).toBeNull();
  });

  it('returns null when there are no results', () => {
    const frame = makeFrameWithResults([]);
    const source = {} as XRHitTestSource;
    expect(pollHitTest(frame, {} as XRReferenceSpace, source)).toBeNull();
  });

  it('returns null when first result has no pose', () => {
    const frame = makeFrameWithResults([{ getPose: () => undefined }]);
    const source = {} as XRHitTestSource;
    expect(pollHitTest(frame, {} as XRReferenceSpace, source)).toBeNull();
  });

  it('returns the first hit transform', () => {
    const expected = new THREE.Matrix4().compose(
      new THREE.Vector3(1.5, 2.5, -3.5),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.3, 0.4)),
      new THREE.Vector3(1, 1, 1),
    );
    const frame = makeFrameWithResults([{ getPose: () => makePose(expected) }]);
    const source = {} as XRHitTestSource;

    const result = pollHitTest(frame, {} as XRReferenceSpace, source);
    expect(result).not.toBeNull();
    const got = result!.transform.elements;
    const want = expected.elements;
    for (let i = 0; i < 16; i++) {
      expect(got[i]).toBeCloseTo(want[i]!, 6);
    }
  });

  it('returns the FIRST hit, not a later one', () => {
    const first = new THREE.Matrix4().makeTranslation(1, 0, 0);
    const second = new THREE.Matrix4().makeTranslation(2, 0, 0);
    const frame = makeFrameWithResults([
      { getPose: () => makePose(first) },
      { getPose: () => makePose(second) },
    ]);
    const source = {} as XRHitTestSource;

    const result = pollHitTest(frame, {} as XRReferenceSpace, source);
    expect(result!.transform.elements[12]).toBeCloseTo(1, 6);
  });
});
