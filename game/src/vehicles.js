// Cars for Cayo Verde: the mesh builder, arcade driving for the player's car,
// parked cars to steal, and the traffic system that keeps the streets alive.
import * as THREE from 'three';
import { resolveCollisions, clampToCity } from './city.js';

const CAR_COLORS = [0xd23b2e, 0x2e6fd2, 0xe8c33a, 0x37b24d, 0x8a5fd2, 0xe8e8e8, 0x222831, 0xff8c42, 0x14b8a6];

export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: opts.police ? 0x1a1d24 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.55, 2.0),
    new THREE.MeshLambertMaterial({ color: opts.police ? 0xf2f2f2 : 0x1c2733 }),
  );
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  if (opts.police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x223344 }),
    );
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    const beaconL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 }));
    beaconL.position.set(-0.4, 1.55, -0.2);
    group.add(beaconL);
    const beaconR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000ff }));
    beaconR.position.set(0.4, 1.55, -0.2);
    group.add(beaconR);
    group.userData.beacons = [beaconL, beaconR];
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  return group;
}

export function spawnCar(scene, x, z, heading, color, opts = {}) {
  const mesh = makeCarMesh(color, opts);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    mesh, x, z, heading,
    speed: 0, steer: 0,
    color, kind: opts.kind || 'parked',
    radius: 1.9,
    targetSpeed: 0,
  };
}

export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels || [];
  for (let i = 0; i < wheels.length; i += 1) {
    wheels[i].rotation.x += car.speed * 0.016 * 2.4;
    if (i < 2) wheels[i].rotation.y = car.steer * 0.45;
  }
}

// Arcade driving: W/S accelerate and brake/reverse, A/D steer, Space handbrake.
export function drivePlayerCar(car, input, dt, colliders) {
  const fwd = input.forward();
  const steerIn = input.strafe();
  const topSpeed = 30;
  if (fwd > 0) car.speed += 15 * dt;
  else if (fwd < 0) car.speed -= car.speed > 0.5 ? 22 * dt : 8 * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (input.down('Space')) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-9, Math.min(topSpeed, car.speed));
  const steerTarget = steerIn * Math.min(1, Math.abs(car.speed) / 6 + 0.25);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  car.heading -= car.steer * (car.speed / 9) * dt * 1.9;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const pos = { x: nx, z: nz };
  resolveCollisions(pos, car.radius, colliders);
  if (pos.x !== nx || pos.z !== nz) car.speed *= 0.55;
  car.x = pos.x; car.z = pos.z;
  if (car.x < -198) { car.x = -198; car.speed *= 0.5; }
  clampToCity(car, 200);
  syncCarMesh(car);
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.kind === 'traffic') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// Traffic: cars loop along the street grid, slowing for the car ahead.
export class Traffic {
  constructor(scene, city) {
    this.cars = [];
    let seed = 777;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const lines = city.streetLines;
    for (let i = 0; i < 14; i += 1) {
      const horizontal = i % 2 === 0;
      const line = lines[Math.floor(rnd() * lines.length)];
      const lane = (rnd() < 0.5 ? -1 : 1) * 2.4;
      const along = -180 + rnd() * 360;
      const car = spawnCar(
        scene,
        horizontal ? along : line + lane,
        horizontal ? line + lane : along,
        horizontal ? (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() < 0.5 ? 0 : Math.PI),
        CAR_COLORS[i % CAR_COLORS.length],
        { kind: 'traffic' },
      );
      car.horizontal = horizontal;
      car.line = line;
      car.lane = lane;
      car.dir = rnd() < 0.5 ? 1 : -1;
      car.cruise = 8 + rnd() * 4;
      car.speed = car.cruise;
      car.heading = horizontal ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
      syncCarMesh(car);
      this.cars.push(car);
    }
  }

  update(dt) {
    for (const car of this.cars) {
      let want = car.cruise;
      for (const other of this.cars) {
        if (other === car || other.horizontal !== car.horizontal || other.line !== car.line) continue;
        const along = car.horizontal ? car.x : car.z;
        const oAlong = other.horizontal ? other.x : other.z;
        const gap = (oAlong - along) * car.dir;
        if (gap > 0 && gap < 9) { want = Math.min(want, other.speed); break; }
      }
      car.speed += (want - car.speed) * Math.min(1, dt * 2);
      if (car.horizontal) car.x += car.dir * car.speed * dt;
      else car.z += car.dir * car.speed * dt;
      const along = car.horizontal ? car.x : car.z;
      if (along > 192 || along < -192) {
        car.dir *= -1;
        if (car.horizontal) { car.x = Math.max(-192, Math.min(192, car.x)); car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { car.z = Math.max(-192, Math.min(192, car.z)); car.heading = car.dir > 0 ? 0 : Math.PI; }
      }
      syncCarMesh(car);
    }
  }
}
