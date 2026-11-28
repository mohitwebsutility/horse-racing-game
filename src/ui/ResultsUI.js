import { fmtTime, ordinal } from './RacingHUD.js';
import { COMPETITORS } from '../config.js';

export class ResultsUI {
  constructor({ onRestart, onMenu }) {
    this.root = document.getElementById('results');
    this.body = document.getElementById('res-body');
    this.title = document.getElementById('res-title');
    this.badge = document.getElementById('res-badge');
    document.getElementById('btn-res-restart').onclick = onRestart;
    document.getElementById('btn-res-menu').onclick = onMenu;
  }

  show(standings) {
    const player = standings.find((s) => s.isPlayer);
    const winner = standings[0];
    this.badge.textContent = player.position === 1 ? '🏆 VICTORY' : 'RACE OVER';
    this.title.textContent = player.finished
      ? `You finished ${player.position}${ordinal(player.position)}`
      : 'You did not finish';
    const t0 = winner.time;
    this.body.innerHTML = standings.map((s) => {
      const gap = s.finished && s !== winner ? `+${(s.time - t0).toFixed(2)}s` : '';
      const time = s.finished ? fmtTime(s.time) : `DNF · ${Math.round(s.distance)} m`;
      const sw = COMPETITORS[s.index].silks;
      return `<tr class="${s.isPlayer ? 'me' : ''}"><td>${s.position}</td><td><span class="dotc" style="background:${sw}"></span>${s.name}${s.isPlayer ? ' (you)' : ''}</td><td>${time}</td><td>${gap}</td></tr>`;
    }).join('');
    this.root.hidden = false;
  }

  hide() { this.root.hidden = true; }
}
