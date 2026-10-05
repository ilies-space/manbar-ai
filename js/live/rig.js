// rig layer: maps canonical bone names to whatever skeleton the GLB ships,
// remembers the rest pose, and turns euler-offset poses into quaternion targets

import * as THREE from "three";

// canonical name -> list of name endings we accept (mixamo & friends)
const BONE_ALIASES = {
  Hips: ["hips"],
  Spine: ["spine"],
  Spine1: ["spine1"],
  Spine2: ["spine2", "chest"],
  Neck: ["neck"],
  Head: ["head"],
  LShoulder: ["leftshoulder", "l_shoulder", "shoulder_l"],
  LArm: ["leftarm", "l_upperarm", "upperarm_l"],
  LForeArm: ["leftforearm", "l_forearm", "forearm_l"],
  LHand: ["lefthand", "l_hand", "hand_l"],
  RShoulder: ["rightshoulder", "r_shoulder", "shoulder_r"],
  RArm: ["rightarm", "r_upperarm", "upperarm_r"],
  RForeArm: ["rightforearm", "r_forearm", "forearm_r"],
  RHand: ["righthand", "r_hand", "hand_r"]
};

// finger chains (present only after the fingered re-rig)
const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
for (const side of ["L", "R"]) {
  const word = side === "L" ? "lefthand" : "righthand";
  for (const f of FINGERS) {
    for (let i = 1; i <= 3; i++) {
      BONE_ALIASES[`${side}${f}${i}`] = [`${word}${f.toLowerCase()}${i}`];
    }
  }
}

export function buildRig(root) {
  const bones = {};          // canonical -> Bone
  const rest = {};           // canonical -> rest quaternion (clone)
  const all = [];
  root.traverse(o => { if (o.isBone) all.push(o); });

  const normalized = all.map(b => ({ bone: b, key: b.name.toLowerCase().replace(/[^a-z0-9]/g, "") }));
  for (const [canon, endings] of Object.entries(BONE_ALIASES)) {
    for (const ending of endings) {
      const hit = normalized.find(n => n.key.endsWith(ending.replace(/[^a-z0-9]/g, "")));
      if (hit) { bones[canon] = hit.bone; rest[canon] = hit.bone.quaternion.clone(); break; }
    }
  }

  const _e = new THREE.Euler();
  const _q = new THREE.Quaternion();

  return {
    bones,
    rest,
    has: canon => !!bones[canon],
    hasFingers: !!bones.RIndex1,
    list: () => Object.keys(bones),

    // offset: [xDeg, yDeg, zDeg] relative to rest pose -> world-ready quaternion
    targetFor(canon, offsetDeg, out) {
      const r = rest[canon];
      if (!r) return null;
      _e.set(
        THREE.MathUtils.degToRad(offsetDeg[0] || 0),
        THREE.MathUtils.degToRad(offsetDeg[1] || 0),
        THREE.MathUtils.degToRad(offsetDeg[2] || 0),
        "XYZ"
      );
      _q.setFromEuler(_e);
      return (out || new THREE.Quaternion()).copy(r).multiply(_q);
    },

    resetPose() {
      for (const [canon, b] of Object.entries(bones)) b.quaternion.copy(rest[canon]);
    }
  };
}
