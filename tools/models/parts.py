"""Pièces de l'atelier modélisées dans Blender : ailerons et rétroviseurs, posés sur chaque caisse.

Chaque pièce est un volume fermé (les normales se recalculent sans ambiguïté), aux arêtes biseautées,
dont l'occlusion ambiante est cuite contre la caisse. Une pièce qui traverse l'axe de la voiture porte
un anneau de sommets en z = 0 : l'export ne garde que la moitié droite, le jeu refait le miroir.
"""
import math

import bmesh
from mathutils import Matrix, Vector

import carlib as C

MI = C.MI
DOWN = Vector((0, -1, 0))


# ---------- briques ----------
def merge(dst, src):
    """Verse src dans dst après avoir orienté ses faces vers l'extérieur, puis libère src."""
    bmesh.ops.recalc_face_normals(src, faces=list(src.faces))
    vs = {v: dst.verts.new(v.co) for v in src.verts}
    for f in src.faces:
        nf = dst.faces.new([vs[v] for v in f.verts])
        nf.material_index = f.material_index
    src.free()


def loft(rings, mat, caps=True):
    """Volume entre des anneaux fermés de même longueur ; bouché aux deux bouts."""
    bm = bmesh.new()
    rows = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rows[0])
    for a, b in zip(rows, rows[1:]):
        for j in range(n):
            bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j])).material_index = MI[mat]
    if caps:
        bm.faces.new(rows[0][::-1]).material_index = MI[mat]
        bm.faces.new(rows[-1]).material_index = MI[mat]
    return bm


def plate(outline, zc, thick, mat, bevel=0.0018):
    """Tôle découpée : contour (x, y) extrudé en épaisseur autour de z = zc, arêtes adoucies."""
    bm = loft([[(x, y, zc - thick / 2) for x, y in outline], [(x, y, zc + thick / 2) for x, y in outline]], mat)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, thick * 0.3), segments=2, profile=0.6, affect='EDGES', clamp_overlap=True)
    return bm


def rounded_box(size, center, mat, radius, yaw=0.0, pitch=0.0):
    """Coque aux arêtes très adoucies (rétroviseur)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=radius, segments=4, profile=0.5, affect='EDGES', clamp_overlap=True)
    m = Matrix.Translation(center) @ Matrix.Rotation(yaw, 4, 'Y') @ Matrix.Rotation(pitch, 4, 'Z')
    for v in bm.verts:
        v.co = m @ v.co
    for f in bm.faces:
        f.material_index = MI[mat]
    return bm


def foil(chord, thick, camber=0.03, n=12):
    """Profil d'aile inversé (appui) : points (x, y), bord d'attaque vers l'avant (+x), sens trigonométrique."""
    up, low = [], []
    for i in range(n + 1):
        u = (1 - math.cos(math.pi * i / n)) / 2  # resserré aux deux bords
        yt = 5 * thick * (0.2969 * math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4)
        yc = -camber * chord * 4 * u * (1 - u)
        x = chord / 2 - u * chord
        up.append((x, yc + yt * chord))
        low.append((x, yc - yt * chord))
    return up + low[-2:0:-1]


def blade(x, y, half, chord, thick, aoa, mat, camber=0.03):
    """Lame d'aileron de −half à +half, avec un anneau sur l'axe."""
    c, s = math.cos(aoa), math.sin(aoa)
    prof = [(x + px * c - py * s, y + px * s + py * c) for px, py in foil(chord, thick, camber)]
    return loft([[(px, py, z) for px, py in prof] for z in (-half, 0.0, half)], mat)


class Mounts:
    """Hauteur de la carrosserie sous un point : les pieds des pièces s'y posent."""

    def __init__(self, body):
        self.bvh = C.bvh_of([body])

    def y(self, x, z, default=0.9):
        hit, _, _, _ = self.bvh.ray_cast(Vector((x, 3.0, max(abs(z), 0.004))), DOWN, 3.0)
        return hit.y if hit is not None else default


# ---------- ailerons ----------
def wing_gt(S, M, swan=False):
    d = S.d
    deck = M.y(S.X0 + 0.3, 0)
    chord = 0.36 if swan else 0.32
    x = S.X0 + (0.22 if swan else 0.30)
    y = deck + (0.36 if swan else 0.30)
    half = S.W - (0.02 if swan else 0.125)
    mat = 'carbon' if swan else 'trim'
    aoa = -0.12
    bm = bmesh.new()
    merge(bm, blade(x, y, half, chord, 0.11, aoa, mat))
    merge(bm, blade(x - chord / 2 + 0.03, y + 0.058, half, 0.13, 0.10, -0.55, mat, camber=0.05))  # volet
    ep = [(x + chord / 2 + 0.02, y - 0.05), (x - chord / 2 - 0.02, y - 0.065), (x - chord / 2 - 0.045, y + 0.105),
          (x - chord / 2 + 0.08, y + 0.105), (x + chord / 2 + 0.03, y + 0.014)]
    zs = half - (0.24 if swan else 0.2)
    for sz in (1, -1):
        merge(bm, plate(ep, sz * half, 0.008, mat))
        if swan:
            # col de cygne : le support part du coffre devant la lame, passe au-dessus et la suspend
            xb = x + 0.26
            yb = M.y(xb, zs, deck) - 0.012
            P = [(xb, yb), (xb + 0.02, y + 0.16), (x + 0.14, y + 0.2), (x - 0.02, y + 0.014)]
            left, right = [], []
            n = 16
            for i in range(n + 1):
                t = i / n
                bez = lambda t: tuple((1 - t) ** 3 * P[0][k] + 3 * (1 - t) ** 2 * t * P[1][k] + 3 * (1 - t) * t * t * P[2][k] + t ** 3 * P[3][k] for k in (0, 1))
                p, q, o = bez(t), bez(min(1, t + 0.01)), bez(max(0, t - 0.01))
                tx, ty = q[0] - o[0], q[1] - o[1]
                l = math.hypot(tx, ty) or 1
                w = 0.024 + 0.024 * (1 - t) ** 2  # plus large au pied
                left.append((p[0] - ty / l * w, p[1] + tx / l * w))
                right.append((p[0] + ty / l * w, p[1] - tx / l * w))
            merge(bm, plate(left + right[::-1], sz * zs, 0.014, 'carbon'))
            merge(bm, plate([(xb + 0.07, yb), (xb - 0.07, yb), (xb - 0.07, yb + 0.014), (xb + 0.07, yb + 0.014)], sz * zs, 0.06, 'trim', 0.003))
        else:
            yb = M.y(x + 0.02, zs, deck) - 0.012
            stand = [(x + 0.10, yb), (x - 0.06, yb), (x - 0.035, y - 0.012), (x + 0.07, y - 0.012)]
            merge(bm, plate(stand, sz * zs, 0.012, mat))
    return bm


def wing_hoop(S, M):
    """Aileron arche : la lame se recourbe aux extrémités et descend se poser sur les ailes."""
    x = S.X0 + 0.30
    deck = M.y(S.X0 + 0.3, 0)
    H = deck + 0.22
    zs = S.W - 0.10
    r = 0.09
    base = M.y(x, zs, deck) - 0.012
    path = [(0.0, H, (0, 1))]  # (z, y, normale dans le plan y-z)
    path.append((zs - r, H, (0, 1)))
    for i in range(1, 9):
        a = math.pi / 2 * i / 8
        path.append((zs - r + r * math.sin(a), H - r + r * math.cos(a), (math.sin(a), math.cos(a))))
    path.append((zs, base, (1, 0)))
    full = [(-z, y, (-nz, ny)) for z, y, (nz, ny) in path[:0:-1]] + path
    sec = foil(0.22, 0.13, camber=0.02, n=10)
    rings = [[(x + sx, y + ny * sy, z + nz * sy) for sx, sy in sec] for z, y, (nz, ny) in full]
    bm = bmesh.new()
    merge(bm, loft(rings, 'paint_plain'))
    return bm


def wing_wedge(S, M, x_rear, x_front, half, height, mat='paint_plain'):
    """Becquet : un coin posé sur la carrosserie, plus haut au centre, qui s'efface vers les côtés."""
    n = 10
    rings = []
    for i in range(-n, n + 1):
        z = half * i / n
        k = 1 - 0.55 * abs(i / n) ** 3
        yf, ym, yr = M.y(x_front, z), M.y((x_front + x_rear) / 2, z), M.y(x_rear + 0.01, z)
        top = max(yr, ym) + height * k
        rings.append([(x_front, yf - 0.006, z), (x_rear - 0.035, top, z), (x_rear - 0.02, top - 0.014, z), (x_rear + 0.012, yr - 0.012, z)])
    bm = bmesh.new()
    merge(bm, loft(rings, mat))
    return bm


def wing_duck(S, M):
    # en retrait de l'arrondi du bouclier : sur une poupe très ronde, le pied plongerait le long du pare-chocs
    return wing_wedge(S, M, S.X0 + 0.10, S.X0 + 0.40, (S.w_max(S.X0 + 0.3) - S.d.get('edge_in', 0.105)) * 0.88, 0.085)


def wing_lip(S, M):
    d = S.d
    x = d['roofEnd']
    half = (S.w_max(x) - 0.085 - d['tumble']) * 0.9
    return wing_wedge(S, M, x - 0.16, x + 0.06, half, 0.04)


# ---------- rétroviseurs (côté droit ; le jeu refait le gauche par miroir) ----------
def _mirror_glass(bm, center, size, yaw):
    """Glace : un quad sur la face arrière de la coque."""
    w, h = size[2] * 0.36, size[1] * 0.34
    m = Matrix.Translation(center) @ Matrix.Rotation(yaw, 4, 'Y')
    xr = -size[0] / 2 - 0.0015
    vs = [bm.verts.new(m @ Vector((xr, sy * h, sz * w))) for sy, sz in ((-1, -1), (-1, 1), (1, 1), (1, -1))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.x > 0:
        f.normal_flip()
    f.material_index = MI['lens']


def mirror_door(S, M, aero=False):
    x = S.ws0 - 0.2
    ys = S.y_shoulder(x)
    zf = S.w_max(x) - 0.085  # pied de vitre
    bm = bmesh.new()
    if aero:
        size, c = (0.17, 0.062, 0.09), Vector((x - 0.03, ys + 0.105, zf + 0.15))
        merge(bm, rounded_box(size, c, 'carbon', 0.024, yaw=0.12))
        merge(bm, rounded_box((0.045, 0.012, 0.13), Vector((x + 0.005, ys + 0.088, zf + 0.07)), 'trim', 0.004, yaw=0.0, pitch=0.0))
    else:
        size, c = (0.13, 0.092, 0.115), Vector((x - 0.02, ys + 0.092, zf + 0.105))
        merge(bm, rounded_box(size, c, 'paint_plain', 0.03, yaw=0.15))
        merge(bm, rounded_box((0.055, 0.03, 0.075), Vector((x + 0.008, ys + 0.05, zf + 0.045)), 'trim', 0.008))
    _mirror_glass(bm, c, size, 0.12 if aero else 0.15)
    return bm


def mirror_fender(S, M):
    """Rétro d'aile : petit miroir sur tige, au-dessus de la roue avant."""
    x = S.d['fa'] + 0.18
    z = S.w_max(x) - S.d.get('edge_in', 0.105) - 0.05
    y = M.y(x, z)
    bm = bmesh.new()
    stem = [[(x + 0.02 * k + r * math.cos(a), y - 0.01 + 0.15 * k, z + r * math.sin(a)) for a in [2 * math.pi * i / 8 for i in range(8)]]
            for k, r in ((0.0, 0.011), (1.0, 0.007))]
    merge(bm, loft(stem, 'trim'))
    size, c = (0.062, 0.066, 0.095), Vector((x - 0.005, y + 0.165, z))
    merge(bm, rounded_box(size, c, 'trim', 0.02))
    _mirror_glass(bm, c, size, 0.0)
    return bm


def popup_lamps(S, M, lamps):
    """Phares escamotables relevés (de nuit) : un bloc profilé par phare, optique encadrée tournée vers l'avant."""
    bm = bmesh.new()
    for x, _, z in lamps:
        y = M.y(x, z)
        size = (0.30, 0.125, 0.40)
        c = Vector((x, y + 0.045, z))
        merge(bm, rounded_box(size, c, 'paint_plain', 0.028, pitch=-0.06))
        merge(bm, rounded_box((0.014, 0.098, 0.34), Vector((x + 0.146, y + 0.05, z)), 'trim', 0.004))
        merge(bm, rounded_box((0.012, 0.074, 0.30), Vector((x + 0.153, y + 0.05, z)), 'head', 0.004))
    return bm


def build_parts(S, body, lamps=()):
    """Toutes les pièces d'une voiture : { nom: objet Blender }."""
    M = Mounts(body)
    wings = {'duck': wing_duck, 'gt': wing_gt, 'swan': lambda S, M: wing_gt(S, M, swan=True), 'hoop': wing_hoop, 'lip': wing_lip}
    wanted = dict.fromkeys(['duck', 'gt', 'swan', S.d['wing']])  # les options de l'atelier + l'aileron d'origine
    out = {}
    for name in wanted:
        out['wing_' + name] = wings[name](S, M)
    if S.d.get('head') == 'popup' and lamps:
        out['popup_up'] = popup_lamps(S, M, lamps)
    out['mirror_stock'] = mirror_door(S, M)
    out['mirror_aero'] = mirror_door(S, M, aero=True)
    out['mirror_fender'] = mirror_fender(S, M)
    objs = {}
    for name, bm in out.items():
        bm.normal_update()
        ob = C.new_object(f"{name}_{S.d['name']}", bm)
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.data.set_sharp_from_angle(angle=math.radians(32))  # arêtes de tôle nettes, galbes lisses
        objs[name] = ob
    return objs
