import * as THREE from 'three';
import type { WeaponId } from './weapons';

/** Small procedural helpers for the 3D scene: textures, particles, soldiers, weapon models. */

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTexture(w: number, h: number, draw: Draw, srgb = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas is not available');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Multiplies the UVs of a geometry (so a texture tiles on boxes of any size). */
export function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

export function asphaltTexture(rng: () => number): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#323339';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + Math.floor(rng() * 50);
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.08 + rng() * 0.18})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(10,10,12,${0.08 + rng() * 0.12})`;
      g.beginPath();
      g.ellipse(rng() * w, rng() * h, 20 + rng() * 60, 10 + rng() * 30, rng() * 3, 0, 7);
      g.fill();
    }
    g.strokeStyle = 'rgba(8,8,10,0.65)';
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 1 + rng() * 1.5;
      g.beginPath();
      let x = rng() * w;
      let y = rng() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (rng() - 0.5) * 60;
        y += rng() * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // Centre dashes and worn edge lines.
    g.fillStyle = 'rgba(214,176,44,0.78)';
    for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 4, y + 10, 8, 70);
    g.fillStyle = 'rgba(220,220,214,0.45)';
    g.fillRect(w * 0.035, 0, 5, h);
    g.fillRect(w * 0.965 - 5, 0, 5, h);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = 'rgba(30,30,34,0.55)';
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 5, 2 + rng() * 5);
    }
  });
}

export function concreteTexture(rng: () => number, tint = '#8f8c86'): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = tint;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const light = rng() > 0.5;
      g.fillStyle = light ? `rgba(255,255,255,${0.03 + rng() * 0.07})` : `rgba(0,0,0,${0.04 + rng() * 0.09})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
    }
    for (let i = 0; i < 26; i++) {
      const x = rng() * w;
      const grad = g.createLinearGradient(x, 0, x, h);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, `rgba(20,18,14,${0.04 + rng() * 0.08})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 2 + rng() * 6, h);
    }
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(30,28,24,0.55)';
      g.beginPath();
      const x = rng() * w;
      const y = rng() * h;
      g.moveTo(x, y);
      g.lineTo(x + 3 + rng() * 9, y + rng() * 5);
      g.lineTo(x + rng() * 6, y + 3 + rng() * 8);
      g.closePath();
      g.fill();
    }
  });
}

/** A building facade; the second texture holds only the lit windows (emissive map). */
export function facadeTextures(rng: () => number, base: string, lit: boolean): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const cols = 6;
  const rows = 10;
  const draw = (emissive: boolean): Draw => {
    const r2 = (() => {
      // Same pattern for both textures: re-seed with a fixed sequence.
      let a = 12345;
      return () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
    })();
    return (g, w, h) => {
      g.fillStyle = emissive ? '#000' : base;
      g.fillRect(0, 0, w, h);
      const cw = w / cols;
      const ch = h / rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * cw + cw * 0.18;
          const py = y * ch + ch * 0.2;
          const pw = cw * 0.64;
          const ph = ch * 0.58;
          const on = r2() < 0.22;
          const broken = r2() < 0.2;
          if (emissive) {
            if (lit && on) {
              g.fillStyle = r2() > 0.5 ? '#ffc874' : '#ffe9b0';
              g.fillRect(px, py, pw, ph);
            }
          } else {
            const grad = g.createLinearGradient(px, py, px, py + ph);
            grad.addColorStop(0, '#1a2230');
            grad.addColorStop(1, '#0a0d14');
            g.fillStyle = lit && on ? '#d9a95a' : grad;
            g.fillRect(px, py, pw, ph);
            if (broken && !(lit && on)) {
              g.strokeStyle = 'rgba(120,130,140,0.5)';
              g.beginPath();
              g.moveTo(px, py);
              g.lineTo(px + pw, py + ph);
              g.moveTo(px + pw, py);
              g.lineTo(px, py + ph * 0.6);
              g.stroke();
            }
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.fillRect(px - 2, py + ph, pw + 4, 3);
          }
        }
      }
      if (!emissive) {
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = `rgba(${rng() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rng() * 0.06})`;
          g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
        }
        for (let i = 0; i < 18; i++) {
          g.fillStyle = `rgba(10,8,6,${0.05 + rng() * 0.1})`;
          g.fillRect(rng() * w, rng() * h * 0.3, 3 + rng() * 14, 30 + rng() * 120);
        }
      }
    };
  };
  return { map: canvasTexture(256, 512, draw(false)), glow: canvasTexture(256, 512, draw(true)) };
}

export function softSprite(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// --- Particles ---------------------------------------------------------------

const PARTICLE_VERT = `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

/** A pool of billboard particles drawn as one Points object. */
export class ParticlePool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly base: Float32Array;
  private readonly grow: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private head = 0;

  private readonly count: number;
  private readonly gravity: number;
  private readonly drag: number;

  constructor(count: number, additive: boolean, gravity: number, drag: number) {
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);
    this.size = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count).fill(1);
    this.base = new Float32Array(count);
    this.grow = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  setScale(heightPx: number, fovDeg: number): void {
    this.material.uniforms.uScale = { value: heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)) };
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, rgb: readonly [number, number, number], alpha: number, size: number, life: number, grow = 0): void {
    const i = this.head;
    this.head = (this.head + 1) % this.count;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = rgb[0];
    this.col[i * 4 + 1] = rgb[1];
    this.col[i * 4 + 2] = rgb[2];
    this.col[i * 4 + 3] = alpha;
    this.base[i] = alpha;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  update(dtSec: number): void {
    const drag = Math.exp(-this.drag * dtSec);
    for (let i = 0; i < this.count; i++) {
      const l = this.life[i] ?? 0;
      if (l <= 0) {
        this.size[i] = 0;
        continue;
      }
      const nl = l - dtSec;
      this.life[i] = nl;
      if (nl <= 0) {
        this.size[i] = 0;
        continue;
      }
      const k = i * 3;
      this.vel[k] = (this.vel[k] ?? 0) * drag;
      this.vel[k + 1] = (this.vel[k + 1] ?? 0) * drag - this.gravity * dtSec;
      this.vel[k + 2] = (this.vel[k + 2] ?? 0) * drag;
      this.pos[k] = (this.pos[k] ?? 0) + (this.vel[k] ?? 0) * dtSec;
      this.pos[k + 1] = (this.pos[k + 1] ?? 0) + (this.vel[k + 1] ?? 0) * dtSec;
      this.pos[k + 2] = (this.pos[k + 2] ?? 0) + (this.vel[k + 2] ?? 0) * dtSec;
      const f = nl / (this.maxLife[i] ?? 1);
      this.col[i * 4 + 3] = (this.base[i] ?? 1) * f;
      this.size[i] = (this.size[i] ?? 0) + (this.grow[i] ?? 0) * dtSec;
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
    this.points.geometry.getAttribute('aColor').needsUpdate = true;
    this.points.geometry.getAttribute('aSize').needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// --- Soldiers ----------------------------------------------------------------

export interface SoldierRig {
  root: THREE.Group;
  /** Moves up and down behind cover. */
  body: THREE.Group;
  mats: THREE.MeshStandardMaterial[];
  marker: THREE.Mesh;
  flash: THREE.Sprite;
  gunTip: THREE.Object3D;
  goggles: THREE.Mesh;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** A trooper in tactical gear (dark vest, ammo belts, black helmet, red goggles). Faces +z, toward the player. */
export function buildSoldier(heavy: boolean, flashTex: THREE.Texture): SoldierRig {
  const std = (color: number, rough = 0.85, metal = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const suit = std(heavy ? 0x241c1c : 0x2a3027);
  const vest = std(heavy ? 0x4a1c1c : 0x4a4332, 0.9);
  const skin = std(0x9a7456, 0.7);
  const helmet = std(0x121417, 0.45, 0.35);
  const gun = std(0x0e0f11, 0.4, 0.7);
  const ammo = std(0xc9a227, 0.5, 0.6);
  const mats = [suit, vest, skin, helmet, gun, ammo];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const s = heavy ? 1.14 : 1;
  body.scale.setScalar(s);

  body.add(mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), suit, -0.12, 0.4, 0));
  body.add(mesh(new THREE.BoxGeometry(0.17, 0.8, 0.2), suit, 0.12, 0.4, 0));
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.26), helmet, -0.12, 0.05, 0.03)); // boots
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.26), helmet, 0.12, 0.05, 0.03));
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.24), vest, -0.14, 0.62, 0.02)); // knee pads
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.24), vest, 0.14, 0.62, 0.02));
  body.add(mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), suit, 0, 1.12, 0));
  body.add(mesh(new THREE.BoxGeometry(0.48, 0.46, 0.3), vest, 0, 1.18, 0.02)); // plate carrier
  body.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.32), ammo, 0, 1.0, 0.03)); // belts
  body.add(mesh(new THREE.BoxGeometry(0.42, 0.06, 0.32), ammo, 0, 1.12, 0.03));
  body.add(mesh(new THREE.BoxGeometry(0.46, 0.1, 0.34), gun, 0, 0.86, 0.01));
  body.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), suit, 0, 1.47, 0)); // neck
  body.add(mesh(new THREE.SphereGeometry(0.115, 14, 12), skin, 0, 1.62, 0.01));
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), helmet);
  helm.position.set(0, 1.64, 0);
  helm.castShadow = true;
  body.add(helm);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: heavy ? 0xff2a2a : 0xff6a2a }));
  goggles.position.set(0, 1.63, 0.12);
  body.add(goggles);
  // Shoulder pads (the yellow-trimmed armour in the deck art).
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.26), ammo, -0.34, 1.4, 0));
  body.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.26), vest, 0.34, 1.4, 0));
  // Arms and the rifle, aimed at the player.
  body.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), suit, -0.2, 1.32, 0.3));
  body.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), suit, 0.2, 1.28, 0.3));
  const rifle = new THREE.Group();
  rifle.position.set(0, 1.3, 0.45);
  rifle.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 0.7), gun, 0, 0, 0.1));
  rifle.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.32), gun, 0, 0.01, 0.62));
  rifle.add(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.09), gun, 0, -0.14, 0.12));
  rifle.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.2), ammo, 0, 0.08, 0.1));
  body.add(rifle);
  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, 1.31, 1.12);
  body.add(gunTip);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.9);
  flash.visible = false;
  gunTip.add(flash);

  // The red ▼ above a soldier who is about to fire.
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 3), new THREE.MeshBasicMaterial({ color: 0xff1f2a, toneMapped: false }));
  marker.rotation.x = Math.PI;
  marker.position.set(0, 2.15 * s, 0);
  marker.visible = false;
  root.add(marker);
  return { root, body, mats, marker, flash, gunTip, goggles };
}

// --- Weapon models (first person) ---------------------------------------------

export interface ViewModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  rGlove?: THREE.Mesh;
  lGlove?: THREE.Mesh;
}

/** Simple, readable first-person weapon models built from boxes and cylinders. Muzzle points to -z. */
export function buildViewModel(id: WeaponId): ViewModel {
  const group = new THREE.Group();
  let rGlove: THREE.Mesh | undefined;
  let lGlove: THREE.Mesh | undefined;
  const metal = (color: number, rough = 0.35, m = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: m });
  const dark = metal(0x14161a, 0.45, 0.6);
  const steel = metal(0x9aa2ac, 0.25, 1);
  const grip = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.8 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.6, metalness: 0.2 });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    group.add(m);
  };
  const cyl = (r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, rad2 = r): void => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad2, r, len, 14), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
  };
  const muzzle = new THREE.Object3D();
  group.add(muzzle);
  switch (id) {
    case 'boxing': {
      // First-person boxing gloves in guard position
      const redGlove = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.35, metalness: 0.2 });
      const laceMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
      // Right glove (dominant)
      rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), redGlove);
      rGlove.scale.set(1.0, 1.25, 0.95);
      rGlove.position.set(0.16, -0.16, -0.38);
      group.add(rGlove);
      // Left glove
      lGlove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), redGlove);
      lGlove.scale.set(1.0, 1.25, 0.95);
      lGlove.position.set(-0.16, -0.18, -0.42);
      group.add(lGlove);
      // Laces / wrist cuffs
      const rCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), laceMat);
      rCuff.position.set(0.16, -0.22, -0.36);
      group.add(rCuff);
      const lCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), laceMat);
      lCuff.position.set(-0.16, -0.24, -0.4);
      group.add(lCuff);
      muzzle.position.set(0, 0, -0.45);
      break;
    }
    case 'sword': {
      // First-person Katana held at diagonal ready angle
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe6edf3, roughness: 0.15, metalness: 0.95 });
      const tsubaMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.4, metalness: 0.8 });
      const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
      // Blade
      box(0.012, 0.038, 0.72, bladeMat, 0.12, -0.06, -0.48, 0.15);
      // Tsuba (crossguard)
      cyl(0.05, 0.012, tsubaMat, 0.12, -0.15, -0.15);
      // Handle (tsuka)
      cyl(0.024, 0.22, handleMat, 0.12, -0.22, -0.04);
      // Gloved hand gripping hilt
      box(0.08, 0.08, 0.12, glove, 0.12, -0.21, -0.04);
      muzzle.position.set(0.12, 0, -0.8);
      break;
    }
    case 'knife':
      box(0.035, 0.05, 0.14, grip, 0, 0, 0.05);
      box(0.012, 0.055, 0.36, steel, 0, 0.01, -0.2);
      box(0.06, 0.02, 0.02, dark, 0, 0, -0.02);
      box(0.09, 0.09, 0.1, glove, 0, -0.02, 0.1);
      muzzle.position.set(0, 0, -0.4);
      break;
    case 'pistol':
      box(0.045, 0.06, 0.24, dark, 0, 0.02, -0.08);
      box(0.04, 0.12, 0.06, grip, 0, -0.07, 0.02, 0.2);
      box(0.09, 0.09, 0.1, glove, 0, -0.08, 0.06);
      muzzle.position.set(0, 0.02, -0.22);
      break;
    case 'deagle':
      box(0.06, 0.075, 0.3, steel, 0, 0.02, -0.1);
      box(0.045, 0.13, 0.07, grip, 0, -0.08, 0.03, 0.2);
      box(0.035, 0.03, 0.04, dark, 0, 0.065, 0.02);
      box(0.1, 0.1, 0.11, glove, 0, -0.09, 0.07);
      muzzle.position.set(0, 0.02, -0.27);
      break;
    case 'rifle':
      box(0.06, 0.09, 0.62, dark, 0, 0, -0.18);
      box(0.05, 0.05, 0.4, dark, 0, 0.01, -0.62);
      box(0.06, 0.2, 0.08, dark, 0, -0.14, -0.1, 0.1);
      box(0.07, 0.11, 0.28, grip, 0, -0.02, 0.22);
      box(0.045, 0.05, 0.12, steel, 0, 0.075, -0.2);
      box(0.1, 0.1, 0.14, glove, 0.02, -0.08, -0.4);
      muzzle.position.set(0, 0.01, -0.85);
      break;
    case 'auto':
      box(0.065, 0.1, 0.42, dark, 0, 0, -0.1);
      box(0.045, 0.05, 0.22, dark, 0, 0.01, -0.42);
      box(0.045, 0.24, 0.07, dark, 0, -0.17, -0.1, 0.15);
      box(0.06, 0.09, 0.2, grip, 0, 0, 0.2);
      box(0.1, 0.1, 0.12, glove, 0.02, -0.07, -0.25);
      muzzle.position.set(0, 0.01, -0.56);
      break;
    case 'sniper':
      box(0.06, 0.09, 0.5, grip, 0, 0, 0.0);
      box(0.03, 0.03, 0.9, dark, 0, 0.01, -0.62);
      cyl(0.035, 0.34, dark, 0, 0.1, -0.1);
      cyl(0.05, 0.05, dark, 0, 0.1, -0.29);
      box(0.06, 0.07, 0.3, grip, 0, -0.01, 0.35);
      box(0.1, 0.1, 0.14, glove, 0.02, -0.07, -0.35);
      muzzle.position.set(0, 0.01, -1.08);
      break;
    case 'bomb':
      group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), olive), { scale: new THREE.Vector3(1, 1.25, 1) }));
      box(0.02, 0.1, 0.03, steel, 0.05, 0.1, 0);
      cyl(0.02, 0.03, steel, 0, 0.1, 0);
      box(0.1, 0.1, 0.1, glove, 0.03, -0.1, 0.02);
      muzzle.position.set(0, 0, -0.1);
      break;
    case 'rocket':
      cyl(0.075, 0.95, olive, 0, 0, -0.3);
      cyl(0.075, 0.12, dark, 0, 0, -0.8, 0.095);
      cyl(0.09, 0.1, dark, 0, 0, 0.2, 0.11);
      box(0.03, 0.08, 0.05, dark, 0, 0.1, -0.35);
      box(0.06, 0.12, 0.08, grip, 0, -0.12, -0.2);
      box(0.1, 0.1, 0.12, glove, 0, -0.14, -0.45);
      muzzle.position.set(0, 0, -0.85);
      break;
  }
  return { group, muzzle, rGlove, lGlove };
}
