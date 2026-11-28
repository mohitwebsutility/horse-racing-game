import { TRACK, RACE } from '../config.js';

/**
 * Race lifecycle: ready → countdown → racing → finished, plus standings and finish-line detection.
 * Finish times are interpolated between frames so ordering never depends on frame rate.
 */
export class RaceManager {
  constructor(horses, { onCountdown, onGo, onFinish, onRaceOver } = {}) {
    this.horses = horses;
    this.cb = { onCountdown, onGo, onFinish, onRaceOver };
    this.finishZ = TRACK.startZ + TRACK.length;
    this.reset();
  }

  reset() {
    this.phase = 'ready';      // ready | countdown | racing | over
    this.time = 0;             // race clock (seconds since GO)
    this.countdown = RACE.countdownSeconds;
    this._lastCount = null;
    this.finishOrder = [];
    this.results = [];
    this.playerFinishedAt = null;
    this.paused = false;
  }

  startCountdown() {
    if (this.phase !== 'ready') return false;
    this.phase = 'countdown';
    this.countdown = RACE.countdownSeconds;
    this._lastCount = null;
    return true;
  }

  get remainingTime() { return Math.max(0, this.countdown); }

  update(dt) {
    if (this.paused) return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const shown = Math.ceil(this.countdown);
      if (shown !== this._lastCount && shown > 0) { this._lastCount = shown; this.cb.onCountdown?.(shown); }
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.time = -this.countdown; // carry the overshoot so the clock stays exact
        for (const h of this.horses) h.status = 'racing';
        this.cb.onGo?.();
      }
      return;
    }
    if (this.phase !== 'racing' && this.phase !== 'over') return;
    const prevTime = this.time;
    this.time += dt;
    // Finish-line detection
    for (const h of this.horses) {
      if (h.status !== 'racing') continue;
      if (h.z >= this.finishZ) {
        const span = h.z - h.prevZ;
        const f = span > 1e-6 ? (this.finishZ - h.prevZ) / span : 1;
        h.finishTime = prevTime + dt * Math.min(1, Math.max(0, f));
        h.status = 'finished';
        this.finishOrder.push(h);
        this.cb.onFinish?.(h, this.finishOrder.length);
        if (h.isPlayer) this.playerFinishedAt = this.time;
      }
    }
    if (this.phase === 'racing') {
      const player = this.horses.find((h) => h.isPlayer);
      const all = this.finishOrder.length === this.horses.length;
      const playerDone = player && player.status === 'finished';
      const waited = this.playerFinishedAt !== null && this.time - this.playerFinishedAt > 8;
      // If every AI horse is home, give a slow/stopped player 20 s more before the race is closed out.
      const allAiDone = this.horses.filter((h) => !h.isPlayer).every((h) => h.status === 'finished') && this.time - Math.max(...this.finishOrder.map((h) => h.finishTime || 0)) > 20;
      const timeout = this.time > 150;
      if (all || (playerDone && waited) || allAiDone || timeout) {
        this.phase = 'over';
        this.results = this.getStandings();
        this.cb.onRaceOver?.(this.results);
      } else if (playerDone && !this._notified) {
        this._notified = true;
      }
    }
  }

  /** Ordered list: finishers by finish time, then everyone else by distance covered. */
  getStandings() {
    const fin = [...this.finishOrder].sort((a, b) => a.finishTime - b.finishTime);
    const rest = this.horses.filter((h) => h.status !== 'finished').sort((a, b) => b.z - a.z);
    return [...fin, ...rest].map((h, i) => ({
      position: i + 1, horse: h, name: h.name, isPlayer: h.isPlayer, index: h.index,
      finished: h.status === 'finished', time: h.finishTime, distance: Math.min(h.z - TRACK.startZ, TRACK.length),
    }));
  }

  positionOf(horse) { return this.getStandings().find((s) => s.horse === horse).position; }
}
