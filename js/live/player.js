// SignPlayer v3 — waypoint IK + geometry-calibrated hands.
// All hand axes are derived from the ACTUAL skeleton at load time:
//   palm normal  = knuckle-plane normal oriented toward the thumb
//   finger axes  = per-joint curl/spread axes from bone directions
// so presets are plain angles that work on any humanoid rig, per hand.
// Wrist orientation is independent (fingers + palm specs per frame),
// with an anatomical limit against the forearm direction.

import * as THREE from "three";

const GAP = 0.12;
const LETTER_DUR = 0.5;
const FOLLOW = 10;
const WRIST_LIMIT = THREE.MathUtils.degToRad(70);

const REST_R = [0.20, -0.30, 0.12];
const REST_L = [-0.20, -0.30, 0.12];
const DIGITS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];

const smooth01 = u => u * u * (3 - 2 * u);
const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];

export class SignPlayer {
  constructor(rig, lexicon, handshapes, character) {
    this.rig = rig;
    this.lexicon = lexicon;
    this.handshapes = handshapes;
    this.character = character;
    this.queue = [];
    this.active = null;
    this.t = 0;
    this.speed = 1;
    this.idleT = 0;
    this.onItem = null;
    this._index = -1;
    this._frozen = false;

    this._cur = {};
    for (const c of rig.list()) this._cur[c] = rig.bones[c].quaternion.clone();

    this._v = Array.from({ length: 8 }, () => new THREE.Vector3());
    this._q = Array.from({ length: 4 }, () => new THREE.Quaternion());
    this._aimV = new THREE.Vector3();

    this._chain = {};
    this._fingerAxes = {};          // canon -> {curl: V3, spread: V3}
    this._calibrate();
  }

  _calibrate() {
    const b = this.rig.bones;
    this.character.updateMatrixWorld(true);
    for (const side of ["R", "L"]) {
      const arm = b[side + "Arm"], fore = b[side + "ForeArm"], hand = b[side + "Hand"];
      if (!arm || !fore || !hand) continue;

      const hw = hand.getWorldPosition(new THREE.Vector3());
      const hq = hand.getWorldQuaternion(new THREE.Quaternion());
      const hqi = hq.clone().invert();

      // finger direction: wrist -> middle knuckle (fallback: forearm axis)
      const mid = b[side + "Middle1"];
      const f0 = (mid ? mid.getWorldPosition(new THREE.Vector3()).sub(hw)
                      : hw.clone().sub(fore.getWorldPosition(new THREE.Vector3()))).normalize();

      // palm normal: knuckle-plane normal, oriented toward the thumb side
      let n0 = new THREE.Vector3(0, -1, 0);
      const idx = b[side + "Index1"], pky = b[side + "Pinky1"], th = b[side + "Thumb1"];
      if (idx && pky) {
        const vi = idx.getWorldPosition(new THREE.Vector3()).sub(hw);
        const vp = pky.getWorldPosition(new THREE.Vector3()).sub(hw);
        n0 = new THREE.Vector3().crossVectors(vi, vp).normalize();
        if (th) {
          const vt = th.getWorldPosition(new THREE.Vector3()).sub(hw);
          if (n0.dot(vt) < 0) n0.negate();
        }
      }

      this._chain[side] = {
        arm, fore, hand,
        dirArm: fore.position.clone().normalize(),
        dirFore: hand.position.clone().normalize(),
        fingLocal: (() => {
          const f = f0.clone().applyQuaternion(hqi).normalize();
          return f;
        })(),
        palmLocal: (() => {
          const f = f0.clone().applyQuaternion(hqi).normalize();
          const n = n0.clone().applyQuaternion(hqi);
          n.addScaledVector(f, -n.dot(f)).normalize();     // strictly perpendicular
          return n;
        })(),
        L1: 0, L2: 0
      };

      // per-joint curl & spread axes (bind pose, bone-local)
      for (const d of DIGITS) {
        for (let k = 1; k <= 3; k++) {
          const bone = b[`${side}${d}${k}`];
          if (!bone) continue;
          const next = b[`${side}${d}${k + 1}`];
          const head = bone.getWorldPosition(new THREE.Vector3());
          let tip;
          if (next) tip = next.getWorldPosition(new THREE.Vector3());
          else {
            const prev = b[`${side}${d}${k - 1}`];
            const back = prev ? prev.getWorldPosition(new THREE.Vector3()) : hw;
            tip = head.clone().add(head.clone().sub(back));
          }
          const a = tip.sub(head).normalize();
          let curlW = new THREE.Vector3().crossVectors(a, n0);
          if (curlW.lengthSq() < 0.04) curlW = new THREE.Vector3().crossVectors(a, f0);
          curlW.normalize();
          const bq = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
          this._fingerAxes[`${side}${d}${k}`] = {
            curl: curlW.applyQuaternion(bq).normalize(),
            spread: n0.clone().applyQuaternion(bq).normalize()
          };
        }
      }
    }
  }

  // ---- queue --------------------------------------------------------------
  enqueue(items) {
    for (const it of items) {
      if (it.kind === "spell") {
        for (const ch of [...it.word]) this.queue.push({ kind: "letter", ch, word: it.word, dur: LETTER_DUR });
      } else if (this.lexicon[it.id]) {
        this.queue.push({ kind: "gloss", id: it.id, dur: this.lexicon[it.id].dur + GAP });
      }
    }
  }
  clear() { this.queue.length = 0; this.active = null; this._index = -1; }
  get busy() { return !!this.active || this.queue.length > 0; }

  // ---- frame update ---------------------------------------------------------
  update(dt) {
    if (this._frozen) return;
    dt *= this.speed;
    this.idleT += dt;
    if (!this.active && this.queue.length) {
      this.active = this.queue.shift();
      this.t = 0;
      this._index++;
      this.onItem?.(this.active, this._index);
    }
    if (this.active) {
      this.t += dt;
      if (this.t >= this.active.dur) {
        this.active = null;
        if (!this.queue.length) this.onItem?.(null, this._index);
      }
    }
    this._pose(this.active ? this._sample() : this._idle(), dt);
  }

  _sample() {
    const it = this.active;
    if (it.kind === "letter") {
      return {
        R: [0.33, 0.06, 0.30], palmR: "forward", fingersR: "up",
        L: REST_L, palmL: "in",
        handR: this.handshapes.letters[it.ch] || "flat", handL: "rest",
        euler: { Head: [Math.sin(this.t * 12) * 1.5, 0, 0] }
      };
    }
    const sign = this.lexicon[it.id];
    const t = Math.min(this.t, sign.dur);
    const fr = sign.frames;
    let i = 0;
    while (i < fr.length - 1 && fr[i + 1].t <= t) i++;
    const a = fr[i], z = fr[Math.min(i + 1, fr.length - 1)];
    const span = Math.max(z.t - a.t, 1e-4);
    const u = a === z ? 1 : smooth01(Math.min(1, Math.max(0, (t - a.t) / span)));
    // a field omitted in a later keyframe HOLDS its previous value
    const held = (idx, key) => {
      for (let j = idx; j >= 0; j--) if (fr[j][key] !== undefined) return fr[j][key];
      return undefined;
    };
    const num = (key, dflt) => {
      const av = held(i, key) ?? dflt;
      const zv = held(Math.min(i + 1, fr.length - 1), key) ?? av;
      return Array.isArray(av) ? lerp3(av, zv, u) : av;
    };
    const step = key => {
      const av = held(i, key), zv = held(Math.min(i + 1, fr.length - 1), key);
      return u < 0.5 ? (av ?? zv) : (zv ?? av);
    };
    const out = {
      R: num("R", REST_R), L: num("L", REST_L),
      palmR: step("palmR") || "in", palmL: step("palmL") || "in",
      fingersR: step("fingersR") || null, fingersL: step("fingersL") || null,
      handR: step("handR") || "rest", handL: step("handL") || "rest",
      euler: {}
    };
    for (const bone of ["Head", "Neck", "Spine2"]) {
      const av = a.euler?.[bone], zv = z.euler?.[bone];
      if (av || zv) out.euler[bone] = lerp3(av || [0, 0, 0], zv || av || [0, 0, 0], u);
    }
    return out;
  }

  _idle() {
    const t = this.idleT;
    return {
      R: [REST_R[0], REST_R[1] + Math.sin(t * 0.9) * 0.012, REST_R[2]],
      L: [REST_L[0], REST_L[1] + Math.sin(t * 0.9 + 0.7) * 0.012, REST_L[2]],
      palmR: "in", palmL: "in", handR: "rest", handL: "rest",
      euler: {
        Spine2: [Math.sin(t * 0.6) * 1.2, 0, 0],
        Head: [Math.sin(t * 0.7 + 1) * 2, Math.sin(t * 0.45) * 3, 0]
      }
    };
  }

  // ---- directions -----------------------------------------------------------
  _dirFromSpec(spec, sx, out) {
    switch (spec) {
      case "up": return out.set(0, 1, 0);
      case "down": return out.set(0, -1, 0);
      case "forward": return out.set(0, 0, 1);
      case "back": return out.set(0, 0, -1);
      case "in": return out.set(sx, 0, 0);      // toward the body midline (right hand sits at -X)
      case "out": return out.set(-sx, 0, 0);
      default: return out.set(sx, 0, 0);
    }
  }

  _bodyBasis() {
    const chest = this.rig.bones.Spine2 || this.rig.bones.Spine1;
    const origin = chest.getWorldPosition(this._v[0]);
    origin.y -= 0.14;
    return {
      origin,
      right: this._v[1].set(-1, 0, 0),
      up: this._v[2].set(0, 1, 0),
      fwd: this._v[3].set(0, 0, 1)
    };
  }

  _targets(pose) {
    const T = {};
    const basis = this._bodyBasis();

    for (const side of ["R", "L"]) {
      const ch = this._chain[side];
      if (!ch) continue;
      const wp = pose[side] || (side === "R" ? REST_R : REST_L);
      const sx = side === "R" ? 1 : -1;

      const S = ch.arm.getWorldPosition(this._v[4]);
      if (!ch.L1) {
        const E0 = ch.fore.getWorldPosition(this._v[5]);
        const W0 = ch.hand.getWorldPosition(this._v[6]);
        ch.L1 = S.distanceTo(E0); ch.L2 = E0.distanceTo(W0);
      }

      const Tw = this._v[5].copy(basis.origin)
        .addScaledVector(basis.right, wp[0])
        .addScaledVector(basis.up, wp[1])
        .addScaledVector(basis.fwd, wp[2]);

      let d = S.distanceTo(Tw);
      const maxD = (ch.L1 + ch.L2) * 0.95;
      if (d > maxD) { Tw.sub(S).multiplyScalar(maxD / d).add(S); d = maxD; }
      d = Math.max(d, Math.abs(ch.L1 - ch.L2) * 1.05 + 1e-4);

      const n = this._v[6].copy(Tw).sub(S).normalize();
      const pole = this._v[7].copy(basis.up).multiplyScalar(-1)
        .addScaledVector(basis.right, sx * 0.9)
        .addScaledVector(basis.fwd, -0.25).normalize();
      pole.addScaledVector(n, -pole.dot(n)).normalize();

      const cosA = Math.min(1, Math.max(-1, (ch.L1 * ch.L1 + d * d - ch.L2 * ch.L2) / (2 * ch.L1 * d)));
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const E = this._v[4].clone().addScaledVector(n, cosA * ch.L1).addScaledVector(pole, sinA * ch.L1);

      T[side + "Arm"] = this._aim(ch.arm, ch.dirArm, S, E);
      T[side + "ForeArm"] = this._aimWithParent(ch.fore, ch.dirFore, E, Tw, ch.arm, T[side + "Arm"]);

      // ---- wrist: independent fingers + palm orientation ----
      {
        const fa = new THREE.Vector3().copy(Tw).sub(E).normalize();   // forearm direction
        let f = fa.clone();
        const fspec = pose["fingers" + side];
        if (fspec) {
          this._dirFromSpec(fspec, sx, f).normalize();
          const dot = Math.min(1, Math.max(-1, f.dot(fa)));
          if (Math.acos(dot) > WRIST_LIMIT) {              // anatomical wrist limit
            const axis = new THREE.Vector3().crossVectors(fa, f);
            if (axis.lengthSq() < 1e-8) f.copy(fa);
            else f.copy(fa).applyAxisAngle(axis.normalize(), WRIST_LIMIT);
          }
        }
        const n0 = new THREE.Vector3();
        this._dirFromSpec(pose["palm" + side] || "in", sx, n0);
        n0.addScaledVector(f, -n0.dot(f));
        if (n0.lengthSq() < 0.2) n0.crossVectors(f, new THREE.Vector3(0, 0, 1));
        n0.normalize();
        const b1 = new THREE.Vector3().crossVectors(f, n0);
        const Mw = new THREE.Matrix4().makeBasis(f, n0, b1);
        const fl = ch.fingLocal, nl = ch.palmLocal;
        const bl = new THREE.Vector3().crossVectors(fl, nl);
        const Ml = new THREE.Matrix4().makeBasis(fl, nl, bl);
        const Qh = new THREE.Quaternion().setFromRotationMatrix(Mw.multiply(Ml.invert())).normalize();
        const gp = ch.arm.parent.getWorldQuaternion(this._q[1]);
        const foreW = new THREE.Quaternion().copy(gp).multiply(T[side + "Arm"]).multiply(T[side + "ForeArm"]);
        T[side + "Hand"] = foreW.invert().multiply(Qh).normalize();
      }

      this._applyHandshape(T, side, pose["hand" + side] || "rest");
    }

    for (const [bone, e] of Object.entries(pose.euler || {})) {
      if (this.rig.has(bone)) T[bone] = this.rig.targetFor(bone, e, this._q[2]).clone();
    }
    return T;
  }

  _applyHandshape(T, side, presetId) {
    const preset = this.handshapes.presets[presetId] || this.handshapes.presets.rest;
    if (!preset) return;
    const tmpQ = new THREE.Quaternion();
    for (const d of DIGITS) {
      const curls = preset.curl?.[d] || [0, 0, 0];
      const spread = preset.spread?.[d] || 0;
      for (let k = 1; k <= 3; k++) {
        const canon = `${side}${d}${k}`;
        const ax = this._fingerAxes[canon];
        if (!ax) continue;
        const q = this.rig.rest[canon].clone();
        if (k === 1 && spread) {
          q.multiply(tmpQ.setFromAxisAngle(ax.spread, THREE.MathUtils.degToRad(spread)));
        }
        q.multiply(tmpQ.setFromAxisAngle(ax.curl, THREE.MathUtils.degToRad(curls[k - 1] || 0)));
        T[canon] = q;
      }
    }
  }

  _aim(bone, bindDir, A, B) {
    const parentQ = bone.parent.getWorldQuaternion(this._q[1]);
    const dLocal = this._aimV.copy(B).sub(A).normalize().applyQuaternion(parentQ.invert());
    return new THREE.Quaternion().setFromUnitVectors(bindDir, dLocal);
  }
  _aimWithParent(bone, bindDir, A, B, parentBone, pq) {
    const gp = parentBone.parent.getWorldQuaternion(this._q[1]);
    const parentQ = this._q[2].copy(gp).multiply(pq);
    const dLocal = this._aimV.copy(B).sub(A).normalize().applyQuaternion(parentQ.invert());
    return new THREE.Quaternion().setFromUnitVectors(bindDir, dLocal);
  }

  _pose(pose, dt) {
    const T = this._targets(pose);
    const k = 1 - Math.exp(-FOLLOW * dt);
    for (const canon of this.rig.list()) {
      const target = T[canon] || this.rig.rest[canon];
      this._cur[canon].slerp(target, k);
      this.rig.bones[canon].quaternion.copy(this._cur[canon]);
    }
  }

  // ---- debug ---------------------------------------------------------------
  testPose(pose) {
    this._frozen = true;
    const T = this._targets(pose);
    for (const canon of this.rig.list()) {
      const target = T[canon] || this.rig.rest[canon];
      this._cur[canon].copy(target);
      this.rig.bones[canon].quaternion.copy(target);
    }
  }
  freeze(glossId, t) {
    this.clear();
    this.active = { kind: "gloss", id: glossId, dur: 1e9 };
    this.t = t;
    const pose = this._sample();
    this.active = null;
    this.testPose(pose);
  }
}
