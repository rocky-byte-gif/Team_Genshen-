import * as THREE from 'three';
import { clamp } from '../../lib/math/geometry';
import type { Enemy } from './MadGame';
import type { MadControls } from './madInput';
import type { WeaponId } from './weapons';

export type HumanoidRole = 'player' | 'boxer' | 'swordmaster' | 'soldier';

export interface HumanoidRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  chest: THREE.Group;
  leftArm: THREE.Group;
  leftForearm: THREE.Group;
  leftHand: THREE.Group;
  rightArm: THREE.Group;
  rightForearm: THREE.Group;
  rightHand: THREE.Group;
  leftLeg: THREE.Group;
  leftCalf: THREE.Group;
  rightLeg: THREE.Group;
  rightCalf: THREE.Group;
  muzzle: THREE.Object3D;
  gunTip: THREE.Object3D;
  marker: THREE.Mesh;
  flash: THREE.Sprite;
  swordBlade?: THREE.Mesh;
  boxingGloves: THREE.Mesh[];
  materials: THREE.Material[];
  updateAsPlayer: (controls: MadControls, weapon: WeaponId, dt: number) => void;
  updateAsOpponent: (enemy: Enemy, weapon: WeaponId, time: number, dt: number) => void;
  dispose: () => void;
}

function pbrMat(color: number, roughness = 0.75, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function createDetailedHead(skinMat: THREE.Material, hairMat: THREE.Material, role: HumanoidRole): THREE.Group {
  const headGroup = new THREE.Group();

  // Cranium and jaw: anatomical shaped head
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), skinMat);
  cranium.scale.set(0.92, 1.15, 0.98);
  cranium.position.set(0, 0, 0);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Jaw & Chin
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.09), skinMat);
  jaw.position.set(0, -0.09, 0.05);
  headGroup.add(jaw);

  // Nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.065, 6), skinMat);
  nose.rotation.x = -Math.PI / 2.3;
  nose.position.set(0, -0.01, 0.13);
  headGroup.add(nose);

  // Eyes (white sclera + dark pupil/iris)
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x1f2421 });

  [-0.045, 0.045].forEach((x) => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), eyeWhiteMat);
    eyeWhite.scale.set(1.2, 0.8, 0.5);
    eyeWhite.position.set(x, 0.015, 0.11);
    headGroup.add(eyeWhite);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), eyePupilMat);
    pupil.position.set(x, 0.015, 0.12);
    headGroup.add(pupil);

    // Eyebrows
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.009, 0.012), hairMat);
    brow.position.set(x, 0.04, 0.115);
    brow.rotation.z = x > 0 ? -0.08 : 0.08;
    headGroup.add(brow);
  });

  // Mouth / Lips
  const lipMat = pbrMat(0x9a5c54, 0.8, 0);
  const lips = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.014, 0.018), lipMat);
  lips.position.set(0, -0.06, 0.115);
  headGroup.add(lips);

  // Ears
  [-0.12, 0.12].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), skinMat);
    ear.scale.set(0.4, 1.4, 0.8);
    ear.position.set(x, 0, -0.01);
    headGroup.add(ear);
  });

  // Hair / Headgear
  if (role === 'boxer') {
    // Athletic short crop + champion headband
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.set(0, 0.03, -0.01);
    hair.castShadow = true;
    headGroup.add(hair);

    const bandMat = pbrMat(0xd90429, 0.6, 0.1);
    const headband = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.032, 18, 1, true), bandMat);
    headband.position.set(0, 0.045, 0);
    headGroup.add(headband);
  } else if (role === 'swordmaster') {
    // Samurai style topknot & undercut
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.138, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
    hair.position.set(0, 0.02, -0.01);
    headGroup.add(hair);

    const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.08, 10), hairMat);
    knot.position.set(0, 0.15, -0.06);
    knot.rotation.x = -0.5;
    headGroup.add(knot);
  } else if (role === 'soldier') {
    // Military beret / tactical combat haircut
    const beretMat = pbrMat(0x2d3a29, 0.85, 0.1);
    const beret = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), beretMat);
    beret.position.set(0.02, 0.05, 0);
    beret.rotation.z = -0.2;
    headGroup.add(beret);
  } else {
    // Player: Modern athletic styling
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.set(0, 0.03, -0.01);
    headGroup.add(hair);
  }

  return headGroup;
}

export function buildHumanoid(role: HumanoidRole): HumanoidRig {
  const materials: THREE.Material[] = [];
  const boxingGloves: THREE.Mesh[] = [];

  // Color palettes tailored for human realism
  const skinColor = role === 'boxer' ? 0xb8805a : role === 'swordmaster' ? 0xcfa47e : role === 'player' ? 0xd6a482 : 0xa67452;
  const hairColor = role === 'swordmaster' ? 0x111113 : role === 'boxer' ? 0x1f1b18 : 0x241d1a;

  const skinMat = pbrMat(skinColor, 0.72, 0.02);
  const hairMat = pbrMat(hairColor, 0.9, 0);

  // Clothing materials
  let shirtMat: THREE.MeshStandardMaterial;
  let pantsMat: THREE.MeshStandardMaterial;
  let trimMat: THREE.MeshStandardMaterial;
  const shoeMat = pbrMat(0x18181b, 0.7, 0.2);
  const gloveColor = role === 'boxer' ? 0xd90429 : role === 'player' ? 0x0077b6 : 0x2b2d42;
  const gloveMat = pbrMat(gloveColor, 0.35, 0.25);

  if (role === 'boxer') {
    shirtMat = pbrMat(0x1a1a24, 0.85); // dark athletic tank
    pantsMat = pbrMat(0xd90429, 0.85); // red boxing trunks
    trimMat = pbrMat(0xf8f9fa, 0.8);  // white belt trim
  } else if (role === 'swordmaster') {
    shirtMat = pbrMat(0x1c2321, 0.9); // dark martial gi
    pantsMat = pbrMat(0x0f1416, 0.9); // black hakama
    trimMat = pbrMat(0x9e2a2b, 0.75); // crimson sash
  } else if (role === 'soldier') {
    shirtMat = pbrMat(0x3a4036, 0.85); // military combat vest
    pantsMat = pbrMat(0x272b25, 0.85); // tactical combat trousers
    trimMat = pbrMat(0x181b16, 0.9);
  } else {
    // Player
    shirtMat = pbrMat(0x023e8a, 0.85); // vibrant athletic combat top
    pantsMat = pbrMat(0x141824, 0.85); // dark training trousers
    trimMat = pbrMat(0x00b4d8, 0.8);
  }

  materials.push(skinMat, hairMat, shirtMat, pantsMat, trimMat, shoeMat, gloveMat);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Scale: human height approx 1.78m
  const scale = role === 'boxer' ? 1.04 : role === 'soldier' ? 1.02 : 1.0;
  body.scale.setScalar(scale);

  // --- Pelvis / Hips ---
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.22), pantsMat);
  pelvis.position.set(0, 0.92, 0);
  pelvis.castShadow = true;
  body.add(pelvis);

  // Waistband
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.05, 0.23), trimMat);
  belt.position.set(0, 0.99, 0);
  body.add(belt);

  // --- Chest / Torso ---
  const chest = new THREE.Group();
  chest.position.set(0, 1.02, 0);
  body.add(chest);

  // Upper torso with pectoral definition
  const upperTorso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.34, 0.24), shirtMat);
  upperTorso.position.set(0, 0.2, 0);
  upperTorso.castShadow = true;
  chest.add(upperTorso);

  // Pectoral contours
  const pecs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.04), shirtMat);
  pecs.position.set(0, 0.24, 0.12);
  chest.add(pecs);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.12, 14), skinMat);
  neck.position.set(0, 0.42, 0.01);
  neck.castShadow = true;
  chest.add(neck);

  // Head
  const head = createDetailedHead(skinMat, hairMat, role);
  head.position.set(0, 0.54, 0.02);
  chest.add(head);

  // --- Shoulders & Arms ---
  const makeArm = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const armGroup = new THREE.Group();
    armGroup.position.set(sign * 0.24, 0.32, 0);
    chest.add(armGroup);

    // Deltoid shoulder cap
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), shirtMat);
    deltoid.position.set(0, 0, 0);
    armGroup.add(deltoid);

    // Biceps / Upper Arm (anatomical muscular cylinder)
    const upperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.26, 8), skinMat);
    upperArmMesh.position.set(0, -0.13, 0);
    upperArmMesh.castShadow = true;
    armGroup.add(upperArmMesh);

    // Elbow Joint
    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0, -0.26, 0);
    armGroup.add(forearmGroup);

    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), skinMat);
    forearmGroup.add(elbow);

    // Forearm
    const forearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.24, 8), skinMat);
    forearmMesh.position.set(0, -0.12, 0);
    forearmMesh.castShadow = true;
    forearmGroup.add(forearmMesh);

    // Hand / Glove
    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.24, 0);
    forearmGroup.add(handGroup);

    // Realistic padded boxing glove
    const gloveMain = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), gloveMat);
    gloveMain.scale.set(1.0, 1.25, 0.9);
    gloveMain.castShadow = true;
    handGroup.add(gloveMain);
    boxingGloves.push(gloveMain);

    // Thumb wrap on glove
    const thumbWrap = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), gloveMat);
    thumbWrap.position.set(sign * 0.045, -0.02, 0.03);
    handGroup.add(thumbWrap);

    // Wrist cuff
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 8), trimMat);
    cuff.position.set(0, 0.04, 0);
    handGroup.add(cuff);

    return { armGroup, forearmGroup, handGroup };
  };

  const leftArmRig = makeArm(true);
  const rightArmRig = makeArm(false);

  // --- Legs ---
  const makeLeg = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const legGroup = new THREE.Group();
    legGroup.position.set(sign * 0.11, 0.88, 0);
    body.add(legGroup);

    // Thigh with athletic pants
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.072, 0.42, 8), pantsMat);
    thigh.position.set(0, -0.21, 0);
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Knee
    const calfGroup = new THREE.Group();
    calfGroup.position.set(0, -0.42, 0);
    legGroup.add(calfGroup);

    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
    calfGroup.add(knee);

    // Calf (lower leg)
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.38, 8), skinMat);
    calf.position.set(0, -0.19, 0);
    calf.castShadow = true;
    calfGroup.add(calf);

    // Athletic Shoe / Boot
    const foot = new THREE.Group();
    foot.position.set(0, -0.38, 0.04);
    calfGroup.add(foot);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.22), shoeMat);
    shoe.castShadow = true;
    foot.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.025, 0.23), trimMat);
    sole.position.set(0, -0.04, 0);
    foot.add(sole);

    return { legGroup, calfGroup };
  };

  const leftLegRig = makeLeg(true);
  const rightLegRig = makeLeg(false);

  // Muzzle attachment (for soldier / rifle)
  const muzzle = new THREE.Object3D();
  body.add(muzzle);

  // Optional sword weapon attachment for swordmaster
  let swordBlade: THREE.Mesh | undefined;
  if (role === 'swordmaster') {
    const swordGroup = new THREE.Group();
    swordGroup.position.set(0, -0.06, 0);

    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe0e6ed, metalness: 0.95, roughness: 0.15 });
    materials.push(bladeMat);
    swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.85, 0.008), bladeMat);
    swordBlade.position.set(0, 0.45, 0);
    swordBlade.castShadow = true;
    swordGroup.add(swordBlade);

    // Tsuba (guard)
    const tsubaMat = pbrMat(0xb8860b, 0.4, 0.8);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.015, 14), tsubaMat);
    swordGroup.add(tsuba);

    rightArmRig.handGroup.add(swordGroup);
  }

  // Tactical marker (red cone above opponent's head when aiming)
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 4), new THREE.MeshBasicMaterial({ color: 0xff1f2a, toneMapped: false }));
  marker.rotation.x = Math.PI;
  marker.position.set(0, 2.15, 0);
  marker.visible = false;
  root.add(marker);

  // Attack / muzzle flash sprite
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.9);
  flash.visible = false;
  muzzle.add(flash);

  // --- Real-time animation / tracking controller ---
  let punchAnimT = 0;
  let activePunchSide: 'left' | 'right' | null = null;
  let slashAnimT = 0;
  let runCycle = 0;

  const updateAsPlayer = (controls: MadControls, weapon: WeaponId, dt: number) => {
    // Body posture: lean and crouch
    body.position.x = controls.lean * 0.45;
    body.position.y = controls.crouch ? -0.35 : 0;
    chest.rotation.z = -controls.lean * 0.15;

    // Running animation
    if (controls.speed > 0.05) {
      runCycle += dt * 0.008 * controls.speed;
      const stride = Math.sin(runCycle);
      leftLegRig.legGroup.rotation.x = stride * 0.55;
      rightLegRig.legGroup.rotation.x = -stride * 0.55;
      leftLegRig.calfGroup.rotation.x = Math.max(0, -stride * 0.6);
      rightLegRig.calfGroup.rotation.x = Math.max(0, stride * 0.6);
    } else {
      leftLegRig.legGroup.rotation.x = 0;
      rightLegRig.legGroup.rotation.x = 0;
      leftLegRig.calfGroup.rotation.x = 0;
      rightLegRig.calfGroup.rotation.x = 0;
    }

    // Punch trigger detection
    if (controls.punchHand) {
      activePunchSide = controls.punchHand;
      punchAnimT = 1.0;
    }
    if (punchAnimT > 0) {
      punchAnimT = Math.max(0, punchAnimT - dt * 0.005);
    }

    // Slash trigger
    if (weapon === 'sword' && controls.triggers.length > 0) {
      slashAnimT = 1.0;
    }
    if (slashAnimT > 0) {
      slashAnimT = Math.max(0, slashAnimT - dt * 0.004);
    }

    // Arm positioning based on active weapon
    if (weapon === 'boxing') {
      // Body posture reaction to dodge
      if (controls.isDodging) {
        chest.rotation.z = -controls.lean * 0.4;
        chest.rotation.x = controls.crouch ? 0.28 : 0;
      }

      const punchExt = Math.sin(punchAnimT * Math.PI);

      if (controls.isBlocking) {
        // High Peekaboo Guard: Both gloves held high in front of face
        leftArmRig.armGroup.rotation.set(-1.35, 0.45, 0.6);
        leftArmRig.forearmGroup.rotation.set(-1.45, 0, 0);
        leftArmRig.armGroup.position.z = -0.15;

        rightArmRig.armGroup.rotation.set(-1.35, -0.45, -0.6);
        rightArmRig.forearmGroup.rotation.set(-1.45, 0, 0);
        rightArmRig.armGroup.position.z = -0.15;
      } else if (activePunchSide === 'left' && punchAnimT > 0) {
        // Left arm extends punch / jab
        leftArmRig.armGroup.rotation.set(-1.45, 0.05, 0.1);
        leftArmRig.forearmGroup.rotation.set(-punchExt * 0.45, 0, 0);
        leftArmRig.armGroup.position.z = -punchExt * 0.42;

        rightArmRig.armGroup.rotation.set(-1.1, -0.3, -0.4);
        rightArmRig.forearmGroup.rotation.set(-1.2, 0, 0);
        rightArmRig.armGroup.position.z = 0;
      } else if (activePunchSide === 'right' && punchAnimT > 0) {
        // Right arm extends heavy power punch
        rightArmRig.armGroup.rotation.set(-1.45, -0.05, -0.1);
        rightArmRig.forearmGroup.rotation.set(-punchExt * 0.45, 0, 0);
        rightArmRig.armGroup.position.z = -punchExt * 0.45;

        leftArmRig.armGroup.rotation.set(-1.1, 0.3, 0.4);
        leftArmRig.forearmGroup.rotation.set(-1.2, 0, 0);
        leftArmRig.armGroup.position.z = 0;
      } else {
        // Standard boxing guard
        leftArmRig.armGroup.rotation.set(-1.1, 0.3, 0.4);
        leftArmRig.forearmGroup.rotation.set(-1.2, 0, 0);
        leftArmRig.armGroup.position.z = 0;

        rightArmRig.armGroup.rotation.set(-1.1, -0.3, -0.4);
        rightArmRig.forearmGroup.rotation.set(-1.2, 0, 0);
        rightArmRig.armGroup.position.z = 0;
      }
    } else if (weapon === 'sword') {
      const slashExt = Math.sin(slashAnimT * Math.PI);
      if (slashAnimT > 0) {
        rightArmRig.armGroup.rotation.set(-1.2 + slashExt * 1.4, -slashExt * 1.2, 0.4);
        rightArmRig.forearmGroup.rotation.set(-0.2, 0, 0);
      } else {
        // Ready sword guard
        rightArmRig.armGroup.rotation.set(-0.9, -0.3, 0.3);
        rightArmRig.forearmGroup.rotation.set(-0.8, 0, 0);
      }
      leftArmRig.armGroup.rotation.set(-0.6, 0.2, 0.4);
      leftArmRig.forearmGroup.rotation.set(-0.6, 0, 0);
    } else {
      // Rifle / Auto: Two-handed aiming stance
      const aimPitch = clamp(-controls.aim.y * 0.4, -0.6, 0.6);
      const aimYaw = clamp(controls.aim.x * 0.5, -0.7, 0.7);

      rightArmRig.armGroup.rotation.set(-1.3 + aimPitch, aimYaw, -0.2);
      rightArmRig.forearmGroup.rotation.set(-0.7, 0, 0);

      leftArmRig.armGroup.rotation.set(-1.1 + aimPitch, aimYaw + 0.3, 0.4);
      leftArmRig.forearmGroup.rotation.set(-1.0, 0, 0);
    }
  };

  const updateAsOpponent = (enemy: Enemy, _weapon: WeaponId, time: number, dt: number) => {
    // Positioning
    body.position.x = enemy.x;
    body.position.z = enemy.z;

    // Hit flash reaction
    if (enemy.hitFlash > 0) {
      body.position.z += 0.08 * enemy.hitFlash;
      head.rotation.x = -0.35 * enemy.hitFlash;
    } else {
      head.rotation.x = 0;
    }

    // Death animation
    if (enemy.state === 'dead') {
      body.rotation.x = Math.min(Math.PI / 2, body.rotation.x + dt * 0.006);
      body.position.y = Math.max(0.1, body.position.y - dt * 0.003);
      return;
    }

    // Vis: rising / ducking behind cover (for boxer: stands tall in the ring)
    body.position.y = (enemy.vis - 1) * 0.45;

    // AI Stance bob & weave
    const idleT = time * 0.003;
    body.position.x += Math.sin(idleT * 1.5) * 0.04;
    chest.rotation.z = Math.sin(idleT * 1.2) * 0.05;

    if (role === 'boxer') {
      const isAiming = enemy.state === 'aiming';
      const isAttacking = enemy.state === 'firing';

      if (isAttacking) {
        // CPU opponent lunges forward and drives punch straight at player!
        body.position.z = enemy.z + 0.65;
        rightArmRig.armGroup.rotation.set(-1.52, 0, 0.05);
        rightArmRig.forearmGroup.rotation.set(-0.12, 0, 0);
        rightArmRig.armGroup.position.z = -0.55;

        leftArmRig.armGroup.rotation.set(-1.25, 0.3, 0.4);
        leftArmRig.forearmGroup.rotation.set(-1.3, 0, 0);
      } else if (isAiming) {
        // Wind-up: Coiling fist back, tense posture preparing strike!
        body.position.z = enemy.z - 0.08;
        rightArmRig.armGroup.rotation.set(-0.95, -0.55, -0.35);
        rightArmRig.forearmGroup.rotation.set(-1.45, 0, 0);
        rightArmRig.armGroup.position.z = 0.18;

        leftArmRig.armGroup.rotation.set(-1.25, 0.25, 0.35);
        leftArmRig.forearmGroup.rotation.set(-1.35, 0, 0);
      } else {
        // Tight agile guard protecting face: rhythmic bobbing
        rightArmRig.armGroup.rotation.set(-1.15 + Math.sin(idleT * 2) * 0.08, -0.25, -0.35);
        rightArmRig.forearmGroup.rotation.set(-1.25, 0, 0);
        rightArmRig.armGroup.position.z = 0;

        leftArmRig.armGroup.rotation.set(-1.15 - Math.sin(idleT * 2) * 0.08, 0.25, 0.35);
        leftArmRig.forearmGroup.rotation.set(-1.25, 0, 0);
      }
    } else if (role === 'swordmaster') {
      const isAttacking = enemy.state === 'firing';
      if (isAttacking) {
        // Furious katana slash
        rightArmRig.armGroup.rotation.set(-0.4, -0.8, 0.6);
        rightArmRig.forearmGroup.rotation.set(-0.3, 0, 0);
      } else {
        // Master sword guard (chudan)
        rightArmRig.armGroup.rotation.set(-0.9, -0.2, 0.3);
        rightArmRig.forearmGroup.rotation.set(-0.75, 0, 0);
      }
    } else {
      // Rifle combatant
      const isAiming = enemy.state === 'aiming' || enemy.state === 'firing';
      if (isAiming) {
        rightArmRig.armGroup.rotation.set(-1.35, 0.1, -0.15);
        leftArmRig.armGroup.rotation.set(-1.15, 0.35, 0.35);
      } else {
        rightArmRig.armGroup.rotation.set(-0.8, 0, -0.1);
        leftArmRig.armGroup.rotation.set(-0.8, 0, 0.1);
      }
    }
  };

  const dispose = () => {
    materials.forEach((m) => m.dispose());
  };

  return {
    root,
    body,
    head,
    chest,
    leftArm: leftArmRig.armGroup,
    leftForearm: leftArmRig.forearmGroup,
    leftHand: leftArmRig.handGroup,
    rightArm: rightArmRig.armGroup,
    rightForearm: rightArmRig.forearmGroup,
    rightHand: rightArmRig.handGroup,
    leftLeg: leftLegRig.legGroup,
    leftCalf: leftLegRig.calfGroup,
    rightLeg: rightLegRig.legGroup,
    rightCalf: rightLegRig.calfGroup,
    muzzle,
    gunTip: muzzle,
    marker,
    flash,
    swordBlade,
    boxingGloves,
    materials,
    updateAsPlayer,
    updateAsOpponent,
    dispose,
  };
}
