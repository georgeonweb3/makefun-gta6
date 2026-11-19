// Pedestrians: box-built locals who stroll the sidewalks, chat in place,
// flee from gunfire and speeding cars, and remember a shove.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { range, pick } from './rng.js';
import { collidesAt, clampToCity } from './city.js';

const SKINS = [0x8a5a3b, 0xd9a986, 0x6b4226, 0xe8c39a, 0x4a2f1d];
const TOPS = [0xc0392b, 0x2e6fb0, 0xe8e3d8, 0x7a4a9e, 0x3d9970, 0xd98a2b, 0xe87a9e, 0x5f8fa8];
const PANTS = [0x2c343c, 0x5a4632, 0x3a3f45, 0x7a6a58];

function makePedMesh(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: pick(rng, SKINS), roughness: 0.8 });
  const top = new THREE.MeshStandardMaterial({ color: pick(rng, TOPS), roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(rng, PANTS), roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), top);
  torso.position.y = 1.25; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
  head.position.y = 1.85; head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38),
    new THREE.MeshStandardMaterial({ color: pick(rng, [0x14100c, 0x4a2f1d, 0x8a8a8a, 0x6b4226]), roughness: 0.95 }));
  hair.position.y = 2.06;
  g.add(hair);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.68, 0.19), top);
  armL.position.set(-0.41, 1.25, 0);
  const armR = armL.clone(); armR.position.x = 0.41;
  g.add(armL); g.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pants);
  legL.position.set(-0.16, 0.42, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  g.add(legL); g.add(legR);
  g.userData = { armL, armR, legL, legR };
  return g;
}

export class Pedestrians {
  constructor(scene, rng, colliders, lines, half) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.lines = lines; this.half = half;
    this.peds = [];
    for (let i = 0; i < CONFIG.pedestrians.count; i++) this.spawn(true);
  }
  spawn(anywhere) {
    const rng = this.rng;
    const road = pick(rng, this.lines);
    const along = range(rng, -this.half + 10, this.half - 10);
    const side = rng() < 0.5 ? 1 : -1;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : road + 7.6 * side;
    const z = horizontal ? road + 7.6 * side : along;
    const mesh = makePedMesh(rng);
    this.scene.add(mesh);
    const ped = {
      mesh, pos: new THREE.Vector3(x, 0, z),
      heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, 1.2, 2.1),
      phase: range(rng, 0, 6),
      state: 'walk', // walk | flee | down
      fleeTimer: 0, downTimer: 0, retarget: range(rng, 4, 12),
      horizontal, road, side,
    };
    mesh.position.copy(ped.pos);
    this.peds.push(ped);
    return ped;
  }
  update(dt, playerPos, playerSpeed, gunshotAt, cars) {
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        ped.mesh.rotation.x = Math.max(-Math.PI / 2, ped.mesh.rotation.x - dt * 4);
        if (ped.downTimer <= 0) {
          ped.state = 'walk';
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0;
          this.respawnFar(ped);
        }
        continue;
      }
      // fear: gunfire, a speeding car, or the player sprinting at them
      let threat = null;
      if (gunshotAt && ped.pos.distanceTo(gunshotAt) < 26) threat = gunshotAt;
      if (!threat && playerPos) {
        const d = ped.pos.distanceTo(playerPos);
        if (d < 3 && playerSpeed > 8) threat = playerPos;
      }
      if (!threat) {
        for (const c of cars) {
          if (c.dead) continue;
          const d = ped.pos.distanceTo(c.pos);
          if (d < 7 && Math.abs(c.speed) > 6) { threat = c.pos; break; }
        }
      }
      if (threat) { ped.state = 'flee'; ped.fleeTimer = 3.5; ped.fleeFrom = threat.clone(); }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        const awayFrom = ped.fleeFrom || playerPos || ped.pos;
        const away = ped.pos.clone().sub(awayFrom).setY(0);
        if (away.lengthSq() < 0.01) away.set(1, 0, 0);
        away.normalize();
        ped.heading = Math.atan2(-away.x, -away.z);
        this.step(ped, CONFIG.pedestrians.fleeSpeed, dt);
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        ped.retarget -= dt;
        if (ped.retarget <= 0) {
          ped.retarget = range(this.rng, 5, 14);
          ped.heading = Math.atan2(-Math.sin(ped.heading + range(this.rng, -1.2, 1.2)), -Math.cos(ped.heading + range(this.rng, -1.2, 1.2)));
          // keep walking roughly along the sidewalk grid
          ped.heading = Math.round(ped.heading / (Math.PI / 2)) * (Math.PI / 2) + range(this.rng, -0.2, 0.2);
        }
        this.step(ped, ped.speed, dt);
      }
      ped.phase += dt * (ped.state === 'flee' ? 11 : 5);
      const s = Math.sin(ped.phase) * 0.55;
      const u = ped.mesh.userData;
      u.legL.rotation.x = s; u.legR.rotation.x = -s;
      u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7;
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = ped.heading;
    }
  }
  step(ped, speed, dt) {
    const nx = ped.pos.x - Math.sin(ped.heading) * speed * dt;
    const nz = ped.pos.z - Math.cos(ped.heading) * speed * dt;
    if (!collidesAt(this.colliders, nx, nz, 0.5)) {
      const cl = clampToCity(nx, nz, this.half);
      ped.pos.x = cl.x; ped.pos.z = cl.z;
    } else {
      ped.heading += Math.PI / 2; // turn away from the wall
    }
  }
  respawnFar(ped) {
    const road = pick(this.rng, this.lines);
    const along = range(this.rng, -this.half + 10, this.half - 10);
    ped.pos.set(along, 0, road + 7.6);
    ped.mesh.position.copy(ped.pos);
  }
  knockDown(ped) {
    if (ped.state === 'down') return false;
    ped.state = 'down';
    ped.downTimer = 9;
    return true;
  }
  nearestTo(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = p.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
