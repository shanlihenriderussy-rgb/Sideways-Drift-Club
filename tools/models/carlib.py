"""Carrosseries du jeu, construites dans Blender (module bpy).

Chaque voiture est une cage de subdivision décrite par des profils (ligne de toit, ceinture de caisse,
bas de caisse, plan) : sections transversales reliées, vitrages incrustés, joints d'ouvrants creusés,
lèvres de passage de roue. Les optiques et les grilles sont des pièces projetées sur la carrosserie.
L'occlusion ambiante est calculée par lancer de rayons et stockée par sommet.

Repère (celui du jeu) : x vers l'avant, y vers le haut, z vers la droite. Unité : le mètre.
"""
import json
import math
import random
import struct

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# emplacements de matériau : l'indice est écrit par sommet dans le fichier exporté
MATS = ['paint_side', 'paint_top', 'paint_plain', 'glass', 'trim', 'chrome', 'head', 'tail', 'lens', 'amber']
MI = {n: i for i, n in enumerate(MATS)}


# ---------- outils numériques ----------
def clamp(v, a, b):
    return max(a, min(b, v))


def smooth(t):
    t = clamp(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def bump(dx, half):
    return 0.5 + 0.5 * math.cos(math.pi * dx / half) if abs(dx) < half else 0.0


def pchip(pts):
    """Courbe monotone par morceaux passant par pts = [(x, y), ...] (x croissant) ; pas de dépassement."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while x > xs[i + 1]:
            i += 1
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])

    return f


# ---------- profils d'une voiture ----------
class Shape:
    """Lignes de style d'une voiture, évaluées en fonction de x."""

    NR = 10  # points par demi-section, du bas de caisse (0) à l'axe (9)

    def __init__(self, d):
        self.d = d
        self.X0 = d['ra'] - d['tail']
        self.X1 = d['fa'] + d['nose']
        self.L = self.X1 - self.X0
        self.W = d['w'] / 2
        self.R = d['R']
        self.AR = d['R'] + d.get('arch', 0.075)
        self.ws0 = d['fa'] - d.get('cowl_back', 0.42)  # pied de pare-brise
        self.ws1 = self.ws0 - d['wsLen']  # haut de pare-brise
        self.deck = pchip(d['deck_line'])  # axe du capot et du coffre (prolongé sous l'habitacle)
        self.belt = pchip(d['belt_line'])  # ligne de caisse (épaule)
        self.plan = pchip(d['plan'])  # demi-largeur maximale
        self.sill = pchip(d['sill_line'])  # bas de caisse hors passages de roue

    # hauteur relative du pavillon : 0 au pied de pare-brise et au bas de lunette, 1 sur le toit
    def k(self, x):
        d = self.d
        if x >= self.ws0 or x <= d['gEnd']:
            return 0.0
        if x >= self.ws1:
            t = (self.ws0 - x) / (self.ws0 - self.ws1)
            return 1 - (1 - t) ** d.get('ws_curve', 1.7)
        if x >= d['roofEnd']:
            return 1.0
        t = (x - d['gEnd']) / (d['roofEnd'] - d['gEnd'])
        return t ** 0.75 if d.get('hatch') else 1 - (1 - t) ** d.get('rg_curve', 2.2)

    def roof(self, x):
        d = self.d
        mid, half = (self.ws1 + d['roofEnd']) / 2, max(0.2, (self.ws1 - d['roofEnd']) / 2)
        return d['roof'] - d.get('roof_arc', 0.018) * clamp((x - mid) / half, -1.4, 1.4) ** 2

    def y_bot(self, x):
        y = self.sill(x)
        for wx in (self.d['fa'], self.d['ra']):
            dx = x - wx
            if abs(dx) <= self.AR:
                y = max(y, self.R + math.sqrt(max(0.0, self.AR ** 2 - dx ** 2)))
        return y

    def y_shoulder(self, x):
        y = self.belt(x)
        top = self.R + self.AR
        for wx in (self.d['fa'], self.d['ra']):
            y = max(y, top + self.d.get('fender_rise', 0.07) - (1 - bump(x - wx, self.AR * 1.6)) * 0.6)
        return y

    def w_max(self, x, kit=0.0):
        b = (self.d.get('bulge', 0.0) + kit) * (bump(x - self.d['fa'], self.AR * 1.6) + bump(x - self.d['ra'], self.AR * 1.6))
        return self.plan(x) + b

    def ring(self, x, kit=0.0):
        """Demi-section à l'abscisse x : liste de (y, z), du bas de caisse à l'axe."""
        d = self.d
        yb, ys, wb = self.y_bot(x), self.y_shoulder(x), self.w_max(x, kit)
        ys = max(ys, yb + 0.06)
        h = ys - yb
        tuck = d.get('tuck', 0.05)
        # près des boucliers, les lignes horizontales suivent le dessin de la face (bandeau d'optiques, pare-chocs)
        f1, f2, f3 = 0.10, 0.46, 0.84
        for xe, rows in ((self.X1, d.get('front_rows')), (self.X0, d.get('rear_rows'))):
            if rows:
                t = smooth(1 - abs(x - xe) / 0.45)
                f1, f2, f3 = f1 + (rows[0] - f1) * t, f2 + (rows[1] - f2) * t, f3 + (rows[2] - f3) * t
        side = [
            (yb, wb - tuck),
            (yb + f1 * h, wb - 0.012),
            (yb + f2 * h, wb),
            (yb + f3 * h, wb - 0.010),
            (ys, wb - 0.040),
        ]
        # dessus hors habitacle : capot ou coffre, bombé vers l'axe
        yc = max(self.deck(x), ys + 0.02)
        ye = ys + 0.024
        we = wb - d.get('edge_in', 0.105)
        base = [(ye, we)]
        for f in (0.70, 0.42, 0.0):
            base.append((yc - (yc - ye) * f ** 2.2, we * f))
        k = self.k(x)
        if k <= 0:
            return side + [base[0], base[1], base[2], (base[3][0], base[3][1] * 0 + we * 0.18), base[3]]
        # habitacle : pied de vitre, montant de pavillon, toit
        rf = self.roof(x)
        s = smooth(k / 0.35)
        tum = d['tumble']
        wl = wb - 0.085  # pied de vitre latérale
        wr = wl - tum * (0.25 + 0.75 * k)  # rail de pavillon
        cab = [
            (ys + 0.018, wl),
            (ys + 0.018 + (rf - 0.055 - ys) * k, wr),
            (ys + 0.018 + (rf - 0.012 - ys) * k, wr - 0.10 * s - 0.02),
            (ys + 0.018 + (rf + 0.006 - ys) * k, (wr - 0.10) * 0.5),
            (ys + 0.018 + (rf + 0.014 - ys) * k, 0.0),
        ]
        b5 = [base[0], base[1], base[2], (base[3][0], we * 0.18), base[3]]
        top = []
        for (yb5, zb5), (yc5, zc5) in zip(b5, cab):
            top.append((max(yb5 * (1 - s) + yc5 * s, yb5 if k < 0.02 else 0), zb5 * (1 - s) + zc5 * s))
        return side + top

    def stations(self):
        """Abscisses des sections : lignes imposées (habitacle, ouvrants, arches), puis comblement régulier."""
        d = self.d
        ends = d.get('end_round', 0.07)
        must = [self.X0, self.X0 + ends, self.X0 + ends * 2.4, self.X0 + ends * 4.6, self.X1 - ends * 4.6, self.X1 - ends * 2.4, self.X1 - ends, self.X1]
        for wx in (d['fa'], d['ra']):
            must += [wx + a * self.AR for a in (-1.0, -0.88, -0.52, 0.0, 0.52, 0.88, 1.0)]
            must += [wx - self.AR - 0.07, wx + self.AR + 0.07]
        lines = [self.ws0 + 0.07, self.ws0, self.ws0 - d['wsLen'] * 0.33, self.ws0 - d['wsLen'] * 0.66, self.ws1,
                 d['roofEnd'], d['gEnd'], d['gEnd'] - 0.07, d['bpil'] + 0.04, d['bpil'] - 0.04, d['cpil'], self.door_f(), self.door_r(),
                 self.X1 - d.get('hood_gap', 0.30)]
        n = max(2, int(round((d['roofEnd'] - d['gEnd']) / 0.3)))
        lines += [d['gEnd'] + (d['roofEnd'] - d['gEnd']) * i / n for i in range(1, n)]
        out = sorted(must)
        for c in lines:  # les lignes de style priment : on écarte les sections trop proches
            out = [x for x in out if abs(x - c) > 0.05 or x in (self.X0, self.X1)]
            out.append(c)
        out = sorted(set(round(x, 4) for x in out if self.X0 <= x <= self.X1))
        full = [out[0]]
        for x in out[1:]:
            gap = x - full[-1]
            n = int(math.ceil(gap / d.get('max_gap', 0.27)))
            a0 = full[-1]
            for i in range(1, n):
                full.append(round(a0 + gap * i / n, 4))
            full.append(x)
        return full

    def door_f(self):
        return self.ws0 - 0.03

    def door_r(self):
        return self.d['bpil'] - 0.05


# ---------- construction de la cage ----------
def new_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in MATS:
        me.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    return ob


def build_cage(S, kit=0.0):
    """Demi-caisse (z ≥ 0) : grille stations × points, embouts fermés. Renvoie (bmesh, grille de sommets, stations)."""
    d = S.d
    xs = S.stations()
    bm = bmesh.new()
    crease = bm.edges.layers.float.new('crease_edge')
    grid = []
    n = len(xs)
    for i, x in enumerate(xs):
        ring = S.ring(x, kit)
        # embouts : la section rétrécit vers son centre sur les dernières sections (arrondi du bouclier)
        e = min(i, n - 1 - i)
        if e < 3:
            sz, sy = d.get('end_scale', ((0.86, 0.90), (0.955, 0.972), (0.99, 0.995)))[e]
            cy = (ring[0][0] + ring[5][0]) / 2
            ring = [(cy + (y - cy) * sy, z * sz) for (y, z) in ring]
        row = []
        front = i >= n - 4
        rear = i <= 3
        for j, (y, z) in enumerate(ring):
            xo = 0.0
            if front or rear:
                # bas de bouclier avancé, haut en retrait : le nez plonge
                lean = d.get('nose_lean', 0.05) if front else -d.get('tail_lean', 0.03)
                yb, yt = ring[0][0], ring[9][0]
                f = clamp((y - yb) / max(0.05, yt - yb), 0, 1)
                amt = (1.0, 0.72, 0.42, 0.18)[e]
                xo = -lean * amt * f ** 1.5
            row.append(bm.verts.new((x + xo, y, max(0.0, z))))
        grid.append(row)
    bm.verts.ensure_lookup_table()
    faces = {}
    NR = S.NR
    for i in range(n - 1):
        for j in range(NR - 1):
            a, b, c, e = grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]
            f = bm.faces.new((a, e, c, b))  # normale sortante
            f.material_index = MI['paint_side'] if j < 4 else MI['paint_top']
            faces[(i, j)] = f
    # boucliers : une grille de quads (5 colonnes de l'axe au coin, 5 rangs du capot au bas), bombée en plan.
    # Les cases servent ensuite à creuser optiques et prises d'air comme on incruste les vitres.
    for i, is_front in ((0, False), (n - 1, True)):
        row = grid[i]
        top = [row[9], row[8], row[7], row[6], row[5]]  # de l'axe vers le coin
        sidev = [row[5], row[4], row[3], row[2], row[1], row[0]]  # du haut vers le bas
        y_low = sidev[5].co.y
        zmax = max(1e-6, top[4].co.z)
        bow = d.get('nose_bow' if is_front else 'tail_bow', 0.04) * (1 if is_front else -1)
        V = [[None] * 5 for _ in range(6)]
        for c in range(5):
            V[0][c] = top[c]
        for r in range(6):
            V[r][4] = sidev[r]
        for r in range(1, 6):
            t = (top[4].co.y - sidev[r].co.y) / max(1e-6, top[4].co.y - y_low)
            for c in range(4):
                u = top[c].co.z / zmax
                y = top[c].co.y + (y_low - top[c].co.y) * t
                z = u * sidev[r].co.z
                x = sidev[r].co.x + bow * (1 - u * u) * smooth(t * 1.6) * (1 - 0.35 * t)
                V[r][c] = bm.verts.new((x, y, z))
        for r in range(5):
            for c in range(4):
                q = (V[r][c], V[r + 1][c], V[r + 1][c + 1], V[r][c + 1])
                f = bm.faces.new(q[::-1] if is_front else q)  # normale vers l'extérieur : +x à l'avant, −x à l'arrière
                f.material_index = MI['paint_plain']
                faces[('front' if is_front else 'rear', r, c)] = f
    bm.normal_update()
    return bm, grid, xs, faces, crease


def build_interior(S, kit=0.0):
    """Coque intérieure sombre : baignoire sous la ceinture de caisse et ciel de toit, vus à travers les vitres."""
    d = S.d
    bm = bmesh.new()
    x0, x1 = d['gEnd'] + 0.03, S.ws0 - 0.03
    n = 12
    floor = d.get('floor', S.sill(0) + 0.12)
    rows = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        ring = S.ring(x, kit)
        ys, wl = ring[4][0], ring[5][1]
        tub = [(floor, 0.0), (floor, wl - 0.07), (ys - 0.015, wl - 0.035)]
        roof = [(y - 0.03, max(0.0, z - 0.035)) for (y, z) in ring[6:]]
        rows.append([bm.verts.new((x, y, z)) for (y, z) in tub + roof])
    m = len(rows[0])
    for i in range(n):
        for j in range(m - 1):
            if j == 2:
                continue  # ouverture des vitres latérales
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            f.material_index = MI['trim']
    for row, flip in ((rows[0], True), (rows[-1], False)):  # cloisons avant et arrière, sous la ceinture
        q = [row[0], row[1], row[2], bm.verts.new((row[2].co.x, row[2].co.y, 0.0))]
        bm.faces.new(q if flip else q[::-1]).material_index = MI['trim']
    bm.normal_update()
    ob = new_object('interior_' + d['name'], bm)
    mir = ob.modifiers.new('mirror', 'MIRROR')
    mir.use_axis = (False, False, True)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def edge_between(a, b):
    for e in a.link_edges:
        if e.other_vert(a) is b:
            return e
    return None


def detail_cage(S, bm, grid, xs, faces, crease):
    """Vitrages incrustés, joints d'ouvrants, lèvres d'aile : tout ce qui donne des arêtes nettes après subdivision."""
    d = S.d
    n = len(xs)
    mid = lambda i: (xs[i] + xs[i + 1]) / 2
    # ----- vitrages : régions de faces incrustées (le pourtour devient le joint noir)
    def glass(region, thick=0.026, depth=0.007):
        region = [f for f in region if f.is_valid]
        if not region:
            return
        r = bmesh.ops.inset_region(bm, faces=region, thickness=thick, depth=-depth, use_even_offset=True, use_boundary=False)
        for f in r['faces']:
            f.material_index = MI['trim']
        inner = set(region)
        for f in region:
            f.material_index = MI['glass']
            for e in f.edges:
                if any(g not in inner for g in e.link_faces):
                    e[crease] = 0.55
    ws = [faces[(i, j)] for i in range(n - 1) for j in (6, 7, 8) if S.ws1 - 0.01 < mid(i) < S.ws0]
    rg = [faces[(i, j)] for i in range(n - 1) for j in (6, 7, 8) if d['gEnd'] < mid(i) < d['roofEnd'] + 0.01]
    side_f = [faces[(i, 5)] for i in range(n - 1) if d['bpil'] + 0.04 < mid(i) < S.ws0 - d['wsLen'] * 0.30]
    side_r = [faces[(i, 5)] for i in range(n - 1) if d['cpil'] < mid(i) < d['bpil'] - 0.04 and S.k(mid(i)) > 0.5]
    glass(ws, 0.030)
    glass(rg, 0.030)
    glass(side_f, 0.024)
    glass(side_r, 0.024)
    # ----- boucliers : optiques, calandre, prises d'air creusées dans la face (ou pare-chocs en relief)
    for end in ('front', 'rear'):
        for feat in d.get(end, []):
            region = [faces[(end, r, c)] for (r, c) in feat['cells']]
            if feat.get('flat'):  # simple changement de matière, sans relief
                for f in region:
                    f.material_index = MI[feat['mat']]
                continue
            r = bmesh.ops.inset_region(bm, faces=region, thickness=feat.get('thick', 0.02), depth=-feat.get('depth', 0.02), use_even_offset=True, use_boundary=False)
            for f in r['faces']:
                f.material_index = MI[feat.get('rim', 'paint_plain')]
            inner = set(region)
            for f in region:
                f.material_index = MI[feat['mat']]
                for e in f.edges:
                    if any(g not in inner for g in e.link_faces):
                        e[crease] = feat.get('crease', 0.6)
    # ----- joints d'ouvrants : arêtes de cage biseautées en gorge
    def station_index(x):
        return min(range(n), key=lambda i: abs(xs[i] - x))
    chains = []
    def ring_chain(x, j0, j1):
        i = station_index(x)
        es = [edge_between(grid[i][j], grid[i][j + 1]) for j in range(j0, j1)]
        return [e for e in es if e is not None and e.is_valid]
    def long_chain(j, xa, xb):
        es = []
        for i in range(n - 1):
            if xa - 1e-6 <= xs[i] and xs[i + 1] <= xb + 1e-6:
                e = edge_between(grid[i][j], grid[i + 1][j])
                if e is not None and e.is_valid:
                    es.append(e)
        return es
    chains += ring_chain(S.door_f(), 0, 5)
    chains += ring_chain(S.door_r(), 0, 5)
    # jonctions aile / bouclier
    chains += ring_chain(d['fa'] + S.AR + 0.07, 0, 5)
    chains += ring_chain(d['ra'] - S.AR - 0.07, 0, 5)
    hood_f = S.X1 - d.get('hood_gap', 0.30)
    chains += long_chain(5, S.ws0 + 0.07, hood_f)
    chains += ring_chain(hood_f, 5, 9)
    if not d.get('hatch'):
        tr = d['gEnd'] - 0.07
        chains += ring_chain(tr, 5, 9)
        chains += long_chain(5, S.X0 + d.get('trunk_gap', 0.2), tr)
    chains = list(dict.fromkeys(chains))  # sans doublon, ordre conservé : la caisse et son kit doivent se construire à l'identique
    if chains:
        old = [v.co.copy() for e in chains for v in e.verts]
        r = bmesh.ops.bevel(bm, geom=chains, offset=d.get('gap_w', 0.007), offset_type='OFFSET', segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
        bm.normal_update()
        for v in r['verts']:
            if any((v.co - o).length < 0.0025 for o in old):
                v.co -= v.normal * d.get('gap_d', 0.011)
        for e in r['edges']:
            e[crease] = 0.35
    # ----- bord inférieur : lèvre rentrante (passages de roue et bas de caisse)
    bm.edges.ensure_lookup_table()
    low = [e for e in bm.edges if e.is_boundary and all(v.co.z > 0.02 for v in e.verts) and all(f.material_index == MI['paint_side'] for f in e.link_faces)]
    for e in low:
        e[crease] = 0.75
    r = bmesh.ops.extrude_edge_only(bm, edges=low)
    new_v = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in new_v:
        v.co.z -= 0.045
        v.co.y += 0.004
    for g in r['geom']:
        if isinstance(g, bmesh.types.BMFace):
            g.material_index = MI['paint_plain']
            g.normal_update()
            if g.normal.y > 0:  # la lèvre se voit par dessous
                g.normal_flip()
    # lignes de caractère : épaule, arête de capot, bas de caisse
    def line(j, amount, inside=None):
        if amount <= 0:
            return
        for i in range(n - 1):
            if inside and not inside(mid(i)):
                continue
            va, vb = grid[i][j], grid[i + 1][j]
            e = edge_between(va, vb) if va.is_valid and vb.is_valid else None
            if e is not None and e.is_valid:
                e[crease] = max(e[crease], amount)
    line(4, d.get('belt_crease', 0.4))
    line(5, d.get('edge_crease', 0.3), lambda x: x > S.ws0 or x < d['gEnd'])
    line(1, d.get('rocker_crease', 0.45))
    # pourtour des boucliers
    for i in (0, n - 1):
        for j in range(S.NR - 1):
            e = edge_between(grid[i][j], grid[i][j + 1]) if grid[i][j].is_valid and grid[i][j + 1].is_valid else None
            if e is not None and e.is_valid:
                e[crease] = max(e[crease], d.get('cap_crease', 0.4))
    bm.normal_update()


def finish_body(S, bm, levels=2):
    """Subdivise, met en miroir, soude l'axe. Renvoie l'objet Blender."""
    ob = new_object('body_' + S.d['name'], bm)
    sub = ob.modifiers.new('subdiv', 'SUBSURF')
    sub.levels = levels
    sub.subdivision_type = 'CATMULL_CLARK'
    sub.boundary_smooth = 'PRESERVE_CORNERS'
    mir = ob.modifiers.new('mirror', 'MIRROR')
    mir.use_axis = (False, False, True)
    mir.use_clip = True
    mir.merge_threshold = 0.0008
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    for p in me.polygons:
        p.use_smooth = True
    return ob


# ---------- pièces projetées sur la carrosserie ----------
def outline_rrect(w, h, r, n=8):
    """Contour d'un rectangle arrondi centré, sens trigonométrique."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def outline_ellipse(w, h, n=28):
    return [(w / 2 * math.cos(2 * math.pi * i / n), h / 2 * math.sin(2 * math.pi * i / n)) for i in range(n)]


def outline_poly(pts, r=0.0, n=5):
    """Polygone convexe aux coins arrondis (rayon r)."""
    if r <= 0:
        return list(pts)
    out = []
    m = len(pts)
    for i in range(m):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % m])
        a, b = (p0 - p1).normalized(), (p2 - p1).normalized()
        rr = min(r, (p0 - p1).length * 0.45, (p2 - p1).length * 0.45)
        s, e = p1 + a * rr, p1 + b * rr
        for k in range(n + 1):
            t = k / n
            q = (1 - t) ** 2 * s + 2 * t * (1 - t) * p1 + t * t * e
            out.append((q.x, q.y))
    return out


class Projector:
    """Pose des pièces qui épousent la carrosserie : un contour 2D est projeté le long d'une direction."""

    def __init__(self, body, low=False):
        self.bvh = bvh_of([body])
        self.bm = bmesh.new()
        self.low = low  # niveau de détail bas : contours et anneaux allégés

    def patch(self, outline, origin, axis_u, axis_v, direction, mat, lift=0.002, rings=4, dome=0.0, both=True):
        """outline : points (u, v) autour de l'origine ; direction : sens du rayon (vers la caisse).
        lift : décollement de la surface ; dome : bombé au centre. both : pose aussi le symétrique (z → −z)."""
        o, au, av, dr = Vector(origin), Vector(axis_u).normalized(), Vector(axis_v).normalized(), Vector(direction).normalized()
        if self.low:
            outline = outline[::2] if len(outline) > 12 else outline
            rings = 2
        cu = sum(p[0] for p in outline) / len(outline)
        cv = sum(p[1] for p in outline) / len(outline)
        layers = []
        for r in range(rings + 1):
            s = 1 - r / rings
            layer = []
            for (u, v) in outline if s > 0 else [(cu, cv)]:
                pu, pv = cu + (u - cu) * s, cv + (v - cv) * s
                start = o + au * pu + av * pv - dr * 1.5
                hit, nrm, _, _ = self.bvh.ray_cast(start, dr, 3.0)
                if hit is None:
                    return False
                h = lift + dome * (1 - s * s)
                layer.append(hit - dr * h)
            layers.append(layer)
        for sign in ((1, -1) if both else (1,)):
            vs = [[self.bm.verts.new((p.x, p.y, p.z * sign)) for p in layer] for layer in layers]
            n = len(outline)
            out = Vector((-dr.x, -dr.y, -dr.z * sign))  # la face visible regarde vers l'origine du rayon
            made = []
            for r in range(rings - 1):
                for i in range(n):
                    made.append(self.bm.faces.new((vs[r][i], vs[r][(i + 1) % n], vs[r + 1][(i + 1) % n], vs[r + 1][i])))
            c = vs[rings][0]
            for i in range(n):
                made.append(self.bm.faces.new((vs[rings - 1][i], vs[rings - 1][(i + 1) % n], c)))
            for f in made:
                f.material_index = MI[mat]
                f.normal_update()
                if f.normal.dot(out) < 0:
                    f.normal_flip()
        return True

    def lamp(self, outline, origin, axis_u, axis_v, direction, mat, bezel='trim', grow=0.012, **kw):
        """Optique : un entourage sombre, puis la glace légèrement bombée."""
        cu = sum(p[0] for p in outline) / len(outline)
        cv = sum(p[1] for p in outline) / len(outline)
        big = []
        for (u, v) in outline:
            l = math.hypot(u - cu, v - cv) or 1
            big.append((u + (u - cu) / l * grow, v + (v - cv) / l * grow))
        if not self.low:
            self.patch(big, origin, axis_u, axis_v, direction, bezel, lift=0.0025, rings=3, **kw)
        return self.patch(outline, origin, axis_u, axis_v, direction, mat, lift=0.004, dome=0.004, **kw)

    def box(self, center, size, mat, rot_y=0.0, rot_z=0.0, bevel=0.006, both=True):
        """Petit volume aux arêtes adoucies (rétroviseur, poignée)."""
        for sign in ((1, -1) if both else (1,)):
            tmp = bmesh.new()
            bmesh.ops.create_cube(tmp, size=1.0)
            for v in tmp.verts:
                v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
            if bevel > 0:
                bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=1 if self.low else 2, profile=0.6, affect='EDGES')
            cy, sy = math.cos(rot_y * sign), math.sin(rot_y * sign)
            cz, sz = math.cos(rot_z), math.sin(rot_z)
            idx = {}
            for v in tmp.verts:
                x, y, z = v.co
                x, y = x * cz - y * sz, x * sz + y * cz
                x, z = x * cy + z * sy, -x * sy + z * cy
                idx[v.index] = self.bm.verts.new((center[0] + x, center[1] + y, (center[2] + z) * sign if sign > 0 else -(center[2] + z)))
            for f in tmp.faces:
                vs = [idx[v.index] for v in f.verts]
                nf = self.bm.faces.new(vs if sign > 0 else vs[::-1])
                nf.material_index = MI[mat]
            tmp.free()

    def object(self, name):
        self.bm.normal_update()
        ob = new_object(name, self.bm)
        for p in ob.data.polygons:
            p.use_smooth = True
        return ob


def bvh_of(objects):
    verts, polys = [], []
    for ob in objects:
        base = len(verts)
        verts += [v.co.copy() for v in ob.data.vertices]
        polys += [[base + i for i in p.vertices] for p in ob.data.polygons]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0)


# ---------- occlusion ambiante par sommet ----------
def hemisphere(n, seed=7):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        u, v = rnd.random(), rnd.random()
        r, a = math.sqrt(u), 2 * math.pi * v
        out.append((r * math.cos(a), r * math.sin(a), math.sqrt(1 - u)))  # pondération en cosinus
    return out


def bake_ao(objects, S, samples=40, reach=1.1):
    """Écrit l'attribut 'ao' (0 = caché, 1 = dégagé) sur chaque sommet des objets."""
    occ = bmesh.new()
    for ob in objects:
        base = len(occ.verts)
        vs = [occ.verts.new(v.co) for v in ob.data.vertices]
        for p in ob.data.polygons:
            try:
                occ.faces.new([vs[i] for i in p.vertices])
            except ValueError:
                pass
    # le sol et les roues masquent le bas de caisse et les passages de roue
    g = [occ.verts.new((x, 0.0, z)) for x, z in ((-6, -6), (6, -6), (6, 6), (-6, 6))]
    occ.faces.new(g)
    for wx in (S.d['fa'], S.d['ra']):
        for sz in (1, -1):
            zc = sz * (S.W - S.d['tw'] / 2 - 0.02)
            ring_a, ring_b = [], []
            for i in range(16):
                a = 2 * math.pi * i / 16
                ring_a.append(occ.verts.new((wx + S.R * math.cos(a), S.R + S.R * math.sin(a), zc - S.d['tw'] / 2)))
                ring_b.append(occ.verts.new((wx + S.R * math.cos(a), S.R + S.R * math.sin(a), zc + S.d['tw'] / 2)))
            for i in range(16):
                occ.faces.new((ring_a[i], ring_a[(i + 1) % 16], ring_b[(i + 1) % 16], ring_b[i]))
            occ.faces.new(ring_a)
            occ.faces.new(ring_b)
    occ.verts.ensure_lookup_table()
    tree = BVHTree.FromBMesh(occ)
    occ.free()
    dirs = hemisphere(samples)
    for ob in objects:
        me = ob.data
        attr = me.attributes.get('ao') or me.attributes.new('ao', 'FLOAT', 'POINT')
        for v in me.vertices:
            n = v.normal
            t = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
            bx = n.cross(t).normalized()
            by = n.cross(bx)
            o = v.co + n * 0.004
            hit = 0.0
            for (dx, dy, dz) in dirs:
                dr = bx * dx + by * dy + n * dz
                loc, _, _, dist = tree.ray_cast(o, dr, reach)
                if loc is not None:
                    hit += 1 - (dist / reach) ** 2
            attr.data[v.index].value = 1 - hit / samples


# ---------- export ----------
def pack_lod(objects):
    """Demi-modèle (z ≥ 0) d'un niveau de détail : sommets et indices quantifiés."""
    verts, vdata, groups = {}, [], {}
    for oi, ob in enumerate(objects):
        me = ob.data
        me.calc_loop_triangles()
        ao = me.attributes.get('ao')
        normals = me.corner_normals
        for tri in me.loop_triangles:
            co = [me.vertices[i].co for i in tri.vertices]
            if (co[0].z + co[1].z + co[2].z) / 3 < -1e-5:
                continue
            idx = []
            for li, vi in zip(tri.loops, tri.vertices):
                p = me.vertices[vi].co
                n = normals[li].vector
                nz = 0.0 if abs(p.z) < 2e-4 else n.z
                key = (oi, vi, round(n.x, 2), round(n.y, 2), round(nz, 2), tri.material_index)
                k = verts.get(key)
                if k is None:
                    k = len(vdata)
                    verts[key] = k
                    vdata.append((p.x, p.y, max(0.0, p.z), n.x, n.y, nz, ao.data[vi].value if ao else 1.0, tri.material_index))
                idx.append(k)
            if len(set(idx)) == 3:
                groups.setdefault(MATS[tri.material_index], []).extend(idx)
    lo = [min(v[i] for v in vdata) for i in range(3)]
    size = [max(1e-6, max(v[i] for v in vdata) - lo[i]) for i in range(3)]
    vb = bytearray()
    for (x, y, z, nx, ny, nz, a, mi) in vdata:
        q = [int(round((c - lo[i]) / size[i] * 65535)) for i, c in enumerate((x, y, z))]
        l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
        vb += struct.pack('<3H3bBBx', q[0], q[1], q[2], *[int(round(clamp(c / l, -1, 1) * 127)) for c in (nx, ny, nz)], int(round(clamp(a, 0, 1) * 255)), mi)
    wide = len(vdata) > 65535
    ib, glist, off = bytearray(), [], 0
    for mat in MATS:
        if mat in groups:
            ids = groups[mat]
            ib += struct.pack('<%d%s' % (len(ids), 'I' if wide else 'H'), *ids)
            glist.append({'mat': mat, 'start': off, 'count': len(ids)})
            off += len(ids)
    ib += b'\0' * ((4 - len(ib) % 4) % 4)
    info = {'verts': len(vdata), 'tris': off // 3, 'index32': wide, 'min': [round(c, 5) for c in lo], 'size': [round(c, 5) for c in size], 'groups': glist}
    return info, vb, ib


def export_car(path, lods, meta):
    """Écrit le fichier : « SDCM », longueur de l'en-tête, en-tête JSON, puis les blocs de chaque niveau de détail.
    lods : listes d'objets, du niveau le plus fin au plus léger."""
    blob, infos = bytearray(), []
    for objects in lods:
        info, vb, ib = pack_lod(objects)
        info['vOff'] = len(blob); blob += vb
        info['iOff'] = len(blob); blob += ib
        infos.append(info)
    head = dict(meta)
    head.update({'v': 2, 'mats': MATS, 'lods': infos})
    js = json.dumps(head, separators=(',', ':')).encode('utf8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sI', b'SDCM', len(js)))
        f.write(js)
        f.write(blob)
    return infos, 8 + len(js) + len(blob)


# ---------- aperçu (rendu Cycles) ----------
PREVIEW_MATS = {
    'paint_side': ((0.82, 0.83, 0.80, 1), 0.0, 0.32, 1.0), 'paint_top': ((0.82, 0.83, 0.80, 1), 0.0, 0.32, 1.0), 'paint_plain': ((0.82, 0.83, 0.80, 1), 0.0, 0.32, 1.0),
    'glass': ((0.015, 0.02, 0.025, 1), 1.0, 0.04, 0.0), 'trim': ((0.02, 0.02, 0.02, 1), 0.1, 0.6, 0.0), 'chrome': ((0.8, 0.8, 0.82, 1), 1.0, 0.15, 0.0),
    'head': ((1.0, 0.97, 0.9, 1), 0.2, 0.15, 0.0), 'tail': ((0.55, 0.02, 0.02, 1), 0.2, 0.2, 0.0), 'lens': ((0.6, 0.65, 0.7, 1), 0.9, 0.08, 0.0), 'amber': ((1.0, 0.45, 0.05, 1), 0.2, 0.2, 0.0),
}


def preview(path, S, views=((35, 12), (150, 14), (90, 4), (8, 16)), res=(1100, 620), samples=24, paint=None):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res
    for name, (col, metal, rough, coat) in PREVIEW_MATS.items():
        m = bpy.data.materials.get(name)
        m.use_nodes = True
        b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = paint if (paint and name.startswith('paint')) else col
        b.inputs['Metallic'].default_value = metal
        b.inputs['Roughness'].default_value = rough
        if 'Coat Weight' in b.inputs:
            b.inputs['Coat Weight'].default_value = coat
            b.inputs['Coat Roughness'].default_value = 0.04
    # le jeu a y vers le haut : on bascule la scène pour Blender (z vers le haut)
    root = bpy.data.objects.new('root', None)
    sc.collection.objects.link(root)
    root.rotation_euler = (math.pi / 2, 0, 0)
    for ob in list(sc.collection.objects):
        if ob.type == 'MESH':
            ob.parent = root
    # roues factices : juger l'assiette et le remplissage des arches
    for nm, col, rough in (('tire', (0.02, 0.02, 0.02, 1), 0.8), ('rim', (0.55, 0.42, 0.2, 1), 0.3)):
        m = bpy.data.materials.new(nm)
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = col
        m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = rough
        m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.0 if nm == 'tire' else 0.9
    for wx in (S.d['fa'], S.d['ra']):
        for sz in (1, -1):
            zc = sz * (S.w_max(wx) - S.d['tw'] / 2 - 0.012)
            for nm, r, depth, off in (('tire', S.R, S.d['tw'], 0), ('rim', S.d['rr'], 0.02, sz * (S.d['tw'] / 2 - 0.03))):
                bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=depth, location=(wx, -(zc + off), S.R), rotation=(math.pi / 2, 0, 0))
                bpy.context.active_object.data.materials.append(bpy.data.materials[nm])
                bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    floor = bpy.context.active_object
    fm = bpy.data.materials.new('floor')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.16, 0.17, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.55
    floor.data.materials.append(fm)
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexGradient')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.05, 0.05, 0.06, 1)
    ramp.color_ramp.elements[1].color = (0.9, 0.92, 1.0, 1)
    mapn = nt.nodes.new('ShaderNodeMapping')
    mapn.inputs['Rotation'].default_value = (0, -math.pi / 2, 0)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(tc.outputs['Generated'], mapn.inputs['Vector'])
    nt.links.new(mapn.outputs['Vector'], sky.inputs['Vector'])
    nt.links.new(sky.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.1
    for loc, size, power in (((2.5, -3, 4.5), 5, 900), ((-4, 3, 3), 4, 350)):
        ld = bpy.data.lights.new('area', 'AREA')
        ld.size = size
        ld.energy = power
        lo = bpy.data.objects.new('area', ld)
        sc.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.5)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 60
    for k, (az, el) in enumerate(views):
        a, e = math.radians(az), math.radians(el)
        dist = 9.2
        tgt = Vector(((S.X0 + S.X1) / 2, 0, 0.55))
        cam.location = tgt + Vector((math.cos(a) * math.cos(e), -math.sin(a) * math.cos(e), math.sin(e))) * dist
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{path}-{k}.png'
        bpy.ops.render.render(write_still=True)
