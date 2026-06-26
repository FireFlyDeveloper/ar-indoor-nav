import { describe, it, expect } from 'vitest';
import { computeOriginTransform, applyOriginTransform } from './originTransform';
import * as THREE from 'three';

describe('originTransform', () => {
  it('maps marker pose to identity', () => {
    // Build a marker pose with non-trivial translation and rotation
    const marker = new THREE.Matrix4().compose(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, -0.5)),
      new THREE.Vector3(1, 1, 1),
    );

    const T = computeOriginTransform(marker);
    const result = applyOriginTransform(marker, T);

    const pos = new THREE.Vector3();
    result.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());

    expect(pos.x).toBeCloseTo(0, 5);
    expect(pos.y).toBeCloseTo(0, 5);
    expect(pos.z).toBeCloseTo(0, 5);
  });

  it('identity in → identity out', () => {
    const identity = new THREE.Matrix4();
    const T = computeOriginTransform(identity);
    const result = applyOriginTransform(identity, T);

    const pos = new THREE.Vector3();
    result.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());

    expect(pos.x).toBeCloseTo(0, 5);
    expect(pos.y).toBeCloseTo(0, 5);
    expect(pos.z).toBeCloseTo(0, 5);
  });

  it('chained apply is associative with T', () => {
    const m1 = new THREE.Matrix4().compose(
      new THREE.Vector3(0.5, -1.2, 2.0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.4, 0.9)),
      new THREE.Vector3(1, 1, 1),
    );
    const m2 = new THREE.Matrix4().compose(
      new THREE.Vector3(-0.3, 1.7, 0.8),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0.2, 0.3)),
      new THREE.Vector3(1, 1, 1),
    );

    const T = computeOriginTransform(m1);
    const result = applyOriginTransform(m2, T);

    // T = m1^-1, applyOriginTransform(m2, T) = T * m2 = m1^-1 * m2
    const expected = new THREE.Matrix4().multiplyMatrices(m1.clone().invert(), m2);

    const rPos = new THREE.Vector3();
    const rQuat = new THREE.Quaternion();
    const rScale = new THREE.Vector3();
    result.decompose(rPos, rQuat, rScale);

    const ePos = new THREE.Vector3();
    const eQuat = new THREE.Quaternion();
    const eScale = new THREE.Vector3();
    expected.decompose(ePos, eQuat, eScale);

    expect(rPos.x).toBeCloseTo(ePos.x, 5);
    expect(rPos.y).toBeCloseTo(ePos.y, 5);
    expect(rPos.z).toBeCloseTo(ePos.z, 5);
    expect(rQuat.x).toBeCloseTo(eQuat.x, 5);
    expect(rQuat.y).toBeCloseTo(eQuat.y, 5);
    expect(rQuat.z).toBeCloseTo(eQuat.z, 5);
    expect(rQuat.w).toBeCloseTo(eQuat.w, 5);
  });
});
