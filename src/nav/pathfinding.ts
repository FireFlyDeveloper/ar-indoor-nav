import * as THREE from 'three';

export type NavNode = { id: string; position: THREE.Vector3 };
export type NavEdge = { from: string; to: string };
export type NavGraph = { nodes: NavNode[]; edges: NavEdge[] };

export function neighbors(graph: NavGraph, id: string): string[] {
  return graph.edges.filter((e) => e.from === id).map((e) => e.to);
}

export function heuristic(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

export function getNode(graph: NavGraph, id: string): NavNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function aStar(graph: NavGraph, start: string, goal: string): string[] | null {
  if (!getNode(graph, start) || !getNode(graph, goal)) return null;

  const open: string[] = [start];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(start, 0);
  fScore.set(start, heuristic(getNode(graph, start)!.position, getNode(graph, goal)!.position));

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

    for (const neighborId of neighbors(graph, current)) {
      const tentativeG = (gScore.get(current) ?? Infinity) + 1; // edge cost = 1
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        const neighborNode = getNode(graph, neighborId)!;
        const goalNode = getNode(graph, goal)!;
        fScore.set(neighborId, tentativeG + heuristic(neighborNode.position, goalNode.position));
        if (!open.includes(neighborId)) open.push(neighborId);
      }
    }
  }

  return null;
}
