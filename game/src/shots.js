// Screenshot scenes for Cayo Verde: each one plays the real game forward from a
// staged position, so every screenshot is a genuine render of live gameplay.
export function stageShot(name, G) {
  const p = G.player;
  if (name === 'start') {
    // Title screen over the city; the orbit camera does the rest.
    return;
  }
  G.startGame(false);
  if (name === 'drive') {
    const car = G.parkedCars[1];
    p.x = car.x; p.z = car.z;
    window.__debug.giveCar(car);
    car.x = 0; car.z = -60; car.heading = 0; car.speed = 14;
    G.setCam(Math.PI, 0.3, 11);
    return;
  }
  if (name === 'chase') {
    const car = G.parkedCars[1];
    p.x = car.x; p.z = car.z;
    window.__debug.giveCar(car);
    car.x = 0; car.z = -40; car.heading = 0; car.speed = 13;
    G.setCam(Math.PI, 0.3, 12);
    window.__debug.setWanted(3);
    window.__debug.startMission(3);
    G.missions.stage = 1;
    // Three patrol cars closing in behind the player.
    for (let i = 0; i < 3; i += 1) {
      const patrol = G.police._spawnPatrol(p.x, p.z);
      patrol.x = -6 + i * 6;
      patrol.z = p.z - 18 - i * 6;
      patrol.heading = 0;
      patrol.speed = 16;
    }
    return;
  }
  if (name === 'mission') {
    window.__debug.startMission(1);
    p.x = -156; p.z = 34;
    p.heading = -Math.PI / 2;
    G.setCam(Math.PI / 2, 0.28, 9);
    G.hud.showToast('Mission 2 — steal the yellow car at the pier.', 5);
    return;
  }
  // Any other name: plain start of the story on foot.
}
