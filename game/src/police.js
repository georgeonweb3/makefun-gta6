// The wanted system: stars rise with crime and fall with clean time. Bay PD
// answers with patrol cars that ram and foot cops that chase — get busted or
// get away, but the city remembers for a while.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makePoliceMesh, Car } from './cars.js';
import { range, pick } from './rng.js';
import { collidesAt } from './city.js';

export class Police {
  constructor(scene, rng, colliders, lines, half) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.lines = lines; this.half = half;
    this.stars = 0;
    this.cleanTimer = 0;
    this.cars = [];
    this.cops = [];
    this.bustTimer = 0;
    this.sirenPhase = 0;
    this.lastCrimeAt = -999;
  }
  addCrime(stars, now) {
    this.stars = Math.min(CONFIG.police.maxStars, this.stars + stars);
    this.cleanTimer = 0;
    this.lastCrimeAt = now;
    this.syncForce();
  }
  setStars(n, now) {
    this.stars = Math.max(0, Math.min(CONFIG.police.maxStars, n));
    this.cleanTimer = 0;
    this.lastCrimeAt = now ?? this.lastCrimeAt;
    this.syncForce();
  }
  // spawn/despawn patrol cars and foot cops to match the star count
  syncForce() {
    const wantCars = Math.min(this.stars, 3) * CONFIG.police.carsPerStar;
    const wantCops = this.stars >= CONFIG.police.footCopsFromStar ? (this.stars - 1) * 2 : 0;
    while (this.cars.length < wantCars) this.spawnCar();
    while (this.cops.length < wantCops) this.spawnCop();
  }
  spawnCar() {
    const road = pick(this.rng, this.lines);
    const along = range(this.rng, -this.half + 30, this.half - 30);
    const horizontal = this.rng() < 0.5;
    const x = horizontal ? along : road;
    const z = horizontal ? road : along;
    const mesh = makePoliceMesh();
    this.scene.add(mesh);
    const car = new Car(mesh, x, z, 0, { name: 'Bay PD Cruiser', driver: 'police', isPolice: true });
    car.speed = 0;
    this.cars.push(car);
    return car;
  }
  spawnCop() {
    const g = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({ color: 0x1d3a5f, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a986, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), navy);
    torso.position.y = 1.28; torso.castShadow = true;
    g.add(torso);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.04), new THREE.MeshBasicMaterial({ color: 0xffd94a }));
    badge.position.set(-0.18, 1.45, 0.2);
    g.add(badge);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
    head.position.y = 1.92; g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42), navy);
    cap.position.y = 2.12; g.add(cap);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.26), navy);
    legL.position.set(-0.17, 0.43, 0);
    const legR = legL.clone(); legR.position.x = 0.17;
    g.add(legL); g.add(legR);
    this.scene.add(g);
    const cop = { mesh: g, pos: new THREE.Vector3(), heading: 0, speed: 6.4, phase: 0, legL, legR };
    this.cops.push(cop);
    return cop;
  }
  placeNear(pos, dist) {
    const a = this.rng() * Math.PI * 2;
    return new THREE.Vector3(pos.x + Math.cos(a) * dist, 0, pos.z + Math.sin(a) * dist);
  }
  update(dt, now, player, playerCar, onBusted) {
    // decay: a clean stretch drops one star
    if (this.stars > 0) {
      this.cleanTimer += dt;
      if (this.cleanTimer >= CONFIG.police.decaySeconds) {
        this.stars -= 1;
        this.cleanTimer = 0;
        this.syncForce();
      }
    }
    const target = playerCar ? playerCar.pos : player.pos;
    // patrol cars chase and ram
    for (const car of this.cars) {
      if (car.dead) continue;
      const to = target.clone().sub(car.pos);
      const dist = to.length();
      const wantHeading = Math.atan2(-to.x, -to.z);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      const speedTarget = car.reverseTimer > 0 ? -9
        : dist > 60 ? CONFIG.police.chaseSpeed : (dist > 8 ? CONFIG.police.chaseSpeed * 0.85 : 14);
      car.speed += (speedTarget - car.speed) * Math.min(1, dt * 1.2);
      const f = car.forward;
      const nx = car.pos.x + f.x * car.speed * dt;
      const nz = car.pos.z + f.z * car.speed * dt;
      if (!collidesAt(this.colliders, nx, nz, 1.6)) { car.pos.x = nx; car.pos.z = nz; }
      else {
        // wedged on a building: back up and swing around instead of grinding
        car.speed *= 0.4;
        car.heading += 0.7 * dt * 4;
        car.reverseTimer = 0.7;
      }
      if (car.reverseTimer > 0) car.reverseTimer -= dt;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      // ram the player's car
      if (playerCar && dist < 3.4 && Math.abs(car.speed) > 4) {
        playerCar.damage(CONFIG.police.ramDamage * dt * 3);
        car.speed *= 0.5;
      }
      if (dist > CONFIG.police.despawnDistance && this.stars === 0) {
        this.scene.remove(car.mesh);
        this.cars.splice(this.cars.indexOf(car), 1);
      }
    }
    // foot cops chase the player on foot
    let touching = false;
    for (const cop of this.cops) {
      if (playerCar) { // cops run toward the car and wait near it
        const d = cop.pos.distanceTo(playerCar.pos);
        if (d > 40) cop.pos.copy(this.placeNear(playerCar.pos, CONFIG.police.spawnDistance));
      }
      const to = player.pos.clone().sub(cop.pos);
      const dist = to.length();
      if (dist > 1.2) {
        const dir = to.normalize();
        cop.heading = Math.atan2(-dir.x, -dir.z);
        cop.pos.addScaledVector(dir, cop.speed * dt);
        cop.phase += dt * 10;
        const s = Math.sin(cop.phase) * 0.6;
        cop.legL.rotation.x = s; cop.legR.rotation.x = -s;
      }
      cop.mesh.position.copy(cop.pos);
      cop.mesh.rotation.y = cop.heading;
      if (!playerCar && dist < CONFIG.police.bustRadius) touching = true;
    }
    if (touching && !player.dead) {
      this.bustTimer += dt;
      if (this.bustTimer >= CONFIG.police.bustHoldSeconds) {
        this.bustTimer = 0;
        onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    // keep the force near the action when stars are up
    for (const car of this.cars) {
      if (car.pos.distanceTo(target) > CONFIG.police.spawnDistance + 60 && this.stars > 0) {
        car.pos.copy(this.placeNear(target, CONFIG.police.spawnDistance));
      }
    }
    for (const cop of this.cops) {
      if (cop.pos.distanceTo(player.pos) > CONFIG.police.spawnDistance + 60 && this.stars > 0 && !playerCar) {
        cop.pos.copy(this.placeNear(player.pos, CONFIG.police.spawnDistance));
      }
    }
    // despawn the whole force when the heat is gone
    if (this.stars === 0) {
      for (const car of this.cars) this.scene.remove(car.mesh);
      for (const cop of this.cops) this.scene.remove(cop.mesh);
      this.cars = [];
      this.cops = [];
    }
    this.sirenPhase += dt;
  }
  // A cop or patrol car can see the player (line of sight is approximated by distance).
  seenByPolice(playerPos, radius = 45) {
    for (const car of this.cars) if (car.pos.distanceTo(playerPos) < radius) return true;
    for (const cop of this.cops) if (cop.pos.distanceTo(playerPos) < radius) return true;
    return false;
  }
}
