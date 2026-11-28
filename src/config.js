// Central configuration for the prototype. All gameplay numbers live here.
export const FBX_URL = '/models/ArabianHorseJockey.fbx';
export const MODEL_SCALE = 0.01; // FBX is authored in centimetres

// Unity import settings (ArabianHorseJockey.fbx.meta / ArabianHorseJockey.txt): one take, 30 fps, split by frame range.
export const SOURCE_FPS = 24;
export const CLIP_RANGES = {
  Jump:     [0, 40],
  Idle:     [42, 241],
  Idle01:   [242, 291],
  Idle02:   [292, 361],
  Attack:   [362, 395],
  Attack01: [396, 436],
  WalkBack: [438, 471],
  Trot:     [473, 493],
  Gallop:   [496, 509],
  Tarsus:   [511, 539],
  Idle03:   [541, 660],
  Death:    [661, 686],
  HitRight: [689, 704],
  HitLeft:  [705, 723],
  HitFront: [724, 740],
  HitBack:  [741, 757],
};

export const TRACK = {
  laneCount: 6,
  laneWidth: 3.2,
  length: 800,          // metres from start line to finish line
  startZ: 0,
  runUp: 40,            // empty track behind the start line
  runOut: 120,          // empty track after the finish line
};

export const RACE = {
  countdownSeconds: 3,
  stickInputGraceMs: 0,
};

// Horse movement model (metres / second)
export const HORSE_DEFAULTS = {
  baseSpeed: 14.5,         // cruising speed once the race is on
  maxSpeed: 19.5,          // hard cap, boost included
  acceleration: 4.5,       // m/s^2 toward target speed
  deceleration: 6.0,       // m/s^2 when slowing down
  brakeDeceleration: 10.0, // S / down key
  stamina: 100,
  staminaDrainRun: 1.2,    // per second while running
  staminaDrainBoost: 3.5,  // extra per second at full boost
  staminaRecovery: 7.0,    // per second once the rider has stopped hitting for a moment
  staminaPerHit: 1.2,
  hitCooldown: 0.35,       // seconds, enforced per press (holding the key does nothing)
  mashWindow: 0.8,         // seconds: 3+ rejected presses inside this window count as button mashing
  mashBoostLoss: 0.35,     // fraction of current boost lost per mashing penalty
  mashStaminaLoss: 3.0,
  hitBoost: 1.3,           // m/s added to boost per valid hit
  maxBoost: 4.2,           // boost can never exceed this
  boostDecay: 1.0,         // boost lost per second
  fatigueThreshold: 25,    // below this stamina the max boost shrinks
  fatigueMaxBoostScale: 0.35,
  lateralSpeed: 2.6,       // m/s sideways when steering
  lateralReturn: 1.2,      // m/s drift back to lane centre
  lateralLimit: 1.2,       // metres each side of lane centre
  steerMaxYaw: 0.22,       // radians of visual yaw while steering
};

// AI riders are slightly less efficient than a skilled human (scales hitBoost).
export const AI_HIT_EFFICIENCY = 0.82;
export const AI_MAX_BOOST_SCALE = 0.62; // AI horses cannot reach a skilled human's full boost

export const AI_PROFILES = [
  { name: 'Thunderbolt', baseSpeed: 14.65, boostSkill: 0.55, stamina: 100, aggression: 0.5 },
  { name: 'Desert Wind', baseSpeed: 14.7, boostSkill: 0.45, stamina: 105, aggression: 0.4 },
  { name: 'Sahara Star', baseSpeed: 14.6, boostSkill: 0.70, stamina: 95,  aggression: 0.6 },
  { name: 'Midnight',    baseSpeed: 14.65, boostSkill: 0.50, stamina: 100, aggression: 0.5 },
  { name: 'Silver Mist', baseSpeed: 14.6, boostSkill: 0.65, stamina: 100, aggression: 0.55 },
  { name: 'Golden Gale', baseSpeed: 14.7, boostSkill: 0.40, stamina: 110, aggression: 0.35 },
];

export const COMPETITORS = [
  { name: 'Crimson Arrow', horseTex: 1, jockeyMat: 0, silks: '#e63946' },
  { name: 'Desert Wind', horseTex: 2, jockeyMat: 1, silks: '#1d7bff' },
  { name: 'Sahara Star', horseTex: 3, jockeyMat: 2, silks: '#ffd23f' },
  { name: 'Midnight',    horseTex: 4, jockeyMat: 0, silks: '#2ec27e' },
  { name: 'Silver Mist', horseTex: 1, jockeyMat: 1, silks: '#b158e8' },
  { name: 'Golden Gale', horseTex: 2, jockeyMat: 2, silks: '#ff8c1a' },
];
