import * as THREE from 'three';
import type { Node, Edge, NavGraph } from '../scene/navGraph';

export type { Node, Edge, NavGraph };

/**
 * Outgoing neighbours of `id`. The nav graph is treated as directed; an
 * edge `{ from: 'A', to: 'B' }` is traversable A→B but not B→A. If you need
 * an undirected graph, add the reverse edge to `NavGraph.edges` or extend
 * this helper to also match `e.to === id`.
 */
export function neighbors(graph: NavGraph, id: string): string[] {
  return graph.edges.filter((e) => e.from === id).map((e) => e.to);
}

export function heuristic(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

export function getNode(graph: NavGraph, id: string): Node | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function aStar(graph: NavGraph, start: string, goal: string): string[] | null {
  if (!getNode(graph, start) || !getNode(graph, goal)) return null;
  if (start === goal) return [start];

  const goalNode = getNode(graph, goal)!;

  // Precompute outgoing edges per node so neighbor lookups inside the
  // search loop are O(deg(current)) instead of O(E) per node.
  const outgoing = new Map<string, Edge[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
  }

  const open: string[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(start, 0);
  fScore.set(start, heuristic(getNode(graph, start)!.position, goalNode.position));

  while (open.length > 0) {
    // pick the open node with lowest fScore
    let current = open[0]!;
    let bestF = fScore.get(current) ?? Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }

    if (current === goal) {
      // reconstruct path
      const path: string[] = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        path.unshift(current);
      }
      return path;
    }

    // remove current from open
    const idx = open.indexOf(current);
    open.splice(idx, 1);

    for (const edge of outgoing.get(current) ?? []) {
      const neighborId = edge.to;
      const edgeCost = edge.cost ?? 1;
      const tentativeG = (gScore.get(current) ?? Infinity) + edgeCost;
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        const neighborNode = getNode(graph, neighborId)!;
        fScore.set(neighborId, tentativeG + heuristic(neighborNode.position, goalNode.position));
        if (!open.includes(neighborId)) open.push(neighborId);
      }
    }
  }

  return null;
}
