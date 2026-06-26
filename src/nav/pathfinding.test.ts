import { describe, it, expect } from 'vitest';
import { aStar } from './pathfinding';
import { buildNavGraph } from '../scene/navGraph';

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
    const g2 = {
      nodes: [{ id: 'X', position: { x: 0, y: 0, z: 0 } as any }],
      edges: [],
    };
    expect(aStar(g2 as any, 'X', 'Y')).toBeNull();
  });
});
