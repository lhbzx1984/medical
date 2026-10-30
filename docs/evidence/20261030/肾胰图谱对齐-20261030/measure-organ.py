# Usage: python -I measure-organ.py <frontal screenshot.jpg> <bodyPosition x> <y> <z> <bodySize> <canvas css width> <css px across the image> <canvas left css> <canvas top css> [ureters]
# Reads an organ's position off a level, frontal body-level screenshot and compares it with the body outline.
# The screenshot is 800 px wide. Two framings occurred (853 x 833 viewport, device pixel ratio 1.5, hidden pane):
#   before the change: 568.667 CSS px across the image, page shifted so the canvas starts at 0,0, canvas 574 wide;
#   after the change:  853 CSS px across the image, natural layout, canvas at 264.67,193.33, canvas 564 wide.
# Canvas height is 571 CSS px, field of view 42 deg.
# Reference: BodyOutline is a lathe, so its shoulder corner (r 0.185, y 1.36) gives the camera distance from the width
# and the orbit target's real height from the row. CameraRig stops within 1.2 cm of its goal, so that height is measured,
# not assumed. Rows and columns of the organ mask then convert to metres at the organ's own depth.
import math
import sys
from PIL import Image

path = sys.argv[1]
bx, by, bz, size, css_w, css_across, left_css, top_css = (float(v) for v in sys.argv[2:10])
ureters = 'ureters' in sys.argv[10:]
im = Image.open(path).convert('RGB')
px = im.load()
W, H = im.size
K = 800 / css_across
U = 568.667 / css_across  # the pixel limits below were set on the 568.667 framing
OX, OY = left_css * K, top_css * K
CX, CY = OX + css_w * K / 2, OY + 571 * K / 2
F = (571 * K / 2) / math.tan(math.radians(21))
D_NOMINAL = size * 2 + 0.55
canvas_right = min(W - 5, int(OX + css_w * K - 5))

organ = lambda p: p[0] > 40 and p[0] > p[2] + 10 and p[0] >= p[1] - 6
rim = lambda p: p[2] > 90 and p[2] > p[0] + 40 and not organ(p)

# Outline edges per row: from the axis outward, the outer end of the first bright rim on each side.
def first_rim(y, start, step, stop):
    x = start
    while x != stop and not rim(px[x, y]):
        x += step
    if x == stop:
        return None
    while x != stop and rim(px[x, y]):
        x += step
    return x - step

centre_guess = int(round(CX))
offset = int(round(150 * U))
rows = []
for y in range(int(OY + 60 * U), int(OY + 620 * U)):
    left = first_rim(y, centre_guess - offset, -1, int(OX + 20 * U))
    right = first_rim(y, centre_guess + offset, 1, canvas_right)
    if left is not None and right is not None:
        rows.append((y, left, right))
# Shoulder corner: the widest torso row in the upper half of the view, limited to where both edges are torso edges.
upper = [r for r in rows if r[0] < CY - 60 * U]
corner = max(upper, key=lambda r: r[2] - r[1])
widest = corner[2] - corner[1]
same = [r for r in upper if r[2] - r[1] >= widest - 2 * U]
corner_row = sum(r[0] for r in same) / len(same)
axis = (corner[1] + corner[2]) / 2
half = widest / 2
R = 0.185
d_axis = math.sqrt((F * R / half) ** 2 + R ** 2)
depth_ring = (d_axis ** 2 - R ** 2) / d_axis
target_y = 1.36 - (CY - corner_row) * depth_ring / F
d_organ = d_axis - bz
scale = F / d_organ
print(f'view: canvas centre ({CX:.1f}, {CY:.1f}), focal {F:.1f} px at 1 m')
print(f'outline shoulder corner: row {corner_row:.1f}, columns {corner[1]}..{corner[2]} -> axis column {axis:.1f}, half-width {half:.1f} px')
print(f'camera to body axis {d_axis:.3f} m (nominal {D_NOMINAL + bz:.3f}); camera to organ {d_organ:.3f} m; scale at organ {scale:.1f} px/m')
print(f'orbit target height from the outline: {target_y:.3f} m (bodyPosition y {by})')

# Organ mask: warm pixels. The flat marker ring is cyan and stays out of the mask, but hides a few rows in front of the organ.
mask_rows = []
reach = int(round(330 * U))
for y in range(int(OY + 60 * U), int(OY + 625 * U)):
    xs = [x for x in range(int(axis) - reach, int(axis) + reach) if 0 <= x < W and organ(px[x, y])]
    if len(xs) >= 2:
        mask_rows.append((y, min(xs), max(xs), len(xs)))
top, bottom = mask_rows[0][0], mask_rows[-1][0]
left, right = min(r[1] for r in mask_rows), max(r[2] for r in mask_rows)
to_y = lambda row: target_y + (CY - row) / scale
to_x = lambda col: (col - axis) / scale
print(f'organ mask: rows {top}..{bottom}, columns {left}..{right}')
print(f'model box in the body: y {to_y(top):.3f}..{to_y(bottom):.3f}, x {to_x(left):.3f}..{to_x(right):.3f}; width {(right - left) / scale:.3f} m, height {(bottom - top) / scale:.3f} m')
if ureters:
    # Same rule as the test: height slices narrower than a third of the width are ureter, not kidney.
    wide = [r for r in mask_rows if r[2] - r[1] > (right - left) / 3]
    btop, bbot = wide[0][0], wide[-1][0]
    print(f'kidney body without ureters: rows {btop}..{bbot} -> y {to_y(btop):.3f}..{to_y(bbot):.3f}, centre {to_y((btop + bbot) / 2):.3f}, height {(bbot - btop) / scale:.3f} m')
print(f'box centre: x {to_x((left + right) / 2):.3f}, y {to_y((top + bottom) / 2):.3f}')
