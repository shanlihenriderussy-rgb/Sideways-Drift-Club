"""Pièces de l'atelier modélisées dans Blender, ajustées à chaque caisse.

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
        for f in bm.faces:
            f.material_index = MI[mat]
    return bm


def rounded_box(size, center, mat, radius, yaw=0.0, pitch=0.0, segments=4):
    """Coque aux arêtes adoucies."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=radius, segments=segments, profile=0.5, affect='EDGES', clamp_overlap=True)
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
    """Points de fixation relevés sur la carrosserie subdivisée."""

    def __init__(self, body):
        self.bvh = C.bvh_of([body])

    def y(self, x, z, default=0.9):
        hit, _, _, _ = self.bvh.ray_cast(Vector((x, 3.0, max(abs(z), 0.004))), DOWN, 3.0)
        return hit.y if hit is not None else default

    def under(self, x, z, default):
        hit, _, _, _ = self.bvh.ray_cast(Vector((x, 0.0, max(abs(z), 0.004))), -DOWN, 1.0)
        return min(hit.y, default + 0.045) if hit is not None else default

    def side(self, x, y, default):
        hit, _, _, _ = self.bvh.ray_cast(Vector((x, y, 2)), Vector((0, 0, -1)), 2.0)
        return hit.z if hit is not None else default

    def bumper(self, x, y, z, sign):
        hit, _, _, _ = self.bvh.ray_cast(
            Vector((x + sign, y, max(abs(z), 0.004))), Vector((-sign, 0, 0)), 1.35)
        return hit.x if hit is not None else x - sign * 0.08


def across(rings, mat):
    """Referme un volume transversal en gardant une section exactement sur l'axe."""
    return loft([[(x, y, -z) for x, y, z in ring] for ring in rings[:0:-1]] + rings, mat)


def pipe(points, radius, mat, sides=8):
    """Tube fermé dont les sections suivent la tangente du profil."""
    vertices = [Vector(p) for p in points]
    tangents = [(vertices[min(i + 1, len(vertices) - 1)] - vertices[max(0, i - 1)]).normalized()
                for i in range(len(vertices))]
    axes = [Vector(axis) for axis in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]
    ref = min(axes, key=lambda axis: max(abs(axis.dot(t)) for t in tangents))
    rings = []
    for p, t in zip(vertices, tangents):
        u = t.cross(ref).normalized() * radius
        v = t.cross(u)
        rings.append([p + math.cos(j * math.tau / sides) * u + math.sin(j * math.tau / sides) * v for j in range(sides)])
    return loft(rings, mat)


# ---------- lames, jupes et diffuseur ----------
def splitter(S, M, aero=False):
    """Lame qui suit le galbe du bouclier et remonte aux extrémités."""
    bm = bmesh.new()
    x = S.X1
    half = S.w_max(x - 0.17) - 0.035
    rings = []
    for t in (0.0, 0.25, 0.5, 0.68, 0.82, 0.93, 1.0):
        z = half * t
        bottom = M.under(x - 0.18, z, S.sill(x))
        nose = M.bumper(x, bottom + 0.025, z, 1)
        setback = 0.14 * t ** 4
        tip = min(nose, x + 0.025) + (0.115 if aero else 0.055) * (1 - 0.42 * t ** 2) - setback
        root = tip - (0.30 if aero else 0.22) + 0.05 * t
        y = bottom - 0.014 + 0.023 * t ** 4
        rings.append([(root, y + 0.026, z), (tip - 0.022, y + 0.008, z),
                      (tip, y, z), (tip - 0.009, y - 0.013, z), (root, y - 0.013, z)])
    merge(bm, across(rings, 'carbon'))
    return bm


def bumper_winglets(S, M, aero=False):
    """Ailettes profilées, centrées sur le flanc réel du bouclier."""
    bm = bmesh.new()
    tiers = ((0.19, 0.095, 0.235, 0.095),) if aero else (
        (0.16, 0.09, 0.19, 0.082), (0.24, 0.17, 0.16, 0.065))
    for dx, dy, chord, span in tiers:
        x = S.X1 - dx
        y = S.sill(x) + dy
        z = M.side(x, y, S.w_max(x) - 0.06)
        rings = []
        for t, scale in ((0, 1), (0.65, 0.82), (0.91, 0.56), (1, 0.35)):
            xx = x - 0.075 * t
            yy = y + 0.05 * t ** 1.5
            rings.append([(xx + u, yy + v + 0.17 * u, z - 0.018 + (span + 0.018) * t)
                          for u, v in foil(chord * scale, 0.065, camber=0.015, n=6)])
        merge(bm, loft(rings, 'carbon'))
    return bm


def side_skirt(S, M, variant):
    """Bas de caisse profilé entre les arches, avec une lèvre plus basse sur le kit aéro."""
    bm = bmesh.new()
    x0, x1 = S.d['ra'] + S.AR + 0.045, S.d['fa'] - S.AR - 0.045
    aero = variant == 'blade'
    rings = []
    for t in (0, 0.055, 0.20, 0.50, 0.80, 0.945, 1):
        x = x0 + (x1 - x0) * t
        y = M.under(x, S.w_max(x) - 0.08, S.sill(x))
        z = M.side(x, y + 0.028, S.w_max(x) - 0.055)
        width = (0.09 if aero else 0.06) * (0.45 + 0.55 * math.sin(math.pi * t) ** 0.6)
        if aero:
            rings.append([(x, y - 0.026, z - 0.035), (x, y - 0.047, z + width),
                          (x, y - 0.061, z + width - 0.008), (x, y - 0.053, z - 0.035)])
        else:
            rings.append([(x, y + 0.037, z - 0.025), (x, y + 0.026, z + 0.006),
                          (x, y - 0.014, z + width), (x, y - 0.037, z + width - 0.012),
                          (x, y - 0.039, z - 0.035)])
    merge(bm, loft(rings, 'paint_plain' if variant == 'skirt' else 'carbon'))
    return bm


def rear_diffuser(S, M):
    """Rampe sous le pare-chocs et six cloisons dont la hauteur décroît vers les sorties."""
    bm = bmesh.new()
    x = S.X0
    half = (S.w_max(x + 0.14) - 0.09) * 0.9
    y = M.under(x + 0.18, 0, S.sill(x)) - 0.053
    rings = []
    for t in (0, 0.22, 0.48, 0.73, 0.90, 1):
        z = half * t
        rear = M.bumper(x, y + 0.11, z, -1) - 0.068 + 0.10 * t ** 4
        rear_y = y + 0.067 + 0.013 * t ** 2
        rings.append([(x + 0.38, y, z), (rear + 0.10, rear_y - 0.024, z),
                      (rear, rear_y, z), (rear + 0.012, rear_y - 0.018, z),
                      (x + 0.38, y - 0.018, z)])
    merge(bm, across(rings, 'carbon'))
    for t in (0.16, 0.45, 0.74):
        z = half * t
        rear = M.bumper(x, y + 0.11, z, -1) - 0.054 + 0.10 * t ** 4
        rear_y = y + 0.060 + 0.013 * t ** 2
        merge(bm, plate([(x + 0.33, y - 0.009), (rear + 0.12, rear_y - 0.025), (rear, rear_y),
                         (rear + 0.047, y - 0.065), (x + 0.14, y - 0.071)], z, 0.014, 'carbon'))
    return bm


# ---------- toit ----------
def roof_scoop(S, M):
    """Écope à ouverture frontale, avec lèvres peintes et fond sombre en retrait."""
    bm = bmesh.new()
    span = S.ws1 - S.d['roofEnd']
    xf, xr = S.ws1 - span * 0.10, S.ws1 - span * 0.68
    half = 0.165
    roof = lambda x, z: M.y(x, z, S.roof(x))
    rings = []
    for t in (0.0, 0.45, 0.8, 0.94, 1.0):
        z = t * half
        front = xf - 0.034 * t ** 2
        rear = xr + 0.045 * t ** 2
        high = roof(front, z) + 0.105 - 0.034 * t ** 3
        mid = (front + rear) / 2
        rings.append([(rear, roof(rear, z) - 0.004, z),
                      (mid, roof(mid, z) + 0.079 - 0.02 * t, z),
                      (front - 0.014, high, z), (front, high - 0.012, z),
                      (front - 0.023, high - 0.023, z), (mid, roof(mid, z) + 0.048, z)])
    merge(bm, across(rings, 'paint_plain'))
    for sz in (1, -1):
        z = half - 0.01
        front = xf - 0.034
        merge(bm, plate([(xr + 0.025, roof(xr + 0.025, z) - 0.007), (front + 0.015, roof(front, z) - 0.006),
                         (front - 0.015, roof(front, z) + 0.06), (front - 0.075, roof(front, z) + 0.062)],
                        sz * z, 0.018, 'paint_plain', 0.004))
    mid = xf - 0.115
    shadow = [[(mid - 0.01, roof(mid, z) - 0.008, z), (mid + 0.006, roof(mid, z) + 0.056, z),
               (mid + 0.02, roof(mid, z) + 0.056, z), (mid + 0.022, roof(mid, z) - 0.008, z)]
              for z in (0.0, half * 0.5, half - 0.018)]
    merge(bm, across(shadow, 'trim'))
    return bm


def roof_visor(S, M):
    bm = bmesh.new()
    x = S.ws1 + 0.015
    half = (S.w_max(x) - S.d.get('edge_in', 0.105) - S.d['tumble']) * 0.92
    rings = []
    for t in (0.0, 0.32, 0.64, 0.88, 1.0):
        z = half * t
        rear = x - 0.045 + 0.036 * t ** 2
        front = x + 0.135 - 0.045 * t ** 3
        yr = M.y(rear, z, S.roof(rear))
        yf = M.y(front, z, yr - 0.05) + 0.025
        rings.append([(rear, yr, z), (rear + 0.012, yr + 0.018, z),
                      (front, yf + 0.015, z), (front - 0.008, yf, z)])
    merge(bm, across(rings, 'trim'))
    return bm


def roof_rack(S, M):
    """Galerie tubulaire, fixations sur le pavillon, roue de secours sanglée à plat."""
    bm = bmesh.new()
    span = S.ws1 - S.d['roofEnd']
    xc = (S.ws1 + S.d['roofEnd']) / 2
    z = (S.w_max(xc) - S.d.get('edge_in', 0.105) - S.d['tumble']) * 0.79
    dx = span * 0.43
    y = M.y(xc, 0, S.roof(xc)) + 0.068
    for side in (1, -1):
        sz = side * z
        merge(bm, pipe([(xc - dx, y, sz), (xc + dx, y, sz)], 0.016, 'chrome'))
        for x in (xc - dx * 0.82, xc + dx * 0.82):
            mount = M.y(x, z, S.roof(x) - 0.035)
            merge(bm, rounded_box((0.085, 0.033, 0.052), Vector((x, mount + 0.008, sz)), 'trim', 0.009, segments=2))
            merge(bm, pipe([(x, mount + 0.02, sz), (x, y, sz)], 0.018, 'chrome'))
    for x in (xc - dx * 0.82, xc, xc + dx * 0.82):
        merge(bm, pipe([(x, y + 0.012, -z), (x, y + 0.012, 0), (x, y + 0.012, z)], 0.015, 'chrome'))
    # Profil de pneu à flancs arrondis. Les anneaux à 0 et à pi sont sur la couture du miroir.
    yc = y + 0.094
    section = [(0.177, -0.04), (0.194, -0.067), (0.261, -0.071), (0.296, -0.046),
               (0.300, -0.029), (0.300, 0.034), (0.284, 0.063), (0.252, 0.075), (0.179, 0.056)]
    rings = []
    for i in range(25):
        a = i * math.tau / 24
        rings.append([(xc + r * math.cos(a), yc + h, r * math.sin(a)) for r, h in section])
    tire = loft(rings, 'trim', caps=False)
    bmesh.ops.remove_doubles(tire, verts=list(tire.verts), dist=1e-5)
    merge(bm, tire)
    for x in (xc - 0.109, xc + 0.109):
        straps = []
        for zz, h in ((0.0, 0.08), (0.223, 0.08), (0.267, 0.068), (0.285, 0.038), (0.295, -0.015), (z, -0.082)):
            yy = yc + h
            straps.append([(x - 0.016, yy, zz), (x + 0.016, yy, zz),
                           (x + 0.016, yy - 0.006, zz), (x - 0.016, yy - 0.006, zz)])
        merge(bm, across(straps, 'belt'))
    return bm


# ---------- habitacle ----------
def roll_cage(S, M):
    """Arceau cintré, barres de portes, jambes arrière et fixations au plancher."""
    bm = bmesh.new()
    x = S.ws0 - 1.39
    floor = S.sill(0) + 0.12
    z = min(0.47, S.w_max(x) - S.d.get('edge_in', 0.105) - S.d['tumble'] - 0.06)
    top = M.y(x, z - 0.095, S.roof(x)) - 0.065
    hoop = [(x + 0.045, floor + 0.013, z + 0.027), (x, top - 0.19, z),
            (x, top - 0.089, z - 0.017), (x, top - 0.037, z - 0.056), (x, top, z - 0.115), (x, top, 0)]
    merge(bm, pipe(hoop + [(x, y, -z) for x, y, z in hoop[-2::-1]], 0.021, 'chrome'))
    front_x = S.ws1 - 0.095
    pillar_x = (S.ws0 + S.ws1) / 2 - 0.04
    roof_z = z - 0.12
    front_y = M.y(front_x, roof_z, S.roof(front_x)) - 0.06
    pillar_y = M.y(pillar_x, z - 0.065, 1.04) - 0.07
    for side in (1, -1):
        pillar = [(x, top, roof_z), (front_x, front_y, roof_z + 0.018),
                  (pillar_x, pillar_y, z - 0.065), (S.ws0 - 0.14, floor + 0.025, z + 0.025)]
        rear = [(x, top - 0.04, z - 0.052), (max(S.d['gEnd'] + 0.16, x - 0.58), floor + 0.11, z - 0.02)]
        door = [(x, floor + 0.115, z + 0.03), (S.ws0 - 0.17, floor + 0.24, z + 0.025)]
        diagonal = [(x, top - 0.07, z - 0.052), (x + 0.016, floor + 0.06, -z - 0.012)]
        for points in (pillar, rear, door, diagonal):
            merge(bm, pipe([(x, y, z * side) for x, y, z in points], 0.019, 'chrome'))
        for xf in (x + 0.04, S.ws0 - 0.14):
            merge(bm, rounded_box((0.096, 0.023, 0.072), Vector((xf, floor + 0.011, side * (z + 0.027))),
                                  'trim', 0.005, segments=2))
    bmesh.ops.bisect_plane(bm, geom=[*bm.verts, *bm.edges, *bm.faces], dist=1e-6,
                          plane_co=(0, 0, 0), plane_no=(0, 0, 1))
    return bm


def seat_mount(S, M):
    x = S.ws0 - 0.96
    y = S.sill(0) + 0.12
    z = min(0.355, S.W - S.d.get('edge_in', 0.105) - S.d['tumble'] - 0.19)
    back = x - 0.205
    top = min(y + 0.70, M.y(back - 0.135, z + 0.10, S.roof(back)) - 0.09)
    return x, y, z, back, top


def bucket_seat(S, M, race):
    """Garniture sur coque, dossier incliné et joues du baquet."""
    bm = bmesh.new()
    x, y, z, back, top = seat_mount(S, M)
    color = 'seat' if race else 'trim'
    merge(bm, rounded_box((0.475, 0.08, 0.39), Vector((x, y + 0.075, z)), 'trim', 0.021, segments=2))
    merge(bm, rounded_box((0.416, 0.075, 0.28 if race else 0.37), Vector((x + 0.012, y + 0.134, z)),
                          color, 0.03, pitch=0.075, segments=2))
    start = y + 0.105
    rings = []
    for t, width in ((0.0, 0.185), (0.24, 0.187), (0.54, 0.17), (0.76, 0.153), (0.9, 0.13), (1.0, 0.102)):
        xx = back - 0.165 * t
        yy = start + (top - start) * t
        rings.append([(xx + 0.038, yy, z - width * 0.83), (xx + 0.038, yy, z + width * 0.83),
                      (xx, yy, z + width), (xx - 0.057, yy, z + width * 0.77),
                      (xx - 0.073, yy, z + width * 0.5), (xx - 0.073, yy, z - width * 0.5),
                      (xx - 0.057, yy, z - width * 0.77), (xx, yy, z - width)])
    merge(bm, loft(rings, color))
    if race:
        for side in (1, -1):
            merge(bm, rounded_box((0.35, 0.095, 0.071), Vector((x, y + 0.149, z + 0.156 * side)),
                                  'seat', 0.028, pitch=0.093, segments=2))
            outline = [(back + 0.055, y + 0.146), (back + 0.155, y + 0.185), (back + 0.117, y + 0.298),
                       (back + 0.05, y + 0.39), (back - 0.075, y + 0.46), (back - 0.099, y + 0.36)]
            merge(bm, plate(outline, z + 0.147 * side, 0.065, 'seat', 0.012))
            hole_x = back - 0.165 * 0.83 + 0.039
            merge(bm, rounded_box((0.016, 0.042, 0.065), Vector((hole_x, top - 0.105, z + 0.07 * side)),
                                  'trim', 0.007, pitch=0.24, segments=2))
    return bm


def seat_harness(S, M):
    """Sangles visibles sur le dossier du baquet et boucle centrale."""
    bm = bmesh.new()
    x, y, z, back, top = seat_mount(S, M)
    for side in (1, -1):
        rings = []
        for xx, yy, zz in ((back - 0.108, top - 0.112, 0.072), (back - 0.047, y + 0.44, 0.079),
                           (back + 0.017, y + 0.26, 0.081), (x - 0.035, y + 0.187, 0.025)):
            zc = z + zz * side
            rings.append([(xx, yy, zc - 0.019), (xx, yy, zc + 0.019),
                          (xx + 0.008, yy, zc + 0.019), (xx + 0.008, yy, zc - 0.019)])
        merge(bm, loft(rings, 'belt'))
    merge(bm, rounded_box((0.055, 0.018, 0.075), Vector((x - 0.035, y + 0.187, z)), 'chrome', 0.005, segments=2))
    return bm


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
    out['front_lip'] = splitter(S, M)
    out['front_aero'] = splitter(S, M, aero=True)
    out['front_canards'] = bumper_winglets(S, M)
    out['front_winglets'] = bumper_winglets(S, M, aero=True)
    out['skirt_painted'] = side_skirt(S, M, 'skirt')
    out['skirt_carbon'] = side_skirt(S, M, 'carbon')
    out['skirt_blade'] = side_skirt(S, M, 'blade')
    out['diffuser_fins'] = rear_diffuser(S, M)
    out['roof_scoop'] = roof_scoop(S, M)
    out['roof_visor'] = roof_visor(S, M)
    out['roof_rack'] = roof_rack(S, M)
    out['cage_cage'] = roll_cage(S, M)
    out['seat_stock'] = bucket_seat(S, M, race=False)
    out['seat_bucket'] = bucket_seat(S, M, race=True)
    out['seat_harness'] = seat_harness(S, M)
    objs = {}
    for name, bm in out.items():
        bm.normal_update()
        ob = C.new_object(f"{name}_{S.d['name']}", bm)
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.data.set_sharp_from_angle(angle=math.radians(32))  # arêtes de tôle nettes, galbes lisses
        objs[name] = ob
    return objs
