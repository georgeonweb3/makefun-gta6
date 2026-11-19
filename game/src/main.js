// Solmar Bay — boot, game loop and the glue between every system.
// States: title -> playing -> paused -> busted / wasted / story done.
import * as THREE from 'three';
import { CONFIG, RADIO_STATIONS } from './config.js';
import { makeRng } from './rng.js';
import { Input } from './input.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Traffic, makeCarMesh, Car } from './cars.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, clearSave, freshState } from './save.js';
import { parseShot, applyShot } from './shots.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

const { shot, seed } = parseShot();
const LOW = new URLSearchParams(location.search).has('low'); // software-render test mode: no shadows, 1x pixels
const BARE = new URLSearchParams(location.search).has('bare'); // test mode: skip palms, lamps, clouds
const rng = makeRng(seed);

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.id = 'game';
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(0, 40, 80);

const input = new Input(renderer.domElement);
const hud = new HUD();
const audio = new AudioEngine();

const { colliders, spots, lines, centers, half, worldHalf, clouds, oceanMat, sun } = buildCity(scene, rng, { bare: BARE });

const save = loadSave() || freshState();
const game = {
  state: 'loading',
  time: 0,
  clockMinutes: CONFIG.day.startMinutes,
  cash: save.cash,
  missionIndex: save.missionIndex,
  storyDone: save.storyDone,
  spots, half, worldHalf, lines, centers,
  stageCamera: null,
  damageFlash: 0,
  lastHealth: 100,
};

const player = new Player(scene, spots.spawn);
player.health = CONFIG.player.maxHealth;
game.player = player;

const traffic = new Traffic(scene, rng, colliders, lines, half);
const peds = new Pedestrians(scene, rng, colliders, lines, half);
const police = new Police(scene, rng, colliders, lines, half);
const combat = new Combat(scene);
const missions = new Missions(scene, spots, rng);
game.traffic = traffic;
game.peds = peds;
game.police = police;
game.missions = missions;
game.cars = { parked: missions.parkedCars() };

// ---- mission event wiring ----
missions.onEvent = (type, payload) => {
  if (type === 'mission-start') {
    hud.toast(`NEW JOB — ${payload.mission.title}: ${payload.mission.brief}`, 6);
    hud.banner(payload.mission.title, payload.mission.brief, 4);
    audio.sfx('mission');
  } else if (type === 'objective') {
    hud.toast(payload.objective.label, 4);
  } else if (type === 'collect') {
    audio.sfx('pickup');
    hud.toast(`Parcel secured (${payload.collected} collected)`, 2.5);
  } else if (type === 'crime') {
    police.addCrime(payload.stars, game.time);
    hud.toast('Bay PD saw that!', 2.5);
  } else if (type === 'mission-complete') {
    game.cash += payload.pay;
    game.missionIndex = missions.index;
    audio.sfx('cash');
    audio.sfx('mission');
    hud.banner('MISSION COMPLETE', `Eddie paid you $${payload.pay} — cash on hand $${game.cash}`, 4);
    writeSave({ cash: game.cash, missionIndex: game.missionIndex, storyDone: game.storyDone });
  } else if (type === 'story-complete') {
    game.storyDone = true;
    writeSave({ cash: game.cash, missionIndex: game.missionIndex, storyDone: true });
    hud.banner('THE BIG SCORE — DONE', 'Solmar Bay is yours, Marcus. Free roam unlocked.', 6);
  }
};

// ---- entering / exiting cars ----
function nearestEnterableCar() {
  let best = null, bestD = CONFIG.car.enterRange;
  const all = [...missions.parkedCars(), ...traffic.cars];
  for (const c of all) {
    if (c.dead || c.driver === 'police') continue;
    if (c.driver === 'traffic' && Math.abs(c.speed) > 1.5) continue; // can't jack a moving car
    const d = c.pos.distanceTo(player.pos);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

game.enterCar = function enterCar(car, silent) {
  if (!car || car.dead) return false;
  const wasTraffic = car.driver === 'traffic';
  car.driver = 'player';
  player.inCar = car;
  player.mesh.visible = false;
  player.camYaw = car.heading;
  if (!silent) audio.sfx('enter');
  if (wasTraffic) {
    // jacking a taxi in the open is a crime if anyone is watching
    const watched = police.seenByPolice(player.pos, 40) || peds.nearestTo(player.pos, 22);
    if (watched) {
      police.addCrime(1, game.time);
      hud.toast('You jacked a car in broad daylight — Bay PD is coming!', 3);
    } else {
      hud.toast(`You took the ${car.name}.`, 2);
    }
  } else {
    hud.toast(`You're driving the ${car.name}.`, 2);
  }
  return true;
};

function exitCar() {
  const car = player.inCar;
  if (!car) return;
  car.driver = null;
  car.speed *= 0.3;
  player.inCar = null;
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  player.pos.set(car.pos.x + side.x * 2.4, 0, car.pos.z + side.z * 2.4);
  player.mesh.visible = true;
  player.camYaw = car.heading;
  audio.sfx('enter');
}

// ---- crime helpers ----
function addCrime(stars, reason) {
  if (stars <= 0) return;
  police.addCrime(stars, game.time);
  if (reason) hud.toast(reason, 2.5);
}
function onShotCrime(stars) {
  if (stars > 0) addCrime(stars, 'Bay PD heard the shot!');
  else if (police.seenByPolice(player.pos, 45)) addCrime(1, 'Bay PD heard the shot!');
}
function onPedHit(ped, isCop) {
  if (isCop) { addCrime(1, 'You hit a cop!'); return; }
  addCrime(1, 'Someone saw you hit a pedestrian!');
}

// ---- busted / wasted ----
function endRun(kind) {
  const fine = Math.min(game.cash, kind === 'busted' ? CONFIG.economy.bustFine : CONFIG.economy.wastedFine);
  game.cash -= fine;
  police.setStars(0, game.time);
  audio.sfx('busted');
  audio.setSiren(false);
  if (player.inCar) exitCar();
  player.health = CONFIG.player.maxHealth;
  player.dead = false;
  player.pos.copy(spots.hospital);
  player.camYaw = Math.PI;
  game.state = kind;
  writeSave({ cash: game.cash, missionIndex: game.missionIndex, storyDone: game.storyDone });
  const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
  const text = kind === 'busted'
    ? `Bay PD took you downtown and kept $${fine} as a "processing fee". Cash on hand: $${game.cash}. Eddie is still waiting — get back out there.`
    : `You woke up at Solmar General, $${fine} lighter for the hospital bill. Cash on hand: $${game.cash}. The city is still yours to take.`;
  hud.showEnd(title, text);
  document.getElementById('endBtn').textContent = 'BACK ON THE STREETS';
}

// ---- UI buttons ----
document.getElementById('playBtn').addEventListener('click', () => startGame(false));
document.getElementById('resumeBtn').addEventListener('click', () => {
  game.state = 'playing';
  hud.hidePause();
  audio.resume();
});
document.getElementById('restartBtn').addEventListener('click', () => {
  clearSave();
  const fresh = freshState();
  game.cash = fresh.cash; game.missionIndex = 0; game.storyDone = false;
  missions.start(0);
  player.pos.copy(spots.spawn);
  player.health = CONFIG.player.maxHealth;
  police.setStars(0, game.time);
  hud.hidePause();
  game.state = 'playing';
});
document.getElementById('endBtn').addEventListener('click', () => {
  hud.hideEnd();
  game.state = 'playing';
  audio.resume();
});

function startGame(auto) {
  audio.init();
  audio.resume();
  hud.showGame();
  hud.setCash(game.cash);
  game.state = 'playing';
  if (game.missionIndex < 5 && missions.state !== 'active') missions.start(game.missionIndex);
  if (!auto) hud.banner('SOLMAR BAY', 'Eddie Cross is waiting. Follow the yellow beacon.', 4);
}

// ---- per-frame update ----
const clock = new THREE.Clock();
let frames = 0;
const tmpV = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.time += dt;
  frames += 1;
  window.__frames = frames;

  // ocean + clouds drift, sun follows the player for tight shadows
  oceanMat.color.setHSL(0.55, 0.75, 0.42 + Math.sin(game.time * 0.3) * 0.02);
  for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 460) c.position.x = -460; }
  sun.position.set(player.pos.x + 180, 260, player.pos.z + 120);
  sun.target.position.set(player.pos.x, 0, player.pos.z);
  scene.add(sun.target);

  if (game.state === 'title') {
    // slow orbit over the plaza for the title screen backdrop
    const t = game.time * 0.05;
    camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90);
    camera.lookAt(0, 8, 0);
  } else if (game.state === 'playing') {
    updatePlaying(dt);
  } else if (game.state === 'paused' || game.state === 'busted' || game.state === 'wasted') {
    // frozen world behind the overlay; still render
  }

  hud.update(dt);
  audio.update(dt);
  audio.setSiren(police.stars > 0 && game.state === 'playing');
  renderer.render(scene, camera);
  if (frames === 3) {
    document.getElementById('loading').classList.add('hidden');
    window.__ready = true;
  }
  input.beginFrame(); // snapshot keys for next frame's pressed() checks
}

function updatePlaying(dt) {
  game.clockMinutes += dt * CONFIG.day.minutesPerSecond;
  let inCar = !!player.inCar; // refreshed after the E handling below

  // pause
  if (input.pressed('KeyP') || input.pressed('Escape')) {
    game.state = 'paused';
    hud.showPause(`Cash $${game.cash}  ·  Mission ${Math.min(game.missionIndex + 1, 5)} of 5 — ${missions.current ? missions.current.title : 'story complete'}  ·  Wanted ${police.stars}★`);
    return;
  }
  if (input.pressed('KeyM')) { const m = audio.toggleMute(); hud.toast(m ? 'Sound off' : 'Sound on', 1.5); }
  if (input.pressed('KeyR')) {
    const s = audio.cycleStation();
    hud.setRadio(RADIO_STATIONS[s].name);
    hud.toast(`Radio: ${RADIO_STATIONS[s].name}`, 2);
  }
  if (input.pressed('KeyC')) {
    player.camDist = player.camDist > 8 ? 5.5 : (player.camDist > 6 ? 11 : 7.5);
  }
  if (input.pressed('KeyQ') && !inCar) {
    player.armed = !player.armed;
    hud.toast(player.armed ? 'Pistol out — click to shoot' : 'Fists out', 1.5);
  }

  // enter / exit car (handled before inCar is read, so exiting on this
  // frame never leaves a stale car reference behind for the drive branch)
  if (input.pressed('KeyE')) {
    if (player.inCar) exitCar();
    else {
      const car = nearestEnterableCar();
      if (car) game.enterCar(car, false);
      else hud.toast('No car close enough — get nearer to a parked car.', 1.8);
    }
  }
  const inCarNow = !!player.inCar;
  inCar = inCarNow;

  if (inCar) {
    const car = player.inCar;
    if (!car) return; // defensive: never drive a car that just vanished
    const driveInput = {
      forward: input.down('KeyW') || input.down('ArrowUp'),
      back: input.down('KeyS') || input.down('ArrowDown'),
      left: input.down('KeyA') || input.down('ArrowLeft'),
      right: input.down('KeyD') || input.down('ArrowRight'),
    };
    const hit = car.drive(driveInput, dt, colliders, half);
    if (hit && Math.abs(car.speed) > 10) { audio.sfx('crash'); game.damageFlash = 0.5; }
    player.updateCarCamera(car, input, dt, camera);
    audio.setEngine(Math.abs(car.speed) / CONFIG.car.maxSpeed, true);
    // running over pedestrians in the car
    for (const ped of peds.peds) {
      if (ped.state === 'down') continue;
      const d = ped.pos.distanceTo(car.pos);
      if (d < 1.9 && Math.abs(car.speed) > 5) {
        peds.knockDown(ped);
        addCrime(1, 'You ran someone over!');
        audio.sfx('crash');
      }
    }
    // ramming traffic
    for (const other of traffic.cars) {
      if (other.dead || other === car) continue;
      const d = other.pos.distanceTo(car.pos);
      if (d < 3.4) {
        const impact = Math.abs(car.speed - other.speed);
        if (impact > 6) {
          other.damage(impact * 1.4);
          car.damage(impact * 0.5);
          car.speed *= 0.55;
          audio.sfx('crash');
          if (police.seenByPolice(car.pos, 45)) addCrime(1, 'Bay PD saw the crash!');
        }
      }
    }
    // ramming police cars damages both
    for (const pc of police.cars) {
      if (pc.dead) continue;
      const d = pc.pos.distanceTo(car.pos);
      if (d < 3.4 && Math.abs(car.speed) > 4) { pc.damage(8); car.damage(4); car.speed *= 0.6; audio.sfx('crash'); }
    }
    if (car.dead) {
      hud.banner('CAR WRECKED', 'That ride is done. Find another one.', 3);
      audio.sfx('crash');
      exitCar();
      // leave the wreck where it is, smoking
      car.mesh.visible = true;
      scene.remove(car.mesh);
      const idx = traffic.cars.indexOf(car);
      if (idx >= 0) traffic.cars.splice(idx, 1);
    }
  } else {
    player.update(input, dt, colliders, half, camera);
    audio.setEngine(0, false);
    // fists
    if (input.pressed('KeyF')) {
      if (combat.punch(player, peds, police, onPedHit)) audio.sfx('punch');
    }
    // pistol
    if (player.armed && input.consumeClick()) {
      if (player.ammo > 0) {
        if (combat.shoot(player, camera, peds, police, traffic.cars, onShotCrime, onPedHit)) audio.sfx('shot');
      } else {
        hud.toast('Out of ammo — find a new piece (pick up ammo at the gun shop marker).', 2.5);
      }
    }
    // health regen when calm, slow
    if (police.stars === 0 && player.health > 0 && player.health < CONFIG.player.maxHealth) {
      player.heal(dt * 1.5);
    }
    if (player.dead) { endRun('wasted'); return; }
  }

  traffic.update(dt, player.pos, player.inCar);
  peds.update(dt, player.pos, player.speed2d, combat.flashTimer > 0 ? player.pos : null, [...traffic.cars, ...police.cars]);
  police.update(dt, game.time, player, player.inCar, () => endRun('busted'));
  combat.update(dt);
  missions.update(dt, { player, police });

  // car damage smoke + wrecked traffic removal
  for (const c of [...traffic.cars]) {
    if (c.dead) {
      scene.remove(c.mesh);
      traffic.cars.splice(traffic.cars.indexOf(c), 1);
      traffic.spawnCar(false);
    }
  }

  // HUD
  hud.setCash(game.cash);
  hud.setHealth(player.health, player.armor);
  hud.setStars(police.stars);
  hud.setClock(game.clockMinutes);
  hud.setObjective(missions.hudInfo(player.pos, inCar ? player.inCar.pos : null));
  hud.setSpeed(inCar ? player.inCar.speed * 2.237 : 0, inCar ? player.inCar.name : '', inCar);
  hud.setCrosshair(player.armed && !inCar);
  hud.setHint(inCar
    ? 'W/S drive · A/D steer · E exit car · C camera · R radio'
    : (player.armed ? 'Click shoot · F punch · Q holster · E enter car' : 'WASD move · Shift sprint · Space jump · E enter car · Q draw pistol'));
  const lowHealth = player.health < 30 ? (0.35 + Math.sin(game.time * 6) * 0.12) : 0;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 1.6);
  hud.setDamage(Math.max(lowHealth, game.damageFlash));
  hud.drawMinimap({
    half, centers, lines,
    player: { x: inCar ? player.inCar.pos.x : player.pos.x, z: inCar ? player.inCar.pos.z : player.pos.z, heading: inCar ? player.inCar.heading : player.heading },
    beacon: missions.markerMesh.visible ? missions.markerMesh.position : null,
    trafficCars: [...traffic.cars, ...police.cars],
  });
  if (player.health < game.lastHealth) game.damageFlash = 0.55;
  game.lastHealth = player.health;

  window.__state = {
    state: game.state, cash: game.cash, health: player.health,
    stars: police.stars, mission: missions.index, objective: missions.objIndex,
    inCar: !!player.inCar, pos: [player.pos.x, player.pos.z],
    ammo: player.ammo, time: game.time,
  };
}

// ---- boot ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot === 'start') {
  game.state = 'title';
  hud.showStart(game.missionIndex, game.cash);
} else if (shot) {
  startGame(true);
  applyShot(game, shot);
} else {
  game.state = 'title';
  hud.showStart(game.missionIndex, game.cash);
}

window.__game = game;
window.__player = player;
window.__police = police;
window.__missions = missions;
window.__spots = spots;
window.__input = input;
animate();
