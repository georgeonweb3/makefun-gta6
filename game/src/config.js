// Solmar Bay — central tuning and world constants. One place for every number
// a designer would want to tweak: city size, speeds, wanted rules, economy.
export const CONFIG = {
  seed: 7,
  // City grid: BLOCKS x BLOCKS blocks, each BLOCK metres wide, ROAD metres of road between.
  blocks: 7,
  blockSize: 64,
  roadWidth: 12,
  // Derived world half-extent (metres from centre to the beach edge).
  get worldHalf() { return (this.blocks * (this.blockSize + this.roadWidth)) / 2 + 40; },
  get cityHalf() { return (this.blocks * (this.blockSize + this.roadWidth)) / 2; },

  player: {
    walkSpeed: 6.5,
    sprintSpeed: 11,
    accel: 42,
    jumpSpeed: 8.5,
    gravity: 24,
    radius: 0.55,
    maxHealth: 100,
    punchDamage: 12,
    punchRange: 2.1,
    pistolDamage: 34,
    pistolRange: 60,
    pistolAmmoStart: 24,
  },
  car: {
    accel: 26,
    brake: 42,
    reverseAccel: 14,
    maxSpeed: 42,          // ~94 mph feel
    maxReverse: 12,
    steer: 1.9,
    grip: 6.5,
    maxHealth: 100,
    enterRange: 3.4,
  },
  traffic: { count: 12, speed: 9, minGap: 9 },
  pedestrians: { count: 18, walkSpeed: 1.6, fleeSpeed: 4.2 },
  police: {
    maxStars: 5,
    decaySeconds: 26,      // no crime for this long -> lose one star
    carsPerStar: 1,
    footCopsFromStar: 2,
    ramDamage: 6,
    bustHoldSeconds: 2.2,  // cop touching you this long -> busted
    bustRadius: 1.9,
    spawnDistance: 55,
    despawnDistance: 130,
    chaseSpeed: 30,
  },
  economy: { startCash: 250, bustFine: 120, wastedFine: 150 },
  day: { startMinutes: 9 * 60 + 41, minutesPerSecond: 0.55 },
};

// Mission chain: Eddie Cross's jobs. Each mission is a list of objectives.
// type: goto | enterCar | stealCar | collect | deliver | evade | reach
// A mission pays cash on completion and unlocks the next one.
export const MISSIONS = [
  {
    id: 'm1', title: 'FIRST WHEELS', pay: 150,
    brief: 'Eddie Cross needs a driver. There is a grey sedan parked outside the diner — take it and bring it to Eddie\'s garage.',
    objectives: [
      { type: 'goto', label: 'Get to the grey sedan outside the diner', at: 'dinerCar' },
      { type: 'enterCar', label: 'Get in the sedan (E)', car: 'missionCar' },
      { type: 'goto', label: 'Drive to Eddie\'s Auto on Coral Row', at: 'garage', inCar: true },
    ],
  },
  {
    id: 'm2', title: 'COURIER RUSH', pay: 300,
    brief: 'Three parcels, three drop-offs, one clock. Eddie\'s clients pay for speed — the docks pay for silence.',
    objectives: [
      { type: 'collect', label: 'Pick up parcel 1 of 3 at the plaza', at: 'parcel1', count: 1 },
      { type: 'collect', label: 'Pick up parcel 2 of 3 at the marina', at: 'parcel2', count: 1 },
      { type: 'collect', label: 'Pick up parcel 3 of 3 at the market', at: 'parcel3', count: 1 },
      { type: 'deliver', label: 'Deliver all three parcels to the docks', at: 'docks' },
    ],
  },
  {
    id: 'm3', title: 'HOT WHEELS', pay: 450,
    brief: 'A Sunrise GT is parked on the beachfront — keys in it, owner in the waves. Bay PD patrols that strip. Be quick, be gone.',
    objectives: [
      { type: 'goto', label: 'Reach the beachfront strip', at: 'beachCar' },
      { type: 'stealCar', label: 'Steal the Sunrise GT (E) — the cops are watching', car: 'sportsCar' },
      { type: 'evade', label: 'Lose the heat — stay unseen for 20 seconds', seconds: 20 },
      { type: 'goto', label: 'Bring the GT to Eddie\'s garage', at: 'garage', inCar: true },
    ],
  },
  {
    id: 'm4', title: 'THE LONG WAY HOME', pay: 600,
    brief: 'Eddie\'s courier got pinched. The package is at the north checkpoint and Bay PD wants it back. Get it to the yacht at the marina.',
    objectives: [
      { type: 'collect', label: 'Grab the package at the north checkpoint', at: 'checkpoint' },
      { type: 'evade', label: 'Shake the patrols — stay unseen for 25 seconds', seconds: 25 },
      { type: 'deliver', label: 'Deliver the package to the yacht at the marina', at: 'yacht' },
    ],
  },
  {
    id: 'm5', title: 'THE BIG SCORE', pay: 1200,
    brief: 'One last job. The harbour master\'s launch is leaving at noon with the city\'s weekend take. Take the launch. Do not get caught.',
    objectives: [
      { type: 'goto', label: 'Reach the harbour launch', at: 'launch' },
      { type: 'stealCar', label: 'Take the launch car (E) and run', car: 'launchCar' },
      { type: 'evade', label: 'Outrun Bay PD — stay unseen for 30 seconds', seconds: 30 },
      { type: 'deliver', label: 'Bring the take to the lighthouse point', at: 'lighthouse' },
    ],
  },
];

export const RADIO_STATIONS = [
  { name: 'SOLMAR FM · 101.3', mood: 'sunset drive' },
  { name: 'BAY BEATS · 98.7', mood: 'night cruise' },
  { name: 'PALM RADIO · 104.1', mood: 'coast road' },
];
