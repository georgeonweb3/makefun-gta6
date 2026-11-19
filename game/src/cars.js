// Cars: a box-built car factory (sedan, sports, taxi, police, van), arcade
// driving physics for the player's car, and traffic AI that loops the road grid.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { range, pick } from './rng.js';
import { collidesAt, clampToCity } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb0, 0xe8e3d8, 0x2c2c34, 0xd98a2b, 0x7a4a9e, 0x3d9970, 0xb8bec6];
const CAR_NAMES = ['Sunrise GT', 'Coral Sedan', 'Bay Cruiser', 'Palm Runner', 'Dune Coupe'];

export function makeCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.1, metalness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, kind === 'van' ? 5.2 : 4.4), bodyMat);
  body.position.y = 0.62; body.castShadow = true;
  g.add(body);
  const cabinH = kind === 'van' ? 0.85 : 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, cabinH, kind === 'sports' ? 1.9 : 2.3), glassMat);
  cabin.position.set(0, 1.15, kind === 'sports' ? 0.25 : -0.15);
  cabin.castShadow = true;
  g.add(cabin);
  if (kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), darkMat);
    spoiler.position.set(0, 1.15, -2.1); g.add(spoiler);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, 0.36, z);
    w.castShadow = true;
    g.add(w);
  }
  // headlights + taillights
  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(lightGeo, headMat);
    h.position.set(x, 0.72, kind === 'van' ? 2.62 : 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(lightGeo, tailMat);
    t.position.set(x, 0.72, kind === 'van' ? -2.62 : -2.22);
    g.add(t);
  }
  g.userData.kind = kind;
  return g;
}

export function makePoliceMesh() {
  const g = makeCarMesh(0xf2f2f2, 'sedan');
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.92, 0.2, 4.42),
    new THREE.MeshStandardMaterial({ color: 0x1d3a8a, roughness: 0.5 }),
  );
  stripe.position.y = 0.95;
  g.add(stripe);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  bar.position.set(-0.28, 1.5, -0.15);
  g.add(bar);
  const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
  bar2.position.set(0.28, 1.5, -0.15);
  g.add(bar2);
  g.userData.kind = 'police';
  return g;
}

// A drivable car: position, heading, speed, arcade physics, damage.
export class Car {
  constructor(mesh, x, z, heading, opts = {}) {
    this.mesh = mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = CONFIG.car.maxHealth;
    this.name = opts.name || pick(Math.random, CAR_NAMES);
    this.color = opts.color ?? 0xc0392b;
    this.isPolice = !!opts.isPolice;
    this.isMission = !!opts.isMission;
    this.driver = opts.driver || null; // 'player' | 'traffic' | 'police' | null
    this.dead = false;
    this.smokeTimer = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
  }
  get forward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  drive(input, dt, colliders, half) {
    const fwd = input.forward ? 1 : 0, back = input.back ? 1 : 0;
    if (fwd) this.speed += CONFIG.car.accel * dt * (this.speed < 0 ? 1.6 : 1);
    else if (back) this.speed -= (this.speed > 0.5 ? CONFIG.car.brake : CONFIG.car.reverseAccel) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    this.speed = Math.max(-CONFIG.car.maxReverse, Math.min(CONFIG.car.maxSpeed, this.speed));
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += this.steer * CONFIG.car.steer * dir * Math.min(1, Math.abs(this.speed) / 10) * dt * 0.9;
    const f = this.forward;
    const nx = this.pos.x + f.x * this.speed * dt;
    const nz = this.pos.z + f.z * this.speed * dt;
    const hit = collidesAt(colliders, nx, nz, 1.6);
    if (hit) {
      if (Math.abs(this.speed) > 8) this.damage(Math.abs(this.speed) * 0.55);
      this.speed *= -0.25;
    } else {
      const cl = clampToCity(nx, nz, half);
      this.pos.x = cl.x; this.pos.z = cl.z;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // body lean into steering
    this.mesh.rotation.z = -this.steer * Math.min(1, Math.abs(this.speed) / 20) * 0.06;
    return hit;
  }
  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) { this.dead = true; this.health = 0; }
  }
}

// Traffic: cars that follow the road grid, turn at intersections, and keep
// the streets alive. They brake for the car ahead and for the player.
export class Traffic {
  constructor(scene, rng, colliders, lines, half) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.lines = lines; this.half = half;
    this.cars = [];
    for (let i = 0; i < CONFIG.traffic.count; i++) this.spawnCar(true);
  }
  spawnCar(anywhere) {
    const rng = this.rng;
    const road = pick(rng, this.lines);
    const along = range(rng, -this.half + 20, this.half - 20);
    const horizontal = rng() < 0.5;
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = 3.1 * dir;
    const x = horizontal ? along : road + lane;
    const z = horizontal ? road + lane : along;
    const heading = horizontal ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (dir > 0 ? Math.PI : 0);
    const kind = rng() < 0.14 ? 'taxi' : (rng() < 0.12 ? 'van' : 'sedan');
    const color = kind === 'taxi' ? 0xf2c200 : pick(rng, CAR_COLORS);
    const mesh = makeCarMesh(color, kind === 'taxi' ? 'sedan' : kind);
    if (kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      sign.position.set(0, 1.55, -0.15);
      mesh.add(sign);
    }
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, heading, { name: kind === 'taxi' ? 'Bay Taxi' : 'Traffic', driver: 'traffic', color });
    car.speed = CONFIG.traffic.speed * range(rng, 0.8, 1.15);
    car.horizontal = horizontal;
    car.road = road;
    car.dir = dir;
    car.wait = 0;
    this.cars.push(car);
    return car;
  }
  update(dt, playerPos, playerCar) {
    for (const car of this.cars) {
      if (car.dead) continue;
      // slow down for the player / car ahead
      let target = CONFIG.traffic.speed;
      const f = car.forward;
      for (const other of this.cars) {
        if (other === car || other.dead) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead > 0 && ahead < CONFIG.traffic.minGap && Math.abs(dx * f.z - dz * f.x) < 3) { target = 0; break; }
      }
      if (playerCar && playerCar !== car) {
        const dx = playerCar.pos.x - car.pos.x, dz = playerCar.pos.z - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead > 0 && ahead < 12 && Math.abs(dx * f.z - dz * f.x) < 3.5) target = 0;
      }
      if (playerPos && !playerCar) {
        const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        if (ahead > 0 && ahead < 8 && Math.abs(dx * f.z - dz * f.x) < 3) target = 0;
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.pos.x + f.x * car.speed * dt;
      const nz = car.pos.z + f.z * car.speed * dt;
      // at an intersection, sometimes turn
      const nearLine = this.lines.some((l) => Math.abs((car.horizontal ? nz : nx) - l) < 1.2);
      const onRoadAxis = car.horizontal ? Math.abs(nz - car.road) < 4 : Math.abs(nx - car.road) < 4;
      if (nearLine && onRoadAxis && this.rng() < dt * 0.25) {
        const newRoad = pick(this.rng, this.lines);
        const turnDir = this.rng() < 0.5 ? 1 : -1;
        if (car.horizontal) {
          car.horizontal = false; car.road = newRoad; car.dir = turnDir;
          car.heading = turnDir > 0 ? Math.PI : 0;
          car.pos.z = newRoad + 3.1 * turnDir;
        } else {
          car.horizontal = true; car.road = newRoad; car.dir = turnDir;
          car.heading = turnDir > 0 ? -Math.PI / 2 : Math.PI / 2;
          car.pos.x = newRoad + 3.1 * turnDir;
        }
      }
      if (Math.abs(nx) > this.half + 10 || Math.abs(nz) > this.half + 10) {
        // loop back to the other side of the same road
        if (car.horizontal) car.pos.x = -Math.sign(nx) * (this.half - 5);
        else car.pos.z = -Math.sign(nz) * (this.half - 5);
      } else {
        car.pos.x = nx; car.pos.z = nz;
      }
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
    }
  }
  nearestTo(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const c of this.cars) {
      if (c.dead) continue;
      const d = c.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
}
