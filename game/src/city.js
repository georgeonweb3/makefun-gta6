// Solmar Bay itself: a 7x7-block sun-soaked coastal city built from boxes,
// canvas textures and palm trees. Everything here is original — invented street
// names, invented businesses, invented skyline.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeFacadeTexture, makeRoofTexture, makeRoadTexture, makePavementTexture, makeSandTexture, makeSignTexture, makeBillboardTexture, facadePalette } from './textures.js';
import { range, rangeInt, pick, chance } from './rng.js';

const P = () => CONFIG.blockSize + CONFIG.roadWidth; // 76 m pitch

export function roadCoords() {
  const half = CONFIG.cityHalf;
  const lines = [];
  for (let i = 0; i <= CONFIG.blocks; i++) lines.push(-half + i * P());
  return lines;
}

function blockCenters() {
  const lines = roadCoords();
  const centers = [];
  for (let i = 0; i < CONFIG.blocks; i++) centers.push((lines[i] + lines[i + 1]) / 2);
  return centers;
}

export function buildCity(scene, rng, opts = {}) {
  const bare = !!opts.bare; // test mode: skip palms, lamps and clouds for speed
  const colliders = [];
  const spots = {};
  const lines = roadCoords();
  const centers = blockCenters();
  const half = CONFIG.cityHalf;
  const worldHalf = CONFIG.worldHalf;

  // ----- sky, sun, light -----
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fd0e8, 220, 900);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }),
  );
  sunBall.position.set(320, 240, -420);
  scene.add(sunBall);

  // clouds: flat white puffs drifting far above the city
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  const clouds = [];
  if (!bare) for (let i = 0; i < 14; i++) {
    const grp = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 9, 18), 10, 8), cloudMat);
      s.position.set(j * 14 - n * 6, range(rng, -2, 2), range(rng, -4, 4));
      s.scale.y = 0.45;
      grp.add(s);
    }
    grp.position.set(range(rng, -420, 420), range(rng, 130, 190), range(rng, -420, 420));
    scene.add(grp);
    clouds.push(grp);
  }

  // ----- ground: asphalt base, block slabs, beach, ocean -----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldHalf * 2 + 400, worldHalf * 2 + 400),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadTex = makeRoadTexture();
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
  for (const c of lines) {
    for (const [w, l, x, z] of [
      [CONFIG.roadWidth, half * 2, c, 0],
      [half * 2, CONFIG.roadWidth, 0, c],
    ]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat.clone());
      strip.material.map = roadTex.clone();
      strip.material.map.repeat.set(w / 12, l / 12);
      strip.material.map.needsUpdate = true;
      strip.rotation.x = -Math.PI / 2;
      strip.rotation.z = w < l ? 0 : 0;
      strip.position.set(x, 0.01, z);
      strip.receiveShadow = true;
      scene.add(strip);
    }
  }

  // beach (south, z > cityHalf) and ocean beyond it
  const sandTex = makeSandTexture();
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(24, 4);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(worldHalf * 2 + 400, 70),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, half + 35);
  sand.receiveShadow = true;
  scene.add(sand);
  const oceanMat = new THREE.MeshStandardMaterial({ color: 0x1d7fb8, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(worldHalf * 2 + 600, 500), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, half + 70 + 250);
  scene.add(ocean);

  // ----- blocks: slabs + buildings -----
  const pavementTex = makePavementTexture();
  pavementTex.wrapS = pavementTex.wrapT = THREE.RepeatWrapping;
  const slabMat = new THREE.MeshStandardMaterial({ map: pavementTex, roughness: 0.95 });
  const roofTex = makeRoofTexture(rng);
  const plazaBlock = { bx: 3, bz: 3 }; // city centre becomes the plaza
  // Blocks reserved for named landmarks (no random buildings there — the
  // landmark owns the whole block, so nothing ever overlaps it).
  const landmarkBlocks = new Set(['3,5', '1,2', '4,2', '5,3', '2,6']);

  const buildingGeoms = {};
  function box(w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  for (let bi = 0; bi < CONFIG.blocks; bi++) {
    for (let bj = 0; bj < CONFIG.blocks; bj++) {
      const cx = centers[bi], cz = centers[bj];
      const slab = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.blockSize, 0.3, CONFIG.blockSize), slabMat);
      slab.position.set(cx, 0.1, cz);
      slab.receiveShadow = true;
      scene.add(slab);
      if (bi === plazaBlock.bx && bj === plazaBlock.bz) { buildPlaza(scene, cx, cz, colliders, rng); continue; }
      if (landmarkBlocks.has(`${bi},${bj}`)) continue; // landmark owns this block
      const distC = Math.hypot(cx, cz) / half; // 0 centre .. 1 edge
      const nB = chance(rng, 0.3) ? 1 : (chance(rng, 0.55) ? 2 : 4);
      for (let k = 0; k < nB; k++) {
        const w = nB === 1 ? range(rng, 34, 44) : range(rng, 16, 26);
        const d = nB === 1 ? range(rng, 30, 40) : range(rng, 16, 26);
        const tall = range(rng, 0, 1) < (0.55 - distC * 0.35);
        const h = tall ? range(rng, 26, 52) : range(rng, 8, 20);
        const ox = nB === 1 ? 0 : (k % 2 === 0 ? -1 : 1) * (CONFIG.blockSize / 4 - w / 2 - 2);
        const oz = nB === 1 ? 0 : (k < 2 ? -1 : 1) * (CONFIG.blockSize / 4 - d / 2 - 2);
        const x = cx + ox, z = cz + oz;
        const palette = facadePalette(rng);
        const floors = Math.max(2, Math.round(h / 7));
        const facade = makeFacadeTexture(rng, palette, floors, h < 24 && chance(rng, 0.7));
        const mats = [
          new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ map: roofTex, roughness: 1 }),
          new THREE.MeshStandardMaterial({ map: roofTex, roughness: 1 }),
          new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }),
        ];
        const b = box(w, h, d, mats);
        b.position.set(x, h / 2 + 0.2, z);
        scene.add(b);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        if (tall && chance(rng, 0.4)) { // rooftop AC box
          const ac = box(4, 2, 3, new THREE.MeshStandardMaterial({ color: 0x6b7c8a, roughness: 0.8 }));
          ac.position.set(x + range(rng, -w / 4, w / 4), h + 1.2, z + range(rng, -d / 4, d / 4));
          scene.add(ac);
        }
      }
    }
  }

  // ----- landmarks (named, signed, distinct) -----
  function landmark(x, z, w, h, d, signText, signSub, bg, fg, rotY = 0) {
    const palette = facadePalette(rng);
    const facade = makeFacadeTexture(rng, palette, Math.max(2, Math.round(h / 7)), true);
    const mats = Array(6).fill(new THREE.MeshStandardMaterial({ map: facade, roughness: 0.9 }));
    const b = box(w, h, d, mats);
    b.position.set(x, h / 2 + 0.2, z);
    b.rotation.y = rotY;
    scene.add(b);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.92, w * 0.23),
      new THREE.MeshBasicMaterial({ map: makeSignTexture(signText, signSub, bg, fg) }),
    );
    sign.position.set(x, h - 1.2, z + d / 2 + 0.15);
    scene.add(sign);
    return b;
  }
  // Eddie's Auto — garage, block (3,5) centre; approach from its south side
  landmark(centers[3], centers[5], 30, 12, 22, "EDDIE'S AUTO", 'REPAIRS · 24 HRS', '#20262e', '#ffd94a');
  spots.garage = new THREE.Vector3(centers[3], 0, centers[5] + 18);
  // Sunset Diner — block (1,2) centre; mission 1 car parked in its lot, east side
  landmark(centers[1], centers[2], 26, 10, 20, 'SUNSET DINER', 'EAT · DRINK · 24 HRS', '#7a2e2e', '#ffe9a8');
  spots.dinerCar = new THREE.Vector3(centers[1] + 18, 0, centers[2] + 10);
  // Bay PD — police station, block (4,2) centre
  landmark(centers[4], centers[2], 30, 16, 22, 'BAY PD', 'SOLMAR BAY POLICE', '#1d3a5f', '#ffffff');
  spots.policeStation = new THREE.Vector3(centers[4], 0, centers[2] + 18);
  // Solmar General hospital — block (5,3) centre
  landmark(centers[5], centers[3], 34, 22, 24, 'SOLMAR GENERAL', 'HOSPITAL', '#e8ecef', '#c0392b');
  spots.hospital = new THREE.Vector3(centers[5], 0, centers[3] + 18);
  // Palm Court Hotel — beachfront tower, block (2,6) centre
  landmark(centers[2], centers[6], 26, 46, 22, 'PALM COURT', 'HOTEL · BEACHFRONT', '#2e6b62', '#ffe9a8');
  spots.hotel = new THREE.Vector3(centers[2], 0, centers[6] + 18);

  // billboards on two arterial roads
  function billboard(x, z, rotY, lines3) {
    const tex = makeBillboardTexture(rng, lines3, '#14324a', '#ffd94a');
    const board = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(x, 11, z);
    board.rotation.y = rotY;
    scene.add(board);
    const post1 = box(0.8, 8, 0.8, new THREE.MeshStandardMaterial({ color: 0x555555 }));
    post1.position.set(x - 6, 4, z); scene.add(post1);
    const post2 = post1.clone(); post2.position.x = x + 6; scene.add(post2);
  }
  billboard(lines[3], centers[1] - 8, 0, ['SOLMAR BAY', 'LIVE THE SUNSET', 'visit-solmar.example']);
  billboard(centers[5] + 8, lines[4], Math.PI / 2, ['PALM COURT', 'ROOMS FROM $89', 'beachfront · marina']);

  // ----- palms, lamps, benches -----
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.9, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 6 * s, 7), trunkMat);
    trunk.position.y = 3 * s; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * s, 0.55 * s), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.1 * s, 6.1 * s, Math.sin(a) * 1.1 * s);
      // YXZ order: tilt first (droop), then spin around the trunk — radial crown
      frond.rotation.set(-0.95, -a, 0, 'YXZ');
      g.add(frond);
    }
    const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2a }));
    nuts.position.y = 5.8 * s; g.add(nuts);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (const c of lines) {
    for (let t = -half + 20; t < half; t += 46) {
      if (bare) break;
      if (chance(rng, 0.75)) palm(c + 8.5, t + range(rng, -6, 6), range(rng, 0.85, 1.15));
      if (chance(rng, 0.5)) palm(t + range(rng, -6, 6), c + 8.5, range(rng, 0.85, 1.15));
    }
    if (bare) break;
  }
  if (!bare) for (let t = -half; t < half; t += 26) palm(range(rng, -8, 8) + t * 0.9, half + 22 + range(rng, -4, 10), range(rng, 1, 1.3));

  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2c343c, roughness: 0.6, metalness: 0.5 });
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  if (!bare) for (const c of lines) {
    for (let t = -half + 38; t < half; t += 76) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lampMat);
      pole.position.set(c - 6.5, 3.5, t);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampGlow);
      head.position.set(c - 6.5, 7.1, t);
      scene.add(head);
    }
  }

  // ----- pier into the ocean + lighthouse point -----
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const plank = box(6, 0.4, 4, pierMat);
    plank.position.set(centers[5], 0.6, half + 70 + i * 4.4);
    scene.add(plank);
  }
  spots.yacht = new THREE.Vector3(centers[5] + 4, 0, half + 96);
  spots.lighthouse = new THREE.Vector3(-half + 26, 0, half + 30);
  const lh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 10), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8 }));
  lh.position.set(spots.lighthouse.x, 11, spots.lighthouse.z);
  lh.castShadow = true;
  scene.add(lh);
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3, 10), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
  lhTop.position.set(spots.lighthouse.x, 23.5, spots.lighthouse.z);
  scene.add(lhTop);
  colliders.push({ minX: spots.lighthouse.x - 3, maxX: spots.lighthouse.x + 3, minZ: spots.lighthouse.z - 3, maxZ: spots.lighthouse.z + 3 });

  // ----- mission spots on the road network -----
  spots.plaza = new THREE.Vector3(centers[3], 0, centers[3]);
  spots.parcel1 = spots.plaza.clone();
  spots.parcel2 = new THREE.Vector3(centers[5], 0, half + 18); // marina
  spots.parcel3 = new THREE.Vector3(lines[2], 0, centers[1]); // market corner
  spots.docks = new THREE.Vector3(lines[7], 0, centers[4]);
  spots.beachCar = new THREE.Vector3(centers[1], 0, lines[7]); // parked on the beachfront road, not the sand
  spots.checkpoint = new THREE.Vector3(lines[4], 0, -half + 14);
  spots.launch = new THREE.Vector3(lines[7], 0, centers[0]);
  spots.spawn = new THREE.Vector3(lines[3] + 4, 0, centers[4]);

  return { colliders, spots, lines, centers, half, worldHalf, clouds, oceanMat, sun };
}

function buildPlaza(scene, cx, cz, colliders, rng) {
  // central plaza: fountain, benches, open paving
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 10, 1.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x9aa8ad, roughness: 0.7 }),
  );
  basin.position.set(cx, 0.8, cz);
  basin.castShadow = true; basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(8.2, 8.2, 0.4, 20),
    new THREE.MeshStandardMaterial({ color: 0x3fa8d8, roughness: 0.15, transparent: true, opacity: 0.85 }),
  );
  water.position.set(cx, 1.3, cz);
  scene.add(water);
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.4, 3.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7 }),
  );
  jet.position.set(cx, 3, cz);
  scene.add(jet);
  colliders.push({ minX: cx - 10, maxX: cx + 10, minZ: cz - 10, maxZ: cz + 10 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 1), benchMat);
    bench.position.set(cx + Math.cos(a) * 15, 0.6, cz + Math.sin(a) * 15);
    bench.rotation.y = -a + Math.PI / 2;
    bench.castShadow = true;
    scene.add(bench);
  }
}

// Circle-vs-AABB test shared by player, cars and peds.
export function collidesAt(colliders, x, z, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    if (dx * dx + dz * dz < r * r) return c;
  }
  return null;
}

export function clampToCity(x, z, half) {
  return {
    x: Math.max(-half - 30, Math.min(half + 30, x)),
    z: Math.max(-half - 30, Math.min(half + 62, z)),
  };
}
