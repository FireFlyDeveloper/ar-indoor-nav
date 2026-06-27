import * as THREE from 'three';
import { buildNavGraph, graphToLine, type Node } from './navGraph';
import { makeArrow, makeStartMarker, makeEndMarker } from './arrows';

/**
 * The assembled navigation scene: a root group containing the start/end
 * markers, intermediate arrow meshes, the line representing the nav graph
 * path, and the lighting rig. `start` / `end` are exposed so callers can
 * reposition them; `arrows` are the intermediate (non-start, non-end) waypoints.
 *
 * `placed` is a container group the bootstrap can add hit-test-placed
 * meshes to (arrows, path indicators, destination markers) without
 * disturbing the rest of the scene graph.
 */
export type NavScene = {
  root: THREE.Group;
  start: THREE.Mesh;
  arrows: THREE.Mesh[];
  path: THREE.Line;
  nodes: Node[];
  placed: THREE.Group;
};

export function createNavScene(): NavScene {
  const root = new THREE.Group();
  root.name = 'navScene';

  const graph = buildNavGraph();

  const path = graphToLine(graph);
  root.add(path);

  const start = makeStartMarker(graph.nodes[0]!.position);
  root.add(start);

  const end = makeEndMarker(graph.nodes[graph.nodes.length - 1]!.position);
  root.add(end);

  const arrows = graph.nodes.slice(1, -1).map((n) => makeArrow(n.position));
  arrows.forEach((a) => root.add(a));

  // Container for hit-test-placed objects. Bootstrap can add meshes
  // here when the user taps to place on a real surface; the rest of
  // the nav graph remains a fixed authoring artifact.
  const placed = new THREE.Group();
  placed.name = 'placed';
  root.add(placed);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
  root.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2, 4, 2);
  root.add(dir);

  return { root, start, arrows, path, nodes: graph.nodes, placed };
}
