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

  it('prefers cheaper path when edges have explicit costs', () => {
    // Direct A→B is cost 10, but A→C→B is cost 1+1=2. A* must route via C.
    const g: NavGraph = {
      nodes: [
        { id: 'A', position: new THREE.Vector3(0, 0, 0) },
        { id: 'B', position: new THREE.Vector3(0, 0, -10) },
        { id: 'C', position: new THREE.Vector3(5, 0, -5) },
      ],
      edges: [
        { from: 'A', to: 'B', cost: 10 },
        { from: 'A', to: 'C', cost: 1 },
        { from: 'C', to: 'B', cost: 1 },
      ],
    };
    expect(aStar(g, 'A', 'B')).toEqual(['A', 'C', 'B']);
  });
});
