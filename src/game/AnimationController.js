import * as THREE from 'three';

// Reference ground speeds (m/s) at which each clip's feet roughly stop sliding (timeScale = 1).
const GAIT = {
  walk:   { clip: 'WalkBack', ref: 1.9,  min: 0.35, max: 3.4 },
  trot:   { clip: 'Trot',     ref: 6.0,  min: 3.0,  max: 9.0 },
  gallop: { clip: 'Gallop',   ref: 15.0, min: 8.0,  max: 99 },
};

const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * Rotate `bone` by `angle` radians around an axis expressed in the model-root frame
 * (+Z forward, +Y up, -X rider's right). Works regardless of the bone's local axes.
 */
function rotateBoneInRootFrame(bone, rootQuatWorld, axis, angle) {
  bone.parent.getWorldQuaternion(_pq);
  _q.setFromAxisAngle(_axis.copy(axis).applyQuaternion(rootQuatWorld), angle);
  // newLocal = parent^-1 * R * parent * local
  bone.quaternion.premultiply(_pq.clone().invert().multiply(_q).multiply(_pq));
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Drives one horse+rider instance:
 *  - AnimationMixer clips for idle / walk / trot / gallop / rear with cross-fades and speed-matched timeScale
 *  - Procedural, post-mixer bone offsets for the stick-hit (right arm + torso) so a hit never interrupts the gait
 *  - Visual lean while steering
 */
export class AnimationController {
  constructor(instance, clips) {
    this.inst = instance;
    this.root = instance.root;
    this.bones = instance.bones;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {
      idle: this.mixer.clipAction(clips.Idle),
      walk: this.mixer.clipAction(clips[GAIT.walk.clip]),
      trot: this.mixer.clipAction(clips[GAIT.trot.clip]),
      gallop: this.mixer.clipAction(clips[GAIT.gallop.clip]),
      rear: this.mixer.clipAction(clips.Jump),
    };
    this.actions.rear.setLoop(THREE.LoopOnce, 1);
    this.actions.rear.clampWhenFinished = true;
    this.state = null;
    this.rearTime = 0;
    this.rearActive = false;
    this.hitT = -1;              // <0 means no hit in progress
    this.hitDuration = 0.34; // shorter than the hit cooldown so every valid hit can animate
    this.lean = 0;
    this.leanTarget = 0;
    this.stick = this._buildStick();
    this._setState('idle', 0);
    this.actions.idle.time = Math.random() * 4; // de-sync idle across horses
  }

  _buildStick() {
    const hand = this.bones.RightHand;
    const finger = this.bones.RightHandMiddle1;
    if (!hand || !finger) return null;
    // Stick is parented to the right-hand bone; direction follows the fingers.
    const dir = finger.position.clone().normalize();
    const len = 62; // bone space is centimetres
    const geo = new THREE.CylinderGeometry(0.55, 0.9, len, 6);
    geo.translate(0, len / 2 - 6, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x20150d, roughness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.castShadow = true;
    hand.add(mesh);
    this.inst.ownMaterials.push(mat);
    this.inst.ownGeometries = [geo];
    return mesh;
  }

  _setState(name, fade = 0.3) {
    if (this.state === name) return;
    const next = this.actions[name];
    const prev = this.state ? this.actions[this.state] : null;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (name === 'rear') next.reset();
    next.play();
    if (prev) {
      if (fade > 0) prev.crossFadeTo(next, fade, false);
      else prev.stop();
    }
    this.state = name;
  }

  /** Pick a gait for the given ground speed, with hysteresis so it does not flicker. */
  _gaitForSpeed(speed) {
    const cur = this.state;
    if (speed < 0.25) return 'idle';
    if (cur === 'idle' && speed < 0.45) return 'idle';
    const up = speed;
    if (cur === 'gallop') return speed > GAIT.gallop.min - 1.5 ? 'gallop' : (speed > GAIT.trot.min - 0.6 ? 'trot' : 'walk');
    if (up >= GAIT.gallop.min) return 'gallop';
    if (cur === 'trot') return speed > GAIT.trot.min - 0.6 ? 'trot' : 'walk';
    if (up >= GAIT.trot.min) return 'trot';
    return 'walk';
  }

  triggerHit() {
    if (this.hitT >= 0) return false;
    this.hitT = 0;
    return true;
  }

  triggerRear() {
    if (this.rearActive) return false;
    this.rearActive = true;
    this.rearTime = 0;
    this._setState('rear', 0.2);
    return true;
  }

  get isRearing() { return this.rearActive; }

  /** Return to a clean standing state (used when a race restarts). */
  reset() {
    this.rearActive = false; this.hitT = -1; this.lean = 0;
    this.mixer.stopAllAction();
    this.state = null;
    this._setState('idle', 0);
    this.actions.idle.time = Math.random() * 4;
  }

  update(dt, speed, steer) {
    // ---- locomotion state
    if (this.rearActive) {
      this.rearTime += dt;
      // Jump clip: 0 → rear peak at ~0.55s. We play to 0.62s then fade back to a locomotion gait.
      if (this.rearTime > 0.62) {
        this.rearActive = false;
        this.state = 'rear';
        this._setState(this._gaitForSpeed(speed), 0.35);
      }
    } else {
      const want = this._gaitForSpeed(speed);
      this._setState(want, want === 'gallop' || this.state === 'gallop' ? 0.35 : 0.25);
    }
    const g = GAIT[this.state];
    if (g) {
      const a = this.actions[this.state];
      a.timeScale = THREE.MathUtils.clamp(speed / g.ref, 0.55, 1.45);
    } else if (this.state === 'idle') {
      this.actions.idle.timeScale = 1;
    }
    this.mixer.update(dt);

    // ---- procedural overlays (applied after the mixer so they layer on top of the clip pose)
    this.leanTarget = steer;
    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 6);
    this.root.updateMatrixWorld(true);
    this._applyLean();
    this._applyHit(dt);
  }

  _applyLean() {
    const b = this.bones;
    const q = this.root.getWorldQuaternion(new THREE.Quaternion());
    if (Math.abs(this.lean) < 0.01) return;
    // Rider shifts weight into the turn; head and neck look into it.
    // -X is the rider's right, so steering right (lean>0) = rotate about +Y negative (clockwise from above).
    if (b.Spine1) rotateBoneInRootFrame(b.Spine1, q, AXIS_Z, -this.lean * 0.10);
    if (b.Neck) rotateBoneInRootFrame(b.Neck, q, AXIS_Y, -this.lean * 0.22);
    if (b.neck_flexi_bind_d01) rotateBoneInRootFrame(b.neck_flexi_bind_d01, q, AXIS_Y, -this.lean * 0.16);
    this.root.updateMatrixWorld(true);
  }

  _applyHit(dt) {
    if (this.hitT < 0) return;
    this.hitT += dt / this.hitDuration;
    const t = this.hitT;
    if (t >= 1) { this.hitT = -1; return; }
    // w: 0 → 1 (raise) → -0.55 (strike forward/down) → 0 (recover)
    let w;
    if (t < 0.38) w = smooth(t / 0.38);
    else if (t < 0.55) w = 1 - 1.55 * smooth((t - 0.38) / 0.17);
    else w = -0.55 * (1 - smooth((t - 0.55) / 0.45));
    const b = this.bones;
    const q = this.root.getWorldQuaternion(new THREE.Quaternion());
    // Forward is +Z, so rotating about +X by a negative angle swings a forward-pointing limb upward.
    if (b.Spine2) rotateBoneInRootFrame(b.Spine2, q, AXIS_Y, w * 0.18);
    if (b.RightShoulder) rotateBoneInRootFrame(b.RightShoulder, q, AXIS_X, -w * 0.25);
    if (b.RightArm) { rotateBoneInRootFrame(b.RightArm, q, AXIS_X, -w * 1.10); this.root.updateMatrixWorld(true); }
    if (b.RightForeArm) { rotateBoneInRootFrame(b.RightForeArm, q, AXIS_X, -w * 0.75); this.root.updateMatrixWorld(true); }
  }

  /** Force the hit overlay to a specific phase (debug / screenshots). */
  debugSetHit(t) { this.hitT = t; }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}
