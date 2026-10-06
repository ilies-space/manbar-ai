#!/usr/bin/env python3
"""
KArSL (MediaPipe Holistic landmarks) -> Manbar waypoint lexicon.

For each recorded sign we derive, per keyframe:
  R / L      wrist position in Manbar body space (x = signer's right, y = up, z = forward; metres
             from the chest origin), retargeted to the character's arm length
  palmR/L    palm normal as a world-space unit vector
  fingersR/L wrist->middle-knuckle direction as a world-space unit vector
  handR/L    finger curls in degrees per joint ({curl: {Thumb:[a,b,c], Index:[...], ...}})
Keyframes are chosen by Ramer-Douglas-Peucker on the smoothed wrist paths.

Inputs : data/lm/NNNN.lm.json   (fps, w, h, frames[{pw:33x4, l:21x3|[], r:21x3|[]}])
         data/labels.json       (NNNN -> {id, ar, en, kind, aliases})
Output : assets/lexicon/signs_karsl.json
"""
import json, math, os, sys

LM = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/minbar/data/lm"
LABELS = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/minbar/data/labels.json"
OUT = sys.argv[3] if len(sys.argv) > 3 else "assets/lexicon/signs_karsl.json"

# character metrics measured from assets/character/translator.glb (body space, see tools/metrics)
CH_SHOULDER = {"R": (0.244, 0.242, -0.009), "L": (-0.244, 0.242, -0.009)}
CH_ARM = 0.228 + 0.241           # upper arm + forearm
REST = {"R": (0.20, -0.30, 0.12), "L": (-0.20, -0.30, 0.12)}
# torso front surface: minimum forward distance of the wrist by height (body-space y)
FRONT = [(-0.25, 0.20), (-0.10, 0.21), (0.03, 0.20), (0.13, 0.18), (0.23, 0.16), (0.33, 0.14), (0.43, 0.15), (0.53, 0.16), (0.63, 0.15), (0.73, 0.10)]

def sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def add(a, b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def mul(a, k): return (a[0]*k, a[1]*k, a[2]*k)
def dot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a): return math.sqrt(dot(a, a))
def unit(a):
    n = norm(a); return (a[0]/n, a[1]/n, a[2]/n) if n > 1e-9 else (0.0, 0.0, 0.0)
def lerp(a, b, u): return tuple(x + (y-x)*u for x, y in zip(a, b))
def angle(a, b):
    na, nb = norm(a), norm(b)
    if na < 1e-9 or nb < 1e-9: return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, dot(a, b)/(na*nb)))))

def front_min(y):
    if y <= FRONT[0][0]: return FRONT[0][1]
    for (y0, z0), (y1, z1) in zip(FRONT, FRONT[1:]):
        if y <= y1: return z0 + (z1-z0)*(y-y0)/(y1-y0)
    return FRONT[-1][1]

# MediaPipe world landmarks: x = image right (= signer's LEFT), y = down, z = away from camera.
def world_from_pw(p):  return (p[0], -p[1], -p[2])          # character world frame (+x = character's left)
def body_from_world(v): return (-v[0], v[1], v[2])           # body space (+x = signer's right)

def hand_world(h, W, H):
    # image-normalized hand landmarks -> world-oriented vectors (only directions/angles are used)
    return [(p[0]*W, -p[1]*H, -p[2]*W) for p in h]

FINGERS = {"Thumb": (1, 2, 3, 4), "Index": (5, 6, 7, 8), "Middle": (9, 10, 11, 12), "Ring": (13, 14, 15, 16), "Pinky": (17, 18, 19, 20)}

def curls(h):
    out = {}
    w = h[0]
    for name, (a, b, c, d) in FINGERS.items():
        base = sub(h[a], w)
        s1, s2, s3 = sub(h[b], h[a]), sub(h[c], h[b]), sub(h[d], h[c])
        k = [angle(base, s1), angle(s1, s2), angle(s2, s3)]
        if name == "Thumb":
            k = [min(55, k[0]*0.8), min(60, k[1]), min(50, k[2])]
        else:
            k = [max(0, min(95, k[0]-8)), min(105, k[1]), min(80, k[2])]
        out[name] = [round(x) for x in k]
    return out

def palm_dirs(h, side):
    w = h[0]
    vi, vp, vt = sub(h[5], w), sub(h[17], w), sub(h[2], w)
    n = unit(cross(vi, vp))
    if dot(n, vt) < 0: n = mul(n, -1)
    f = unit(sub(h[9], w))
    return n, f

def smooth(seq, k=(1, 2, 3, 2, 1)):
    r = len(k)//2; out = []
    for i in range(len(seq)):
        acc, ws = None, 0
        for j, wgt in enumerate(k):
            t = i + j - r
            if 0 <= t < len(seq) and seq[t] is not None:
                v = seq[t]
                acc = mul(v, wgt) if acc is None else add(acc, mul(v, wgt)); ws += wgt
        out.append(mul(acc, 1/ws) if acc is not None else None)
    return out

def fill(seq):
    idx = [i for i, v in enumerate(seq) if v is not None]
    if not idx: return None
    return [seq[min(idx, key=lambda j: abs(j-i))] for i in range(len(seq))]

def rdp(points, eps):
    """points: list of (t, vec) -> indices to keep"""
    def rec(a, b):
        if b <= a + 1: return []
        ta, va = points[a]; tb, vb = points[b]
        best, bi = -1, -1
        for i in range(a+1, b):
            ti, vi = points[i]
            u = (ti-ta)/(tb-ta) if tb > ta else 0
            d = norm(sub(vi, lerp(va, vb, u)))
            if d > best: best, bi = d, i
        if best > eps: return rec(a, bi) + [bi] + rec(bi, b)
        return []
    return [0] + rec(0, len(points)-1) + [len(points)-1]

def convert(path):
    d = json.load(open(path))
    fps, W, H, F = d["fps"], d["w"], d["h"], d["frames"]
    if len(F) < 4: return None
    pw = [f.get("pw") or None for f in F]
    if any(p is None or len(p) < 17 for p in pw): pw = fill([p if p and len(p) >= 17 else None for p in pw])
    if not pw: return None
    sh = {"R": [world_from_pw(p[12]) for p in pw], "L": [world_from_pw(p[11]) for p in pw]}
    el = {"R": [world_from_pw(p[14]) for p in pw], "L": [world_from_pw(p[13]) for p in pw]}
    wr = {"R": [world_from_pw(p[16]) for p in pw], "L": [world_from_pw(p[15]) for p in pw]}
    # x/y from the image (accurate in the camera plane), depth from the 3D world landmarks
    pi = [f.get("p") for f in F]
    if any(not q or len(q) < 17 for q in pi): pi = fill([q if q and len(q) >= 17 else None for q in pi])
    def img(q): return (q[0]*W, -q[1]*H)
    sw_img = sorted(norm(sub(img(q[11]) + (0,), img(q[12]) + (0,))) for q in pi)[len(F)//2]
    sw_w = sorted(norm(sub(world_from_pw(q[11]), world_from_pw(q[12]))) for q in pw)[len(F)//2]
    CH_SW = 0.488

    pos, palm, fing, hand = {}, {}, {}, {}
    for s in "RL":
        ki, kw = CH_SW / max(sw_img, 1), CH_SW / max(sw_w, 0.1)
        si, wi = (12, 16) if s == "R" else (11, 15)
        P = []
        for i in range(len(F)):
            dxy = sub(img(pi[i][wi]) + (0,), img(pi[i][si]) + (0,))
            dz = sub(wr[s][i], sh[s][i])[2]
            rel = (-dxy[0]*ki, dxy[1]*ki, dz*kw*0.6)      # body space: +x signer's right, +y up, +z forward
            # keep what the viewer sees (x/y) and give up depth first when the target is out of reach
            R = 0.92 * CH_ARM
            xy = math.hypot(rel[0], rel[1])
            if xy > R: rel = (rel[0]*R/xy, rel[1]*R/xy, 0.05)
            elif norm(rel) > R: rel = (rel[0], rel[1], math.sqrt(R*R - xy*xy))
            p = add(CH_SHOULDER[s], rel)
            # relaxed arm: a wrist hanging below the waist settles into the idle pose
            u = max(0.0, min(1.0, (-0.24 - p[1]) / 0.10))
            p = lerp(p, REST[s], u)
            # keep the hand in front of the torso
            if abs(p[0]) < 0.24: p = (p[0], p[1], max(p[2], front_min(p[1])))
            P.append(p)
        pos[s] = smooth(P)
        key = "r" if s == "R" else "l"
        HS = [hand_world(f[key], W, H) if f.get(key) else None for f in F]
        Hf = fill(HS)
        if Hf:
            N, Fd, C = [], [], []
            for h in Hf:
                n, fd = palm_dirs(h, s); N.append(n); Fd.append(fd); C.append(curls(h))
            palm[s] = [unit(v) for v in smooth(N)]; fing[s] = [unit(v) for v in smooth(Fd)]; hand[s] = C
        else:
            palm[s] = fing[s] = hand[s] = None

    # keyframes on the combined wrist path
    T = [i/fps for i in range(len(F))]
    pts = [(T[i], pos["R"][i] + pos["L"][i]) for i in range(len(F))]
    keep = sorted(set(rdp(pts, 0.025)))
    if len(keep) > 8:   # keep the most significant
        step = len(keep) / 8; keep = sorted(set(keep[round(j*step)] for j in range(8)) | {keep[-1]})
    frames = []
    for i in keep:
        fr = {"t": round(T[i] - T[keep[0]], 3)}
        for s in "RL":
            fr[s] = [round(x, 3) for x in pos[s][i]]
            if hand[s]:
                fr["palm" + s] = [round(x, 3) for x in palm[s][i]]
                fr["fingers" + s] = [round(x, 3) for x in fing[s][i]]
                fr["hand" + s] = {"curl": hand[s][i]}
            else:
                fr["palm" + s] = "in"; fr["hand" + s] = "rest"
        frames.append(fr)
    dur = round(frames[-1]["t"] + 0.12, 3)
    return {"dur": dur, "frames": frames}

def main():
    labels = json.load(open(LABELS))
    out = {"_note": "KArSL (King Fahd University of Petroleum & Minerals) signs recorded by human signers; motion extracted with MediaPipe Holistic and retargeted to waypoints (tools/karsl_to_waypoints.py). Cite: Sidig et al., KArSL: Arabic Sign Language Database, ACM TALLIP 20(1), 2021."}
    n = 0
    for num, lab in sorted(labels.items()):
        p = os.path.join(LM, f"{num}.lm.json")
        if not os.path.exists(p): continue
        r = convert(p)
        if not r: continue
        out["KARSL_" + lab["id"]] = {"ar": lab["ar"], "kind": lab["kind"], "dur": r["dur"], "frames": r["frames"]}
        n += 1
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print("signs:", n, "bytes:", os.path.getsize(OUT))

if __name__ == "__main__":
    main()
