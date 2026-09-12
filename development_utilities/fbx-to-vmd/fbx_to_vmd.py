#!/usr/bin/env python3
"""
fbx_to_vmd.py — FBX default-pose → VMD converter

Extracts the rest pose at t=0 from an FBX binary (FBX SDK 2020, version 7700)
via the AnimationCurve chain and writes a single-frame VMD (Vocaloid Motion
Data 0002) suitable as the MMD idle / default_pose.

• Input : development_utilities/fbx-to-vmd/fbx-input/*.fbx  (binary FBX 7.5+)
• Output: VMD_Animations/default_pose.vmd
          waifu-viewer/public/vmd/default_pose.vmd (if waifu-viewer exists)
          (also supports --output / --input overrides)

Mapping:
  FBX LimbNode names (hips_JNT, spine_JNT, …) → MMD Japanese bone names
  (センター, 上半身, 下半身, 首, 頭, 左腕, 右腕 …).

VMD bone frame encoding
  header (30) + model name (20, SJIS-padded) + LE uint32 count
  + N×111-byte bone frames:
      name(15 sjis) | frame(u32) | pos(3×f32) | rot(4×f32 quaternion xyzw) | interp(64)

FBX sampling:
  Connections:  AnimCurve --OP d|X/Y/Z--> AnimCurveNode(R/T) --OP Lcl Rotation/Translation--> Model(LimbNode)
  For each curve we inflate KeyTime/KeyValueFloat (zlib if enc==1) and take
  the value at KeyTime==0 (or Default fallback). Degrees → radians → quaternion
  via intrinsic XYZ Euler order (qz*qy*qx).

If FBX parsing fails we still emit a valid VMD with identity frames for the
common MMD skeleton so callers never get a 0-bone degenerate file.
"""
from __future__ import annotations
import struct
import math
import argparse
import sys
import zlib
from pathlib import Path

# ---------------------------------------------------------------------------
# Bone mapping FBX → MMD
# ---------------------------------------------------------------------------
FBX_TO_MMD = {
    "hips_JNT":        "センター",
    "spine_JNT":       "上半身",
    "spine1_JNT":      "上半身2",
    "spine2_JNT":      "上半身2",
    "neck_JNT":        "首",
    "head_JNT":        "頭",
    "l_shoulder_JNT":  "左肩",
    "l_arm_JNT":       "左腕",
    "l_forearm_JNT":   "左ひじ",
    "l_hand_JNT":      "左手首",
    "r_shoulder_JNT":  "右肩",
    "r_arm_JNT":       "右腕",
    "r_forearm_JNT":   "右ひじ",
    "r_hand_JNT":      "右手首",
    "l_upleg_JNT":     "左足",
    "l_leg_JNT":       "左ひざ",
    "l_foot_JNT":      "左足首",
    "l_toebase_JNT":   "左つま先",
    "r_upleg_JNT":     "右足",
    "r_leg_JNT":       "右ひざ",
    "r_foot_JNT":      "右足首",
    "r_toebase_JNT":   "右つま先",
}

FALLBACK_BONES = [
    "センター", "グルーブ", "上半身", "上半身2", "下半身",
    "首", "頭",
    "左肩", "左腕", "左ひじ", "左手首",
    "右肩", "右腕", "右ひじ", "右手首",
    "左足", "左ひざ", "左足首",
    "右足", "右ひざ", "右足首",
]

DEFAULT_INTERP = bytes([
    20,20,0,0, 20,20,20,20, 107,107,107,107, 20,20,20,20,
    20,20,0,0, 20,20,20,20, 107,107,107,107, 20,20,20,20,
    20,20,0,0, 20,20,20,20, 107,107,107,107, 20,20,20,20,
    20,20,0,0, 20,20,20,20, 107,107,107,107, 20,20,20,20,
])

# ---------------------------------------------------------------------------
# FBX binary parsing — version 7700 64-bit offsets
# ---------------------------------------------------------------------------

def _unpack_props(prop_bytes: bytes, nprops: int):
    off = 0
    out = []
    for _ in range(nprops):
        if off >= len(prop_bytes):
            break
        t = chr(prop_bytes[off]); off += 1
        try:
            if t == 'S':
                ln = struct.unpack_from('<I', prop_bytes, off)[0]; off += 4
                out.append(prop_bytes[off:off+ln].decode(errors='ignore')); off += ln
            elif t == 'I':
                out.append(struct.unpack_from('<i', prop_bytes, off)[0]); off += 4
            elif t == 'F':
                out.append(struct.unpack_from('<f', prop_bytes, off)[0]); off += 4
            elif t == 'D':
                out.append(struct.unpack_from('<d', prop_bytes, off)[0]); off += 8
            elif t == 'L':
                out.append(struct.unpack_from('<q', prop_bytes, off)[0]); off += 8
            elif t == 'Y':
                out.append(struct.unpack_from('<h', prop_bytes, off)[0]); off += 2
            elif t == 'C':
                out.append(bool(prop_bytes[off])); off += 1
            elif t == 'R':
                ln = struct.unpack_from('<I', prop_bytes, off)[0]; off += 4
                out.append(prop_bytes[off:off+ln]); off += ln
            elif t in ('b','i','f','d','l'):
                ln = struct.unpack_from('<I', prop_bytes, off)[0]; off += 4
                enc = struct.unpack_from('<I', prop_bytes, off)[0]; off += 4
                clen = struct.unpack_from('<I', prop_bytes, off)[0]; off += 4
                comp = prop_bytes[off:off+clen]; off += clen
                if enc == 1:
                    try:
                        raw = zlib.decompress(comp)
                    except Exception:
                        raw = comp
                else:
                    raw = comp
                # unpack array
                vals = []
                if t == 'f':
                    for i in range(ln):
                        vals.append(struct.unpack_from('<f', raw, i*4)[0])
                elif t == 'd':
                    for i in range(ln):
                        vals.append(struct.unpack_from('<d', raw, i*8)[0])
                elif t == 'l':
                    for i in range(ln):
                        vals.append(struct.unpack_from('<q', raw, i*8)[0])
                elif t == 'i':
                    for i in range(ln):
                        vals.append(struct.unpack_from('<i', raw, i*4)[0])
                elif t == 'b':
                    for i in range(ln):
                        vals.append(struct.unpack_from('<b', raw, i)[0])
                out.append(vals)
            else:
                out.append(f"<unk:{t}>")
                break
        except struct.error:
            break
    return out


def _parse_range(buf: bytes, start: int, end: int, is64: bool):
    nodes = []
    off = start
    L = len(buf)
    while off < end:
        if is64:
            if off + 24 > L: break
            eoff, nprops, plistlen = struct.unpack_from('<QQQ', buf, off); off += 24
        else:
            if off + 12 > L: break
            eoff, nprops, plistlen = struct.unpack_from('<III', buf, off); off += 12
        if eoff == 0 and nprops == 0 and plistlen == 0:
            break
        if off >= L: break
        namelen = buf[off]; off += 1
        name = buf[off:off+namelen].decode(errors='ignore'); off += namelen
        prop_bytes = buf[off:off+plistlen]; off += plistlen
        props = _unpack_props(prop_bytes, nprops) if nprops else []
        nested = []
        if eoff != 0:
            body_end = eoff
            if is64 and eoff >= 25 and buf[eoff-25:eoff] == b'\x00'*25:
                body_end = eoff - 25
            elif eoff >= 13 and buf[eoff-13:eoff] == b'\x00'*13:
                body_end = eoff - 13
            if off < body_end:
                nested, _ = _parse_range(buf, off, body_end, is64)
            off = eoff
        nodes.append((name, props, nested))
        if eoff == 0:
            break
    return nodes, off


def _euler_xyz_to_quat(rx_deg: float, ry_deg: float, rz_deg: float):
    """Intrinsic XYZ Euler (degrees) → quaternion xyzw (same as THREE.Euler XYZ)."""
    rx = math.radians(rx_deg)
    ry = math.radians(ry_deg)
    rz = math.radians(rz_deg)
    cx, sx = math.cos(rx * 0.5), math.sin(rx * 0.5)
    cy, sy = math.cos(ry * 0.5), math.sin(ry * 0.5)
    cz, sz = math.cos(rz * 0.5), math.sin(rz * 0.5)
    # q = qz * qy * qx  (intrinsic XYZ)
    # intermediate
    qx = sx * cy * cz + cx * sy * sz
    qy = cx * sy * cz - sx * cy * sz
    qz = cx * cy * sz + sx * sy * cz
    qw = cx * cy * cz - sx * sy * sz
    # normalize (tiny drift)
    n = math.sqrt(qx*qx + qy*qy + qz*qz + qw*qw)
    if n > 1e-9:
        qx/=n; qy/=n; qz/=n; qw/=n
    return qx, qy, qz, qw


def _parse_top(data: bytes):
    if not data.startswith(b'Kaydara FBX Binary'):
        return None, None, None
    try:
        version = struct.unpack_from('<I', data, 23)[0]
    except Exception:
        return None, None, None
    is64 = version >= 7500
    hdr = 27
    try:
        top, _ = _parse_range(data, hdr, len(data) - 13, is64)
    except Exception:
        return None, None, None
    objs = [n for n in top if n[0] == 'Objects']
    if not objs:
        return top, None, None
    _, _, children = objs[0]
    conns_node = [n for n in top if n[0] == 'Connections']
    conns = conns_node[0][2] if conns_node else []
    return top, children, conns


def _collect_fbx_skeleton_and_pose(fbx_path: Path, verbose=False):
    """Return (bones list[str], pose dict fbx_name -> {quat, pos, euler_deg})."""
    try:
        data = fbx_path.read_bytes()
    except Exception as e:
        if verbose: print(f"  read failed: {e}", file=sys.stderr)
        return [], {}
    top, children, conns = _parse_top(data)
    if top is None or children is None:
        if verbose: print("  not binary FBX — ascii fallback")
        return [], {}

    # id -> (name, props, nested)
    id_map: dict[int, tuple] = {}
    for name, props, nested in children:
        if props and isinstance(props[0], int):
            id_map[props[0]] = (name, props, nested)

    # LimbNode models
    bones: list[str] = []
    model_id_to_name: dict[int, str] = {}
    for name, props, nested in children:
        if name != 'Model':
            continue
        m_type = props[2] if len(props) > 2 else ''
        if m_type != 'LimbNode':
            continue
        raw = props[1] if len(props) > 1 else ''
        short = raw.split('::')[-1].replace('\x00\x01Model', '').strip()
        bones.append(short)
        model_id_to_name[props[0]] = short

    if verbose:
        print(f"  FBX {fbx_path.name}: {len(bones)} LimbNodes -> {bones[:8]}{' …' if len(bones)>8 else ''}")

    # Build connections maps
    # AnimCurve --OP d|X/Y/Z--> AnimCurveNode
    node_to_curves: dict[int, dict[str,int]] = {}
    # AnimCurveNode --OP Lcl Rotation/Translation--> Model
    model_to_nodes: dict[int, dict[str,int]] = {}
    # For OP connections, props = [kind, src, dst, propName?]
    for cname, cprops, _ in conns:
        if cname != 'C' or len(cprops) < 3:
            continue
        kind = cprops[0]
        if kind != 'OP':
            continue
        if len(cprops) < 4:
            continue
        src, dst, prop_name = cprops[1], cprops[2], cprops[3]
        if prop_name in ('d|X', 'd|Y', 'd|Z'):
            node_to_curves.setdefault(dst, {})[prop_name] = src
        elif prop_name in ('Lcl Rotation', 'Lcl Translation'):
            model_to_nodes.setdefault(dst, {})[prop_name] = src

    # Curve id -> sampled value at t=0 (or Default)
    curve_t0: dict[int, float] = {}
    for name, props, nested in children:
        if name != 'AnimationCurve':
            continue
        cid = props[0] if props and isinstance(props[0], int) else None
        if cid is None:
            continue
        d: dict[str, list] = {}
        for n, pp, _ in nested:
            if n in ('Default', 'KeyTime', 'KeyValueFloat'):
                # pp is list (inflated) or placeholder; _unpack now returns list
                if isinstance(pp, list) and len(pp) == 1 and isinstance(pp[0], list):
                    pp = pp[0]
                d[n] = pp
        val = None
        # Prefer t=0 sample
        if 'KeyTime' in d and 'KeyValueFloat' in d:
            kt = d['KeyTime']
            kv = d['KeyValueFloat']
            if isinstance(kt, list) and isinstance(kv, list) and len(kt) == len(kv) and len(kt) > 0:
                # find index where KeyTime == 0
                try:
                    idx = kt.index(0)
                except ValueError:
                    # if no exact 0, take argmin
                    idx = min(range(len(kt)), key=lambda i: abs(kt[i]))
                if 0 <= idx < len(kv):
                    val = float(kv[idx])
        if val is None and 'Default' in d:
            dv = d['Default']
            if isinstance(dv, list) and len(dv):
                val = float(dv[0])
        if val is not None:
            curve_t0[cid] = val
        elif 'Default' in d:
            # fallback scalar
            try:
                curve_t0[cid] = float(d['Default'][0])
            except: pass

    # Also collect Model Properties70 defaults for fallback
    model_defaults: dict[int, dict[str, tuple[float,float,float]]] = {}
    for name, props, nested in children:
        if name != 'Model':
            continue
        mid = props[0] if props and isinstance(props[0], int) else None
        if mid is None:
            continue
        for n, pp, nn in nested:
            if n == 'Properties70':
                for pn, pprops, _ in nn:
                    if pn != 'P' or not pprops or len(pprops) < 6:
                        continue
                    pname = pprops[0]
                    if pname == 'Lcl Rotation' and len(pprops) >= 7:
                        # P: Lcl Rotation, Lcl Rotation, '', 'A+', x,y,z
                        model_defaults.setdefault(mid, {})['Lcl Rotation'] = (float(pprops[4]), float(pprops[5]), float(pprops[6]))
                    elif pname == 'Lcl Translation' and len(pprops) >= 7:
                        model_defaults.setdefault(mid, {})['Lcl Translation'] = (float(pprops[4]), float(pprops[5]), float(pprops[6]))

    # Build per-bone pose
    pose: dict[str, dict] = {}
    for mid, bname in model_id_to_name.items():
        euler = (0.0, 0.0, 0.0)
        pos = (0.0, 0.0, 0.0)
        # rotation via curves
        rot_node = model_to_nodes.get(mid, {}).get('Lcl Rotation')
        if rot_node is not None and rot_node in node_to_curves:
            curves = node_to_curves[rot_node]
            rx = curve_t0.get(curves.get('d|X'))
            ry = curve_t0.get(curves.get('d|Y'))
            rz = curve_t0.get(curves.get('d|Z'))
            # fill missing from model defaults
            def_fallback = model_defaults.get(mid, {}).get('Lcl Rotation', (0,0,0))
            if rx is None: rx = def_fallback[0]
            if ry is None: ry = def_fallback[1]
            if rz is None: rz = def_fallback[2]
            euler = (float(rx), float(ry), float(rz))
        else:
            # no animated node — use model defaults if present
            if mid in model_defaults and 'Lcl Rotation' in model_defaults[mid]:
                euler = model_defaults[mid]['Lcl Rotation']
        # translation via curves (only hips uses it meaningfully; others stay 0)
        trans_node = model_to_nodes.get(mid, {}).get('Lcl Translation')
        if trans_node is not None and trans_node in node_to_curves:
            curves = node_to_curves[trans_node]
            tx = curve_t0.get(curves.get('d|X'))
            ty = curve_t0.get(curves.get('d|Y'))
            tz = curve_t0.get(curves.get('d|Z'))
            def_t = model_defaults.get(mid, {}).get('Lcl Translation', (0,0,0))
            if tx is None: tx = def_t[0]
            if ty is None: ty = def_t[1]
            if tz is None: tz = def_t[2]
            pos = (float(tx), float(ty), float(tz))
        else:
            if mid in model_defaults and 'Lcl Translation' in model_defaults[mid]:
                pos = model_defaults[mid]['Lcl Translation']

        qx, qy, qz, qw = _euler_xyz_to_quat(*euler)
        pose[bname] = {"euler": euler, "pos": pos, "quat": (qx, qy, qz, qw)}
        if verbose and bname in ("hips_JNT","spine_JNT","l_arm_JNT","head_JNT"):
            print(f"    {bname}: euler {euler} -> quat {(qx,qy,qz,qw)} pos {pos}")

    # ---- Retarget fix: FBX→MMD arm penetration (same class as FBX→VRoid) ----
    # The source FBX (AI-generated) has asymmetric extreme rotations for the right
    # forearm (89,73,105) that cause the hand to intersect the torso when applied
    # directly to the MMD T-pose. Classic FBX→VRM/VRoid issue: the right side is
    # not a clean mirror and carries ~90° twist from the generator. We correct by
    # (a) clamping extreme limb eulers and (b) enforcing left/right symmetry for
    # arms/forearms: if the right side diverges >35° from the mirrored left,
    # replace it with the mirrored left (negated X/Y/Z, the FBX left/right mirror).
    def _clamp_euler(e, lo=-65, hi=65):
        return (max(lo, min(hi, e[0])), max(lo, min(hi, e[1])), max(lo, min(hi, e[2])))
    # Clamp all limb eulers to avoid 90°+ penetrations (DISABLED for exact FBX)
    if False:
      _limb_clamp = {"l_arm_JNT","r_arm_JNT","l_forearm_JNT","r_forearm_JNT","l_hand_JNT","r_hand_JNT","l_shoulder_JNT","r_shoulder_JNT","l_upleg_JNT","r_upleg_JNT","l_leg_JNT","r_leg_JNT"}
      for bn in list(pose.keys()):
        if bn in _limb_clamp:
            e = pose[bn]["euler"]
            ce = _clamp_euler(e)
            if ce != e:
                if verbose:
                    print(f"    clamp {bn}: {e} -> {ce}")
                e = ce
                qx, qy, qz, qw = _euler_xyz_to_quat(*e)
                pose[bn] = {"euler": e, "pos": pose[bn]["pos"], "quat": (qx, qy, qz, qw)}
    # Symmetry enforcement for arms/forearms (DISABLED for exact FBX)
    if False:
      _mirror_pairs = [("l_arm_JNT","r_arm_JNT"),("l_forearm_JNT","r_forearm_JNT"),("l_hand_JNT","r_hand_JNT"),("l_shoulder_JNT","r_shoulder_JNT")]
      for lb, rb in _mirror_pairs:
        if lb in pose and rb in pose:
            le = pose[lb]["euler"]
            re = pose[rb]["euler"]
            mirrored = (-le[0], -le[1], -le[2])
            diff = (abs(re[0]-mirrored[0]), abs(re[1]-mirrored[1]), abs(re[2]-mirrored[2]))
            if max(diff) > 35:
                if verbose:
                    print(f"    mirror-fix {rb}: {re} diverged {tuple(round(d,1) for d in diff)} from mirrored {lb} {mirrored} -> replacing")
                qx, qy, qz, qw = _euler_xyz_to_quat(*mirrored)
                pose[rb] = {"euler": mirrored, "pos": pose[rb]["pos"], "quat": (qx, qy, qz, qw)}

    # ---- Exact-FBX retarget: compensate MMD vs FBX bind-angle difference ----
    # User wants pixel-perfect FBX. Previous "relax" gave hands-at-sides but not
    # exact. The penetration is not bad data — it's rest-pose mismatch:
    #   MMD Ellen: arm→elbow vector (2.06, -1.71) = -39.6° from X, plus twist bones
    #   FBX:       arm→forearm (26.9, 0) = 0°, shoulder→arm -14.8° vs MMD -39.6° gap.
    # Applying raw FBX Z (-67°) to MMD's -39.6° rest yields world -106° vs FBX world
    # -67°/-82° — elbow 24-39° too far inward, hence "inside body".
    # Exact fix: MMD_local_Z = FBX_local_Z + (FBX_rest_angle - MMD_rest_angle).
    # Computed from dumped skeleton (mmd_dump: 左腕→左ひじ world, fbx Lcl Translation):
    #   left arm/forearm rest diff ≈ -39.6° (MMD diagonal vs FBX horizontal)
    # We apply only to Z (primary swing/bend axis); X/Y (twist) stay as-is but
    # still clamped/mirrored above. This yields world-faithful FBX pose without
    # hand-made relax.
    _rest_correct_Z = {
        "l_arm_JNT":     +39.6,  # MMD -39.6 vs FBX 0 (forearm vector)
        "l_forearm_JNT": +39.6,
        "r_arm_JNT":     -39.6,  # mirrored
        "r_forearm_JNT": -39.6,
        # hands keep 0 — finger pivots are ~0 in both rigs, no diagonal offset
    }
    for bn, dz in _rest_correct_Z.items():
        if bn in pose:
            e = pose[bn]["euler"]
            # only adjust Z, keep X/Y from FBX (already clamped/mirrored)
            ne = (e[0], e[1], e[2] + dz)
            qx, qy, qz, qw = _euler_xyz_to_quat(*ne)
            if verbose:
                print(f"    rest-correct {bn}: {tuple(round(v,2) for v in e)} +{dz:.1f}°Z -> {tuple(round(v,2) for v in ne)}")
            pose[bn] = {"euler": ne, "pos": pose[bn]["pos"], "quat": (qx, qy, qz, qw)}

    return bones, pose


def _collect_fbx_skeleton(fbx_path: Path, verbose=False):
    bones, _ = _collect_fbx_skeleton_and_pose(fbx_path, verbose=verbose)
    return bones


# ---------------------------------------------------------------------------
# VMD writer
# ---------------------------------------------------------------------------

def _sjis_padded(s: str, length: int) -> bytes:
    try:
        b = s.encode('shift_jis')
    except Exception:
        b = s.encode('utf-8', errors='ignore')
    if len(b) > length:
        b = b[:length]
    return b.ljust(length, b'\x00')


def write_vmd(bone_names: list[str], out_path: Path, model_name: str = "Ellen Joe", verbose=False, pose_map: dict | None = None):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    header = b'Vocaloid Motion Data 0002\x00\x00\x00\x00\x00'
    assert len(header) == 30, len(header)
    model_bytes = _sjis_padded(model_name, 20)
    n = len(bone_names)
    interp = DEFAULT_INTERP
    buf = bytearray()
    buf += header
    buf += model_bytes
    buf += struct.pack('<I', n)
    for bname in bone_names:
        name_bytes = _sjis_padded(bname, 15)
        frame = 0
        # default identity
        px, py, pz = 0.0, 0.0, 0.0
        qx, qy, qz, qw = 0.0, 0.0, 0.0, 1.0
        if pose_map and bname in pose_map:
            # pose_map stores MMD names -> quat/pos; already in correct space
            qx, qy, qz, qw = pose_map[bname]["quat"]
            # For センター (hips) translation is in FBX world coords; VMD expects
            # relative offset. Emitting full hips translation would drift 100 units
            # up. Keep at 0 for default_pose (model stays at bind). If you want
            # hips height, sample relative delta instead. We keep 0.
            px, py, pz = 0.0, 0.0, 0.0
        buf += name_bytes
        buf += struct.pack('<I', frame)
        buf += struct.pack('<fff', px, py, pz)
        buf += struct.pack('<ffff', qx, qy, qz, qw)
        buf += interp
    buf += struct.pack('<I', 0)  # morphs
    buf += struct.pack('<I', 0)  # cameras
    buf += struct.pack('<I', 0)  # lights
    buf += struct.pack('<I', 0)  # shadow
    out_path.write_bytes(bytes(buf))
    if verbose:
        print(f"  wrote {out_path}  bones={n}  {len(buf)} bytes")


def resolve_bones_from_fbx(fbx_files: list[Path], verbose=False):
    """
    Union of LimbNodes across all FBX inputs, mapped to MMD names.
    Returns (mmd_bone_list, fbx_original_list, pose_map_mmd).
    pose_map_mmd: dict MMD name -> {quat, pos, euler}
    """
    all_fbx: list[str] = []
    merged_pose: dict[str, dict] = {}  # fbx_name -> pose
    for p in fbx_files:
        bones, pose = _collect_fbx_skeleton_and_pose(p, verbose=verbose)
        for b in bones:
            if b not in all_fbx:
                all_fbx.append(b)
        # merge pose (first file wins for duplicates)
        for k, v in pose.items():
            if k not in merged_pose:
                merged_pose[k] = v

    if not all_fbx:
        if verbose: print("  no FBX bones resolved — using fallback skeleton")
        return FALLBACK_BONES, [], {}

    # Map FBX -> MMD and build MMD pose map
    mmd: list[str] = []
    pose_map_mmd: dict[str, dict] = {}
    for fb in all_fbx:
        m = FBX_TO_MMD.get(fb)
        target = m if m else fb
        if target not in mmd:
            mmd.append(target)
        # propagate pose (first writer wins for duplicate MMD targets like spine1/2)
        if target not in pose_map_mmd and fb in merged_pose:
            pose_map_mmd[target] = merged_pose[fb]
        elif target in pose_map_mmd and fb in merged_pose:
            # multiple FBX map to same MMD (spine1/2 -> 上半身2): prefer non-identity
            cur_q = pose_map_mmd[target].get("quat")
            new_q = merged_pose[fb].get("quat")
            cur_is_id = cur_q and abs(cur_q[0])<1e-6 and abs(cur_q[1])<1e-6 and abs(cur_q[2])<1e-6 and abs(cur_q[3]-1)<1e-6
            new_is_id = new_q and abs(new_q[0])<1e-6 and abs(new_q[1])<1e-6 and abs(new_q[2])<1e-6 and abs(new_q[3]-1)<1e-6
            if cur_is_id and not new_is_id:
                pose_map_mmd[target] = merged_pose[fb]
        elif target not in pose_map_mmd and m and fb in merged_pose:
            # keep original fb name as fallback
            pass

    if len(mmd) < 5:
        for fb in FALLBACK_BONES:
            if fb not in mmd:
                mmd.append(fb)
            if len(mmd) >= 10:
                break

    return mmd, all_fbx, pose_map_mmd


def main():
    ap = argparse.ArgumentParser(description="FBX default_pose → VMD converter")
    ap.add_argument("--input", "-i", type=str, default=None, help="input FBX file or dir (default: fbx-input/)")
    ap.add_argument("--output", "-o", type=str, default=None, help="output VMD path (default: VMD_Animations/default_pose.vmd)")
    ap.add_argument("--model-name", type=str, default="Ellen Joe", help="model name stamped in VMD header")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parents[2] if (script_dir / "fbx-input").exists() else Path.cwd()

    if args.input:
        in_path = Path(args.input)
        fbx_files = [in_path] if in_path.is_file() else list(in_path.glob("*.fbx"))
    else:
        cand_dirs = [script_dir / "fbx-input", repo_root / "development_utilities" / "fbx-to-vmd" / "fbx-input", repo_root / "fbx-input"]
        fbx_dir = next((d for d in cand_dirs if d.exists()), None)
        if not fbx_dir:
            print("No fbx-input dir found; writing fallback-identity VMD.", file=sys.stderr)
            fbx_files = []
        else:
            fbx_files = sorted(fbx_dir.glob("*.fbx"))
            if args.verbose:
                print(f"Input dir: {fbx_dir} ({len(fbx_files)} .fbx)")

    if args.output:
        out_main = Path(args.output)
    else:
        out_main = repo_root / "VMD_Animations" / "default_pose.vmd"
        if not out_main.parent.exists():
            out_main = Path("VMD_Animations/default_pose.vmd")

    # Collect bones + pose
    result = resolve_bones_from_fbx(fbx_files, verbose=args.verbose)
    if len(result) == 3:
        bones, fbx_raw, pose_map = result
    else:
        bones, fbx_raw = result
        pose_map = {}
    if args.verbose:
        print(f"Resolved {len(bones)} MMD bone tracks from {len(fbx_raw)} FBX bones")
        if fbx_raw:
            print(f"  FBX: {fbx_raw[:10]}")
        print(f"  MMD: {bones[:12]}")
        if pose_map:
            smp = list(pose_map.items())[:4]
            for k, v in smp:
                print(f"  pose {k}: euler {v['euler']} quat {v['quat']}")

    write_vmd(bones, out_main, model_name=args.model_name, verbose=True, pose_map=pose_map)

    mirrors = [
        repo_root / "waifu-viewer" / "public" / "vmd" / "default_pose.vmd",
        Path("waifu-viewer/public/vmd/default_pose.vmd"),
    ]
    for m in mirrors:
        try:
            if m.resolve() == out_main.resolve():
                continue
        except Exception:
            pass
        try:
            if m.parent.exists() or repo_root.joinpath("waifu-viewer").exists():
                write_vmd(bones, m, model_name=args.model_name, verbose=args.verbose, pose_map=pose_map)
                if args.verbose:
                    print(f"  mirrored -> {m}")
                break
        except Exception:
            pass
    dist_vmd = repo_root / "waifu-viewer" / "dist" / "vmd" / "default_pose.vmd"
    if dist_vmd.parent.exists():
        try:
            dist_vmd.write_bytes(out_main.read_bytes())
            if args.verbose: print(f"  mirrored -> {dist_vmd}")
        except Exception:
            pass

    st = out_main.stat()
    print(f"Done. default_pose.vmd: {len(bones)} bone tracks, {st.st_size} bytes -> {out_main}")
    if fbx_files:
        print(f"Source FBX: {', '.join(p.name for p in fbx_files)}")


if __name__ == "__main__":
    main()
