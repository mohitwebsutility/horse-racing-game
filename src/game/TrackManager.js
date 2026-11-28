import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { TRACK } from '../config.js';

// Procedural canvas textures (no external image files needed for the environment).
function canvasTexture(w, h, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noiseFill(ctx, w, h, base, variance, count, size) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = (Math.random() - 0.5) * variance;
    const [r, g, b] = base.match(/\d+/g).map(Number);
    ctx.fillStyle = `rgba(${Math.max(0, Math.min(255, r + v))},${Math.max(0, Math.min(255, g + v))},${Math.max(0, Math.min(255, b + v))},0.5)`;
    const s = 1 + Math.random() * size;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function labelTexture(text, { w = 1024, h = 256, bg = '#0b1d3a', fg = '#ffffff', accent = '#ffd23f' } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, w, 14); ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = fg; ctx.font = '900 150px system-ui, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

/**
 * Builds the environment: sky, terrain, six-lane track, rails, finish/start structures,
 * grandstands with spectators, trees and trackside decoration. Everything is static except flags.
 */
export class TrackManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Track';
    scene.add(this.group);
    this.flags = [];
    this.disposables = [];
    this.laneCount = TRACK.laneCount;
    this.laneWidth = TRACK.laneWidth;
    this.trackWidth = this.laneCount * this.laneWidth;
    this.startZ = TRACK.startZ;
    this.finishZ = TRACK.startZ + TRACK.length;
    this.zMin = this.startZ - TRACK.runUp;
    this.zMax = this.finishZ + TRACK.runOut;
    this.sunDir = new THREE.Vector3();
    this._build();
  }

  laneX(i) { return ((this.laneCount - 1) / 2 - i) * this.laneWidth; } // lane 1 is on the left when looking down the track (+X)

  _track(o) { this.disposables.push(o); return o; }

  _build() {
    this._sky();
    this._lights();
    this._terrain();
    this._trackSurface();
    this._rails();
    this._gantries();
    this._markers();
    this._stands();
    this._scenery();
  }

  _sky() {
    const sky = new Sky();
    sky.scale.setScalar(3000);
    const u = sky.material.uniforms;
    u.turbidity.value = 2.4; u.rayleigh.value = 2.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    const elev = 38, azim = 215;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);
    this.sky = sky;
    this.scene.fog = new THREE.Fog(0xbfd6ea, 220, 1500);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5b7a3a, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 34;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 200 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = hemi;
  }

  /** Keep the shadow frustum centred on whatever the camera is following. */
  followShadow(pos) {
    this.sun.target.position.copy(pos);
    this.sun.position.copy(pos).addScaledVector(this.sunDir, 90);
  }

  _terrain() {
    const grassTex = canvasTexture(512, 512, (ctx, w, h) => {
      noiseFill(ctx, w, h, 'rgb(72,128,52)', 40, 9000, 3);
      for (let i = 0; i < 700; i++) { ctx.fillStyle = `rgba(${40 + Math.random() * 40},${100 + Math.random() * 50},${30 + Math.random() * 30},0.35)`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 6); }
    }, [260, 260]);
    const grass = this._track(new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Mown-stripe grass strips beside the track (infield and outfield).
    const stripeTex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = 'rgb(80,142,58)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgb(66,122,48)'; ctx.fillRect(0, h / 2, w, h / 2);
    }, [1, (this.zMax - this.zMin) / 8]);
    stripeTex.magFilter = THREE.NearestFilter;
    const sm = this._track(new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 1 }));
    for (const side of [-1, 1]) {
      const w = 28;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, this.zMax - this.zMin), sm);
      m.rotation.x = -Math.PI / 2;
      m.position.set(side * (this.trackWidth / 2 + 3 + w / 2), -0.04, (this.zMin + this.zMax) / 2);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  _trackSurface() {
    const L = this.zMax - this.zMin;
    const dirt = canvasTexture(512, 512, (ctx, w, h) => {
      noiseFill(ctx, w, h, 'rgb(176,134,92)', 46, 14000, 3);
      for (let i = 0; i < 420; i++) { ctx.fillStyle = 'rgba(120,88,58,0.28)'; ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 7, 1); }
    }, [this.trackWidth / 8, L / 8]);
    const mat = this._track(new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }));
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(this.trackWidth, L), mat);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(0, 0.0, (this.zMin + this.zMax) / 2);
    surf.receiveShadow = true;
    this.group.add(surf);

    // Lane lines
    const lineMat = this._track(new THREE.MeshBasicMaterial({ color: 0xf4efe4 }));
    const lineLen = this.finishZ - this.startZ + 6;
    for (let i = 0; i <= this.laneCount; i++) {
      const x = (i - this.laneCount / 2) * this.laneWidth;
      const outer = i === 0 || i === this.laneCount;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(outer ? 0.22 : 0.1, lineLen), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.04, this.startZ + lineLen / 2 - 3);
      this.group.add(m);
    }
    // Start line
    const start = new THREE.Mesh(new THREE.PlaneGeometry(this.trackWidth, 0.5), lineMat);
    start.rotation.x = -Math.PI / 2; start.position.set(0, 0.045, this.startZ);
    this.group.add(start);

    // Chequered finish line
    const check = canvasTexture(256, 32, (ctx, w, h) => {
      const n = 32; const s = h / 2;
      for (let y = 0; y < 2; y++) for (let x = 0; x < w / s; x++) { ctx.fillStyle = (x + y) % 2 ? '#fff' : '#111'; ctx.fillRect(x * s, y * s, s, s); }
    }, [1, 1]);
    check.wrapS = check.wrapT = THREE.ClampToEdgeWrapping;
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(this.trackWidth, 1.4), this._track(new THREE.MeshBasicMaterial({ map: check })));
    fin.rotation.x = -Math.PI / 2; fin.position.set(0, 0.05, this.finishZ);
    this.group.add(fin);

    // Lane numbers painted on the start area
    for (let i = 0; i < this.laneCount; i++) {
      const tex = canvasTexture(128, 128, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '900 100px system-ui, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), w / 2, h / 2 + 6);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this._track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI;
      m.position.set(this.laneX(i), 0.055, this.startZ + 7);
      this.group.add(m);
    }
  }

  _rails() {
    const half = this.trackWidth / 2 + 0.6;
    const railMat = this._track(new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 }));
    const postGeo = this._track(new THREE.CylinderGeometry(0.07, 0.07, 1.25, 8));
    const spacing = 4;
    const n = Math.floor((this.zMax - this.zMin) / spacing);
    const posts = new THREE.InstancedMesh(postGeo, railMat, n * 2);
    posts.castShadow = true;
    const m = new THREE.Matrix4();
    let k = 0;
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) { m.makeTranslation(side * half, 0.62, this.zMin + i * spacing); posts.setMatrixAt(k++, m); }
    this.group.add(posts);
    const barGeo = this._track(new THREE.BoxGeometry(0.08, 0.1, this.zMax - this.zMin));
    for (const side of [-1, 1]) for (const y of [0.55, 1.1]) {
      const bar = new THREE.Mesh(barGeo, railMat);
      bar.position.set(side * half, y, (this.zMin + this.zMax) / 2);
      bar.castShadow = true;
      this.group.add(bar);
    }
    // Soft run-out barrier at the end
    const end = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth + 2, 1.6, 0.4), this._track(new THREE.MeshStandardMaterial({ color: 0x1b3a73 })));
    end.position.set(0, 0.8, this.zMax);
    this.group.add(end);
    const back = end.clone(); back.position.z = this.zMin; this.group.add(back);
  }

  _gantry(z, text, color) {
    const g = new THREE.Group();
    const w = this.trackWidth + 5;
    const pillarMat = this._track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 }));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.5, 0.7), pillarMat);
      p.position.set(s * w / 2, 4.25, 0); p.castShadow = true; g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.6, 0.9), pillarMat);
    beam.position.y = 8.3; beam.castShadow = true; g.add(beam);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.62, 2.4), this._track(new THREE.MeshBasicMaterial({ map: labelTexture(text), side: THREE.DoubleSide })));
    sign.position.set(0, 7.0, 0.0); g.add(sign);
    g.position.z = z;
    this.group.add(g);
  }

  _gantries() {
    this._gantry(this.finishZ, 'FINISH', 0xd7263d);
    this._gantry(this.startZ - 3, 'START', 0x1d4ed8);
  }

  _markers() {
    // Distance boards every 100 m on both rails
    const side = this.trackWidth / 2 + 1.4;
    for (let d = 100; d < TRACK.length; d += 100) {
      const remain = TRACK.length - d;
      const tex = canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#c1121f'; ctx.fillRect(0, 0, w, 56);
        ctx.fillStyle = '#fff'; ctx.font = '700 40px system-ui, Arial'; ctx.textAlign = 'center'; ctx.fillText('TO GO', w / 2, 42);
        ctx.fillStyle = '#111'; ctx.font = '900 120px system-ui, Arial'; ctx.fillText(String(remain), w / 2, 190);
      });
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.08), this._track(new THREE.MeshStandardMaterial({ map: tex })));
        b.position.set(s * side, 1.1, this.startZ + d);
        b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        b.castShadow = true;
        this.group.add(b);
      }
    }
  }

  _stands() {
    // Grandstand on the +X side, centred near the finish
    const len = 190, depth = 30, rows = 14, rowH = 0.8, rowD = 1.8;
    const cx = this.trackWidth / 2 + 14;
    const cz = this.finishZ - 40;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const concrete = this._track(new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.9 }));
    const rowGeo = this._track(new THREE.BoxGeometry(rowD, rowH, len));
    const seatMat = this._track(new THREE.MeshStandardMaterial({ color: 0x244d9a, roughness: 0.8 }));
    for (let r = 0; r < rows; r++) {
      const row = new THREE.Mesh(rowGeo, concrete);
      row.position.set(r * rowD + rowD / 2, r * rowH + rowH / 2, 0);
      row.castShadow = true; row.receiveShadow = true;
      g.add(row);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, len - 2), seatMat);
      seat.position.set(r * rowD + 0.7, r * rowH + rowH + 0.06, 0);
      g.add(seat);
    }
    // Roof
    const roofMat = this._track(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side: THREE.DoubleSide }));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(rows * rowD + 6, 0.5, len + 4), roofMat);
    roof.position.set(rows * rowD / 2 - 0.5, rows * rowH + 5.5, 0);
    roof.rotation.z = 0.06;
    roof.castShadow = true;
    g.add(roof);
    const colMat = this._track(new THREE.MeshStandardMaterial({ color: 0x8a8f98 }));
    for (let z = -len / 2 + 5; z <= len / 2; z += 20) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, rows * rowH + 5.5, 0.5), colMat);
      col.position.set(rows * rowD - 0.5, (rows * rowH + 5.5) / 2, z);
      col.castShadow = true;
      g.add(col);
    }
    // Banner under the roof
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(60, 5), this._track(new THREE.MeshBasicMaterial({ map: labelTexture('ARABIAN CUP', { w: 1536, h: 160, bg: '#7a0f2e', accent: '#ffd23f' }), side: THREE.DoubleSide })));
    banner.rotation.y = -Math.PI / 2;
    banner.position.set(-0.1, 1.9, 0);
    g.add(banner);
    this.group.add(g);

    // Spectators: instanced capsules across the rows
    const spectGeo = this._track(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6));
    const spectMat = this._track(new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    const per = 120;
    const spect = new THREE.InstancedMesh(spectGeo, spectMat, rows * per);
    const m = new THREE.Matrix4(); const col = new THREE.Color();
    let k = 0;
    const palette = [0xe63946, 0xf1faee, 0x457b9d, 0xffd23f, 0x2ec27e, 0xff8c1a, 0x9b5de5, 0x222222, 0xffffff];
    this.spectators = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) {
      const z = (-len / 2 + 2) + (i + Math.random() * 0.7) * ((len - 4) / per);
      const y = r * rowH + rowH + 0.55;
      m.makeTranslation(r * rowD + 0.75, y, z);
      spect.setMatrixAt(k, m);
      col.setHex(palette[(Math.random() * palette.length) | 0]);
      spect.setColorAt(k, col);
      this.spectators.push({ r, z, y, x: r * rowD + 0.75, phase: Math.random() * 6.28 });
      k++;
    }
    spect.instanceColor.needsUpdate = true;
    spect.castShadow = false;
    g.add(spect);
    this.spectMesh = spect;
    this.spectGroup = g;
    this._spectMatrix = m;

    // Smaller stand on the -X side
    const terr = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 90), concrete);
    terr.position.set(-this.trackWidth / 2 - 13, 2.5, this.finishZ - 30);
    terr.castShadow = true; terr.receiveShadow = true;
    this.group.add(terr);
  }

  _scenery() {
    // Trees (instanced)
    const trunkGeo = this._track(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 6)); trunkGeo.translate(0, 1.6, 0);
    const leafGeo = this._track(new THREE.IcosahedronGeometry(2.2, 0)); leafGeo.translate(0, 4.6, 0);
    const trunkMat = this._track(new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 1 }));
    const leafMat = this._track(new THREE.MeshStandardMaterial({ color: 0x2f7a3d, roughness: 0.9, flatShading: true }));
    const N = 260;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (45 + Math.random() * 160);
      const z = this.zMin - 100 + Math.random() * (this.zMax - this.zMin + 200);
      if (side > 0 && x < 70 && z > this.finishZ - 140 && z < this.finishZ + 60) { p.set(-x, 0, z); } else p.set(x, 0, z);
      const sc = 0.8 + Math.random() * 1.1;
      s.set(sc, sc * (0.9 + Math.random() * 0.4), sc);
      q.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, 0));
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m); leaves.setMatrixAt(i, m);
    }
    trunks.castShadow = leaves.castShadow = true;
    this.group.add(trunks, leaves);

    // Rolling hills on the horizon
    const hillMat = this._track(new THREE.MeshStandardMaterial({ color: 0x5f8f4a, roughness: 1, flatShading: true }));
    for (let i = 0; i < 18; i++) {
      const r = 120 + Math.random() * 180;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      hill.scale.y = 0.22 + Math.random() * 0.12;
      const side = i % 2 ? 1 : -1;
      hill.position.set(side * (420 + Math.random() * 380), -2, this.zMin + (i / 18) * (this.zMax - this.zMin + 800) - 300);
      this.group.add(hill);
    }

    // Flags along the stand side, animated by a cheap vertex wobble in update()
    const flagColors = [0xe63946, 0x1d7bff, 0xffd23f, 0x2ec27e, 0xff8c1a, 0xb158e8];
    const poleMat = this._track(new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    for (let i = 0; i < 24; i++) {
      const z = this.startZ + (i / 23) * TRACK.length;
      for (const side of [-1, 1]) {
        const x = side * (this.trackWidth / 2 + 3.2);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 6), poleMat);
        pole.position.set(x, 3.5, z); pole.castShadow = true; this.group.add(pole);
        const geo = new THREE.PlaneGeometry(2.2, 1.3, 8, 1); geo.translate(1.1, 0, 0);
        const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: flagColors[(i + (side > 0 ? 3 : 0)) % flagColors.length], side: THREE.DoubleSide, roughness: 0.8 }));
        flag.position.set(x, 6.3, z);
        flag.rotation.y = Math.PI / 2;
        this.group.add(flag);
        this.flags.push({ mesh: flag, base: geo.attributes.position.array.slice(), phase: Math.random() * 6.28 });
      }
    }
  }

  update(dt, time) {
    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = f.base[i * 3];
        pos.setZ(i, Math.sin(x * 2.2 - time * 5 + f.phase) * 0.12 * x);
      }
      pos.needsUpdate = true;
    }
    // Crowd cheers: bob a handful of spectator rows (cheap: update a rotating subset each frame)
    if (this.spectMesh) {
      const m = this._spectMatrix; const n = this.spectators.length;
      const start = (this._spectCursor = ((this._spectCursor || 0) + 400) % n);
      for (let i = start; i < Math.min(n, start + 400); i++) {
        const s = this.spectators[i];
        m.makeTranslation(s.x, s.y + Math.max(0, Math.sin(time * 6 + s.phase)) * 0.12 * (this.crowdExcite || 0.3), s.z);
        this.spectMesh.setMatrixAt(i, m);
      }
      this.spectMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((mt) => { for (const k of Object.keys(mt)) if (mt[k] && mt[k].isTexture) mt[k].dispose(); mt.dispose(); }); }
    });
    this.sky?.geometry.dispose(); this.sky?.material.dispose();
  }
}
