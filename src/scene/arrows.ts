import * as THREE from 'three';

export function makeArrow(position: THREE.Vector3, color = 0xff3aa9): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(0.15, 0.4, 16);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function makeStartMarker(position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.12, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  return mesh;
}

export function makeEndMarker(position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.12, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    emissive: 0xffff00,
    emissiveIntensity: 0.8,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  return mesh;
}

/**
 * A bright, easily-visible mesh used to mark a point placed on a real
 * surface via WebXR hit-test. Bigger than the in-graph arrows so the
 * user can confirm placement at a glance, and uses a distinct color so
 * it is not confused with the authored nav path.
 */
export function makePlacedMarker(position: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.18, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00ff66,
    emissive: 0x00ff66,
    emissiveIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.name = 'placedMarker';
  return mesh;
}
