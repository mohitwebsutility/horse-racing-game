import { COMPETITORS } from '../config.js';
const $ = (id) => document.getElementById(id);

/** Menu screens: main, horse selection, settings, how-to-play and the (clearly simulated) rooms screen. */
export class MainMenu {
  constructor({ onPlay, onSettings, audio }) {
    this.onPlay = onPlay;
    this.selected = 2; // mid-pack lane so neighbours are visible on both sides
    this.screens = ['menu', 'select', 'rooms', 'settings', 'how'].map($);
    this.stack = 'menu';
    $('btn-play').onclick = () => this.onPlay(this.selected);
    $('btn-horse').onclick = () => this.open('select');
    $('btn-create').onclick = () => this._rooms('Create Room');
    $('btn-join').onclick = () => this._rooms('Join Room');
    $('btn-settings').onclick = () => this.open('settings');
    $('btn-how').onclick = () => this.open('how');
    $('btn-select-go').onclick = () => this.onPlay(this.selected);
    $('btn-rooms-solo').onclick = () => this.onPlay(this.selected);
    document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => this.open('menu')));
    this._cards();
    this.settings = { autorun: true, shadows: true, touch: false, volume: 0.6, scale: 0.75 };
    $('set-autorun').onchange = (e) => { this.settings.autorun = e.target.checked; onSettings(this.settings); };
    $('set-shadows').onchange = (e) => { this.settings.shadows = e.target.checked; onSettings(this.settings); };
    $('set-touch').onchange = (e) => { this.settings.touch = e.target.checked; onSettings(this.settings); };
    $('set-volume').oninput = (e) => { this.settings.volume = e.target.value / 100; onSettings(this.settings); };
    $('set-scale').onchange = (e) => { this.settings.scale = +e.target.value; onSettings(this.settings); };
  }

  _cards() {
    const box = $('horse-cards');
    box.innerHTML = '';
    COMPETITORS.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'hcard' + (i === this.selected ? ' sel' : '');
      el.innerHTML = `<div class="sw" style="background:${c.silks}"></div><b>${c.name}</b><small>Lane ${i + 1}</small>`;
      el.onclick = () => { this.selected = i; this._cards(); };
      box.appendChild(el);
    });
  }

  _rooms(title) {
    $('rooms-title').textContent = title;
    $('room-slots').innerHTML = Array.from({ length: 6 }, (_, i) => `<div class="slot">Slot ${i + 1}: ${i === 0 ? 'You (solo)' : 'AI horse'}</div>`).join('');
    this.open('rooms');
  }

  open(name) {
    this.screens.forEach((s) => (s.hidden = s.id !== name));
    this.stack = name;
  }

  hideAll() { this.screens.forEach((s) => (s.hidden = true)); }
}
