import * as THREE from 'three';

export type Node = { id: string; position: THREE.Vector3 };
export type Edge = { from: string; to: string; cost?: number };
export type NavGraph = { nodes: Node[]; edges: Edge[] };

export function buildNavGraph(): NavGraph {
  return {
    nodes: [
      { id: 'A', position: new THREE.Vector3(0, 0, 0) },
      { id: 'B', position: new THREE.Vector3(0, 0, -3) },
      { id: 'C', position: new THREE.Vector3(2, 0, -5) },
      { id: 'D', position: new THREE.Vector3(2, 0, -8) },
    ],
    edges: [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
    ],
  };
}

export function graphToLine(graph: NavGraph): THREE.Line {
  const positions: number[] = [];
  for (const edge of graph.edges) {
    const from = graph.nodes.find((n) => n.id === edge.from);
    const to = graph.nodes.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    positions.push(from.position.x, from.position.y, from.position.z);
    positions.push(to.position.x, to.position.y, to.position.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
  return new THREE.Line(geometry, material);
}
