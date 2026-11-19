// Cayo Verde itself: a procedural sun-soaked coastal city on a road grid, with a
// beach and ocean to the west, a pier, landmarks, palms and parks. Exports the
// colliders and landmark spots the rest of the game stands on.
import * as THREE from 'three';

export const CITY = {
  half: 200,          // city extends -200..200 on x and z
  roadStep: 40,       // streets every 40 units
  roadHalf: 5,        // half width of a street
  beachX: -180,       // sand starts here, ocean further west
  waterX: -205,
};

const STREET_LINES = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
const BLOCK_CENTRES = [-180, -140, -100, -60, -20, 20, 60, 100, 140, 180];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function facadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = '#2c3e50';
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if ((row * 4 + col) % 5 === 0) ctx.fillStyle = '#ffd98a';
      else ctx.fillStyle = '#31465c';
      ctx.fillRect(12 + col * 28, 14 + row * 24, 18, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#565c66';
  ctx.fillRect(0, 0, 4, 64); ctx.fillRect(60, 0, 4, 64);
  ctx.fillStyle = '#f5d76e';
  ctx.fillRect(30, 6, 4, 22); ctx.fillRect(30, 38, 4, 22);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rand = mulberry(20261119);
  const group = new THREE.Group();
  const colliders = [];
  const buildings = [];
  const facade = facadeTexture();
  const roadTex = roadTexture();

  // Land: warm grass-green base, sand strip and ocean to the west.
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(440, 440),
    new THREE.MeshLambertMaterial({ color: 0x8fbf6a }),
  );
  land.rotation.x = -Math.PI / 2; land.position.set(0, -0.05, 0);
  land.receiveShadow = true;
  group.add(land);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 440),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(-192, 0, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 440),
    new THREE.MeshLambertMaterial({ color: 0x2e86c1, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2; water.position.set(-268, 0.05, 0);
  group.add(water);

  // Streets: asphalt strips with a dashed centre line, one texture repeated.
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const line of STREET_LINES) {
    for (const horizontal of [false, true]) {
      const strip = new THREE.Mesh(
        horizontal ? new THREE.PlaneGeometry(CITY.roadHalf * 2, 400) : new THREE.PlaneGeometry(400, CITY.roadHalf * 2),
        roadMat.clone(),
      );
      strip.material.map = roadTex.clone();
      strip.material.map.repeat.set(50, 1);
      strip.material.map.needsUpdate = true;
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(horizontal ? line : 0, 0.02, horizontal ? 0 : line);
      strip.receiveShadow = true;
      group.add(strip);
    }
  }

  const palette = [0xf2e3c6, 0xffd9a0, 0x9fd8e8, 0xf7a8a8, 0xc9b8e8, 0xa8e6b0, 0xffffff, 0xe8b48a];
  function addBuilding(x, z, w, d, h, color, name) {
    const mat = new THREE.MeshLambertMaterial({ map: facade, color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.landmark = name || '';
    group.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.4, 1.6, d * 0.4),
      new THREE.MeshLambertMaterial({ color: 0x5a5f66 }),
    );
    roof.position.set(x, h + 0.8, z);
    group.add(roof);
    colliders.push({ x, z, hx: w / 2, hz: d / 2 });
    buildings.push({ x, z, w, d, h, name: name || '' });
    return mesh;
  }

  // City blocks: 1-3 buildings per block, parks left open, beach blocks skipped.
  const parkBlocks = new Set(['100,100', '140,-140', '-100,-100']);
  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      if (bx <= -180) continue; // beachfront row stays open for the boardwalk
      if (parkBlocks.has(`${bx},${bz}`)) continue;
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i += 1) {
        // Keep every building inside its block: the streets stay clear.
        const ox = (rand() - 0.5) * 10;
        const oz = (rand() - 0.5) * 10;
        const w = 9 + rand() * 7;
        const d = 9 + rand() * 7;
        const h = 7 + rand() * rand() * 30;
        addBuilding(bx + ox, bz + oz, w, d, h, palette[Math.floor(rand() * palette.length)]);
      }
    }
  }

  // Landmarks — the places the story points at, each named and findable.
  addBuilding(60, -60, 26, 26, 52, 0x9fd8e8, 'Coral Bank tower');
  addBuilding(20, -140, 30, 18, 9, 0xf2e3c6, 'Verde Garage');
  addBuilding(-20, 20, 16, 12, 8, 0xffd9a0, 'Cafe Carmen');
  addBuilding(100, -100, 22, 22, 14, 0xf7a8a8, 'Mercado Verde');
  addBuilding(-60, 140, 18, 14, 10, 0xc9b8e8, 'Lena hideout');
  addBuilding(-140, -140, 24, 16, 8, 0xa8e6b0, 'Fish docks warehouse');
  addBuilding(140, -140, 44, 30, 12, 0xffffff, 'Verde Arena');
  addBuilding(180, 180, 20, 20, 38, 0x9fd8e8, 'Solmar Hotel');
  addBuilding(-140, 140, 16, 16, 30, 0xffd9a0, 'Lighthouse flats');

  // Parks: grass mounds, palms and benches where the blocks were left open.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  function addPalm(x, z, scale = 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.4 * scale, 6 * scale, 6), trunkMat);
    trunk.position.set(x, 3 * scale, z);
    trunk.castShadow = true;
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6 * scale, 3.2 * scale, 7), leafMat);
    top.position.set(x, 7 * scale, z);
    top.castShadow = true;
    group.add(top);
  }
  function addPark(cx, cz) {
    for (let i = 0; i < 7; i += 1) addPalm(cx + (rand() - 0.5) * 26, cz + (rand() - 0.5) * 26, 0.8 + rand() * 0.5);
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(6, 20),
      new THREE.MeshLambertMaterial({ color: 0x4aa3c7 }),
    );
    pond.rotation.x = -Math.PI / 2; pond.position.set(cx + 6, 0.03, cz - 6);
    group.add(pond);
  }
  addPark(100, 100); addPark(140, -140); addPark(-100, -100);
  // Boardwalk palms along the beach.
  for (let z = -180; z <= 180; z += 24) addPalm(-178, z, 1.1);
  for (let x = -160; x <= 160; x += 48) addPalm(x + 8, -172, 0.9);

  // The pier: wooden boards running out over the water, with lamps.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9c6b3f });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(52, 1, 10), pierMat);
  pier.position.set(-206, 1.2, 40);
  pier.castShadow = true; pier.receiveShadow = true;
  group.add(pier);
  // No collider: the pier deck sits above the sand and the mission stop is beside it.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc94d });
  for (let i = 0; i < 5; i += 1) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), lampMat);
    lamp.position.set(-188 - i * 9, 3.4, 40 + (i % 2 === 0 ? 4 : -4));
    group.add(lamp);
  }

  // Lighthouse on the water's edge, north end of the beach.
  const light = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.2, 22, 10),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  light.position.set(-196, 11, -170);
  light.castShadow = true;
  group.add(light);
  const lightTop = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 10), lampMat);
  lightTop.position.set(-196, 23, -170);
  group.add(lightTop);
  colliders.push({ x: -196, z: -170, hx: 3, hz: 3 });

  scene.add(group);
  return {
    group, colliders, buildings,
    landmarks: {
      cafe: { x: -20, z: 20 },
      garage: { x: 20, z: -140 },
      bank: { x: 60, z: -60 },
      market: { x: 100, z: -100 },
      hideout: { x: -60, z: 140 },
      docks: { x: -140, z: -140 },
      pier: { x: -186, z: 40 },
      pierEnd: { x: -228, z: 40 },
      arena: { x: 140, z: -140 },
    },
    streetLines: STREET_LINES,
  };
}

// Push a circle (x,z,r) out of every building collider it overlaps.
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 0.0001) { pos.x = c.x + c.hx + radius; continue; }
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    }
  }
}

export function clampToCity(pos, half = CITY.half) {
  pos.x = Math.max(-half + 2, Math.min(half - 2, pos.x));
  pos.z = Math.max(-half + 2, Math.min(half - 2, pos.z));
}
