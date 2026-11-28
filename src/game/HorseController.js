import { HORSE_DEFAULTS, TRACK } from '../config.js';

/**
 * Per-horse movement model. Pure logic (no rendering) so the same code can later run on the server.
 * Units: metres, seconds. z = distance along the track, x = lateral world position.
 */
export class HorseController {
  constructor({ index, name, laneX, profile = {}, isPlayer = false }) {
    this.index = index;
    this.name = name;
    this.isPlayer = isPlayer;
    this.cfg = { ...HORSE_DEFAULTS, ...profile };
    this.laneX = laneX;
    this.reset();
  }

  reset() {
    const c = this.cfg;
    this.z = TRACK.startZ - 1.8;     // nose behind the line
    this.x = this.laneX;
    this.speed = 0;
    this.boost = 0;
    this.stamina = c.stamina;
    this.cooldown = 0;
    this.chain = 0;                  // consecutive well-timed hits
    this.sinceHit = 99;
    this.status = 'waiting';         // waiting | racing | finished
    this.finishTime = null;
    this.steer = 0;                  // -1..1 current steering (smoothed, for visuals)
    this.rearCooldown = 0;
    this.rearTimer = 0;
    this.hitsLanded = 0;
    this.pendingHit = false;         // set when a valid hit happened this frame (for animation / audio)
    this.pendingPenalty = false;     // set when mashing was punished this frame (HUD feedback)
    this.rejected = [];              // timestamps (race clock) of presses rejected by the cooldown
    this.clock = 0;
    this.pendingRear = false;
    this.blockedBy = null;
  }

  get isRearing() { return this.rearTimer > 0; }
  get laneOffset() { return this.x - this.laneX; }
  get staminaPct() { return this.stamina / this.cfg.stamina; }

  /** One valid stick hit, subject to cooldown, stamina and boost cap. Returns true if registered. */
  tryHit() {
    if (this.status !== 'racing' || this.isRearing) return false;
    const c = this.cfg;
    if (this.cooldown > 0) {
      // Pressing during the cooldown does nothing — except that rapid mashing is punished.
      this.rejected.push(this.clock);
      this.rejected = this.rejected.filter((t) => this.clock - t <= c.mashWindow);
      if (this.rejected.length >= 3) {
        this.boost *= 1 - c.mashBoostLoss;
        this.stamina = Math.max(0, this.stamina - c.mashStaminaLoss);
        this.rejected.length = 0;
        this.chain = 0;
        this.pendingPenalty = true;
      }
      return false;
    }
    if (this.stamina <= 0) return false;
    // Rhythm bonus: hits landed in the sweet window after the previous one build a chain.
    const sweetMax = c.hitCooldown + 0.28;
    if (this.sinceHit <= sweetMax) this.chain = Math.min(this.chain + 1, 6); else this.chain = 0;
    const mult = 1 + this.chain * 0.07;
    const cap = this._boostCap();
    this.boost = Math.min(cap, this.boost + c.hitBoost * mult);
    this.stamina = Math.max(0, this.stamina - c.staminaPerHit);
    this.cooldown = c.hitCooldown;
    this.sinceHit = 0;
    this.hitsLanded++;
    this.pendingHit = true;
    return true;
  }

  tryRear() {
    if (this.status !== 'racing' || this.rearCooldown > 0 || this.isRearing) return false;
    this.rearTimer = 1.1;
    this.rearCooldown = 8;
    this.pendingRear = true;
    this.boost = 0;
    return true;
  }

  _boostCap() {
    const c = this.cfg;
    if (this.stamina >= c.fatigueThreshold) return c.maxBoost;
    const k = this.stamina / c.fatigueThreshold; // 0..1
    return c.maxBoost * (c.fatigueMaxBoostScale + (1 - c.fatigueMaxBoostScale) * k);
  }

  /**
   * @param {number} dt
   * @param {{run:boolean, brake:boolean, steer:number}} input steer in -1..1 (-1 = left, +1 = right)
   */
  update(dt, input) {
    const c = this.cfg;
    this.pendingHit = false; this.pendingRear = false; this.pendingPenalty = false;
    this.clock += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.rearCooldown = Math.max(0, this.rearCooldown - dt);
    this.sinceHit += dt;
    if (this.rearTimer > 0) this.rearTimer = Math.max(0, this.rearTimer - dt);

    let target = 0;
    if (this.status === 'racing') {
      // Tired horses slow down: below the fatigue threshold the cruise speed shrinks (max 12%).
      const tired = this.stamina < c.fatigueThreshold ? 1 - 0.12 * (1 - this.stamina / c.fatigueThreshold) : 1;
      const cruise = c.baseSpeed * tired;
      target = input.run ? cruise : cruise * 0.55;
      target += this.boost;
      if (input.brake) target = Math.min(target, this.speed * 0.4);
      target = Math.min(target, c.maxSpeed);
      if (this.isRearing) target = 0;
    } else if (this.status === 'finished') {
      target = 0; // pull up after the line
    }

    // Boost fades out when the rider stops hitting; hitting too slowly lets it bleed away quickly.
    if (this.sinceHit > c.hitCooldown + 0.6) this.boost = Math.max(0, this.boost - c.boostDecay * dt * 1.6);
    else this.boost = Math.max(0, this.boost - c.boostDecay * dt * 0.5);
    if (this.sinceHit > 1.0) this.chain = 0;

    // Speed integration
    const accelRate = this.status === 'finished' ? 2.4 : (this.isRearing || input.brake ? c.brakeDeceleration : (target > this.speed ? c.acceleration : c.deceleration));
    if (this.speed < target) this.speed = Math.min(target, this.speed + accelRate * dt);
    else this.speed = Math.max(target, this.speed - accelRate * dt);

    // Stamina: running and boosting cost energy, easing off (low boost) restores it.
    if (this.status === 'racing') {
      const run = this.speed > 1 ? c.staminaDrainRun : 0;
      const boostDrain = c.staminaDrainBoost * (this.boost / c.maxBoost);
      this.stamina -= (run + boostDrain) * dt;
      if (this.sinceHit > 0.6) this.stamina += c.staminaRecovery * dt;
      this.stamina = Math.min(c.stamina, Math.max(0, this.stamina));
    }

    // Lateral movement: steering within lane limits, drifting back to the lane centre when released.
    const steerIn = this.isRearing ? 0 : input.steer;
    const limit = c.lateralLimit + (this.status === 'racing' ? 0 : 0);
    let vx = steerIn * c.lateralSpeed * Math.min(1, 0.3 + this.speed / 8);
    if (Math.abs(steerIn) < 0.05) {
      const off = this.x - this.laneX;
      const back = Math.min(Math.abs(off), c.lateralReturn * dt);
      vx = -Math.sign(off) * back / Math.max(dt, 1e-4);
    }
    this.x += vx * dt;
    this.x = Math.max(this.laneX - limit, Math.min(this.laneX + limit, this.x));
    // Never leave the track
    const half = (TRACK.laneCount * TRACK.laneWidth) / 2 - 1.0;
    this.x = Math.max(-half, Math.min(half, this.x));
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 8);
    this.lateralVelocity = vx;

    this.prevZ = this.z;
    this.z += this.speed * dt;
  }
}
