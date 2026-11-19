// On-foot and in-car combat for Cayo Verde: a pistol, raycast shots, muzzle
// flash, tracers, and the consequences of hitting the wrong person.
import * as THREE from 'three';

const MAG = 12;

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.ammo = MAG;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.tracer = null;
    this.tracerTime = 0;
    this.flash = null;
    this.flashTime = 0;
    this.shotsFired = 0;
    this.hits = 0;
  }

  reload() {
    if (this.reloading || this.ammo === MAG) return false;
    this.reloading = true;
    this.reloadTimer = 1.1;
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = MAG; this.reloading = false; }
    }
    if (this.tracer) {
      this.tracerTime -= dt;
      if (this.tracerTime <= 0) { this.scene.remove(this.tracer); this.tracer = null; }
    }
    if (this.flash) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) { this.scene.remove(this.flash); this.flash = null; }
    }
  }

  // Fire from the camera through the crosshair. Returns what was hit, if anything.
  fire(player, peds, police, cars) {
    if (this.cooldown > 0 || this.reloading) return null;
    if (this.ammo <= 0) { this.reload(); return { kind: 'empty' }; }
    this.ammo -= 1;
    this.shotsFired += 1;
    this.cooldown = 0.28;
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    this.raycaster.far = 90;

    const targets = [];
    for (const ped of peds.peds) {
      if (ped.down) continue;
      ped.mesh.traverse((m) => { if (m.isMesh) { m.userData.hitRef = { kind: 'ped', ped }; targets.push(m); } });
    }
    for (const cop of police.cops) {
      if (cop.down) continue;
      cop.mesh.traverse((m) => { if (m.isMesh) { m.userData.hitRef = { kind: 'cop', cop }; targets.push(m); } });
    }
    for (const car of cars) {
      car.mesh.traverse((m) => { if (m.isMesh) { m.userData.hitRef = { kind: 'car', car }; targets.push(m); } });
    }
    const hits = this.raycaster.intersectObjects(targets, false);
    const end = new THREE.Vector3().copy(origin).addScaledVector(dir, 90);
    let result = { kind: 'miss' };
    if (hits.length > 0) {
      const hit = hits[0];
      end.copy(hit.point);
      const ref = hit.object.userData.hitRef;
      this.hits += 1;
      if (ref.kind === 'ped') {
        peds.knockDown(ref.ped);
        peds.scare(ref.ped.x, ref.ped.z, 26);
        result = { kind: 'ped', ped: ref.ped };
      } else if (ref.kind === 'cop') {
        ref.cop.down = true; ref.cop.downTime = 0;
        ref.cop.mesh.rotation.z = Math.PI / 2;
        result = { kind: 'cop', cop: ref.cop };
      } else {
        result = { kind: 'car', car: ref.car };
      }
    }
    // Tracer line + muzzle flash at the camera.
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(this.tracer);
    this.tracerTime = 0.07;
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    flash.position.copy(origin).addScaledVector(dir, 1.2);
    this.scene.add(flash);
    this.flash = flash;
    this.flashTime = 0.06;
    return result;
  }
}
