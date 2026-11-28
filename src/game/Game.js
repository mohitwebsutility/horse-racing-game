import * as THREE from 'three';
import { COMPETITORS, AI_PROFILES, AI_HIT_EFFICIENCY, AI_MAX_BOOST_SCALE, HORSE_DEFAULTS, TRACK } from '../config.js';
import { TrackManager } from './TrackManager.js';
import { HorseController } from './HorseController.js';
import { HorseAIController } from './HorseAIController.js';
import { AnimationController } from './AnimationController.js';
import { InputController } from './InputController.js';
import { CameraController } from './CameraController.js';
import { CollisionManager } from './CollisionManager.js';
import { RaceManager } from './RaceManager.js';
import { AudioManager } from './AudioManager.js';
import { RacingHUD } from '../ui/RacingHUD.js';
import { ResultsUI } from '../ui/ResultsUI.js';

const $ = (id) => document.getElementById(id);

function makeTag(text, color, big) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (big) {
    x.fillStyle = color; x.beginPath(); x.moveTo(128, 124); x.lineTo(80, 60); x.lineTo(176, 60); x.closePath(); x.fill();
    x.lineWidth = 6; x.strokeStyle = '#fff'; x.stroke();
    x.font = '900 46px system-ui, Arial'; x.lineWidth = 8; x.strokeStyle = '#000'; x.strokeText(text, 128, 30); x.fillStyle = '#fff'; x.fillText(text, 128, 30);
  } else {
    x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.roundRect(40, 30, 176, 60, 30); x.fill();
    x.fillStyle = color; x.beginPath(); x.arc(78, 60, 18, 0, 7); x.fill();
    x.font = '800 34px system-ui, Arial'; x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(text, 106, 62);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.renderOrder = 10;
  s.scale.set(big ? 1.6 : 1.5, big ? 0.8 : 0.75, 1);
  return s;
}

/**
 * Orchestrates the whole prototype: renderer, track, six horse/rider entities, race lifecycle, HUD and UI state.
 * States: menu → ready → countdown → racing → over (paused is an overlay on top of countdown/racing).
 */
export class Game {
  constructor(canvas, assets, menu) {
    this.canvas = canvas;
    this.assets = assets;
    this.menu = menu;
    this.state = 'menu';
    this.paused = false;
    this.playerIndex = 2;
    this.settings = { autorun: true, shadows: true, touch: false, volume: 0.6, scale: 0.75 };
    this.disposed = false;
    this.elapsed = 0;
    this.rafId = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 3500);
    this.track = new TrackManager(this.scene);
    this.cam = new CameraController(this.camera, canvas);
    this.input = new InputController();
    this.audio = new AudioManager();
    this.collision = new CollisionManager();
    this.hud = new RacingHUD();
    this.results = new ResultsUI({ onRestart: () => this.restart(true), onMenu: () => this.toMenu() });
    this.clock = new THREE.Clock();

    this._buildCompetitors();
    this.race = new RaceManager(this.horses, {
      onCountdown: (n) => { this.hud.big(String(n)); this.audio.beep(520, 0.15); },
      onGo: () => { this.hud.big('GO!', 800); this.audio.beep(1040, 0.5, 0.3); this.input.enabled = true; },
      onFinish: (h, place) => this._onFinish(h, place),
      onRaceOver: (res) => this._onRaceOver(res),
    });
    this._bindUI();
    this._bindEvents();
    this.setPlayer(2);
    this.resize();
    this.cam.intro = true;
    this.cam.snap();
    this._loop = this._loop.bind(this);
    this.rafId = requestAnimationFrame(this._loop);
  }

  // ------------------------------------------------------------------ setup
  _buildCompetitors() {
    this.horses = []; this.riders = []; this.ais = [];
    COMPETITORS.forEach((c, i) => {
      const inst = this.assets.createInstance({ horseTex: c.horseTex, jockeyMat: c.jockeyMat, silks: c.silks });
      const group = new THREE.Group();
      group.add(inst.root);
      this.scene.add(group);
      const anim = new AnimationController(inst, this.assets.clips);
      const profile = AI_PROFILES[i];
      const horse = new HorseController({
        index: i, name: c.name, laneX: this.track.laneX(i),
        profile: { baseSpeed: profile.baseSpeed, stamina: profile.stamina },
      });
      const ai = new HorseAIController(horse, profile);
      const tag = makeTag(String(i + 1), c.silks, false); tag.position.set(0, 2.95, 0); group.add(tag);
      const marker = makeTag('YOU', c.silks, true); marker.position.set(0, 3.45, 0); marker.visible = false; group.add(marker);
      this.horses.push(horse);
      this.riders.push({ inst, group, anim, tag, marker, yaw: 0 });
      this.ais.push(ai);
    });
  }

  setPlayer(i) {
    this.playerIndex = i;
    this.horses.forEach((h, k) => { h.isPlayer = k === i; const human = k === i; h.cfg.hitBoost = HORSE_DEFAULTS.hitBoost * (human ? 1 : AI_HIT_EFFICIENCY); h.cfg.maxBoost = HORSE_DEFAULTS.maxBoost * (human ? 1 : AI_MAX_BOOST_SCALE); });
    this.riders.forEach((r, k) => { r.marker.visible = k === i; r.tag.visible = k !== i; });
    this.hud.setPlayer(i);
    $('ready-name').textContent = this.horses[i].name;
    $('ready-name').style.color = COMPETITORS[i].silks;
    $('ready-lane').textContent = `Lane ${i + 1} of 6 · 800 m`;
  }

  get player() { return this.horses[this.playerIndex]; }
  get playerRider() { return this.riders[this.playerIndex]; }

  _bindUI() {
    $('btn-start').onclick = () => this.startCountdown();
    $('btn-ready-menu').onclick = () => this.toMenu();
    $('btn-pause').onclick = () => this.togglePause();
    $('btn-resume').onclick = () => this.togglePause();
    $('btn-pause-restart').onclick = () => { this.paused = false; $('pause').hidden = true; this.restart(true); };
    $('btn-pause-menu').onclick = () => { this.paused = false; $('pause').hidden = true; this.toMenu(); };
    $('btn-cam').onclick = () => { this.cam.cycleMode(); };
    this.input.bindButton($('t-left'), { hold: 'left' });
    this.input.bindButton($('t-right'), { hold: 'right' });
    this.input.bindButton($('t-brake'), { hold: 'brake' });
    this.input.bindButton($('t-hit'), { fire: 'hit' });
    this.input.bindButton($('t-rear'), { fire: 'rear' });
  }

  _bindEvents() {
    this.input.on('hit', () => { if (this._canPlay()) this.player.tryHit(); });
    this.input.on('rear', () => { if (this._canPlay()) this.player.tryRear(); });
    this.input.on('camera', () => { if (this.state !== 'menu') this.cam.cycleMode(); });
    this.input.on('reins', () => { this.reins = !this.reins; this._applyReins(); this.hud.toast(this.reins ? 'Reins hidden' : 'Reins visible'); });
    this.input.on('start', () => { if (this.state === 'ready' && !this.paused) this.startCountdown(); });
    this.input.on('pause', () => { if (this.state === 'countdown' || this.state === 'racing') this.togglePause(); });
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._onVis = () => { if (document.hidden && (this.state === 'racing' || this.state === 'countdown') && !this.paused) this.togglePause(); };
    document.addEventListener('visibilitychange', this._onVis);
    this._unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', this._unlock);
    window.addEventListener('keydown', this._unlock);
    this._onCtx = (e) => { e.preventDefault(); this.hud.toast('Graphics context lost — reload the page'); };
    this.canvas.addEventListener('webglcontextlost', this._onCtx);
  }

  applySettings(s) {
    Object.assign(this.settings, s);
    this.renderer.shadowMap.enabled = s.shadows;
    this.track.sun.castShadow = s.shadows;
    this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
    this.audio.setVolume(s.volume);
    this.resize();
    this._updateTouch();
  }

  _updateTouch() {
    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    $('touch').hidden = !(coarse || this.settings.touch);
  }

  _applyReins() {
    this.riders.forEach((r) => r.inst.root.traverse((o) => { if (o.name === 'bridle_msh4') o.visible = !this.reins; }));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.settings.scale;
    this.renderer.setPixelRatio(Math.max(0.5, dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ state transitions
  _canPlay() { return this.state === 'racing' && !this.paused && this.player.status === 'racing'; }

  _resetEntities() {
    this.horses.forEach((h, i) => {
      h.reset(); h.isPlayer = i === this.playerIndex;
      this.ais[i].reset();
      const r = this.riders[i];
      r.anim.reset(); r.yaw = 0;
      r.group.position.set(h.x, 0, h.z); r.group.rotation.y = 0;
    });
    this.race.reset();
    this.input.enabled = false;
    this.results.hide();
    this.hud.big('', 0);
  }

  playRace(playerIndex) {
    this.setPlayer(playerIndex);
    this._resetEntities();
    this.menu.hideAll();
    this.hud.show(true);
    this._updateTouch();
    this.state = 'ready';
    this.cam.intro = true; this.cam.snap();
    this.input.capture = true;
    $('ready').hidden = false;
    document.activeElement?.blur?.();
  }

  startCountdown() {
    if (this.state !== 'ready') return;
    $('ready').hidden = true;
    document.activeElement?.blur?.();
    this.race.startCountdown();
    this.state = 'countdown';
    this.cam.intro = false;
    this.audio.unlock();
  }

  restart(autoStart = false) {
    this.playerIndex = this.playerIndex;
    this._resetEntities();
    this.cam.intro = true; this.cam.snap();
    this.state = 'ready';
    $('ready').hidden = true;
    if (autoStart) this.startCountdown(); else $('ready').hidden = false;
  }

  toMenu() {
    this._resetEntities();
    this.state = 'menu';
    this.hud.show(false);
    $('ready').hidden = true; $('pause').hidden = true;
    this.input.capture = false;
    this.cam.intro = true; this.cam.snap();
    this.menu.open('menu');
  }

  togglePause() {
    if (this.state !== 'countdown' && this.state !== 'racing') return;
    this.paused = !this.paused;
    this.race.paused = this.paused;
    $('pause').hidden = !this.paused;
    this.input.enabled = !this.paused && this.state === 'racing';
    if (!this.paused) this.clock.getDelta(); // swallow the paused interval
  }

  _onFinish(h, place) {
    if (h.isPlayer) {
      this.hud.big(place === 1 ? 'WINNER!' : `${place}${place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} PLACE`, 2200);
      this.audio.fanfare();
      this.input.enabled = false;
    }
  }

  _onRaceOver(res) {
    this.state = 'over';
    this.input.enabled = false;
    this.results.show(res);
  }

  // ------------------------------------------------------------------ loop
  _loop() {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    if (!this.paused) this._step(dt);
    this._render(dt);
  }

  _step(dt) {
    const progress = (z) => Math.min(1, Math.max(0, (z - TRACK.startZ) / TRACK.length));
    // Player & AI inputs → movement
    this.horses.forEach((h, i) => {
      let inp;
      if (h.isPlayer && h.status === 'racing') {
        inp = { run: this.settings.autorun || this.input.run, brake: this.input.brake, steer: this.input.steer };
      } else if (!h.isPlayer) {
        inp = this.ais[i].think(dt, progress(h.z), this.horses);
      } else inp = { run: true, brake: false, steer: 0 };
      h.update(dt, inp);
    });
    this.collision.resolve(this.horses, dt);
    // Race clock, countdown and finish-line detection (uses post-collision positions, interpolated within the frame)
    if (this.state === 'racing' || this.state === 'over' || this.state === 'countdown') {
      this.race.update(dt);
      if (this.state === 'countdown' && this.race.phase === 'racing') this.state = 'racing';
    }

    // Sync visuals and events
    this.horses.forEach((h, i) => {
      const r = this.riders[i];
      const targetYaw = Math.atan2(h.lateralVelocity || 0, Math.max(h.speed, 4)) * 1.2;
      r.yaw += (targetYaw - r.yaw) * Math.min(1, dt * 6);
      r.group.position.set(h.x, 0, h.z);
      r.group.rotation.y = r.yaw;
      if (h.pendingHit && r.anim.triggerHit() && h.isPlayer) {
        this.audio.crack(); this.hud.flashHit(); this.cam.addShake(0.12);
      } else if (h.pendingHit && !h.isPlayer) { /* AI hit animation already triggered above */ }
      if (h.pendingPenalty && h.isPlayer) this.hud.toast('Too fast — find a steady rhythm', 1200);
      if (h.pendingRear) { r.anim.triggerRear(); if (h.isPlayer) this.hud.toast('Rear! The horse stops briefly'); }
      r.anim.update(dt, h.speed, h.steer);
    });
    this.audio.hooves(dt, this.player.speed);
    if (this.state === 'racing' || this.state === 'over') this.audio.setCrowd(progress(this.player.z));
  }

  _render(dt) {
    const pr = this.playerRider;
    const leaderZ = Math.max(...this.horses.map((h) => h.z));
    let follow = pr.group;
    if (this.state === 'menu') { follow = this.riders[2].group; }
    this.cam.update(dt, follow, this.player.speed, leaderZ);
    this.track.followShadow(follow.position);
    this.track.crowdExcite = this.state === 'racing' ? 0.4 + progress01(this.player.z) : 0.2;
    this.track.update(dt, this.elapsed);
    if (this.state !== 'menu') {
      this.hud.update({
        player: this.player, position: this.race.positionOf(this.player), raceTime: this.race.phase === 'racing' || this.race.phase === 'over' ? this.race.time : 0,
        horses: this.horses, camMode: this.cam.modeName,
      });
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ teardown
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    this.canvas.removeEventListener('webglcontextlost', this._onCtx);
    this.input.dispose(); this.cam.dispose();
    this.riders.forEach((r) => {
      r.anim.dispose();
      r.inst.ownMaterials.forEach((m) => m.dispose());
      (r.inst.ownGeometries || []).forEach((g) => g.dispose());
    });
    this.track.dispose();
    this.renderer.dispose();
  }
}

function progress01(z) { return Math.min(1, Math.max(0, (z - TRACK.startZ) / TRACK.length)); }
