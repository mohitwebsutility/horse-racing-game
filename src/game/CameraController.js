import * as THREE from 'three';

const MODES = ['Chase', 'Side', 'Overview'];

/**
 * Smooth third-person camera. Modes: chase (orbitable behind the horse), side (TV-style alongside),
 * overview (spectator, high above the pack). Mouse/touch drag orbits, wheel zooms.
 */
export class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = 0;
    this.target = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.yaw = 0;            // orbit offset (radians) relative to behind the horse
    this.pitch = 0.0;
    this.zoom = 1;
    this.shake = 0;
    this.fov = 55;
    this.dragging = false;
    this.userOrbit = false;
    this.intro = false;
    this.introT = 0;
    this._bind();
  }

  get modeName() { return MODES[this.mode]; }
  cycleMode() { this.mode = (this.mode + 1) % MODES.length; this.yaw = 0; this.pitch = 0; this.userOrbit = false; return this.modeName; }
  setMode(i) { this.mode = i; this.yaw = 0; this.pitch = 0; }
  addShake(a) { this.shake = Math.min(0.5, this.shake + a); }

  _bind() {
    let lastX = 0, lastY = 0;
    this._down = (e) => { if (e.target !== this.dom) return; this.dragging = true; lastX = e.clientX; lastY = e.clientY; this.dom.setPointerCapture?.(e.pointerId); };
    this._move = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      this.yaw -= dx * 0.006; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.35, 0.9);
      this.userOrbit = true;
    };
    this._up = () => { this.dragging = false; };
    this._wheel = (e) => { e.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.5, 2.6); };
    this.dom.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    this.dom.addEventListener('wheel', this._wheel, { passive: false });
  }

  /**
   * @param {number} dt
   * @param {THREE.Object3D} subject followed horse group (position + yaw)
   * @param {number} speed m/s for FOV effect
   * @param {number} leaderZ for overview mode
   */
  update(dt, subject, speed, leaderZ = 0) {
    const k = (rate) => 1 - Math.exp(-rate * dt);
    const p = subject.position;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    const zoom = this.zoom;

    if (this.intro) {
      // Slow orbit around the start line before the race
      this.introT += dt;
      const a = -0.9 + Math.sin(this.introT * 0.25) * 0.5;
      desired.set(p.x + Math.sin(a) * 9 * zoom, 2.3 + Math.sin(this.introT * 0.4) * 0.3, p.z + Math.cos(a) * 9 * zoom + 2);
      look.set(p.x, 1.4, p.z + 1);
    } else if (this.mode === 0) {
      const dist = 5.0 * zoom, height = (2.35 + this.pitch * 4) * Math.sqrt(zoom);
      const ang = this.yaw + Math.PI; // behind (-Z forward is +Z)
      desired.set(p.x + Math.sin(ang + this.yaw * 0) * dist * Math.cos(this.pitch * 0.5), p.y + height, p.z + Math.cos(ang) * dist * Math.cos(this.pitch * 0.5));
      // Keep the camera laterally smoothed so it does not whip with every steer
      look.set(p.x * 0.9 + this.lookAt.x * 0.1, 1.45, p.z + 6);
    } else if (this.mode === 1) {
      const dist = 11 * zoom;
      const ang = Math.PI / 2 + this.yaw; // alongside, on the stand side
      desired.set(p.x + Math.sin(ang) * dist, 2.0 + this.pitch * 5, p.z + Math.cos(ang) * dist - 2.5);
      look.set(p.x, 1.3, p.z + 1.5);
    } else {
      const dist = 26 * zoom;
      desired.set(-22 * zoom + Math.sin(this.yaw) * 10, 17 * zoom + this.pitch * 12, THREE.MathUtils.lerp(p.z, leaderZ, 0.5) - dist * 0.6);
      look.set(0, 0.5, THREE.MathUtils.lerp(p.z, leaderZ, 0.5) + 8);
    }

    // Never dip under the ground
    desired.y = Math.max(0.7, desired.y);
    if (!this._init) { this.pos.copy(desired); this.lookAt.copy(look); this._init = true; }
    if (this.intro) this.pos.lerp(desired, k(3));
    else {
      // x/y smoothed for comfort; z follows tightly so the horse does not shrink as speed rises
      this.pos.x += (desired.x - this.pos.x) * k(6);
      this.pos.y += (desired.y - this.pos.y) * k(6);
      this.pos.z += (desired.z - this.pos.z) * k(15);
    }
    this.lookAt.lerp(look, k(8));

    const s = this.shake;
    this.camera.position.copy(this.pos);
    if (s > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * s * 0.35;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.35;
      this.shake *= Math.exp(-9 * dt);
    }
    this.camera.lookAt(this.lookAt);
    const targetFov = 52 + Math.min(1, speed / 19) * 12;
    this.fov += (targetFov - this.fov) * k(2.5);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }

  snap() { this._init = false; this.introT = 0; }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    this.dom.removeEventListener('wheel', this._wheel);
  }
}
