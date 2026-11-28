import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FBX_URL, MODEL_SCALE, SOURCE_FPS, CLIP_RANGES } from '../config.js';

const TEX = '/textures/';
const TEXTURE_FILES = {
  horse: ['ArabianHorseTex_01.png', 'ArabianHorseTex_02.png', 'ArabianHorseTex_03.png', 'ArabianHorseTex_04.png'],
  horseNormal: 'ArabianHorseNM.png',
  jockey: ['JockeyTexture_03.png', 'JockeyTexture_02.png', 'JockeyTexture_01.png'], // JockeyMaterial, ' 1', ' 2'
  jockeyNormal: 'jockeyNM.png',
  bridle: 'BridleColor.png',
  bridleNormal: 'BridleNM.png',
  saddle: 'SadleColor.png',
  saddleNormal: 'SadleNM.png',
};

/**
 * Loads the Arabian horse + jockey FBX (Unity asset pack supplied by the project owner), its textures,
 * and splits the single 'Take 001' into the named clips defined in the pack's ArabianHorseJockey.txt.
 * Throws (and the UI reports) if anything essential is missing — there is no silent fallback.
 */
export class AssetLoader {
  constructor(onProgress = () => {}) {
    this.onProgress = onProgress;
    this.source = null;
    this.clips = {};
    this.textures = {};
  }

  async load() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_u, loaded, total) => this.onProgress(loaded / Math.max(total, 1));
    const texLoader = new THREE.TextureLoader(manager);
    const loadTex = (file, srgb) => new Promise((res, rej) =>
      texLoader.load(TEX + file, (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 4;
        t.flipY = true;
        res(t);
      }, undefined, () => rej(new Error('Missing texture: ' + file))));

    const fbxLoader = new FBXLoader(manager);
    fbxLoader.setResourcePath(TEX);
    const fbxPromise = fbxLoader.loadAsync(FBX_URL).catch(() => {
      throw new Error('Failed to load model ' + FBX_URL);
    });

    const T = TEXTURE_FILES;
    const [fbx, horse, jockey, hN, jN, br, brN, sd, sdN] = await Promise.all([
      fbxPromise,
      Promise.all(T.horse.map((f) => loadTex(f, true))),
      Promise.all(T.jockey.map((f) => loadTex(f, true))),
      loadTex(T.horseNormal, false), loadTex(T.jockeyNormal, false),
      loadTex(T.bridle, true), loadTex(T.bridleNormal, false),
      loadTex(T.saddle, true), loadTex(T.saddleNormal, false),
    ]);
    this.textures = { horse, jockey, horseNormal: hN, jockeyNormal: jN, bridle: br, bridleNormal: brN, saddle: sd, saddleNormal: sdN };

    if (!fbx.animations.length) throw new Error('Model has no animation take');
    const take = fbx.animations[0];
    for (const [name, [a, b]] of Object.entries(CLIP_RANGES)) {
      this.clips[name] = THREE.AnimationUtils.subclip(take, name, a, b, SOURCE_FPS);
    }
    fbx.scale.setScalar(MODEL_SCALE);
    this.source = fbx;
    return this;
  }

  /** Make an independent rider+horse instance with its own skeleton and materials. */
  createInstance({ horseTex = 1, jockeyMat = 0, silks = '#ffffff' } = {}) {
    const root = SkeletonUtils.clone(this.source);
    const t = this.textures;
    const mk = (map, normalMap, extra = {}) => new THREE.MeshStandardMaterial({
      map, normalMap, roughness: 0.75, metalness: 0.0, normalScale: new THREE.Vector2(0.8, 0.8), ...extra,
    });
    const horseMat = mk(t.horse[(horseTex - 1) % 4], t.horseNormal, { roughness: 0.6 });
    const jockeyMaterial = mk(t.jockey[jockeyMat % 3], t.jockeyNormal);
    const bridleMat = mk(t.bridle, t.bridleNormal, { roughness: 0.5 });
    const saddleMat = mk(t.saddle, t.saddleNormal, { color: new THREE.Color(silks) });
    const mats = { bridle_msh4: bridleMat, Arab_HorseB1: horseMat, Sadle1: saddleMat, Jokey_01polySurface1: jockeyMaterial };
    const ownMaterials = [horseMat, jockeyMaterial, bridleMat, saddleMat];
    const bones = {};
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = mats[o.name] || horseMat;
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds from the FBX are unreliable
      }
      if (o.isBone && !bones[o.name]) bones[o.name] = o;
    });
    return { root, bones, ownMaterials };
  }
}
