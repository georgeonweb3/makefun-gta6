// Pedestrians for Cayo Verde: locals strolling the sidewalks who scatter when
// shots ring out or a car bears down on them.
import * as THREE from 'three';
import { resolveCollisions, clampToCity } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x9b59b6, 0xecf0f1, 0x1abc9c];
const PANTS = [0x2c3e50, 0x5d4037, 0x37474f, 0x4a235a];

export function makePedMesh(shirt, pants) {
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24),
    new THREE.MeshLambertMaterial({ color: pants }));
  legs.position.y = 0.28;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 0.86;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0xc68863 }));
  head.position.y = 1.35;
  head.castShadow = true;
  group.add(head);
  return group;
}

export class Pedestrians {
  constructor(scene, city, count = 26) {
    this.scene = scene;
    this.city = city;
    this.peds = [];
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i += 1) {
      const mesh = makePedMesh(SHIRTS[i % SHIRTS.length], PANTS[i % PANTS.length]);
      scene.add(mesh);
      const ped = {
        mesh,
        x: -170 + rnd() * 340,
        z: -170 + rnd() * 340,
        heading: rnd() * Math.PI * 2,
        speed: 1.1 + rnd() * 0.9,
        target: null,
        fleeing: false,
        fleeTime: 0,
        down: false,
        downTime: 0,
      };
      ped.target = this._pickTarget(ped, rnd);
      this.peds.push(ped);
    }
  }

  _pickTarget(ped, rnd) {
    const r = rnd || Math.random;
    const line = this.city.streetLines[Math.floor(r() * this.city.streetLines.length)];
    const side = r() < 0.5 ? -1 : 1;
    if (r() < 0.5) return { x: -170 + r() * 340, z: line + side * 7.5 };
    return { x: line + side * 7.5, z: -170 + r() * 340 };
  }

  // Something scary happened at (x,z): everyone nearby runs away from it.
  scare(x, z, radius = 22) {
    for (const ped of this.peds) {
      if (ped.down) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.fleeing = true;
        ped.fleeTime = 3 + Math.random() * 2;
        ped.target = {
          x: ped.x + (ped.x - x) / Math.max(1, d) * 30,
          z: ped.z + (ped.z - z) / Math.max(1, d) * 30,
        };
      }
    }
  }

  knockDown(ped) {
    ped.down = true;
    ped.downTime = 0;
    ped.mesh.rotation.z = Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  update(dt, colliders) {
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTime += dt;
        if (ped.downTime > 8) {
          ped.down = false;
          ped.mesh.rotation.z = 0;
          ped.mesh.position.y = 0;
          ped.target = this._pickTarget(ped);
        }
        continue;
      }
      if (ped.fleeing) {
        ped.fleeTime -= dt;
        if (ped.fleeTime <= 0) { ped.fleeing = false; ped.target = this._pickTarget(ped); }
      }
      const dx = ped.target.x - ped.x;
      const dz = ped.target.z - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) { ped.target = this._pickTarget(ped); continue; }
      const speed = ped.fleeing ? ped.speed * 3.2 : ped.speed;
      ped.heading = Math.atan2(dx / dist, dz / dist);
      const pos = {
        x: ped.x + Math.sin(ped.heading) * speed * dt,
        z: ped.z + Math.cos(ped.heading) * speed * dt,
      };
      resolveCollisions(pos, 0.5, colliders);
      ped.x = pos.x; ped.z = pos.z;
      clampToCity(ped, 198);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      // Simple walk bob.
      ped.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + ped.speed * 10)) * 0.05;
    }
  }

  // Nearest standing ped to a point, for shooting and collecting.
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }
}
