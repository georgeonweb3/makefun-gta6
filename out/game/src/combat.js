// Combat: fists up close, a pistol at range, tracers, muzzle flash and the
// damage numbers the HUD reads. No hitscan magic beyond a raycast.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.flash = new THREE.PointLight(0xffc36b, 0, 14);
    this.scene.add(this.flash);
    this.flashTimer = 0;
    this.shotCooldown = 0;
    this.punchCooldown = 0;
  }
  punch(player, peds, police, onHitPed) {
    if (this.punchCooldown > 0 || player.inCar) return false;
    this.punchCooldown = 0.32;
    player.punchTimer = 0.3;
    const fwd = new THREE.Vector3(-Math.sin(player.heading), 0, -Math.cos(player.heading));
    const origin = player.pos.clone().setY(1.4);
    let hit = false;
    for (const ped of peds.peds) {
      if (ped.state === 'down') continue;
      const to = ped.pos.clone().setY(1.2).sub(origin);
      if (to.length() < CONFIG.player.punchRange && to.normalize().dot(fwd) > 0.5) {
        peds.knockDown(ped);
        onHitPed(ped);
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const cop of police.cops) {
        const to = cop.pos.clone().setY(1.2).sub(origin);
        if (to.length() < CONFIG.player.punchRange && to.normalize().dot(fwd) > 0.5) {
          cop.pos.addScaledVector(fwd, 3);
          onHitPed(null, true);
          hit = true;
          break;
        }
      }
    }
    return hit;
  }
  shoot(player, camera, peds, police, cars, onCrime, onHitPed) {
    if (this.shotCooldown > 0 || player.inCar || player.ammo <= 0) return false;
    this.shotCooldown = 0.28;
    player.ammo -= 1;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const ray = new THREE.Raycaster(origin, dir, 0.1, CONFIG.player.pistolRange);
    const targets = [];
    for (const ped of peds.peds) {
      if (ped.state === 'down') continue;
      const m = ped.mesh;
      const box = new THREE.Box3().setFromObject(m);
      targets.push({ box, kind: 'ped', ref: ped });
    }
    for (const cop of police.cops) {
      const box = new THREE.Box3().setFromObject(cop.mesh);
      targets.push({ box, kind: 'cop', ref: cop });
    }
    let end = origin.clone().addScaledVector(dir, CONFIG.player.pistolRange);
    let closest = Infinity;
    let hitKind = null, hitRef = null;
    for (const t of targets) {
      const hit = ray.ray.intersectBox(t.box, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(origin);
        if (d < closest) { closest = d; hitKind = t.kind; hitRef = t.ref; end = hit; }
      }
    }
    // tracer + flash
    const muzzle = origin.clone().addScaledVector(dir, 1.2);
    const geo = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    this.flash.position.copy(muzzle);
    this.flash.intensity = 26;
    this.flashTimer = 0.06;
    if (hitKind === 'ped') {
      peds.knockDown(hitRef);
      onHitPed(hitRef);
    } else if (hitKind === 'cop') {
      hitRef.pos.addScaledVector(dir, 2);
      onCrime(1);
    } else {
      onCrime(0); // a shot in the street still draws attention if police are near
    }
    return true;
  }
  update(dt) {
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.intensity = 0;
    }
    for (const t of this.tracers) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }
  }
}
