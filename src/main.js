import { AssetLoader } from './game/AssetLoader.js';
import { Game } from './game/Game.js';
import { MainMenu } from './ui/MainMenu.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  const loader = new AssetLoader((p) => {
    $('loadfill').style.width = Math.round(p * 100) + '%';
    $('loadtext').textContent = `Loading horses and riders… ${Math.round(p * 100)}%`;
  });
  try {
    await loader.load();
  } catch (err) {
    console.error(err);
    $('loadtext').textContent = 'Could not load required assets.';
    const e = $('loaderror'); e.hidden = false; e.textContent = String(err.message || err);
    return;
  }
  let game;
  const menu = new MainMenu({
    onPlay: (idx) => game.playRace(idx),
    onSettings: (s) => game.applySettings(s),
  });
  try {
    game = new Game($('game-canvas'), loader, menu);
  } catch (err) {
    console.error(err);
    $('loadtext').textContent = 'Could not start the 3D renderer (WebGL unavailable?).';
    const e = $('loaderror'); e.hidden = false; e.textContent = String(err.message || err);
    return;
  }
  game.applySettings(menu.settings);
  window.__game = game; // handy for debugging in the console
  $('loading').hidden = true;
  menu.open('menu');
}

boot();
