// Cayo Verde — open-world crime game. Bootstraps the renderer, owns the player
// and the camera, and wires city, traffic, pedestrians, police, missions, combat,
// HUD, audio and saves into one game loop.
import * as THREE from 'three';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { buildCity, resolveCollisions, clampToCity } from './city.js';
import { Traffic, spawnCar, drivePlayerCar, nearestCar } from './vehicles.js';
import { Pedestrians, makePedMesh } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { saveProgress, loadProgress } from './save.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bfe8);
scene.fog = new THREE.Fog(0xa8c8e8, 200, 560);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const sun = new THREE.DirectionalLight(0xfff2cf, 2.4);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -230; sun.shadow.camera.right = 230;
sun.shadow.camera.top = 230; sun.shadow.camera.bottom = -230;
sun.shadow.camera.far = 500;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

const city = buildCity(scene);
const traffic = new Traffic(scene, city);
const peds = new Pedestrians(scene, city, 26);
const police = new Police(scene, city);
const combat = new Combat(scene, camera);
const missions = new MissionManager(scene, city);
const audio = new GameAudio();
const hud = new Hud(city);
const input = new Input(canvas);

// Parked cars worth stealing, scattered on the streets.
const parkedCars = [missions.missionCar];
const parkedSpots = [
  [40, 0, 0.4, 0xd23b2e], [-80, 80, 1.2, 0x2e6fd2], [120, 40, -0.6, 0x37b24d],
  [0, -120, 2.1, 0xe8e8e8], [-40, -80, 0.9, 0xff8c42], [80, 120, -1.8, 0x8a5fd2],
  [-120, 120, 0.2, 0x14b8a6], [160, -40, 2.8, 0xd23b2e],
];
for (const [x, z, heading, color] of parkedSpots) {
  parkedCars.push(spawnCar(scene, x, z, heading, color, { kind: 'parked' }));
}

// The player: Lena Ferrer, on foot to start, outside Café Carmen.
const playerMesh = makePedMesh(0x14b8a6, 0x2c3e50);
scene.add(playerMesh);
const G = {
  screen: 'title',
  cash: 0,
  player: {
    x: -14, z: 28, heading: Math.PI, health: 100,
    inCar: false, car: null, mesh: playerMesh,
  },
  wanted: 0,
  missions, police, traffic, peds, combat, audio,
  input, city, scene, camera,
};
G.player.health = 100;

let camYaw = Math.PI;
let camPitch = 0.32;
let camDist = 10;
let camDragIdle = 0;
let titleAngle = 0;

// Lets the screenshot stager frame a shot; gameplay never calls this.
G.setCam = (yaw, pitch, dist) => { camYaw = yaw; camPitch = pitch; camDist = dist; camDragIdle = 99; };
G.startGame = startGame;
G.hud = hud;
G.parkedCars = parkedCars;

function playerPos() { return G.player; }

function startGame(fromSave) {
  if (fromSave) {
    const save = loadProgress();
    if (save) {
      G.cash = save.cash;
      missions.index = Math.min(save.missionIndex, 5);
      missions.stage = 0;
      G.player.health = save.health || 100;
      G.player.x = city.landmarks.hideout.x;
      G.player.z = city.landmarks.hideout.z;
    }
  } else {
    G.cash = 0;
    missions.index = 0;
    missions.stage = 0;
    G.player.health = 100;
    G.player.x = -14; G.player.z = 28;
  }
  police.clearWanted();
  hud.hideEnd();
  hud.setMenuVisible(false);
  hud.showToast(fromSave ? 'Welcome back to Cayo Verde.' : 'Tía Carmen is waiting at the café. Follow the yellow beacon.');
  G.screen = 'playing';
  audio.start();
}

document.getElementById('startBtn').addEventListener('click', () => startGame(false));
document.getElementById('continueBtn').addEventListener('click', () => startGame(true));
document.getElementById('retryBtn').addEventListener('click', () => {
  const p = G.player;
  p.x = city.landmarks.hideout.x;
  p.z = city.landmarks.hideout.z;
  p.health = 100;
  p.inCar = false;
  p.car = null;
  police.clearWanted();
  hud.hideEnd();
  G.screen = 'playing';
});
if (loadProgress()) document.getElementById('continueBtn').style.display = 'inline-block';

function togglePause() {
  if (G.screen === 'playing') {
    G.screen = 'paused';
    hud.showToast('PAUSED — press P to resume.', 2);
  } else if (G.screen === 'paused') {
    G.screen = 'playing';
  }
}

function enterCar(car) {
  const p = G.player;
  p.inCar = true;
  p.car = car;
  car.kind = 'driven';
  if (!car.stolen) {
    car.stolen = true;
    if (car !== missions.missionCar) {
      police.addWanted(1, 'stole a car');
      hud.showToast('You stole a car — the cops noticed! ★', 2.5);
    }
  }
  audio.blip(520, 0.08);
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  car.speed = 0;
  car.kind = 'parked';
  p.inCar = false;
  p.car = null;
  p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
  p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
  p.heading = car.heading;
  resolveCollisions(p, 0.6, city.colliders);
}

function fireWeapon() {
  if (G.screen !== 'playing') return;
  const result = combat.fire(G.player, peds, police, [...traffic.cars, ...parkedCars]);
  if (!result) return;
  audio.gunshot();
  if (result.kind === 'ped') {
    police.addWanted(1, 'shot a pedestrian');
    hud.showToast('You shot someone! The police are coming. ★', 2.5);
  } else if (result.kind === 'cop') {
    police.addWanted(2, 'shot a cop');
    hud.showToast('You shot a cop! ★★', 2.5);
  } else if (result.kind === 'empty') {
    hud.showToast('Click — empty. Press R to reload.', 1.5);
  }
  if (result.kind === 'ped' || result.kind === 'cop') {
    const at = result.ped || result.cop;
    peds.scare(at.x, at.z, 26);
  }
}

function updatePlayerOnFoot(dt) {
  const p = G.player;
  const fwd = input.forward();
  const strafe = input.strafe();
  if (fwd === 0 && strafe === 0) return;
  const run = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = run ? 10 : 6;
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  const mx = (-sin * fwd + -cos * strafe);
  const mz = (-cos * fwd + sin * strafe);
  const len = Math.hypot(mx, mz) || 1;
  const pos = { x: p.x + (mx / len) * speed * dt, z: p.z + (mz / len) * speed * dt };
  resolveCollisions(pos, 0.6, city.colliders);
  p.x = pos.x; p.z = pos.z;
  if (p.x < -200) p.x = -200; // the water stops you
  clampToCity(p, 199);
  p.heading = Math.atan2(mx / len, mz / len);
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;
  p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.012)) * 0.06;
}

function updateCamera(dt) {
  const p = G.player;
  camYaw -= input.lookDX * 0.005;
  camPitch = Math.max(0.08, Math.min(1.1, camPitch + input.lookDY * 0.003));
  camDist = Math.max(6, Math.min(18, camDist + input.wheel * 0.01));
  if (input.lookDX !== 0 || input.lookDY !== 0) camDragIdle = 0;
  else camDragIdle += dt;
  if (G.screen === 'title') {
    titleAngle += dt * 0.05;
    camera.position.set(Math.sin(titleAngle) * 150, 70, Math.cos(titleAngle) * 150);
    camera.lookAt(0, 0, 0);
    return;
  }
  // While driving, the camera eases back behind the car when the player is not dragging.
  if (p.inCar && p.car && camDragIdle > 1.2) {
    let diff = (p.car.heading + Math.PI) - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, dt * 1.4);
  }
  const focus = p.inCar && p.car
    ? { x: p.car.x, z: p.car.z, h: p.car.heading }
    : { x: p.x, z: p.z, h: p.heading };
  const back = 1;
  const cx = focus.x + Math.sin(camYaw) * camDist * Math.cos(camPitch) * back;
  const cz = focus.z + Math.cos(camYaw) * camDist * Math.cos(camPitch) * back;
  const cy = 2 + camDist * Math.sin(camPitch);
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
  camera.lookAt(focus.x, 1.6, focus.z);
}

function busted() {
  const fine = Math.min(100, G.cash);
  G.cash -= fine;
  hud.showEnd('busted', `The Verde police hauled you in. They took $${fine} off you and dropped you at the hideout.`);
  G.screen = 'busted';
  police.clearWanted();
}

function wasted() {
  G.cash = Math.floor(G.cash / 2);
  hud.showEnd('wasted', 'You went down in the streets of Cayo Verde. Half your cash is gone — the city keeps the rest.');
  G.screen = 'wasted';
  police.clearWanted();
}

const clock = new THREE.Clock();
let frames = 0;
let staged = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, clock.getDelta());
  const p = G.player;

  if (G.screen === 'playing') {
    if (input.hit('KeyP') || input.hit('Escape')) togglePause();
    if (input.hit('KeyM')) {
      audio.setMuted(!audio.muted);
      hud.showToast(audio.muted ? 'Sound muted.' : 'Sound on.', 1.5);
    }
    if (input.hit('KeyQ')) {
      const name = audio.cycleStation();
      hud.showToast(`♪ ${name}`, 2);
    }
    if (input.hit('KeyR')) combat.reload();
    if (input.hit('KeyF') || input.mouseDown) fireWeapon();
    if (input.hit('KeyE')) {
      if (p.inCar) {
        exitCar();
      } else {
        const note = missions.interact(G);
        if (note) {
          hud.showToast(note, 3);
          audio.blip(760, 0.1);
        } else {
          const car = nearestCar(parkedCars, p.x, p.z, 4.5);
          if (car) enterCar(car);
        }
      }
    }
    if (p.inCar && p.car) {
      drivePlayerCar(p.car, input, dt, city.colliders);
      p.x = p.car.x; p.z = p.car.z; p.heading = p.car.heading;
      p.mesh.position.set(p.x, -10, p.z); // hidden while driving
      // Running someone over is a crime.
      if (Math.abs(p.car.speed) > 8) {
        const hit = peds.nearest(p.x, p.z, 2.4);
        if (hit) {
          peds.knockDown(hit);
          peds.scare(hit.x, hit.z, 26);
          police.addWanted(1, 'ran over a pedestrian');
          hud.showToast('You hit someone with the car! ★', 2.5);
        }
      }
    } else {
      updatePlayerOnFoot(dt);
      // Keep the on-foot mesh on the player every frame, even when standing
      // still or after a teleport — it is not only moved by walking.
      p.mesh.position.set(p.x, Math.abs(Math.sin(performance.now() * 0.012)) * 0.04, p.z);
      p.mesh.rotation.y = p.heading;
    }
    // Vault progress bar is driven by missions; show it while cracking.
    const missionEvent = missions.update(dt, G);
    if (missionEvent) {
      if (missionEvent.completed) {
        G.cash += missionEvent.completed.reward;
        audio.cashSound();
        hud.showToast(`MISSION COMPLETE — ${missionEvent.completed.title} — +$${missionEvent.completed.reward}`, 4);
        saveProgress({ cash: G.cash, missionIndex: missions.index, health: p.health });
        if (missions.isComplete()) hud.showToast('STORY COMPLETE — Cayo Verde is yours. Free roam!', 5);
      } else if (missionEvent.note) {
        hud.showToast(missionEvent.note, 3.5);
      }
    }
    const policeState = police.update(dt, p, city.colliders, busted);
    G.wanted = police.wanted;
    combat.update(dt);
    traffic.update(dt);
    peds.update(dt, city.colliders);
    // Slow health regen when the heat is off.
    if (police.wanted === 0 && p.health < 100) p.health = Math.min(100, p.health + 1.5 * dt);
    if (p.health <= 0) wasted();
    audio.update(dt, p.inCar && p.car ? Math.abs(p.car.speed) * 3.6 : 0, police.wanted, true);
    hud.update(dt, G);
  } else if (G.screen === 'paused') {
    if (input.hit('KeyP') || input.hit('Escape')) togglePause();
    hud.update(dt, G);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
  frames += 1;
  if (!staged) {
    staged = true;
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) stageShot(shot, G);
    window.__ready = true;
  }
  input.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hooks the playtest and the screenshot stager use — no gameplay effect.
window.__game = G;
window.__debug = {
  teleport(x, z) { const p = G.player; p.x = x; p.z = z; if (p.car) { p.car.x = x; p.car.z = z; } },
  setWanted(n) { police.wanted = n; G.wanted = n; },
  startMission(i) { missions.index = i; missions.stage = 0; missions.vaultProgress = 0; },
  giveCar(car) { enterCar(car || parkedCars[1]); },
  missionCar() { return missions.missionCar; },
  parkedCars() { return parkedCars; },
};

window.__state = function state() {
  const p = G.player;
  return {
    ready: true,
    screen: G.screen,
    cash: G.cash,
    wanted: police.wanted,
    health: Math.round(p.health),
    ammo: combat.ammo,
    shotsFired: combat.shotsFired,
    hits: combat.hits,
    speedKmh: Math.round(Math.abs(p.inCar && p.car ? p.car.speed : 0) * 3.6),
    inCar: p.inCar,
    missionIndex: missions.index,
    missionTitle: missions.current() ? missions.current().title : 'FREE ROAM',
    objective: missions.objectiveText(),
    x: Math.round(p.x * 10) / 10,
    z: Math.round(p.z * 10) / 10,
    policeCars: police.cars.length,
    footCops: police.cops.length,
    pedsDown: peds.peds.filter((ped) => ped.down).length,
    frames,
  };
};

animate();
