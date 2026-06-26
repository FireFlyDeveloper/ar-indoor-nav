import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { aStar } from './pathfinding';
import { buildNavGraph, type NavGraph } from '../scene/navGraph';

describe('aStar', () => {
  it('finds straight path A→B', () => {
    const g = buildNavGraph();
    expect(aStar(g, 'A', 'B')).toEqual(['A', 'B']);
  });

  it('finds longer path A→D', () => {
    const g = buildNavGraph();
    expect(aStar(g, 'A', 'D')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns null when unreachable', () => {
    const g2: NavGraph = {
      nodes: [{ id: 'X', position: new THREE.Vector3(0, 0, 0) }],
      edges: [],
    };
    expect(aStar(g2, 'X', 'Y')).toBeNull();
  });

  it('returns a single-node path when start === goal', () => {
    const g = buildNavGraph();
    expect(aStar(g, 'A', 'A')).toEqual(['A']);
  });

  it('returns null when start is unknown', () => {
    const g = buildNavGraph();
    expect(aStar(g, 'Z', 'A')).toBeNull();
  });
});
