"""Construit les trois carrosseries et les exporte vers assets/models/*.bin.

    pip install bpy                      # Blender en module Python (5.x)
    python tools/models/build_cars.py                 # les trois voitures
    python tools/models/build_cars.py kouki --preview out/   # une voiture + rendus Cycles de contrôle
    python tools/models/build_cars.py --blend out/    # enregistre aussi les .blend pour retouche à la main
    python tools/models/build_cars.py kouki --preview out/ --show wing_swan,mirror_aero   # choisir les pièces montrées
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carlib as C  # noqa: E402
from cars import CARS, details  # noqa: E402
from parts import build_parts  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
N_PROFILE, N_SURF_Z = 56, 14
SHOW = None


def tables(S, bvh):
    """Lignes de la caisse relevées sur le maillage final : le jeu s'en sert pour poser les pièces rapportées
    (ailerons, lames, jupes, roues) sans qu'elles flottent ni s'enfoncent."""
    from mathutils import Vector
    r4 = lambda v: round(v, 4)
    down, up, inward = Vector((0, -1, 0)), Vector((0, 1, 0)), Vector((0, 0, -1))
    xs = [S.X0 + S.L * i / (N_PROFILE - 1) for i in range(N_PROFILE)]
    prof = {'yS': [], 'yBot': [], 'wB': []}
    surf = []
    for x in xs:
        xc = min(max(x, S.X0 + 0.03), S.X1 - 0.03)
        ys = S.y_shoulder(xc)
        # demi-largeur : le point le plus à l'extérieur du flanc
        w = 0.0
        for k in range(7):
            y = S.y_bot(xc) + (ys - S.y_bot(xc)) * (0.15 + 0.7 * k / 6)
            hit, _, _, _ = bvh.ray_cast(Vector((xc, y, 2.0)), inward, 2.0)
            if hit is not None:
                w = max(w, hit.z)
        hit, _, _, _ = bvh.ray_cast(Vector((xc, -0.5, max(0.05, w - 0.03))), up, 2.0)
        prof['wB'].append(r4(w))
        prof['yBot'].append(r4(hit.y if hit is not None else S.y_bot(xc)))
        prof['yS'].append(r4(ys))
        row = []
        for j in range(N_SURF_Z):
            z = S.W * j / (N_SURF_Z - 1)
            hit, _, _, _ = bvh.ray_cast(Vector((xc, 3.0, max(z, 0.004))), down, 3.0)
            row.append(r4(hit.y) if hit is not None else 0.0)
        surf.append(row)
    top = lambda x: bvh.ray_cast(Vector((x, 3.0, 0.04)), down, 3.0)[0].y
    # plaque arrière : au milieu du bouclier, sous les feux
    py = S.y_bot(S.X0) + (S.y_shoulder(S.X0) - S.y_bot(S.X0)) * 0.56
    plate = bvh.ray_cast(Vector((S.X0 - 1.0, py, 0.04)), Vector((1, 0, 0)), 2.0)[0]
    nose = bvh.ray_cast(Vector((S.X1 + 1.0, S.y_bot(S.X1) + 0.1, 0.04)), Vector((-1, 0, 0)), 2.0)[0]
    return {
        'n': N_PROFILE, 'nz': N_SURF_Z, 'profile': prof, 'surf': surf,
        'sill': r4(S.sill(0)), 'floor': r4(S.sill(0) + 0.12), 'cowl': r4(top(S.ws0 + 0.06)), 'deck': r4(top(S.X0 + 0.3)),
        'edgeIn': S.d.get('edge_in', 0.105), 'plate': [r4(plate.x), r4(plate.y)], 'noseX': r4(nose.x), 'tailX': r4(plate.x),
    }


def assemble(kind, d, levels):
    """Une voiture complète à un niveau de subdivision : [caisse, pièces projetées, intérieur]."""
    S = C.Shape(d)
    bm, grid, xs, faces, crease = C.build_cage(S)
    C.detail_cage(S, bm, grid, xs, faces, crease)
    body = C.finish_body(S, bm, levels=levels)
    P = C.Projector(body, low=levels < 2)
    lamps = details(kind, S, P)
    parts = P.object('details_' + kind)
    inner = C.build_interior(S)
    return S, [body, parts, inner], lamps


def build(kind, preview=None, blend=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    d = dict(CARS[kind], name=kind)
    lods, keep = [], None
    for levels in (2, 1):
        S, objs, lamps = assemble(kind, d, levels)
        C.bake_ao(objs, S, samples=40 if levels == 2 else 24)
        lods.append(objs)
        if levels == 2:
            keep = (S, objs, lamps)
    S, objs, lamps = keep
    parts = build_parts(S, objs[0])
    for ob in parts.values():
        C.bake_ao(objs + [ob], S, samples=32, targets=[ob])
    meta = {k: v for k, v in d.items() if isinstance(v, (int, float, str, bool))}
    meta.update({'X0': round(S.X0, 4), 'X1': round(S.X1, 4), 'ws0': round(S.ws0, 4), 'ws1': round(S.ws1, 4), 'AR': round(S.AR, 4), 'lamps': lamps})
    meta.update(tables(S, C.bvh_of([objs[0]])))
    infos, pinfo, size = C.export_car(os.path.join(OUT, kind + '.bin'), lods, meta, parts)
    print(f"{kind}: " + ' | '.join(f"{i['verts']} sommets, {i['tris'] * 2} triangles" for i in infos) + f" · {size / 1024:.0f} Ko")
    print('  pièces : ' + ', '.join(f"{n} {i['tris'] * 2}" for n, i in pinfo.items()))
    for o in lods[1:]:  # ne garder dans la scène que le niveau fin (aperçu, .blend)
        for ob in o:
            bpy.data.objects.remove(ob)
    shown = set(SHOW.split(',')) if SHOW else {'wing_' + d['wing'], 'mirror_stock'}
    for name, ob in parts.items():
        if name not in shown:
            ob.hide_render = True
    if blend:
        os.makedirs(blend, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(blend, kind + '.blend')))
    if preview:
        os.makedirs(preview, exist_ok=True)
        C.preview(os.path.join(preview, kind), S, paint=d.get('preview_paint'))


if __name__ == '__main__':
    args = sys.argv[1:]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    preview, blend = opt('--preview'), opt('--blend')
    SHOW = opt('--show')  # pièces visibles dans l'aperçu, ex. wing_swan,mirror_aero
    kinds = [a for a in args if a in CARS] or list(CARS)
    os.makedirs(OUT, exist_ok=True)
    for kind in kinds:
        build(kind, preview, blend)
