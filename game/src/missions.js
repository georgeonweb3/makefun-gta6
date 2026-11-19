// The story of Cayo Verde: five jobs from Tía Carmen, each with a target on the
// map, a beacon to follow, and a cash reward that saves the game when it lands.
import * as THREE from 'three';
import { makePedMesh } from './pedestrians.js';
import { spawnCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 1, title: '1 — THE CALL', reward: 150,
    brief: 'Tía Carmen is waiting at Café Carmen. Go and hear her out.',
    objective: 'Meet Tía Carmen at the café (follow the yellow beacon).',
  },
  {
    id: 2, title: '2 — BORROWED WHEELS', reward: 300,
    brief: 'A yellow sports car is parked by the pier. "Borrow" it and bring it to the Verde Garage. Stealing it will draw heat.',
    objective: 'Steal the yellow car at the pier, then deliver it to the garage.',
  },
  {
    id: 3, title: '3 — THE COLLECTION', reward: 450,
    brief: 'A market trader owes Carmen money. Find him at Mercado Verde, press E to collect, then bring the cash back to the café.',
    objective: 'Collect the debt at the market (press E), then return to the café.',
  },
  {
    id: 4, title: '4 — HOT DELIVERY', reward: 700,
    brief: 'A package is waiting at the fish docks. Grab it and run it to the hideout — the cops will be on you the moment you take it.',
    objective: 'Pick up the package at the docks (press E), then deliver it to the hideout.',
  },
  {
    id: 5, title: '5 — THE CORAL JOB', reward: 1500,
    brief: 'The Coral Bank vault. Hold E at the bank doors to crack it, then lose the heat and get home. This is the big one, Lena.',
    objective: 'Crack the bank vault (hold E), then escape to the hideout.',
  },
];

export class MissionManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.index = 0;          // 0..4 active, 5 = story complete
    this.stage = 0;
    this.vaultProgress = 0;
    this.done = false;
    this.events = [];

    // Beacon: a glowing pillar + floating arrow over the current target.
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35 });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true), beaconMat);
    this.beacon.position.y = 15;
    scene.add(this.beacon);
    this.arrow = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 2.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    this.arrow.rotation.x = Math.PI;
    scene.add(this.arrow);

    // The yellow sports car for mission 2, parked by the pier entrance.
    this.missionCar = spawnCar(scene, -170, 34, Math.PI / 2, 0xe8c33a, { kind: 'parked' });
    this.missionCar.isMissionCar = true;

    // The debtor for mission 3, waiting at the market.
    this.debtor = { mesh: makePedMesh(0xf1c40f, 0x2c3e50), x: 100, z: -96, collected: false };
    this.debtor.mesh.position.set(100, 0, -96);
    scene.add(this.debtor.mesh);
    this.time = 0;
  }

  current() { return MISSIONS[this.index] || null; }

  isComplete() { return this.index >= MISSIONS.length; }

  targetPos() {
    const L = this.city.landmarks;
    if (this.isComplete()) return null;
    switch (this.index) {
      case 0: return L.cafe;
      case 1: return this.stage === 0 ? { x: this.missionCar.x, z: this.missionCar.z } : L.garage;
      case 2: return this.stage === 0 ? { x: this.debtor.x, z: this.debtor.z } : L.cafe;
      case 3: return this.stage === 0 ? L.docks : L.hideout;
      case 4: return this.stage === 0 ? L.bank : L.hideout;
      default: return null;
    }
  }

  objectiveText() {
    if (this.isComplete()) return 'Story complete — Cayo Verde is yours. Free roam, cause trouble, lose the heat.';
    return this.current().objective;
  }

  // E pressed near the target: collect the debt, grab the package.
  interact(world) {
    if (this.isComplete()) return null;
    const target = this.targetPos();
    if (!target) return null;
    const d = Math.hypot(world.player.x - target.x, world.player.z - target.z);
    if (this.index === 2 && this.stage === 0 && d < 4) {
      this.debtor.collected = true;
      this.stage = 1;
      return 'Debt collected — $450 in hand. Bring it back to Carmen.';
    }
    if (this.index === 3 && this.stage === 0 && d < 4) {
      this.stage = 1;
      world.police.wanted = 2;
      return 'Package grabbed — the cops are coming! Run it to the hideout.';
    }
    return null;
  }

  // Returns completed mission info (or null) each frame.
  update(dt, world) {
    this.time += dt;
    const target = this.targetPos();
    if (target) {
      this.beacon.visible = true;
      this.arrow.visible = true;
      this.beacon.position.set(target.x, 15, target.z);
      this.arrow.position.set(target.x, 9 + Math.sin(this.time * 3) * 0.7, target.z);
      this.arrow.rotation.y = this.time * 2;
    } else {
      this.beacon.visible = false;
      this.arrow.visible = false;
    }
    if (this.isComplete()) return null;
    const p = world.player;
    const d = target ? Math.hypot(p.x - target.x, p.z - target.z) : Infinity;

    // Mission 2, stage 0 completes when the player enters the yellow car.
    if (this.index === 1 && this.stage === 0 && p.inCar && p.car === this.missionCar) {
      this.stage = 1;
      world.police.addWanted(1, 'stole the yellow car');
      return { note: 'That is the car. Now get it to the Verde Garage — quietly.' };
    }
    // Mission 5 vault: hold E beside the bank.
    if (this.index === 4 && this.stage === 0) {
      if (d < 6 && world.input.down('KeyE')) {
        this.vaultProgress += dt / 5;
        if (this.vaultProgress >= 1) {
          this.stage = 1;
          this.vaultProgress = 0;
          world.police.wanted = 3;
          return { note: 'Vault cracked! $1,500 in the bag — now get home, Lena!' };
        }
      } else {
        this.vaultProgress = Math.max(0, this.vaultProgress - dt * 0.4);
      }
    }
    // Reach-the-target completions.
    const reachRadius = this.index === 0 ? 4 : 6;
    if (d < reachRadius) {
      const completes =
        (this.index === 0 && this.stage === 0) ||
        (this.index === 1 && this.stage === 1) ||
        (this.index === 2 && this.stage === 1) ||
        (this.index === 3 && this.stage === 1) ||
        (this.index === 4 && this.stage === 1);
      if (completes) {
        const mission = this.current();
        this.index += 1;
        this.stage = 0;
        this.vaultProgress = 0;
        return { completed: mission };
      }
    }
    return null;
  }
}
