// Marcus Vale on foot: a box-built character, WASD movement relative to the
// camera, sprint, jump, and a third-person camera that orbits with the mouse.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { collidesAt, clampToCity } from './city.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e6fb0, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c343c, roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), jacket);
  torso.position.y = 1.32; torso.castShadow = true;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), shirt);
  chest.position.set(0, 1.32, 0.21);
  g.add(chest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.98; head.castShadow = true;
  g.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.44), hair);
  hairM.position.y = 2.2;
  g.add(hairM);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), jacket);
  armL.position.set(-0.48, 1.32, 0); armL.castShadow = true;
  const armR = armL.clone(); armR.position.x = 0.48;
  g.add(armL); g.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.28), pants);
  legL.position.set(-0.18, 0.45, 0); legL.castShadow = true;
  const legR = legL.clone(); legR.position.x = 0.18;
  g.add(legL); g.add(legR);
  g.userData = { armL, armR, legL, legR, torso, head };
  return g;
}

export class Player {
  constructor(scene, spawn) {
    this.mesh = makePlayerMesh();
    scene.add(this.mesh);
    this.pos = spawn.clone();
    this.vel = new THREE.Vector3();
    this.heading = Math.PI; // face south into the city
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 7.5;
    this.onGround = true;
    this.y = 0;
    this.vy = 0;
    this.health = CONFIG.player.maxHealth;
    this.armor = 0;
    this.ammo = CONFIG.player.pistolAmmoStart;
    this.armed = false;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.inCar = null;
    this.dead = false;
  }
  get speed2d() { return Math.hypot(this.vel.x, this.vel.z); }
  update(input, dt, colliders, half, camera) {
    if (this.inCar) return;
    const look = input.consumeLook();
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = Math.max(-0.1, Math.min(0.9, this.camPitch + look.dy * 0.0026));
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpeed = sprint ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;
    const f = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const mv = new THREE.Vector3();
    if (input.down('KeyW') || input.down('ArrowUp')) mv.add(f);
    if (input.down('KeyS') || input.down('ArrowDown')) mv.sub(f);
    if (input.down('KeyD') || input.down('ArrowRight')) mv.add(r);
    if (input.down('KeyA') || input.down('ArrowLeft')) mv.sub(r);
    if (mv.lengthSq() > 0) {
      mv.normalize();
      this.heading = Math.atan2(-mv.x, -mv.z);
      this.walkPhase += dt * this.speed2d * 1.6;
    }
    const target = mv.multiplyScalar(maxSpeed);
    this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * 10);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * 10);
    // jump + gravity
    if (input.down('Space') && this.onGround) { this.vy = CONFIG.player.jumpSpeed; this.onGround = false; }
    this.vy -= CONFIG.player.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    if (!collidesAt(colliders, nx, this.pos.z, CONFIG.player.radius)) this.pos.x = nx;
    if (!collidesAt(colliders, this.pos.x, nz, CONFIG.player.radius)) this.pos.z = nz;
    const cl = clampToCity(this.pos.x, this.pos.z, half);
    this.pos.x = cl.x; this.pos.z = cl.z;
    // animate limbs
    const swing = Math.min(1, this.speed2d / CONFIG.player.walkSpeed);
    const s = Math.sin(this.walkPhase * 2.4) * 0.7 * swing;
    const u = this.mesh.userData;
    u.legL.rotation.x = s; u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      u.armR.rotation.x = -1.9 * Math.max(0, this.punchTimer / 0.3);
    }
    this.mesh.position.set(this.pos.x, this.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    // third-person camera
    const cd = this.camDist;
    const cx = this.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * cd;
    const cz = this.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * cd;
    const cy = this.y + 2.1 + Math.sin(this.camPitch) * cd;
    camera.position.set(cx, cy, cz);
    camera.lookAt(this.pos.x, this.y + 1.7, this.pos.z);
  }
  // Camera while driving: chase cam behind the car.
  updateCarCamera(car, input, dt, camera) {
    const look = input.consumeLook();
    this.camYaw -= look.dx * 0.0032;
    this.camPitch = Math.max(0.05, Math.min(0.7, this.camPitch + look.dy * 0.0026));
    // ease the chase yaw toward the car's heading so the camera settles behind it
    let diff = car.heading - this.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camYaw += diff * Math.min(1, dt * 1.6);
    const cd = 10 + Math.min(4, Math.abs(car.speed) * 0.09);
    const cx = car.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * cd;
    const cz = car.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * cd;
    const cy = 2.6 + Math.sin(this.camPitch) * cd;
    camera.position.set(cx, cy, cz);
    camera.lookAt(car.pos.x - Math.sin(car.heading) * 4, 1.4, car.pos.z - Math.cos(car.heading) * 4);
  }
  damage(amount) {
    if (this.dead) return;
    let rest = amount;
    if (this.armor > 0) { const absorbed = Math.min(this.armor, rest * 0.6); this.armor -= absorbed; rest -= absorbed; }
    this.health -= rest;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }
  heal(amount) { this.health = Math.min(CONFIG.player.maxHealth, this.health + amount); }
}
