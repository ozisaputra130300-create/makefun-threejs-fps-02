// Emberline's map: the Kestrel Works foundry yard. Three lanes run north from the
// attacker yard to two bomb sites — the Furnace (A, west, ember orange) and the
// Silos (B, east, coolant cyan) — with a conveyor hall and a climbable gantry
// between them. Every solid is a box: a collider for movement and a surface a
// bullet stops on. Waypoints form the graph the bots navigate on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints the bots walk. Edges are straight, walkable ground lines between them.
const WAYPOINTS = [
  { id: 'spawn', x: 0, z: 12.5 },
  { id: 'w1', x: -13, z: 8 },
  { id: 'w2', x: -13, z: 0 },
  { id: 'w3', x: -13, z: -6 },
  { id: 'a1', x: -11, z: -10 },
  { id: 'a2', x: -7.5, z: -10.5 },
  { id: 'm1', x: 0, z: 8 },
  { id: 'm2', x: 0, z: 0 },
  { id: 'm3', x: 0, z: -6 },
  { id: 'e1', x: 13, z: 8 },
  { id: 'e2', x: 13, z: 0 },
  { id: 'e3', x: 13, z: -6 },
  { id: 'b1', x: 11, z: -10 },
  { id: 'b2', x: 7.5, z: -10.5 },
  { id: 'c1', x: -6, z: 4 },
  { id: 'c2', x: 6, z: 4 },
  { id: 'c3', x: -6, z: -3.5 },
  { id: 'c4', x: 6, z: -3.5 },
  { id: 'midW', x: -9, z: -2 },
  { id: 'midE', x: 9, z: -2 },
];
const EDGES = [
  ['spawn', 'w1'], ['spawn', 'm1'], ['spawn', 'e1'],
  ['w1', 'w2'], ['w2', 'w3'], ['w3', 'a1'], ['a1', 'a2'], ['a2', 'm3'],
  ['m1', 'm2'], ['m2', 'm3'], ['m3', 'b2'], ['b2', 'b1'], ['b1', 'e3'],
  ['e1', 'e2'], ['e2', 'e3'], ['e3', 'b1'],
  ['m1', 'c1'], ['m1', 'c2'], ['c1', 'c3'], ['c2', 'c4'],
  ['w2', 'c1'], ['e2', 'c2'], ['c3', 'm2'], ['c4', 'm2'],
  ['w3', 'c3'], ['e3', 'c4'], ['w2', 'midW'], ['e2', 'midE'],
  ['midW', 'c3'], ['midE', 'c4'], ['midW', 'm3'], ['midE', 'm3'],
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const mat = {};
  for (const name of ['floor', 'steel', 'iron', 'rust']) {
    mat[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'floor' ? 0.95 : 0.85,
      metalness: name === 'floor' ? 0.05 : 0.25,
    });
  }
  mat.ember = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.ember), roughness: 0.6,
    emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 0.9,
  });
  mat.cyan = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.cyan), roughness: 0.6,
    emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 0.7,
  });
  mat.glowA = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a1408'), roughness: 0.9,
    emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 1.6,
  });
  mat.glowB = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#081a20'), roughness: 0.9,
    emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 1.2,
  });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and perimeter: 34 x 30 m yard, 5 m walls, open to the night sky.
  box(34.4, 0.4, 30.4, 0, -0.2, 0, 'floor');
  box(0.4, 5, 30.4, -17.2, 2.5, 0, 'steel');
  box(0.4, 5, 30.4, 17.2, 2.5, 0, 'steel');
  box(34.4, 5, 0.4, 0, 2.5, -15.2, 'steel');
  box(34.4, 5, 0.4, 0, 2.5, 15.2, 'steel');

  // Divider wall at z = -2, with the west and east lanes running around its ends
  // and a mid gap the conveyor hall opens through.
  box(10.5, 4, 0.6, -6.75, 2, -2, 'steel');
  box(10.5, 4, 0.6, 6.75, 2, -2, 'steel');
  box(1.2, 1.2, 0.6, -1.9, 3.4, -2, 'iron');
  box(1.2, 1.2, 0.6, 1.9, 3.4, -2, 'iron');

  // Site A — the Furnace: a rusted furnace block with a glowing mouth, flanked
  // by crates. Plant zone is the open floor in front of it.
  box(4.5, 3.4, 1.6, -11, 1.7, -13.6, 'rust');
  box(2.2, 1.6, 0.5, -11, 0.9, -12.7, 'glowA');
  box(1.2, 2.2, 1.2, -14.2, 1.1, -12.4, 'iron');
  box(1.2, 1.2, 1.2, -8.2, 0.6, -12.8, 'iron');
  box(2.4, 1.1, 1.2, -7.2, 0.55, -7.6, 'iron');
  box(1.2, 1.1, 2.4, -14.6, 0.55, -8.4, 'iron');

  // Site B — the Silos: two tall cylinders with coolant trim and crate cover.
  for (const x of [9.4, 13.2]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6.4, 20), mat.steel);
    silo.position.set(x, 3.2, -13.4);
    silo.castShadow = true;
    silo.receiveShadow = true;
    group.add(silo);
    colliders.push(new THREE.Box3().setFromObject(silo));
    shootables.push(silo);
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.56, 0.25, 20), mat.cyan);
    trim.position.set(x, 5.2, -13.4);
    group.add(trim);
  }
  box(2.4, 1.1, 1.2, 7.4, 0.55, -7.6, 'iron');
  box(1.2, 1.1, 2.4, 14.6, 0.55, -8.4, 'iron');
  box(1.2, 1.2, 1.2, 11.4, 0.6, -7.4, 'iron');

  // Conveyor hall: a gantry walkway across mid. Its steps rise a full metre
  // each and there is no jump, so the walkway is an overlook, not a route —
  // it breaks sightlines and gives the hall its height.
  box(12, 0.3, 2, 0, 2.85, 0, 'iron');
  box(0.3, 3, 2, -6, 1.5, 0, 'steel');
  box(0.3, 3, 2, 6, 1.5, 0, 'steel');
  for (let i = 0; i < 3; i += 1) {
    box(0.9, 1 + i, 2, -6.75 - i * 0.9, (1 + i) / 2, 0, 'iron');
    box(0.9, 1 + i, 2, 6.75 + i * 0.9, (1 + i) / 2, 0, 'iron');
  }
  // Conveyor belt along the hall floor, low cover — split at the middle so
  // the lane through the divider-wall gap stays open; the two ends still
  // read as one belt and still give cover on both flanks.
  box(3.2, 0.5, 1.4, -3.4, 0.25, 3.4, 'rust');
  box(3.2, 0.5, 1.4, 3.4, 0.25, 3.4, 'rust');

  // Lane cover: pillars and crates to break sightlines.
  box(1.2, 3.4, 1.2, -13, 1.7, 4, 'iron');
  box(1.2, 3.4, 1.2, 13, 1.7, 4, 'iron');
  box(2.4, 1.1, 1.2, -9.5, 0.55, 8.5, 'iron');
  box(2.4, 1.1, 1.2, 9.5, 0.55, 8.5, 'iron');
  box(1.2, 1.1, 1.2, -4.5, 0.55, 11.5, 'iron');
  box(1.2, 1.1, 1.2, 4.5, 0.55, 11.5, 'iron');
  box(1.2, 2.6, 1.2, -6, 1.3, -6.5, 'iron');
  box(1.2, 2.6, 1.2, 6, 1.3, -6.5, 'iron');
  // Site markers: glowing floor plates that read as A and B at a glance.
  const plateA = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.06, 2.2), mat.ember,
  );
  plateA.position.set(-11, 0.03, -10);
  group.add(plateA);
  const plateB = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.06, 2.2), mat.cyan,
  );
  plateB.position.set(11, 0.03, -10);
  group.add(plateB);

  // Light: cold moonlight from above, warm furnace glow at A, cool glow at B.
  const ambient = new THREE.AmbientLight(new THREE.Color('#565e6a'), 0.55);
  scene.add(ambient);
  const sky = new THREE.HemisphereLight(
    new THREE.Color('#5a6a86'), new THREE.Color('#33363d'), 1.5,
  );
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#dfe8ff'), 2.6);
  moon.position.set(10, 18, 8);
  moon.target.position.set(0, 0, -2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -20;
  moon.shadow.camera.right = 20;
  moon.shadow.camera.top = 20;
  moon.shadow.camera.bottom = -20;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const glowA = new THREE.PointLight(new THREE.Color(PALETTE.ember), 45, 18, 1.6);
  glowA.position.set(-11, 2.2, -12);
  scene.add(glowA);
  const glowB = new THREE.PointLight(new THREE.Color(PALETTE.cyan), 34, 18, 1.6);
  glowB.position.set(11, 2.2, -12);
  scene.add(glowB);
  const yard = new THREE.PointLight(new THREE.Color('#ffd9a0'), 26, 20, 1.6);
  yard.position.set(0, 5, 10);
  scene.add(yard);
  const mid = new THREE.PointLight(new THREE.Color('#cfe0ff'), 20, 18, 1.6);
  mid.position.set(0, 5, -6);
  scene.add(mid);

  const sites = {
    A: {
      id: 'A', name: 'Furnace', color: PALETTE.ember,
      zone: new THREE.Box3(
        new THREE.Vector3(-14, 0, -13), new THREE.Vector3(-8, 3, -7),
      ),
      plant: new THREE.Vector3(-11, 0, -10),
    },
    B: {
      id: 'B', name: 'Silos', color: PALETTE.cyan,
      zone: new THREE.Box3(
        new THREE.Vector3(8, 0, -13), new THREE.Vector3(14, 3, -7),
      ),
      plant: new THREE.Vector3(11, 0, -10),
    },
  };

  const nodes = new Map(WAYPOINTS.map((w) => [w.id, { ...w }]));
  const adjacency = new Map(WAYPOINTS.map((w) => [w.id, []]));
  for (const [a, b] of EDGES) {
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }

  function nearestNode(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const node of nodes.values()) {
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    return best;
  }

  // A* over the waypoint graph; returns an array of nodes from start to goal.
  function findPath(fromId, toId) {
    if (fromId === toId) return [nodes.get(toId)];
    const open = [{ id: fromId, cost: 0 }];
    const came = new Map();
    const spent = new Map([[fromId, 0]]);
    const goal = nodes.get(toId);
    function heuristic(id) {
      const n = nodes.get(id);
      return Math.hypot(n.x - goal.x, n.z - goal.z);
    }
    while (open.length > 0) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (open[i].cost + heuristic(open[i].id) < open[bestIndex].cost + heuristic(open[bestIndex].id)) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      if (current.id === toId) {
        const path = [nodes.get(toId)];
        let step = toId;
        while (came.has(step)) {
          step = came.get(step);
          path.unshift(nodes.get(step));
        }
        return path;
      }
      for (const next of adjacency.get(current.id)) {
        const a = nodes.get(current.id);
        const b = nodes.get(next);
        const stepCost = Math.hypot(a.x - b.x, a.z - b.z);
        const total = spent.get(current.id) + stepCost;
        if (!spent.has(next) || total < spent.get(next)) {
          spent.set(next, total);
          came.set(next, current.id);
          open.push({ id: next, cost: total });
        }
      }
    }
    return [nodes.get(toId)];
  }

  return {
    colliders,
    shootables,
    sites,
    nodes,
    nearestNode,
    findPath,
    playerSpawn: { x: 0, z: 12.5, yaw: 0 },
    botSpawns: [
      { site: 'A', x: -11, z: -11.5 },
      { site: 'A', x: -7.5, z: -9.5 },
      { site: 'B', x: 11, z: -11.5 },
      { site: 'B', x: 7.5, z: -9.5 },
    ],
  };
}
