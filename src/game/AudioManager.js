/** Small procedural WebAudio layer (no audio files): hoofbeats, whip crack, countdown beeps, crowd bed. */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.hoofAcc = 0;
    this.crowdGain = null;
  }

  _ensure() {
    if (this.ctx) return this.ctx.state !== 'closed';
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this._noise = this._makeNoise();
    this._startCrowd();
    return true;
  }

  unlock() { if (this._ensure() && this.ctx.state === 'suspended') this.ctx.resume(); }

  setVolume(v) { if (!Number.isFinite(v)) return; this.volume = v; if (this.master) this.master.gain.value = v; }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _startCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.4;
    this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0.0;
    src.connect(f).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  setCrowd(level) { if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(0.03 + level * 0.07, this.ctx.currentTime, 0.4); }

  beep(freq = 660, dur = 0.18, vol = 0.25) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  crack() {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noise;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(7000, t + 0.08);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.15);
  }

  thud(vol = 0.3) {
    if (!this._ensure()) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.13);
  }

  /** Called every frame with the player's speed; emits a 4-beat gallop rhythm. */
  hooves(dt, speed) {
    if (speed < 1) { this.hoofAcc = 0; return; }
    const cycle = 0.46 / Math.max(0.55, Math.min(1.45, speed / 15));
    const beat = speed > 8 ? cycle / 4 : cycle / 2;
    this.hoofAcc += dt;
    if (this.hoofAcc >= beat) { this.hoofAcc -= beat; this.thud(0.12 + Math.min(0.15, speed / 120)); }
  }

  fanfare() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.25, 0.2), i * 140)); }
}
