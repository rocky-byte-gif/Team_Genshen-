import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { QualityLevel } from '../../config/render.config';
import { clamp } from '../../lib/math/geometry';
import { createRng } from '../gameplay/course';
import type { CoverKind, LevelDef, ThemeId } from './levels';
import type { Enemy, FxEvent, MadGame, Target } from './MadGame';
import { buildHumanoid, type HumanoidRig, type HumanoidRole } from './humanoidRig';
import type { MadControls } from './madInput';
import { asphaltTexture, buildViewModel, canvasTexture, concreteTexture, facadeTextures, ParticlePool, scaleUV, softSprite, type ViewModel } from './sceneKit';
import type { WeaponDef } from './weapons';

interface Theme {
  top: number;
  horizon: number;
  sun: number;
  sunInt: number;
  /** Degrees above the horizon, and the direction (degrees, 0 = straight ahead). */
  sunElev: number;
  sunAz: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  fog: number;
  fogDensity: number;
  exposure: number;
  bloom: number;
  facade: string;
  lit: boolean;
  stars: boolean;
  embers: boolean;
  rain: boolean;
}

const THEMES: Record<ThemeId, Theme> = {
  dusk: { top: 0x1c2b52, horizon: 0xff8a4a, sun: 0xffa868, sunInt: 3.2, sunElev: 9, sunAz: 25, hemiSky: 0x7a8cc8, hemiGround: 0x4a2c20, hemiInt: 0.9, fog: 0xb86a44, fogDensity: 0.017, exposure: 1.0, bloom: 0.55, facade: '#7a6a5a', lit: false, stars: false, embers: false, rain: false },
  noon: { top: 0x3a78c8, horizon: 0xcfe2f0, sun: 0xfff2dc, sunInt: 3.8, sunElev: 52, sunAz: -20, hemiSky: 0xbcd4ee, hemiGround: 0x6a6258, hemiInt: 1.1, fog: 0xb8cbd8, fogDensity: 0.009, exposure: 0.95, bloom: 0.3, facade: '#8a8478', lit: false, stars: false, embers: false, rain: false },
  overcast: { top: 0x6a7480, horizon: 0xaeb6bd, sun: 0xdde4ea, sunInt: 1.4, sunElev: 40, sunAz: 10, hemiSky: 0xaab4bc, hemiGround: 0x555a58, hemiInt: 1.3, fog: 0x9aa3ab, fogDensity: 0.018, exposure: 1.0, bloom: 0.25, facade: '#6a6c6c', lit: false, stars: false, embers: false, rain: false },
  golden: { top: 0x28487a, horizon: 0xffbf5e, sun: 0xffcc7a, sunInt: 3.4, sunElev: 13, sunAz: -30, hemiSky: 0x8aa4d4, hemiGround: 0x5a4430, hemiInt: 0.85, fog: 0xd9a35c, fogDensity: 0.013, exposure: 1.0, bloom: 0.6, facade: '#8a7458', lit: false, stars: false, embers: false, rain: false },
  night: { top: 0x03060e, horizon: 0x16213c, sun: 0x8aa8ff, sunInt: 0.9, sunElev: 38, sunAz: 15, hemiSky: 0x2c3c6a, hemiGround: 0x10121a, hemiInt: 0.65, fog: 0x0a1020, fogDensity: 0.024, exposure: 1.25, bloom: 0.95, facade: '#4c5058', lit: true, stars: true, embers: false, rain: false },
  dawn: { top: 0x2a3a5a, horizon: 0xe8a3a0, sun: 0xffc8b0, sunInt: 2.2, sunElev: 6, sunAz: -15, hemiSky: 0x9aaac8, hemiGround: 0x5a5058, hemiInt: 0.9, fog: 0xbca0b0, fogDensity: 0.014, exposure: 1.0, bloom: 0.5, facade: '#7a7270', lit: false, stars: false, embers: false, rain: false },
  inferno: { top: 0x1a0705, horizon: 0xff4a14, sun: 0xff7a30, sunInt: 2.4, sunElev: 10, sunAz: 20, hemiSky: 0x8a3a24, hemiGround: 0x2a0e08, hemiInt: 0.9, fog: 0x6a1c0c, fogDensity: 0.021, exposure: 1.05, bloom: 0.9, facade: '#5a463c', lit: true, stars: false, embers: true, rain: false },
  storm: { top: 0x080d16, horizon: 0x3a4a5a, sun: 0x8aa0c0, sunInt: 1, sunElev: 30, sunAz: 0, hemiSky: 0x5a6a80, hemiGround: 0x1c2228, hemiInt: 0.8, fog: 0x1f2933, fogDensity: 0.026, exposure: 1.1, bloom: 0.7, facade: '#50565c', lit: true, stars: false, embers: false, rain: true },
};

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uStars; uniform float uFlash;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 90.0) * 1.2 + pow(s, 900.0) * 6.0);
  col = mix(col, uHorizon, pow(1.0 - h, 6.0) * 0.6);
  if (uStars > 0.5 && d.y > 0.05) {
    float st = step(0.9965, hash(floor(d * 220.0)));
    col += vec3(st) * smoothstep(0.05, 0.4, d.y);
  }
  col += vec3(0.5, 0.6, 0.9) * uFlash * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;

const POST_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uDamage: { value: 0 }, uScope: { value: 0 }, uAspect: { value: 1.7 }, uFlash: { value: 0 }, uHeal: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uTime; uniform float uDamage; uniform float uScope; uniform float uAspect; uniform float uFlash; uniform float uHeal;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  float ca = (0.0012 + uDamage * 0.008 + uScope * 0.002) * r2 * 4.0;
  vec3 col;
  col.r = texture2D(tDiffuse, vUv + c * ca).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv - c * ca).b;
  vec2 cc = c * vec2(uAspect, 1.0);
  float d = length(cc);
  float vig = 1.0 - smoothstep(0.35, 1.05, d) * (0.5 + uScope * 0.3);
  col *= vig;
  float scope = smoothstep(0.52, 0.47, d);
  col = mix(col, col * scope, uScope);
  col = mix(col, col * vec3(1.5, 0.45, 0.45) + vec3(0.1, 0.0, 0.0), uDamage * 0.65 * smoothstep(0.05, 0.9, length(c) * 1.6));
  col += vec3(0.0, 0.08, 0.04) * uHeal * smoothstep(0.2, 0.9, length(c));
  col += (hash(vUv * 1013.0 + uTime) - 0.5) * 0.032;
  col += uFlash * vec3(1.0, 0.82, 0.55);
  gl_FragColor = vec4(col, 1.0);
}`,
};

const VIEW_OFFSETS: Record<string, { p: [number, number, number]; r: [number, number, number] }> = {
  boxing: { p: [0, -0.05, -0.1], r: [0, 0, 0] },
  sword: { p: [0.15, -0.12, -0.2], r: [0.1, 0.2, -0.15] },
  knife: { p: [0.26, -0.24, -0.52], r: [0.25, 0.35, -0.35] },
  pistol: { p: [0.22, -0.25, -0.56], r: [0, 0.03, 0] },
  deagle: { p: [0.22, -0.25, -0.56], r: [0, 0.03, 0] },
  rifle: { p: [0.19, -0.27, -0.62], r: [0, 0.04, 0] },
  auto: { p: [0.19, -0.26, -0.58], r: [0, 0.04, 0] },
  sniper: { p: [0.17, -0.26, -0.62], r: [0, 0.03, 0] },
  bomb: { p: [0.22, -0.2, -0.5], r: [0.2, 0, 0] },
  rocket: { p: [0.3, -0.3, -0.78], r: [0, -0.04, 0] },
};

interface EnemyVisual {
  enemy: Enemy;
  rig: HumanoidRig;
  flashT: number;
  fall: number;
}

interface Transient {
  obj: THREE.Object3D;
  t: number;
  max: number;
  kind: 'fireball' | 'ring' | 'tracer';
  scale: number;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const ndc = new THREE.Vector2();

export class MadScene {
  readonly targets = new Map<number, Target>();
  aspect = 16 / 9;
  cameraMode: 'fpp' | 'tpp' = 'fpp';
  private readonly playerRig: HumanoidRig;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 700);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private post: ShaderPass | null = null;
  private readonly theme: Theme;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sky: THREE.Mesh;
  private readonly skyUniforms: Record<string, { value: unknown }>;
  private readonly sunDir = new THREE.Vector3();
  private readonly view: ViewModel;
  private readonly viewRoot = new THREE.Group();
  private readonly viewFlash: THREE.Sprite;
  private readonly muzzleLight = new THREE.PointLight(0xffa860, 0, 14, 2);
  private readonly blastLight = new THREE.PointLight(0xff7a30, 0, 60, 1.6);
  private readonly sparks = new ParticlePool(900, true, 7, 0.9);
  private readonly smoke = new ParticlePool(360, false, -0.7, 1.4);
  private readonly motes = new ParticlePool(420, true, -0.05, 0.1);
  private rain: THREE.LineSegments | null = null;
  private readonly visuals: EnemyVisual[] = [];
  private readonly transients: Transient[] = [];
  private readonly ray = new THREE.Raycaster();
  private readonly flashTex = softSprite();
  private readonly enemyZ: number;
  private readonly runLen: number;
  private quality: QualityLevel = 'high';
  private maxDpr = 1.5;
  private width = 1;
  private height = 1;
  private shake = 0;
  private kick = 0;
  private slash = 0;
  private throwHide = 0;
  private fov = 62;
  private scopeAmt = 0;
  private flashPost = 0;
  private lightning = 0;
  private nextLightning = 4;
  private muzzleT = 0;
  private time = 0;
  private emberAcc = 0;
  private readonly observer: ResizeObserver;
  private readonly weapon: WeaponDef;

  private readonly canvas: HTMLCanvasElement;
  private readonly level: LevelDef;

  constructor(canvas: HTMLCanvasElement, level: LevelDef, weapon: WeaponDef, quality: QualityLevel) {
    this.canvas = canvas;
    this.level = level;
    this.weapon = weapon;
    this.theme = THEMES[level.theme];
    this.runLen = level.run;
    this.enemyZ = -(level.run + level.range);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.theme.exposure;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.camera);

    const th = this.theme;
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiInt);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(th.sun, th.sunInt);
    const el = (th.sunElev * Math.PI) / 180;
    const az = (th.sunAz * Math.PI) / 180;
    // The sun sits ahead of the player, low, so shadows fall toward the camera and long silhouettes read well.
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -28;
    this.sun.shadow.camera.right = 28;
    this.sun.shadow.camera.top = 28;
    this.sun.shadow.camera.bottom = -28;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    // Sky.
    this.skyUniforms = {
      uTop: { value: new THREE.Color(th.top) },
      uHorizon: { value: new THREE.Color(th.fog) },
      uSunDir: { value: this.sunDir.clone() },
      uSunColor: { value: new THREE.Color(th.sun).multiplyScalar(th.sunInt > 2 ? 0.8 : 0.4) },
      uStars: { value: th.stars ? 1 : 0 },
      uFlash: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyUniforms as unknown as Record<string, THREE.IUniform>, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const rng = createRng(level.id * 7919 + 13);
    this.buildWorld(rng);
    this.buildPlayerCover(rng);
    this.buildEnemies();

    // First-person weapon.
    this.view = buildViewModel(weapon.id);
    const vo = VIEW_OFFSETS[weapon.id] ?? { p: [0.22, -0.25, -0.56], r: [0, 0, 0] };
    this.viewRoot.position.set(...vo.p);
    this.viewRoot.rotation.set(...vo.r);
    this.viewRoot.add(this.view.group);
    this.view.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
    });
    this.camera.add(this.viewRoot);
    this.viewFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.viewFlash.scale.setScalar(0.34);
    this.viewFlash.visible = false;
    this.view.muzzle.add(this.viewFlash);
    this.muzzleLight.position.set(0.15, -0.05, -0.9);
    this.camera.add(this.muzzleLight);
    this.scene.add(this.blastLight, this.sparks.points, this.smoke.points, this.motes.points);
    if (th.rain) this.buildRain();
    this.playerRig = buildHumanoid('player');
    this.playerRig.root.visible = false;
    this.scene.add(this.playerRig.root);

    this.setQuality(quality);
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(canvas);
    this.fit();
  }

  toggleCameraMode(): 'fpp' | 'tpp' {
    this.cameraMode = this.cameraMode === 'fpp' ? 'tpp' : 'fpp';
    return this.cameraMode;
  }

  setCameraMode(mode: 'fpp' | 'tpp'): void {
    this.cameraMode = mode;
  }

  // --- Setup ---------------------------------------------------------------

  private buildWorld(rng: () => number): void {
    const th = this.theme;
    const total = this.runLen + this.level.range + 70;
    const zMid = 14 - total / 2;

    const asphalt = asphaltTexture(rng);
    asphalt.repeat.set(1, total / 14);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(16, total), new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphalt, bumpScale: 0.8, roughness: 0.9, metalness: 0 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, zMid);
    road.receiveShadow = true;
    this.scene.add(road);

    const concrete = concreteTexture(rng);
    const concreteMat = new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: 1.5, roughness: 0.95 });
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, total), concreteMat);
      scaleUV(walk.geometry, 1, total / 3);
      walk.position.set(side * 9.5, 0.09, zMid);
      walk.receiveShadow = true;
      this.scene.add(walk);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, total + 200), new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, zMid);
    this.scene.add(ground);

    // Buildings on both sides, with ruined tops.
    const facades = [facadeTextures(rng, th.facade, th.lit), facadeTextures(rng, '#5a5d63', th.lit), facadeTextures(rng, '#80705e', th.lit)];
    const mats = facades.map((f) => new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.glow, emissive: th.lit ? new THREE.Color(1, 0.8, 0.5) : new THREE.Color(0, 0, 0), emissiveIntensity: th.lit ? 1.6 : 0, roughness: 0.92 }));
    for (const side of [-1, 1]) {
      let z = 16;
      while (z > -total + 30) {
        const w = 7 + rng() * 6;
        const d = 9 + rng() * 5;
        const h = 9 + rng() * 20;
        const geo = new THREE.BoxGeometry(w, h, d);
        scaleUV(geo, w / 9, h / 18);
        const b = new THREE.Mesh(geo, mats[Math.floor(rng() * mats.length)] as THREE.Material);
        b.position.set(side * (11.2 + w / 2 + rng() * 1.5), h / 2, z - d / 2);
        b.receiveShadow = true;
        b.castShadow = h < 16;
        this.scene.add(b);
        // Broken roof edge.
        if (rng() > 0.45) {
          const chunk = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1 + rng() * 2.5, d * 0.5), concreteMat);
          chunk.position.set(b.position.x + (rng() - 0.5) * w * 0.4, h + 0.6, b.position.z);
          chunk.rotation.z = (rng() - 0.5) * 0.4;
          this.scene.add(chunk);
        }
        z -= d + 0.5 + rng() * 2;
      }
    }
    // Far skyline.
    const far = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.fog).multiplyScalar(0.55) });
    for (let i = 0; i < 16; i++) {
      const w = 8 + rng() * 14;
      const h = 14 + rng() * 40;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), far);
      m.position.set((i - 8) * 14 + rng() * 6, h / 2, -total + 6 - rng() * 30);
      this.scene.add(m);
    }

    // Props along the road edges; the middle of the street stays clear.
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 0.9, bumpMap: concrete, bumpScale: 1 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: 0.6, metalness: 0.6 });
    const car = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.55, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0b0e14, roughness: 0.15, metalness: 0.8 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7, metalness: 0.6 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a18, toneMapped: false });
    const add = (m: THREE.Object3D, cast = true) => {
      m.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) {
          mm.castShadow = cast;
          mm.receiveShadow = true;
        }
      });
      this.scene.add(m);
    };
    let z = 8;
    while (z > -total + 34) {
      const side = rng() > 0.5 ? 1 : -1;
      const x = side * (6.2 + rng() * 1.4);
      const roll = rng();
      if (roll < 0.22) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.6), concreteMat);
        bar.position.set(x, 0.5, z);
        bar.rotation.y = (rng() - 0.5) * 0.6;
        add(bar);
      } else if (roll < 0.4) {
        for (let k = 0; k < 1 + Math.floor(rng() * 3); k++) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), wood);
          c.position.set(x + (rng() - 0.5) * 1.6, 0.55 + k * 0.02, z + k * 1.3);
          c.rotation.y = rng() * 1.2;
          add(c);
        }
      } else if (roll < 0.52) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.95, 14), rust);
        barrel.position.set(x, 0.48, z);
        add(barrel);
        if ((th.embers || th.lit) && rng() > 0.4) {
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 8), flameMat);
          flame.position.set(x, 1.25, z);
          this.scene.add(flame);
          const l = new THREE.PointLight(0xff7a30, 6, 12, 2);
          l.position.set(x, 1.6, z);
          this.scene.add(l);
        }
      } else if (roll < 0.64) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), car);
        body.position.y = 0.55;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.1), glass);
        cab.position.set(0, 1.12, -0.2);
        g.add(body, cab);
        for (const wx of [-0.95, 0.95]) for (const wz of [-1.4, 1.4]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), poleMat);
          wh.rotation.z = Math.PI / 2;
          wh.position.set(wx, 0.34, wz);
          g.add(wh);
        }
        g.position.set(side * (5.6 + rng()), 0, z);
        g.rotation.y = (rng() - 0.5) * 0.9;
        g.rotation.z = (rng() - 0.5) * 0.1;
        add(g);
      } else if (roll < 0.8) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.2, 8), poleMat);
        pole.position.set(side * 8.3, 3.1, z);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.08), poleMat);
        arm.position.set(side * 7.7, 6.1, z);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.25), lampMat);
        lamp.position.set(side * 7.2, 6.02, z);
        this.scene.add(pole, arm, lamp);
        if (th.lit && rng() > 0.5) {
          const pl = new THREE.PointLight(0xffd9a0, 18, 22, 2);
          pl.position.set(side * 7.2, 5.8, z);
          this.scene.add(pl);
        }
      } else {
        // Sandbag wall.
        for (let k = 0; k < 6; k++) {
          const sb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.4), wood);
          sb.position.set(x + (k % 3) * 0.72 - 0.7, 0.14 + Math.floor(k / 3) * 0.28, z);
          sb.scale.set(1, 1, 1 + rng() * 0.2);
          add(sb);
        }
      }
      z -= 3 + rng() * 4;
    }
    // Rubble in the street (low, off the centre line).
    for (let i = 0; i < 70; i++) {
      const rz = 6 - rng() * (total - 30);
      const rx = (rng() > 0.5 ? 1 : -1) * (3 + rng() * 5);
      const s = 0.12 + rng() * 0.4;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), concreteMat);
      r.position.set(rx, s * 0.4, rz);
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      r.castShadow = true;
      this.scene.add(r);
    }
  }

  /** The concrete cover the player fights from: a low wall with tall end pillars, sandbags and rebar. */
  private buildPlayerCover(rng: () => number): void {
    const concrete = concreteTexture(rng, '#8a8780');
    const mat = new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: 2.2, roughness: 0.95 });
    const sand = new THREE.MeshStandardMaterial({ color: 0x6a5c40, roughness: 1, bumpMap: concrete, bumpScale: 1.5 });
    const rebar = new THREE.MeshStandardMaterial({ color: 0x5a2e1c, roughness: 0.5, metalness: 0.7 });
    const z = -this.runLen - 1.35;
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.15, 0.7), mat);
    scaleUV(wall.geometry, 2, 1);
    wall.position.set(0, 0.575, z);
    g.add(wall);
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.7, 0.85), mat);
      scaleUV(pillar.geometry, 1, 2);
      pillar.position.set(sx * 2.7, 1.35, z + 0.05);
      pillar.rotation.z = sx * 0.02;
      g.add(pillar);
      for (let k = 0; k < 3; k++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6 + rng() * 0.3, 6), rebar);
        bar.position.set(sx * 2.7 + (k - 1) * 0.25, 2.8, z + 0.05);
        bar.rotation.set((rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.5);
        g.add(bar);
      }
    }
    for (let k = 0; k < 5; k++) {
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.45), sand);
      sb.position.set(-1.7 + k * 0.82, 1.3, z + 0.05);
      sb.rotation.y = (rng() - 0.5) * 0.15;
      g.add(sb);
    }
    // Bullet chips on the wall.
    const chipMat = new THREE.MeshBasicMaterial({ color: 0x2a2824 });
    for (let k = 0; k < 14; k++) {
      const chip = new THREE.Mesh(new THREE.CircleGeometry(0.03 + rng() * 0.07, 7), chipMat);
      chip.position.set((rng() - 0.5) * 4.2, 0.2 + rng() * 0.9, z + 0.36);
      g.add(chip);
    }
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.scene.add(g);
  }

  private buildEnemies(): void {
    const concrete = concreteTexture(createRng(this.level.id), '#7e7b74');
    const concreteMat = new THREE.MeshStandardMaterial({ map: concrete, bumpMap: concrete, bumpScale: 1.5, roughness: 0.95 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7, metalness: 0.3, bumpMap: concrete, bumpScale: 1 });
    const stripe = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#c9a227';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1a1a';
      for (let i = -h; i < w + h; i += 16) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 8, 0);
        g.lineTo(i + 8 + h, h);
        g.lineTo(i + h, h);
        g.fill();
      }
    });
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 });
    const heights: Record<CoverKind, number> = { barrier: 1, crate: 1.1, wall: 1.35 };
    this.rigs.length = 0;
    const role: HumanoidRole = this.weapon.id === 'boxing' ? 'boxer' : this.weapon.id === 'sword' ? 'swordmaster' : 'soldier';
    for (const spec of this.level.enemies) {
      const x = spec.lane * 4.2 + (spec.dx ?? 0);
      const rig = buildHumanoid(role);
      rig.root.position.set(x, 0, this.enemyZ);
      rig.root.rotation.y = Math.atan2(-x, this.runLen);
      this.scene.add(rig.root);
      this.rigs.push(rig);
      const h = heights[spec.cover];
      const cover = new THREE.Mesh(spec.cover === 'crate' ? new THREE.BoxGeometry(1.4, h, 1.4) : spec.cover === 'wall' ? new THREE.BoxGeometry(2.6, h, 0.55) : new THREE.BoxGeometry(2.1, h, 0.62), spec.cover === 'crate' ? crateMat : concreteMat);
      scaleUV(cover.geometry, 1.5, 1);
      cover.position.set(x, h / 2, this.enemyZ + 0.95);
      cover.castShadow = true;
      cover.receiveShadow = true;
      this.scene.add(cover);
      if (spec.cover === 'barrier') {
        const band = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.16, 0.64), stripeMat);
        band.position.set(x, h - 0.1, this.enemyZ + 0.95);
        this.scene.add(band);
      }
      rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
    }
  }

  private readonly rigs: HumanoidRig[] = [];

  /** Links the scene's soldiers to the game's enemy state (once the game exists). */
  bind(game: MadGame): void {
    this.visuals.length = 0;
    for (const [i, enemy] of game.enemies.entries()) {
      const rig = this.rigs[i];
      if (rig) this.visuals.push({ enemy, rig, flashT: 0, fall: 0 });
    }
  }

  private buildRain(): void {
    const n = 900;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 36;
      const y = Math.random() * 18;
      const z = (Math.random() - 0.5) * 50;
      pos.set([x, y, z, x - 0.05, y - 0.7, z + 0.04], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.32, fog: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  // --- Quality and size -------------------------------------------------------

  setQuality(q: QualityLevel): void {
    this.quality = q;
    this.maxDpr = q === 'high' ? 1.5 : q === 'medium' ? 1.25 : 1;
    const shadows = q !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    if (q === 'low') {
      this.composer?.dispose();
      this.composer = null;
      this.bloom = null;
      this.post = null;
    } else if (!this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), this.theme.bloom, 0.6, 0.82);
      this.composer.addPass(this.bloom);
      this.post = new ShaderPass(POST_SHADER);
      this.composer.addPass(this.post);
      this.composer.addPass(new OutputPass());
    }
    if (this.bloom) this.bloom.strength = this.theme.bloom * (q === 'medium' ? 0.8 : 1);
    this.fit();
  }

  private fit(): void {
    const w = Math.max(2, this.canvas.clientWidth);
    const h = Math.max(2, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.width = w;
    this.height = h;
    this.aspect = w / h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
    }
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  // --- Per-frame -----------------------------------------------------------------

  /** Where a screen position (aspect-corrected units, y up) lands on the plane of the enemies. */
  private worldAt(sx: number, sy: number, out: THREE.Vector3, planeZ = this.enemyZ): THREE.Vector3 {
    this.ray.setFromCamera(ndc.set(sx / this.aspect, sy), this.camera);
    const dirZ = this.ray.ray.direction.z;
    const t = Math.abs(dirZ) > 1e-4 ? (planeZ - this.ray.ray.origin.z) / dirZ : 20;
    return out.copy(this.ray.ray.origin).addScaledVector(this.ray.ray.direction, clamp(t, 2, 300));
  }

  render(game: MadGame, c: MadControls, dtMs: number, quality: QualityLevel, events: readonly FxEvent[]): void {
    if (quality !== this.quality) this.setQuality(quality);
    if (this.visuals.length === 0 && game.enemies.length > 0) this.bind(game);
    const dt = Math.min(dtMs, 80) / 1000;
    this.time += dt;
    const th = this.theme;
    const w = this.weapon;

    // Camera: runs down the street, leans out and ducks behind cover, looks where the hand points.
    const bobPhase = game.distance * 2.9;
    const bob = game.phase === 'run' ? Math.sin(bobPhase) * 0.05 * Math.min(1, game.speed) : 0;
    const sway = game.phase === 'run' ? Math.sin(bobPhase * 0.5) * 0.035 * Math.min(1, game.speed) : 0;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const shx = (Math.random() - 0.5) * this.shake * 0.08;
    const shy = (Math.random() - 0.5) * this.shake * 0.08;

    const isTpp = this.cameraMode === 'tpp';
    if (isTpp) {
      // Third-Person Perspective (TPP): camera positioned behind player looking forward
      const tppDist = 2.2;
      const tppHeight = 1.85 - game.coverAmt * 0.45;
      this.camera.position.set(game.peekAmt * 0.85 + sway * 0.6 + shx, tppHeight + bob * 0.5 + shy, -game.distance + tppDist);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(-0.06 + c.aim.y * 0.04, -c.aim.x * 0.07 - game.peekAmt * 0.035, -game.peekAmt * 0.04);
      this.viewRoot.visible = false;
      this.playerRig.root.visible = true;
      this.playerRig.root.position.set(0, 0, -game.distance);
      this.playerRig.updateAsPlayer(c, w.id, dt * 1000);
    } else {
      // First-Person Perspective (FPP): camera positioned at player eye-level
      this.playerRig.root.visible = false;
      const baseY = 1.62 - game.coverAmt * 0.62 - Math.abs(game.peekAmt) * 0.1;
      this.camera.position.set(game.peekAmt * 1.15 + sway + shx, baseY + bob + shy, -game.distance);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(c.aim.y * 0.05 + this.shake * (Math.random() - 0.5) * 0.02 - this.kick * 0.012, -c.aim.x * 0.07 - game.peekAmt * 0.045, -game.peekAmt * 0.06 + sway * 0.3);
    }
    const wantScope = w.style === 'scope' && c.charge > 0.04 ? 1 : 0;
    this.scopeAmt += (wantScope - this.scopeAmt) * (1 - Math.exp(-dt / 0.12));
    const targetFov = THREE.MathUtils.lerp(62, w.fov, w.style === 'scope' ? this.scopeAmt : 1);
    this.fov += (targetFov - this.fov) * (1 - Math.exp(-dt / 0.08));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);

    // Effects from the game's events.
    for (const fx of events) this.onFx(fx, game, c);

    this.updateEnemies(game, dt);
    this.updateViewModel(game, c, dt);
    this.updateTransients(dt);
    this.updateAmbient(dt);

    // Targets for the next frame's hit tests.
    this.projectTargets(game);

    // Light follows the player so the shadow map stays sharp.
    const cam = this.camera.position;
    this.sun.position.set(cam.x + this.sunDir.x * 60, cam.y + this.sunDir.y * 60, cam.z + this.sunDir.z * 60);
    this.sun.target.position.set(cam.x, 0, cam.z - 14);
    this.sky.position.copy(cam);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzleLight.intensity = this.muzzleT > 0 ? 7 * (this.muzzleT / 0.07) : 0;
    this.viewFlash.visible = this.muzzleT > 0.02;
    this.blastLight.intensity = Math.max(0, this.blastLight.intensity - dt * 160);

    // Storm lightning.
    if (th.rain) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.lightning = 1;
        this.nextLightning = 4 + Math.random() * 6;
      }
      this.lightning = Math.max(0, this.lightning - dt * 4);
      this.hemi.intensity = th.hemiInt * (1 + this.lightning * 3);
      (this.skyUniforms.uFlash as { value: number }).value = this.lightning;
    }

    this.flashPost = Math.max(0, this.flashPost - dt * 3);
    if (this.post) {
      const u = this.post.uniforms;
      (u.uTime as THREE.IUniform).value = this.time;
      (u.uDamage as THREE.IUniform).value = game.hurt;
      (u.uScope as THREE.IUniform).value = w.style === 'scope' ? this.scopeAmt : 0;
      (u.uAspect as THREE.IUniform).value = this.aspect;
      (u.uFlash as THREE.IUniform).value = this.flashPost + this.lightning * 0.08;
      (u.uHeal as THREE.IUniform).value = game.coverAmt > 0.6 && game.hp < 100 ? 0.5 : 0;
    }
    const heightPx = this.height * Math.min(window.devicePixelRatio || 1, this.maxDpr);
    for (const p of [this.sparks, this.smoke, this.motes]) p.setScale(heightPx, this.camera.fov);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private updateEnemies(game: MadGame, dt: number): void {
    for (const v of this.visuals) {
      const e = v.enemy;
      const { rig } = v;
      rig.updateAsOpponent(e, this.weapon.id, this.time * 1000, dt * 1000);
      const aiming = e.state === 'aiming';
      rig.marker.visible = aiming;
      if (aiming) {
        const pulse = 1 + 0.3 * Math.sin(this.time * 18);
        rig.marker.scale.setScalar(pulse);
        rig.marker.position.y = 2.15 + Math.sin(this.time * 9) * 0.05;
        rig.marker.rotation.y = this.time * 3;
      }
      v.flashT = Math.max(0, v.flashT - dt);
      rig.flash.visible = v.flashT > 0;
      if (v.flashT > 0) rig.flash.scale.setScalar(0.6 + Math.random() * 0.6);
    }
    void game;
  }

  private projectTargets(game: MadGame): void {
    const camZ = this.camera.position.z;
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    for (const v of this.visuals) {
      const e = v.enemy;
      const off = v.rig.body.position.y;
      const d = Math.max(1, camZ - e.z);
      const halfH = d * tanHalf;
      tmp.set(e.x, 1.35 + off, e.z).project(this.camera);
      const bx = tmp.x * this.aspect;
      const by = tmp.y;
      tmp.set(e.x, 1.7 + off, e.z).project(this.camera);
      this.targets.set(e.id, { bx, by, br: 0.34 / halfH, hx: tmp.x * this.aspect, hy: tmp.y, hr: 0.16 / halfH });
    }
    void game;
  }

  private updateViewModel(game: MadGame, c: MadControls, dt: number): void {
    if (this.cameraMode === 'tpp') {
      this.viewRoot.visible = false;
      return;
    }
    const w = this.weapon;
    const vo = VIEW_OFFSETS[w.id] ?? { p: [0.22, -0.25, -0.56] as [number, number, number], r: [0, 0, 0] as [number, number, number] };
    this.kick = Math.max(0, this.kick - dt * 7);
    this.slash = Math.max(0, this.slash - dt * 4.5);
    this.throwHide = Math.max(0, this.throwHide - dt);
    const bob = game.phase === 'run' ? Math.sin(game.distance * 2.9) * 0.012 * Math.min(1, game.speed) : 0;
    const lower = game.coverAmt * 0.32;
    this.viewRoot.position.set(vo.p[0] - this.slash * 0.28 + bob * 0.5 - game.peekAmt * 0.02, vo.p[1] - lower + bob + Math.sin(this.time * 1.4) * 0.002, vo.p[2] + this.kick * 0.09 - (this.throwHide > 0 ? 0.3 : 0));
    this.viewRoot.rotation.set(vo.r[0] + c.aim.y * 0.1 + this.kick * 0.18 + lower * 0.6, vo.r[1] - c.aim.x * 0.14 + this.slash * 0.5, vo.r[2] - this.slash * 1.3);
    // The scope replaces the weapon view; a thrown bomb is gone for a moment.
    this.viewRoot.visible = !(w.style === 'scope' && this.scopeAmt > 0.5) && !(w.id === 'bomb' && this.throwHide > 0.15);
  }

  private onFx(fx: FxEvent, game: MadGame, c: MadControls): void {
    const w = this.weapon;
    switch (fx.t) {
      case 'shot': {
        this.kick = Math.max(this.kick, w.recoil);
        this.shake += w.recoil * 0.25;
        if (w.style === 'slash') this.slash = 1;
        else if (w.id === 'bomb') this.throwHide = 0.6;
        else if (w.style !== 'throw') {
          this.muzzleT = 0.07;
          this.view.muzzle.getWorldPosition(tmp);
          for (let i = 0; i < 6; i++) this.sparks.emit(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2, -2 - Math.random() * 4, [3, 1.8, 0.6], 1, 0.05, 0.25);
          // Tracer along the aim ray.
          this.worldAt(c.aim.x * this.aspect, c.aim.y, tmp2);
          this.tracer(this.view.muzzle.getWorldPosition(tmp), tmp2.clone(), 0xffd08a, 0.07);
        }
        break;
      }
      case 'hit': {
        const e = game.enemies.find((x) => x.id === fx.id);
        if (e) this.burstAt(e.x, fx.head ? 1.72 : 1.4, e.z + 0.2, fx.head ? 18 : 10, fx.head);
        break;
      }
      case 'kill': {
        const e = game.enemies.find((x) => x.id === fx.id);
        if (e) {
          this.burstAt(e.x, fx.head ? 1.72 : 1.35, e.z + 0.2, 26, true);
          for (let i = 0; i < 6; i++) this.smoke.emit(e.x + (Math.random() - 0.5) * 0.5, 1.2, e.z + 0.5, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.6, 0.3, [0.28, 0.26, 0.25], 0.5, 0.9, 1.4, 0.8);
        }
        break;
      }
      case 'impact': {
        this.worldAt(fx.x, fx.y, tmp);
        for (let i = 0; i < 8; i++) this.sparks.emit(tmp.x, tmp.y, tmp.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.2) * 3, [2.4, 1.5, 0.6], 1, 0.06, 0.4);
        this.smoke.emit(tmp.x, tmp.y, tmp.z, 0, 0.3, 0.2, [0.5, 0.45, 0.4], 0.35, 0.7, 1, 0.9);
        break;
      }
      case 'explosion': {
        this.worldAt(fx.x, fx.y, tmp);
        this.explode(tmp.x, tmp.y, tmp.z, fx.r);
        break;
      }
      case 'volley': {
        const v = this.visuals.find((x) => x.enemy.id === fx.id);
        if (v) {
          v.flashT = 0.12;
          v.rig.gunTip.getWorldPosition(tmp);
          const target = new THREE.Vector3(this.camera.position.x + (Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.2, this.camera.position.z - 1.4);
          this.tracer(tmp.clone(), target, 0xffe0a0, 0.1);
          this.tracer(tmp.clone().add(new THREE.Vector3(0.05, 0, 0)), target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.8, 0)), 0xffc070, 0.08);
          if (fx.blocked) {
            for (let i = 0; i < 12; i++) this.sparks.emit(target.x, 1.15, target.z + 0.1, (Math.random() - 0.5) * 3, Math.random() * 3, 1 + Math.random() * 2, [2.6, 1.6, 0.7], 1, 0.05, 0.35);
          }
        }
        break;
      }
      case 'hurt':
        this.shake = Math.min(1.6, this.shake + fx.amount / 12);
        break;
      case 'cover':
        this.shake += 0.25;
        break;
      case 'dry':
      case 'reload':
        this.kick = Math.max(this.kick, 0.25);
        break;
    }
  }

  private burstAt(x: number, y: number, z: number, n: number, big: boolean): void {
    for (let i = 0; i < n; i++) this.sparks.emit(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 3.2, (Math.random() - 0.2) * 3.5, big ? [3, 0.8, 0.5] : [2.6, 1.5, 0.6], 1, 0.06, 0.45);
    this.smoke.emit(x, y, z, 0, 0.3, 0.2, [0.4, 0.35, 0.32], 0.35, 0.5, 0.8, 0.6);
  }

  private tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.transients.push({ obj: line, t: 0, max: life, kind: 'tracer', scale: 1 });
  }

  private explode(x: number, y: number, z: number, r: number): void {
    const radius = 1.2 + r * 5;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ball.position.set(x, y, z);
    this.scene.add(ball);
    this.transients.push({ obj: ball, t: 0, max: 0.5, kind: 'fireball', scale: radius });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ring.position.set(x, 0.1, z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.transients.push({ obj: ring, t: 0, max: 0.6, kind: 'ring', scale: radius * 2.2 });
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      this.sparks.emit(x, y, z, Math.cos(a) * sp, Math.random() * 8, Math.sin(a) * sp * 0.6, [3.2, 1.5, 0.4], 1, 0.09, 0.8 + Math.random() * 0.6);
    }
    for (let i = 0; i < 22; i++) this.smoke.emit(x + (Math.random() - 0.5) * radius, y + Math.random() * 0.8, z + (Math.random() - 0.5) * radius, (Math.random() - 0.5) * 1.4, 1 + Math.random() * 2, (Math.random() - 0.5) * 1.4, [0.2, 0.19, 0.18], 0.7, 1.8 + Math.random(), 2.6, 1.4);
    this.blastLight.position.set(x, y + 1, z + 3);
    this.blastLight.intensity = 2400;
    this.shake = Math.min(2, this.shake + 1.1);
    this.flashPost = Math.min(1, this.flashPost + 0.35);
  }

  private updateTransients(dt: number): void {
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const tr = this.transients[i];
      if (!tr) continue;
      tr.t += dt;
      const k = tr.t / tr.max;
      if (k >= 1) {
        this.scene.remove(tr.obj);
        const m = tr.obj as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
        this.transients.splice(i, 1);
        continue;
      }
      if (tr.kind === 'fireball') {
        const e = 1 - (1 - k) * (1 - k);
        tr.obj.scale.setScalar(tr.scale * (0.25 + e * 0.75));
        ((tr.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k);
      } else if (tr.kind === 'ring') {
        tr.obj.scale.setScalar(tr.scale * (0.2 + k * 0.8));
        ((tr.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      } else {
        ((tr.obj as THREE.Line).material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - k);
      }
    }
  }

  private updateAmbient(dt: number): void {
    const th = this.theme;
    const cam = this.camera.position;
    this.emberAcc += dt * (th.embers ? 40 : 14);
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      const x = cam.x + (Math.random() - 0.5) * 30;
      const y = Math.random() * 7;
      const z = cam.z - 4 - Math.random() * 40;
      if (th.embers) this.motes.emit(x, y, z, (Math.random() - 0.3) * 0.8, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 0.6, [2.4, 0.9, 0.25], 0.9, 0.05, 5);
      else this.motes.emit(x, y, z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.3, th.stars ? [0.35, 0.45, 0.8] : [0.9, 0.85, 0.75], 0.22, 0.035, 8);
    }
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.motes.update(dt);
    if (this.rain) {
      const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i += 6) {
        const fall = dt * 28;
        a[i + 1] = (a[i + 1] ?? 0) - fall;
        a[i + 4] = (a[i + 4] ?? 0) - fall;
        if ((a[i + 1] ?? 0) < 0) {
          const nx = cam.x + (Math.random() - 0.5) * 36;
          const nz = cam.z + (Math.random() - 0.5) * 50;
          a[i] = nx;
          a[i + 1] = 18;
          a[i + 2] = nz;
          a[i + 3] = nx - 0.05;
          a[i + 4] = 17.3;
          a[i + 5] = nz + 0.04;
        }
      }
      pos.needsUpdate = true;
    }
  }

  dispose(): void {
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) for (const x of mat) x.dispose();
      else mat?.dispose();
    });
    this.sparks.dispose();
    this.smoke.dispose();
    this.motes.dispose();
    this.composer?.dispose();
    this.flashTex.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
