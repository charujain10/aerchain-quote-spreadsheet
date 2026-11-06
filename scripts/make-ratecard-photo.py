"""Renders a 'phone photo of a printed rate card': paper texture, perspective skew, shadow, blur, noise.
Usage: python3 make-ratecard-photo.py <spec.json>   (spec: {rows:[{name,price}], out: path})
"""
import json
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

spec = json.load(open(sys.argv[1]))
rows, out = spec["rows"], spec["out"]
random.seed(7)

W, H = 1300, 1900
paper = Image.new("RGB", (W, H), (246, 242, 232))
d = ImageDraw.Draw(paper)

def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for base in ("/usr/share/fonts/truetype/dejavu/", "/Library/Fonts/", "/System/Library/Fonts/Supplemental/"):
        try:
            return ImageFont.truetype(base + name, size)
        except OSError:
            continue
    return ImageFont.load_default()

d.text((60, 50), "DESIPACK CO.", font=font(54, True), fill=(30, 30, 30))
d.text((60, 118), "Corrugated Boxes & Shippers — RATE CARD, Nov 2026", font=font(28), fill=(60, 60, 60))
d.text((60, 160), "Rates in Rs. per box · ex-works Pune · GST extra", font=font(26), fill=(60, 60, 60))
d.line((60, 205, W - 60, 205), fill=(40, 40, 40), width=3)

y = 230
f_row = font(30)
for i, r in enumerate(rows):
    if i % 2 == 0:
        d.rectangle((50, y - 6, W - 50, y + 48), fill=(236, 231, 218))
    d.text((70, y), f"{i + 1:02d}", font=f_row, fill=(90, 90, 90))
    d.line((W - 330, y + 24, W - 270, y + 24), fill=(150, 150, 150), width=1)
    d.text((140, y), r["name"], font=f_row, fill=(20, 20, 20))
    d.text((W - 250, y), f"Rs. {r['price']}", font=font(30, True), fill=(20, 20, 20))
    y += 56
d.line((60, y + 6, W - 60, y + 6), fill=(40, 40, 40), width=3)
d.text((60, y + 30), "Quality: last audit score 72 · moisture test report pending", font=font(26), fill=(80, 80, 80))
d.text((60, y + 70), "Rates valid 30 days. Payment 45 days.", font=font(26), fill=(80, 80, 80))

# put the paper on a dark desk, skew it like a hand-held photo
desk = Image.new("RGB", (W + 360, H + 360), (58, 52, 46))
shadow = Image.new("RGB", desk.size, (0, 0, 0)).filter(ImageFilter.GaussianBlur(1))
desk.paste(paper, (180, 180))
coeffs = (1.0, 0.018, -12, -0.012, 1.0, 14, 0.000012, 0.00001)
photo = desk.transform(desk.size, Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC, fillcolor=(58, 52, 46))
photo = photo.rotate(-2.8, resample=Image.BICUBIC, expand=False, fillcolor=(58, 52, 46))
photo = photo.filter(ImageFilter.GaussianBlur(0.9))

# vignette + sensor noise
px = photo.load()
cx, cy = photo.width / 2, photo.height / 2
for yy in range(photo.height):
    for xx in range(photo.width):
        r, g, b = px[xx, yy]
        dist = (((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2) ** 0.5
        k = 1 - 0.22 * dist ** 2
        n = random.randint(-7, 7)
        px[xx, yy] = (max(0, min(255, int(r * k) + n)), max(0, min(255, int(g * k) + n)), max(0, min(255, int(b * k) + n)))

photo = photo.resize((1100, int(1100 * photo.height / photo.width)), Image.LANCZOS)
photo.save(out, "JPEG", quality=82)
print("wrote", out)
