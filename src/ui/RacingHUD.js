import { COMPETITORS, TRACK } from '../config.js';

const $ = (id) => document.getElementById(id);
export const ordinal = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
export const fmtTime = (t) => {
  if (t == null) return '—';
  const m = Math.floor(t / 60); const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export class RacingHUD {
  constructor() {
    this.el = $('hud');
    this.pos = $('hud-pos'); this.suf = $('hud-pos-suf'); this.time = $('hud-time');
    this.remain = $('hud-remain'); this.speed = $('hud-speed');
    this.stamina = $('hud-stamina'); this.boost = $('hud-boost'); this.cd = $('hud-cd');
    this.center = $('hud-center'); this.flash = $('hud-flash'); this.toastEl = $('hud-toast');
    this.camName = $('cam-name'); this.who = $('hud-who');
    this.progress = $('hud-progress');
    this.dots = COMPETITORS.map((c) => {
      const d = document.createElement('div'); d.className = 'dot'; d.style.background = c.silks; this.progress.appendChild(d); return d;
    });
    this._last = {};
  }

  show(v) { this.el.hidden = !v; }

  setPlayer(index) {
    this.who.textContent = `${COMPETITORS[index].name.toUpperCase()}  ·  LANE ${index + 1}`;
    this.who.style.color = COMPETITORS[index].silks;
    this.dots.forEach((d, i) => d.classList.toggle('me', i === index));
  }

  _set(key, el, val, fn) { if (this._last[key] !== val) { this._last[key] = val; fn(el, val); } }

  update({ player, position, raceTime, horses, camMode }) {
    this._set('pos', this.pos, position, (e, v) => (e.textContent = v));
    this._set('suf', this.suf, ordinal(position), (e, v) => (e.textContent = v));
    this._set('time', this.time, fmtTime(Math.max(0, raceTime)), (e, v) => (e.textContent = v));
    const remain = Math.max(0, Math.ceil(TRACK.length - (player.z - TRACK.startZ)));
    this._set('remain', this.remain, remain, (e, v) => (e.textContent = v));
    this._set('speed', this.speed, Math.round(player.speed * 3.6), (e, v) => (e.textContent = v));
    const st = Math.round(player.staminaPct * 100);
    this._set('stam', this.stamina, st, (e, v) => { e.style.width = v + '%'; e.classList.toggle('low', v < 25); });
    const bp = Math.round((player.boost / player.cfg.maxBoost) * 100);
    this._set('boost', this.boost, bp, (e, v) => (e.style.width = v + '%'));
    const cd = Math.round((1 - player.cooldown / player.cfg.hitCooldown) * 100);
    this._set('cd', this.cd, cd, (e, v) => { e.style.width = v + '%'; e.style.background = v >= 100 ? '#fff' : '#ff8c1a'; });
    this._set('cam', this.camName, camMode, (e, v) => (e.textContent = v));
    horses.forEach((h, i) => {
      const p = Math.min(1, Math.max(0, (h.z - TRACK.startZ) / TRACK.length));
      const left = (p * 100).toFixed(1);
      this._set('dot' + i, this.dots[i], left, (e, v) => (e.style.left = v + '%'));
    });
  }

  big(text, ms = 900) {
    this.center.textContent = text;
    this.center.classList.remove('pop'); void this.center.offsetWidth; this.center.classList.add('pop');
    clearTimeout(this._bigT);
    if (ms) this._bigT = setTimeout(() => { this.center.textContent = ''; }, ms);
  }

  flashHit() { this.flash.classList.add('on'); clearTimeout(this._ft); this._ft = setTimeout(() => this.flash.classList.remove('on'), 60); }

  toast(msg, ms = 1600) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }
}
