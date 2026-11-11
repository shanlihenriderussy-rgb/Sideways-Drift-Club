"""Fiches de style des trois voitures : cotes, lignes de caisse, optiques.

Les cotes fa / ra / w / R / rr / tw sont aussi celles de la physique et des roues du jeu : les changer ici
change le jeu. Les lignes (deck, belt, sill, plan) sont des points (x, valeur) reliés par une courbe monotone.
"""
from carlib import outline_ellipse, outline_poly, outline_rrect

CARS = {
    # HACHI — coupé à hayon des années 80 : lignes droites, phares escamotables, pare-chocs noirs
    'hachi': dict(
        fa=1.12, ra=-1.18, w=1.66, nose=0.86, tail=0.80, R=0.31, rr=0.195, tw=0.20,
        roof=1.315, wsLen=0.62, roofEnd=-0.62, gEnd=-1.80, bpil=-0.34, cpil=-1.16, tumble=0.17, hatch=True,
        bulge=0.014, head='popup', tailL='twin', wing='lip',
        end_round=0.05, end_scale=((0.94, 0.95), (0.985, 0.988), (1.0, 1.0)), nose_lean=0.02, tail_lean=0.03,
        belt_crease=0.55, cap_crease=0.6, edge_in=0.085, ws_curve=1.35,
        deck_line=[(-1.98, 0.905), (-1.80, 0.95), (0.0, 0.935), (0.70, 0.925), (1.20, 0.895), (1.65, 0.86), (1.90, 0.825), (1.98, 0.775)],
        belt_line=[(-1.98, 0.85), (-1.75, 0.89), (-1.18, 0.895), (-0.34, 0.885), (0.70, 0.872), (1.20, 0.848), (1.65, 0.815), (1.90, 0.78), (1.98, 0.735)],
        sill_line=[(-1.98, 0.335), (-1.75, 0.275), (-1.10, 0.235), (0.80, 0.235), (1.60, 0.25), (1.98, 0.285)],
        plan=[(-1.98, 0.775), (-1.80, 0.815), (-1.10, 0.83), (0.0, 0.83), (1.12, 0.826), (1.60, 0.815), (1.86, 0.795), (1.98, 0.765)],
        arch=0.06, front_rows=(0.12, 0.44, 0.74), rear_rows=(0.12, 0.44, 0.74), nose_bow=0.02, tail_bow=0.015,
        front=[
            dict(cells=[(1, 0), (1, 1), (1, 2)], mat='trim', depth=0.025, thick=0.016),
            dict(cells=[(1, 3)], mat='lens', depth=0.012, thick=0.013, rim='chrome'),
            dict(cells=[(2, 0), (2, 1), (2, 2), (2, 3)], mat='trim', depth=-0.024, thick=0.008, rim='trim', crease=0.8),
            dict(cells=[(3, 0), (3, 1)], mat='trim', depth=0.03, thick=0.03),
        ],
        rear=[
            dict(cells=[(1, 0)], mat='trim', depth=0.008, thick=0.012, rim='trim'),
            dict(cells=[(1, 1), (1, 2)], mat='tail', depth=0.012, thick=0.012, rim='trim'),
            dict(cells=[(1, 3)], mat='amber', depth=0.012, thick=0.012, rim='trim'),
            dict(cells=[(2, 0), (2, 1), (2, 2), (2, 3)], mat='trim', depth=-0.024, thick=0.008, rim='trim', crease=0.8),
        ],
        preview_paint=(0.82, 0.82, 0.78, 1),
    ),
    # KOUKI — coupé des années 90 : volumes tendus, optiques effilées, bandeau de feux
    'kouki': dict(
        fa=1.22, ra=-1.30, w=1.74, nose=0.98, tail=0.88, R=0.32, rr=0.21, tw=0.22,
        roof=1.285, wsLen=0.80, roofEnd=-0.78, gEnd=-1.44, bpil=-0.30, cpil=-1.02, tumble=0.20,
        bulge=0.028, head='projector', tailL='bar', wing='gt',
        end_round=0.065, nose_lean=0.05, tail_lean=0.03, belt_crease=0.4,
        deck_line=[(-2.18, 0.84), (-1.95, 0.935), (-1.44, 0.965), (0.0, 0.94), (0.80, 0.915), (1.35, 0.868), (1.80, 0.795), (2.05, 0.73), (2.20, 0.675)],
        belt_line=[(-2.18, 0.78), (-1.90, 0.878), (-1.30, 0.898), (-0.30, 0.888), (0.80, 0.862), (1.35, 0.815), (1.80, 0.745), (2.05, 0.685), (2.20, 0.63)],
        sill_line=[(-2.18, 0.34), (-1.90, 0.27), (-1.20, 0.215), (0.90, 0.215), (1.80, 0.225), (2.20, 0.255)],
        plan=[(-2.18, 0.775), (-1.95, 0.835), (-1.30, 0.868), (0.0, 0.87), (1.22, 0.866), (1.75, 0.848), (2.02, 0.81), (2.20, 0.745)],
        arch=0.06, front_rows=(0.12, 0.42, 0.70), rear_rows=(0.14, 0.46, 0.74), nose_bow=0.05, tail_bow=0.03,
        front=[
            dict(cells=[(1, 2), (1, 3)], mat='head', depth=0.016, thick=0.012, rim='trim'),
            dict(cells=[(1, 0), (1, 1)], mat='trim', depth=0.02, thick=0.03),
            dict(cells=[(3, 0), (3, 1), (3, 2)], mat='trim', depth=0.04, thick=0.02),
            dict(cells=[(3, 3)], mat='lens', depth=0.02, thick=0.03, rim='trim'),
        ],
        rear=[
            dict(cells=[(1, 0), (1, 1), (1, 2), (1, 3)], mat='tail', depth=0.012, thick=0.014, rim='trim'),
            dict(cells=[(3, 0), (3, 1), (3, 2)], mat='trim', depth=0.02, thick=0.03),
        ],
        preview_paint=(0.10, 0.22, 0.55, 1),
    ),
    # RAIJIN — coupé sport bas et galbé : taille de guêpe, ailes hautes, nez plongeant, quatre feux ronds
    'raijin': dict(
        fa=1.30, ra=-1.36, w=1.80, nose=1.06, tail=0.86, R=0.33, rr=0.225, tw=0.25,
        roof=1.235, wsLen=0.90, roofEnd=-0.55, gEnd=-1.60, bpil=-0.36, cpil=-1.04, tumble=0.25,
        bulge=0.04, fender_rise=0.085, head='oval', tailL='round', wing='hoop',
        end_round=0.085, end_scale=((0.80, 0.86), (0.94, 0.96), (0.985, 0.992)), nose_lean=0.07, tail_lean=0.04,
        belt_crease=0.15, cap_crease=0.25, edge_in=0.13, rg_curve=1.7,
        deck_line=[(-2.22, 0.81), (-2.00, 0.905), (-1.60, 0.945), (0.0, 0.905), (0.88, 0.875), (1.40, 0.825), (1.90, 0.735), (2.20, 0.645), (2.36, 0.575)],
        belt_line=[(-2.22, 0.75), (-1.95, 0.855), (-1.36, 0.885), (-0.36, 0.845), (0.88, 0.825), (1.40, 0.78), (1.90, 0.69), (2.20, 0.60), (2.36, 0.53)],
        sill_line=[(-2.22, 0.335), (-1.95, 0.26), (-1.20, 0.205), (1.00, 0.205), (1.90, 0.215), (2.36, 0.245)],
        plan=[(-2.22, 0.77), (-2.00, 0.85), (-1.36, 0.892), (-0.40, 0.868), (0.40, 0.868), (1.30, 0.892), (1.90, 0.865), (2.20, 0.80), (2.36, 0.70)],
        arch=0.06, front_rows=(0.14, 0.46, 0.78), rear_rows=(0.14, 0.46, 0.72), nose_bow=0.09, tail_bow=0.05,
        front=[
            dict(cells=[(1, 2), (1, 3)], mat='head', depth=0.012, thick=0.018, rim='trim'),
            dict(cells=[(3, 0), (3, 1)], mat='trim', depth=0.045, thick=0.03),
            dict(cells=[(3, 3)], mat='trim', depth=0.03, thick=0.028),
            dict(cells=[(2, 3)], mat='amber', depth=0.008, thick=0.034, rim='paint_plain'),
        ],
        rear=[
            dict(cells=[(1, 0), (1, 1), (1, 2), (1, 3)], mat='trim', depth=0.014, thick=0.012, rim='paint_plain'),
            dict(cells=[(3, 0), (3, 1)], mat='trim', depth=0.02, thick=0.03),
        ],
        preview_paint=(0.62, 0.05, 0.06, 1),
    ),
}


def details(kind, S, P):
    """Pièces projetées sur la caisse (le reste est creusé dans la cage) ; renvoie la position des phares."""
    d = S.d
    X0, X1 = S.X0, S.X1
    U, V = (0, 0, 1), (0, 1, 0)
    front = lambda y, z=0.0: ((X1 + 1, y, z), U, V, (-1, 0, 0))
    rear = lambda y, z=0.0: ((X0 - 1, y, z), U, V, (1, 0, 0))
    side = lambda x, y: ((x, y, 2), (1, 0, 0), V, (0, 0, -1))
    yb = lambda x, f: S.y_bot(x) + (S.y_shoulder(x) - S.y_bot(x)) * f  # hauteur à la fraction f du flanc
    lamps = []
    if kind == 'hachi':
        P.patch(outline_rrect(0.15, 0.034, 0.01), *front(yb(X1, 0.585), 0.50), 'amber', lift=0.030)
        lamps = [[X1 - 0.36, 0.86, 0.55]]
        P.patch(outline_rrect(1.36, 0.032, 0.012), *side(-0.03, 0.53), 'trim', lift=0.005)  # baguette latérale
    elif kind == 'kouki':
        lamps = [[X1 - 0.10, yb(X1, 0.85), 0.45]]
        P.patch(outline_rrect(0.28, 0.04, 0.014), *rear(yb(X0, 0.87)), 'lens', lift=0.004, both=False)  # feu de recul
        P.patch(outline_rrect(0.10, 0.03, 0.012), *side(1.50, 0.63), 'amber', lift=0.003)
    elif kind == 'raijin':
        lamps = [[X1 - 0.12, yb(X1, 0.88), 0.50]]
        for z in (0.20, 0.41):
            P.lamp(outline_ellipse(0.125, 0.125, 28), *rear(yb(X0, 0.86), z), 'tail', bezel='chrome', grow=0.008)
        P.patch(outline_rrect(0.10, 0.03, 0.012), *side(1.60, 0.60), 'amber', lift=0.003)
    # poignées de porte affleurantes
    hx = S.door_r() + 0.17
    P.patch(outline_rrect(0.15, 0.032, 0.014), *side(hx, S.belt(hx) - 0.085), 'trim', lift=0.003)
    return lamps
