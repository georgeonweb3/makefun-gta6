// Screenshot staging: ?shot=<name>&seed=<n> puts the game into a fixed,
// readable state for the maker's screenshots — the same trick the kit's
// starter uses (shots.json). These are real renders of the live game, only
// the starting conditions are chosen: where Marcus stands, what he drives,
// how hot the heat is, and which mission is showing.
export const SHOT_MODES = {
  start: 'title screen over the city at dawn patrol',
  drive: 'Marcus driving a sedan through downtown traffic',
  chase: 'a 3-star police chase with the minimap and HUD live',
  mission: 'on foot at the plaza, mission beacon lit, peds and traffic around',
};

export function parseShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  const seed = Number(q.get('seed') || 7);
  return { shot: SHOT_MODES[shot] ? shot : null, seed: Number.isFinite(seed) ? seed : 7 };
}

// After the world boots, move the game into the staged state for a shot.
export function applyShot(game, shot) {
  if (!shot) return;
  const { player, missions, police, traffic, cars } = game;
  if (shot === 'start') {
    // title screen: camera high over the plaza, no HUD yet
    game.stageCamera = 'title';
    return;
  }
  if (shot === 'drive') {
    const car = cars.parked[0] || traffic.cars[0];
    if (car) game.enterCar(car, true);
    player.camYaw = player.inCar ? player.inCar.heading : player.camYaw;
    return;
  }
  if (shot === 'chase') {
    const car = cars.parked[1] || cars.parked[0];
    if (car) game.enterCar(car, true);
    police.setStars(3, game.time);
    missions.start(2); // HOT WHEELS: evade leg shows the objective line
    missions.objIndex = 2;
    missions.showMarker();
    return;
  }
  if (shot === 'mission') {
    player.pos.set(game.spots.plaza.x + 6, 0, game.spots.plaza.z + 10);
    player.heading = Math.PI * 0.9;
    player.camYaw = Math.PI * 0.9;
    missions.start(1); // COURIER RUSH: parcel pickup at the plaza
    return;
  }
}
