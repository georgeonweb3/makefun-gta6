[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/georgeonweb3/makefun-gta6/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/georgeonweb3/makefun-gta6/reward.svg)](https://make.fun/c/gta6-01)

# Solmar Bay — an open-world crime game

A playable open-world crime game in the spirit of GTA 6, built for the
[make.fun GTA 6 bounty](https://make.fun/c/gta6-01). Everything is original:
an invented sun-soaked coastal city, invented characters, invented story —
no Rockstar names, art, music or map.

**You are Marcus Vale**, back in Solmar Bay with $250 and a debt to Eddie
Cross. Steal cars, outrun Bay PD, run Eddie's five story missions and buy
your way out — or get busted trying.

## What is in the game

- **A city to explore** — 7×7 blocks of procedural Solmar Bay: downtown towers,
  a central plaza with a fountain, Sunset Diner, Eddie's Auto, Bay PD HQ,
  Solmar General hospital, the Palm Court beachfront hotel, a marina, a pier
  and a lighthouse, plus a beach and ocean.
- **On foot and by car** — third-person on-foot play (sprint, jump, punch,
  pistol) and arcade driving with steering, drift, damage and wrecks. Press
  `E` to jack a parked car or a slow taxi.
- **Traffic and pedestrians** — 12 AI cars looping the road grid and 18 locals
  strolling the sidewalks who flee from gunfire and speeding cars.
- **Wanted level and police** — 0–5 stars. Crime draws patrol cars that chase
  and ram, and foot cops that run you down and bust you. Lay low and the heat
  fades; get caught and you pay a fine at the hospital.
- **Missions and a story** — five jobs from Eddie Cross (First Wheels, Courier
  Rush, Hot Wheels, The Long Way Home, The Big Score) with beacons, objectives,
  cash payouts and a story-complete ending. Progress saves automatically.
- **HUD with a minimap** — cash, health/armor, wanted stars, clock, objective
  tracker, speedometer, radio station, and a live round minimap with the
  mission beacon, traffic and police blips.
- **Feel and polish** — synthesized WebAudio sound (engine hum, sirens,
  gunshots, three radio stations), day clock, damage vignette, start/pause/
  busted/wasted screens, camera orbit on the title screen.

## Play it

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
node serve.ts
# → http://localhost:8080
```

No build step, no network: every script, texture and sound is generated or
vendored under `game/` (three.js r160 as `game/vendor/three.module.min.js`).

**Controls:** `W A S D` move/drive · mouse look · `Shift` sprint ·
`Space` jump · `E` enter/exit car · `F` punch · `Q` draw pistol · click shoot ·
`R` radio · `C` camera · `P` pause · `M` mute.

## Layout

- `game/index.html` — page, HUD, menus
- `game/src/main.js` — boot, game loop, state machine, car jacking, busted/wasted
- `game/src/city.js` — procedural city, landmarks, colliders
- `game/src/cars.js` — car factory, driving physics, traffic AI
- `game/src/player.js` — on-foot controller, character, camera
- `game/src/pedestrians.js` — pedestrian AI
- `game/src/police.js` — wanted system, patrol cars, foot cops
- `game/src/missions.js` — the five-job story chain
- `game/src/combat.js` — fists, pistol, tracers
- `game/src/hud.js` — HUD, minimap, screens
- `game/src/audio.js` — synthesized sound and radio
- `game/src/textures.js` — canvas-generated facades, signs, roads
- `game/src/config.js` — tuning and mission data
- `game/src/shots.js` — `?shot=` staging for screenshots
- `main.ts` — the make.fun entrypoint (copies `game/` + `screenshots/`, writes the dossier)

Screenshots in `screenshots/` are real renders of the game running in a browser.

## License

MIT — see [LICENSE](LICENSE).
