// Eddie Cross's job chain: five missions, each a list of objectives with a
// beacon in the world and a line on the HUD. Completing one pays cash, saves
// progress and unlocks the next; finishing the fifth ends the story arc.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { makeCarMesh, Car } from './cars.js';

export class Missions {
  constructor(scene, spots, rng) {
    this.scene = scene;
    this.spots = spots;
    this.rng = rng;
    this.index = 0;
    this.objIndex = 0;
    this.state = 'idle'; // idle | active | done
    this.evadeTimer = 0;
    this.collected = 0;
    this.beacon = null;
    this.markerMesh = null;
    this.missionCars = {};
    this.onEvent = null; // (type, payload) -> main.js (cash, banner, crime, sound)
    this.buildMarker();
    this.buildMissionCars();
  }
  buildMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 21;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd94a }),
    );
    arrow.rotation.x = Math.PI;
    arrow.position.y = 5.2;
    g.add(arrow);
    g.userData = { ring, arrow };
    g.visible = false;
    this.scene.add(g);
    this.markerMesh = g;
  }
  buildMissionCars() {
    const mk = (spotKey, color, kind, name, heading) => {
      const spot = this.spots[spotKey];
      if (!spot) return null;
      const mesh = makeCarMesh(color, kind);
      this.scene.add(mesh);
      const car = new Car(mesh, spot.x, spot.z, heading, { name, driver: null, isMission: true, color });
      return car;
    };
    this.missionCars.missionCar = mk('dinerCar', 0x8a8f96, 'sedan', 'Grey Sedan', Math.PI);
    this.missionCars.sportsCar = mk('beachCar', 0xd98a2b, 'sports', 'Sunrise GT', Math.PI / 2);
    this.missionCars.launchCar = mk('launch', 0x2c2c34, 'sports', 'Harbour Launch GT', 0);
  }
  get current() { return MISSIONS[this.index] || null; }
  get objective() { const m = this.current; return m ? m.objectives[this.objIndex] : null; }
  get done() { return this.index >= MISSIONS.length; }
  start(index = 0) {
    this.index = index;
    this.objIndex = 0;
    this.collected = 0;
    this.evadeTimer = 0;
    this.state = 'active';
    this.showMarker();
    this.emit('mission-start', { mission: this.current });
  }
  emit(type, payload) { if (this.onEvent) this.onEvent(type, payload); }
  showMarker() {
    const obj = this.objective;
    if (!obj || !obj.at) { this.markerMesh.visible = false; return; }
    const spot = this.spots[obj.at];
    if (!spot) { this.markerMesh.visible = false; return; }
    this.markerMesh.position.set(spot.x, 0, spot.z);
    this.markerMesh.visible = true;
  }
  // Called every frame with the live world; returns nothing, emits events.
  update(dt, ctx) {
    if (this.state !== 'active' || !this.current) return;
    const obj = this.objective;
    if (!obj) { this.completeMission(); return; }
    if (this.markerMesh.visible) {
      const t = performance.now() / 1000;
      this.markerMesh.userData.arrow.position.y = 5.2 + Math.sin(t * 3) * 0.5;
      this.markerMesh.userData.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.12);
    }
    const playerPos = ctx.player.pos;
    const inCar = !!ctx.player.inCar;
    if (obj.type === 'goto' || obj.type === 'deliver' || obj.type === 'collect') {
      const spot = this.spots[obj.at];
      const p = inCar ? ctx.player.inCar.pos : playerPos;
      // a car covers ground fast: give it a wider arrival radius than on foot
      const radius = obj.type === 'collect' ? 3.2 : (inCar ? 7 : 5);
      if (spot && p.distanceTo(spot) < radius) {
        if (obj.type === 'collect') {
          this.collected += 1;
          this.emit('collect', { at: obj.at, collected: this.collected });
          this.advance();
        } else {
          this.advance();
        }
      }
    } else if (obj.type === 'enterCar' || obj.type === 'stealCar') {
      const car = this.missionCars[obj.car];
      if (car && ctx.player.inCar === car) {
        if (obj.type === 'stealCar') this.emit('crime', { stars: 1, reason: 'stole the GT in front of patrols' });
        this.advance();
      }
    } else if (obj.type === 'evade') {
      const seen = ctx.police.seenByPolice(playerPos, 42);
      if (!seen && ctx.police.stars > 0) {
        this.evadeTimer += dt;
      } else if (seen) {
        this.evadeTimer = Math.max(0, this.evadeTimer - dt * 1.5);
      }
      if (this.evadeTimer >= obj.seconds) this.advance();
    }
  }
  advance() {
    this.objIndex += 1;
    this.evadeTimer = 0;
    if (this.objIndex >= this.current.objectives.length) {
      this.completeMission();
      return;
    }
    this.showMarker();
    this.emit('objective', { mission: this.current, objective: this.objective });
  }
  completeMission() {
    const m = this.current;
    this.state = 'idle';
    this.markerMesh.visible = false;
    this.emit('mission-complete', { mission: m, pay: m.pay });
    this.index += 1;
    this.objIndex = 0;
    this.collected = 0;
    if (this.index < MISSIONS.length) {
      this.state = 'active';
      this.showMarker();
      this.emit('mission-start', { mission: this.current });
    } else {
      this.emit('story-complete', {});
    }
  }
  // Distance + label for the HUD.
  hudInfo(playerPos, inCarPos) {
    const obj = this.objective;
    if (!obj || this.state !== 'active') return null;
    let dist = null;
    if (obj.at && this.spots[obj.at]) {
      const p = inCarPos || playerPos;
      dist = Math.round(p.distanceTo(this.spots[obj.at]));
    }
    let label = obj.label;
    if (obj.type === 'evade') label = `${obj.label} — ${Math.max(0, Math.ceil(obj.seconds - this.evadeTimer))}s`;
    if (obj.type === 'collect') label = `${obj.label}`;
    return { title: this.current.title, label, dist, progress: `${this.objIndex + 1}/${this.current.objectives.length}` };
  }
  // Parked mission cars the player can steal outside their mission too.
  parkedCars() { return Object.values(this.missionCars).filter(Boolean); }
}
