/**
 * Drives a HorseController through the same public API a player uses (tryHit / steer input),
 * so AI competitors obey exactly the same speed, stamina and cooldown rules.
 */
export class HorseAIController {
  constructor(horse, profile) {
    this.horse = horse;
    this.profile = profile;
    this.reset();
  }

  reset() {
    this.nextHitAt = 0.6 + Math.random() * 0.8;
    this.timeInRace = 0;
    this.burstUntil = 0;
    this.restUntil = 0;
    this.targetOffset = 0;
    this.lateralTimer = 0;
  }

  /**
   * @param dt
   * @param {number} progress 0..1 along the race distance
   * @param {HorseController[]} others
   */
  think(dt, progress, others) {
    const h = this.horse;
    const p = this.profile;
    const out = { run: true, brake: false, steer: 0 };
    if (h.status !== 'racing') return out;
    this.timeInRace += dt;

    // ---- boost policy: bursts of rhythmic hits, then rest, with a stronger finishing push.
    const stamina = h.staminaPct;
    const late = progress > 0.72;
    const wantsPush = (this.timeInRace > this.burstUntil && this.timeInRace > this.restUntil)
      && stamina > (late ? 0.08 : 0.35 + 0.1 * (1 - p.boostSkill));
    if (wantsPush && Math.random() < dt * (0.7 + p.aggression)) {
      this.burstUntil = this.timeInRace + (late ? 4 + Math.random() * 6 : 1.8 + Math.random() * 2.4) * (0.7 + p.boostSkill);
      this.restUntil = this.burstUntil + (late ? 0.5 : 2.5 + Math.random() * 3);
    }
    const bursting = this.timeInRace < this.burstUntil;
    if (bursting && this.timeInRace >= this.nextHitAt) {
      // Slightly imperfect rhythm: better horses hit closer to the ideal interval.
      const jitter = (1 - p.boostSkill) * 0.25 * Math.random();
      const interval = h.cfg.hitCooldown + 0.06 + jitter + (Math.random() < 0.12 ? 0.25 : 0);
      if (h.tryHit()) this.nextHitAt = this.timeInRace + interval;
      else this.nextHitAt = this.timeInRace + 0.05;
    }

    // ---- lane keeping and simple obstacle avoidance
    this.lateralTimer -= dt;
    if (this.lateralTimer <= 0) {
      this.lateralTimer = 0.25;
      let blocker = null;
      for (const o of others) {
        if (o === h) continue;
        const dz = o.z - h.z;
        if (dz > 0.3 && dz < 7 && Math.abs(o.x - h.x) < 1.8 && o.speed < h.speed + 0.6) { blocker = o; break; }
      }
      if (blocker) {
        const room = h.cfg.lateralLimit;
        const want = blocker.x >= h.x ? -1 : 1;
        const cur = h.x - h.laneX;
        this.targetOffset = Math.max(-room, Math.min(room, cur + want * 1.4));
      } else {
        this.targetOffset *= 0.5; // drift back toward lane centre
      }
    }
    const err = this.targetOffset - (h.x - h.laneX);
    out.steer = Math.abs(err) < 0.12 ? 0 : Math.sign(err) * Math.min(1, Math.abs(err));
    return out;
  }
}
