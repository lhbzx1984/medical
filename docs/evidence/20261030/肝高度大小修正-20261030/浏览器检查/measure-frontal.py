# Usage: python -I measure-frontal.py <frontal screenshot.jpg>
# Reads the liver's height off a level, frontal body-level screenshot (800x781 screenshot of an 853x833 viewport).
# Scale comes from the body outline itself: BodyOutline is a LatheGeometry of straight segments, and its torso edge
# between (r 0.15, y 1.46) and (r 0.185, y 1.36) gives px per metre once the screen centre is known to be y 1.202
# (the orbit target = liver bodyPosition, camera levelled).
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert('RGB')
px = im.load()
CANVAS_TOP, CANVAS_H = 193.33 * 781 / 833, 571 * 781 / 833          # canvas rect from getBoundingClientRect
CY = CANVAS_TOP + CANVAS_H / 2
FOCAL = (CANVAS_H / 2) / 0.383864                                    # tan(42deg / 2)
TARGET_Y, LIVER_Z = 1.202, 0.023
liver = lambda p: p[1] > 105 or (p[0] > 110 and p[0] > p[2] + 20)
edge = lambda p: p[2] > 95 and p[1] > 55 and not liver(p)

fits = []
for y in (300, 320, 340):
    xs = [x for x in range(380, 660) if edge(px[x, y])]
    left = [x for x in xs if x < 518]
    right = [x for x in xs if x > 518]
    half = (max(right) - min(left)) / 2 if left and right else None
    if half is None:
        continue
    # half = s * (0.15 + 0.35 * (1.46 - Y)),  Y = TARGET_Y + (CY - y) / s  =>  s = (half + 0.35 * (CY - y)) / (0.15 + 0.35 * (1.46 - TARGET_Y))
    s = (half + 0.35 * (CY - y)) / (0.15 + 0.35 * (1.46 - TARGET_Y))
    fits.append(s)
    print(f'outline row {y}: edges {min(left)}..{max(right)}, half-width {half:.1f} px -> {s:.1f} px/m')
s_outline = sum(fits) / len(fits)
cam_z = FOCAL / s_outline                    # outline silhouette sits at z ~ 0
s_liver = FOCAL / (cam_z - LIVER_Z)
print(f'scale at outline {s_outline:.1f} px/m, camera z {cam_z:.3f} m, scale at liver {s_liver:.1f} px/m')
for name, Y in (('shoulder corner 1.46', 1.46), ('neck narrowest 1.56', 1.56)):
    print(f'check {name}: predicted row {CY - (Y - TARGET_Y) * s_outline:.1f}')

rows = []
for y in range(360, 560):
    n = sum(1 for x in range(420, 600) if liver(px[x, y]))
    rows.append((y, n))
stub_top = next(y for y, n in rows if n >= 3)
body_top = next(y for y, n in rows if n >= 40)
bottom = max(y for y, n in rows if n >= 3)
to_y = lambda row: TARGET_Y + (CY - row) / s_liver
print(f'vessel stub top row {stub_top} -> y {to_y(stub_top):.3f} m')
print(f'liver body top row {body_top} -> y {to_y(body_top):.3f} m')
print(f'liver bottom row {bottom} -> y {to_y(bottom):.3f} m')
xs = [x for x in range(420, 600) for y in range(body_top, bottom + 1) if liver(px[x, y]) and not 440 <= y <= 458]
print(f'liver columns {min(xs)}..{max(xs)} -> width {(max(xs) - min(xs)) / s_liver:.3f} m (ring rows 440-458 left out)')
