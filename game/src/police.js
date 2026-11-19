// Wanted level and the Verde police for Cayo Verde: stars rise with crimes,
// patrol cars chase and ram, foot cops chase and bust, and heat cools off when
// the player breaks away and stays quiet.
import * as THREE from 'three';
import { spawnCar, syncCarMesh } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';
import { resolveCollisions, clampToCity } from './city.js';

export const MAX_WANTED = 5;

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.cars = [];
    this.cops = [];
    this.wanted = 0;
    this.coolTimer = 0;
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.flash = 0;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = Math.max(0, Math.min(MAX_WANTED, this.wanted + n));
    if (this.wanted > before) this.coolTimer = 0;
    return { before, after: this.wanted, reason };
  }

  clearWanted() { this.wanted = 0; this.coolTimer = 0; }

  _spawnPatrol(px, pz) {
    const angle = Math.random() * Math.PI * 2;
    const car = spawnCar(
      this.scene,
      px + Math.sin(angle) * 55,
      pz + Math.cos(angle) * 55,
      angle,
      0x111111,
      { police: true, kind: 'police' },
    );
    car.speed = 10;
    this.cars.push(car);
    return car;
  }

  _spawnCop(px, pz) {
    const mesh = makePedMesh(0x1a2a44, 0x1a2a44);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0x0d1b2e }));
    cap.position.y = 1.5;
    mesh.add(cap);
    this.scene.add(mesh);
    const cop = { mesh, x: px + (Math.random() - 0.5) * 30, z: pz + (Math.random() - 0.5) * 30, heading: 0, down: false, downTime: 0 };
    this.cops.push(cop);
    return cop;
  }

  _despawnAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cars = [];
    this.cops = [];
  }

  update(dt, player, colliders, onBusted) {
    this.flash += dt;
    const beacons = [];
    // Keep the patrol count matched to the wanted level.
    const wantCars = this.wanted === 0 ? 0 : Math.min(4, this.wanted);
    this.spawnTimer -= dt;
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this._spawnPatrol(player.x, player.z);
      this.spawnTimer = 2.5;
    }
    if (this.wanted === 0 && this.cars.length > 0) this._despawnAll();

    for (const car of this.cars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      const wantSpeed = Math.min(15 + this.wanted * 2.2, dist < 6 ? 9 : 26);
      car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.5);
      // Stuck against a wall: reverse out.
      car._stuck = (car._stuck || 0) + dt;
      const pos = {
        x: car.x + Math.sin(car.heading) * car.speed * dt,
        z: car.z + Math.cos(car.heading) * car.speed * dt,
      };
      const beforeX = pos.x; const beforeZ = pos.z;
      resolveCollisions(pos, car.radius, colliders);
      if (Math.hypot(pos.x - beforeX, pos.z - beforeZ) > 0.01 && car.speed > 4) {
        car.heading += Math.PI * 0.5 * dt * 4;
      }
      car.x = pos.x; car.z = pos.z;
      clampToCity(car, 198);
      syncCarMesh(car);
      // Flash the light bar.
      const on = Math.floor(this.flash * 6) % 2 === 0;
      if (car.mesh.userData.beacons) {
        car.mesh.userData.beacons[0].material.emissive.setHex(on ? 0xff0000 : 0x330000);
        car.mesh.userData.beacons[1].material.emissive.setHex(on ? 0x000033 : 0x0000ff);
      }
      beacons.push(car);
      // Ram the player's car.
      if (player.inCar && dist < 4.2 && player.car) {
        player.car.speed *= 0.94;
        player.car.x += (dx / Math.max(1, dist)) * -1.2 * dt * 10;
        player.car.z += (dz / Math.max(1, dist)) * -1.2 * dt * 10;
        player.health = Math.max(0, player.health - 2 * dt);
      }
    }

    // Foot cops only matter when the player is on foot and wanted.
    const wantCops = !player.inCar && this.wanted >= 2 ? Math.min(3, this.wanted - 1) : 0;
    if (this.cops.length < wantCops && this.spawnTimer <= 0) {
      this._spawnCop(player.x, player.z);
      this.spawnTimer = 2;
    }
    let nearestCop = Infinity;
    for (const cop of this.cops) {
      if (cop.down) {
        cop.downTime += dt;
        if (cop.downTime > 10) { this.scene.remove(cop.mesh); this.cops.splice(this.cops.indexOf(cop), 1); }
        continue;
      }
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz);
      nearestCop = Math.min(nearestCop, dist);
      cop.heading = Math.atan2(dx, dz);
      const speed = 5.4;
      const pos = {
        x: cop.x + Math.sin(cop.heading) * speed * dt,
        z: cop.z + Math.cos(cop.heading) * speed * dt,
      };
      resolveCollisions(pos, 0.5, colliders);
      cop.x = pos.x; cop.z = pos.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }

    // Bust: a cop stays on top of the player on foot.
    if (!player.inCar && nearestCop < 1.7) {
      this.bustTimer += dt;
      if (this.bustTimer > 1.4) {
        this.bustTimer = 0;
        onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }

    // Cool-off: no police near and no fresh crime, the heat fades one star at a time.
    if (this.wanted > 0) {
      let nearest = Infinity;
      for (const car of this.cars) nearest = Math.min(nearest, Math.hypot(car.x - player.x, car.z - player.z));
      for (const cop of this.cops) nearest = Math.min(nearest, Math.hypot(cop.x - player.x, cop.z - player.z));
      if (nearest > 45) {
        this.coolTimer += dt;
        if (this.coolTimer > 9) {
          this.wanted -= 1;
          this.coolTimer = 0;
        }
      } else {
        this.coolTimer = 0;
      }
    }
    return { nearestCop };
  }
}
