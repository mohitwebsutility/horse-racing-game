const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Keyboard + on-screen (pointer) input. Emits edge-triggered actions (hit, rear, camera, pause, start)
 * and exposes continuous state (run, brake, steer). Holding Space never repeats: only the keydown edge fires.
 */
export class InputController {
  constructor(target = window) {
    this.target = target;
    this.keys = new Set();
    this.touch = { left: false, right: false, run: false, brake: false };
    this.enabled = false;       // gameplay input (steering/hit) allowed
    this.capture = false;       // swallow page-scroll keys (Space/arrows) while a game screen is up
    this.listeners = {};
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
    this._onBlur = () => { this.keys.clear(); Object.keys(this.touch).forEach((k) => (this.touch[k] = false)); };
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
  off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter((f) => f !== fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  _keyDown(e) {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (BLOCK_KEYS.has(e.code) && (this.enabled || this.capture)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'Space': if (this.enabled) this.emit('hit'); break;
      case 'KeyR': if (this.enabled) this.emit('rear'); break;
      case 'KeyT': this.emit('reins'); break;
      case 'KeyV': this.emit('camera'); break;
      case 'Enter': this.emit('start'); break;
      case 'Escape': this.emit('pause'); break;
      default: break;
    }
  }

  _keyUp(e) { this.keys.delete(e.code); }

  get steer() {
    if (!this.enabled) return 0;
    const l = this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touch.left;
    const r = this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touch.right;
    return (r ? 1 : 0) - (l ? 1 : 0);
  }
  get run() { return this.enabled && (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touch.run); }
  get brake() { return this.enabled && (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touch.brake); }

  /** Bind an on-screen button: sets a held flag, or fires an event on press. */
  bindButton(el, { hold, fire }) {
    const down = (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('active');
      if (hold) this.touch[hold] = true;
      if (fire && this.enabled) this.emit(fire);
    };
    const up = (e) => { e.preventDefault(); el.classList.remove('active'); if (hold) this.touch[hold] = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.listeners = {};
  }
}
