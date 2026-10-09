"""The collage on a hut page, made once from the hut's own photo.

Each hut with a photo gets two paper pieces and the numbers to lay them out:

  main    the whole photo on torn white paper, tilted a little
  second  the hut cut out as a sticker with a white edge, when the cutout is
          clean; otherwise a closer crop of the same photo on torn paper

Writes public/collages/<id>-main.webp and -sticker.webp or -zoom.webp, and an
entry per hut in data/collages.json: the pieces, which washi tapes it gets,
where the sparkles go, and where everything sits in the frame. The page
builder (scripts/build_hut_pages.mjs) reads that file and draws the rest
(tapes, sparkles, the paper labels) as HTML.

The photos don't change, so this runs on a laptop, not in the deploy. An entry
that exists is kept unless --force is given, so a hut always looks the same.

    python3 scripts/make_collages.py --ids-file data/hut_pages.json
    python3 scripts/make_collages.py w127908485 w83122419 --force
    python3 scripts/make_collages.py --all            (every hut with a photo)
    python3 scripts/make_collages.py --check ...      (say what it would do)

Needs Pillow, numpy, opencv-python-headless and rembg (the u2net model is
downloaded on first use). Without rembg every hut gets the close-up instead
of a sticker.
"""
import argparse
import hashlib
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
OUT_DIR = os.path.join(PUBLIC, "collages")
DATA = os.path.join(ROOT, "data", "collages.json")

PAPER = (255, 253, 248, 255)
EDGE = (226, 218, 204, 255)
SHADOW = (58, 42, 32)

MAIN_W = 720        # photo width inside the main piece; shown at about 580 px
QUALITY = 74

# Licences whose terms we can't meet with a collage: the GFDL wants its whole
# text shipped with any modified version. Those huts show the plain photo.
NO_COLLAGE = ("GFDL",)

# The washi tapes, as named in src/hut-page.css (tape-<name>). A hut's tapes
# are picked from this list by its id, so a hut always looks the same and
# neighbours differ.
TAPES = [
    "blue-gingham", "green-gingham", "orange-dots", "pink-dots", "plum-dots",
    "grid-check", "terracotta-stripes", "mustard-stripes", "blush-pinstripe",
    "pink-bands", "gold-dots", "terracotta-dots", "red-gingham",
    "butter-stripes", "blue-wave", "red-floral",
]
CLEAR = "clear-blue"


def seed_of(hut_id, salt=""):
    return int(hashlib.sha1((hut_id + salt).encode()).hexdigest(), 16)


# ---------------------------------------------------------------- paper

def torn_poly(x0, y0, x1, y1, amp, step, rnd):
    pts = []

    def edge(ax, ay, bx, by, nx, ny):
        n = max(2, int(max(abs(bx - ax), abs(by - ay)) / step))
        for i in range(n):
            t = i / n
            j = rnd.uniform(0, amp)
            pts.append((ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j))

    edge(x0, y0, x1, y0, 0, 1)
    edge(x1, y0, x1, y1, -1, 0)
    edge(x1, y1, x0, y1, 0, -1)
    edge(x0, y1, x0, y0, 1, 0)
    return pts


def shadowed(img, blur=7, off=(0, 5), alpha=70):
    pad = blur * 3
    w, h = img.size
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    a = img.split()[-1].point(lambda v: int(v * alpha / 255))
    sh = Image.new("RGBA", img.size, SHADOW + (0,))
    sh.putalpha(a)
    layer = Image.new("RGBA", out.size, (0, 0, 0, 0))
    layer.paste(sh, (pad + off[0], pad + off[1]), sh)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(layer)
    out.alpha_composite(img, (pad, pad))
    return out, pad


def torn_piece(photo, box, width, angle, seed, border=18):
    """A crop of the photo on torn paper. Returns the piece and where the
    photo's corners ended up in it, so sparkles can be kept on the photo."""
    rnd = random.Random(seed)
    crop = photo.crop(box)
    h = round(width * crop.height / crop.width)
    crop = crop.resize((width, h), Image.LANCZOS)
    m = border + 8
    W, H = width + 2 * m, h + 2 * m
    piece = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(piece)
    outer = torn_poly(3, 3, W - 3, H - 3, 12, 9, rnd)
    d.polygon(outer, fill=EDGE)
    inner = [(x + (1 if x < W / 2 else -1), y + (1 if y < H / 2 else -1)) for x, y in outer]
    d.polygon(inner, fill=PAPER)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(torn_poly(m, m, m + width, m + h, 7, 11, rnd), fill=255)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(crop.convert("RGBA"), (m, m))
    piece = Image.composite(layer, piece, mask)
    rotated = piece.rotate(angle, resample=Image.BICUBIC, expand=True)
    out, pad = shadowed(rotated)
    # The photo's rectangle inside the final image (ignoring the small tilt,
    # and pulled in by the tear depth so a sparkle never sits on paper).
    ox = (rotated.width - W) / 2 + pad
    oy = (rotated.height - H) / 2 + pad
    inset = 14
    photo_box = (ox + m + inset, oy + m + inset, ox + m + width - inset, oy + m + h - inset)
    return out, photo_box, (width / crop.width if crop.width else 1)


def sticker(cut_rgba, outline=12, angle=0):
    a = cut_rgba.split()[-1].point(lambda v: 255 if v > 140 else 0)
    a = a.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    bbox = a.getbbox()
    if not bbox:
        return None
    pad = outline + 6
    box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
           min(a.width, bbox[2] + pad), min(a.height, bbox[3] + pad))
    a = a.crop(box)
    rgb = cut_rgba.crop(box).convert("RGBA")
    rgb.putalpha(a)
    W, H = a.width + 2 * pad, a.height + 2 * pad
    base = Image.new("L", (W, H), 0)
    base.paste(a, (pad, pad))
    ring = (base.filter(ImageFilter.MaxFilter(outline * 2 + 1))
            .filter(ImageFilter.GaussianBlur(1.2))
            .point(lambda v: 255 if v > 100 else 0))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(Image.new("RGBA", (W, H), (255, 255, 255, 255)), (0, 0), ring)
    out.alpha_composite(rgb, (pad, pad))
    out = out.rotate(angle, resample=Image.BICUBIC, expand=True)
    return shadowed(out, blur=6, off=(0, 4), alpha=80)[0]


# ---------------------------------------------------------------- cutout

_session = None


def cutout(photo):
    """The photo with its main subject kept and the rest transparent, or None
    when rembg isn't installed."""
    global _session
    try:
        from rembg import new_session, remove
    except ImportError:
        return None
    if _session is None:
        _session = new_session("u2net")
    return remove(photo, session=_session)


def clean_mask(cut):
    """The subject's mask if the cutout is clean enough for a sticker, else
    None, with the reason. Clean: one dominant shape, a sensible size, cut
    free of the frame on most sides, and solid rather than a lace of strands."""
    import cv2

    a = np.array(cut.split()[-1]) > 140
    a = cv2.morphologyEx(a.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(a, 8)
    if n < 2:
        return None, "nothing found"
    areas = stats[1:, cv2.CC_STAT_AREA]
    k = int(np.argmax(areas)) + 1
    main = int(areas.max())
    total = a.shape[0] * a.shape[1]
    share = main / total
    if main / areas.sum() < 0.85:
        return None, "several pieces"
    if not 0.02 <= share <= 0.45:
        return None, "subject %.0f%% of the photo" % (share * 100)
    x, y, w, h = stats[k, :4]
    H, W = a.shape
    edges = sum([x <= 2, y <= 2, x + w >= W - 2, y + h >= H - 2])
    if edges > 1:
        return None, "touches %d edges" % edges
    m = (labels == k).astype(np.uint8)
    if main / (w * h) < 0.45:
        return None, "too thin for its box"
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = cv2.contourArea(cv2.convexHull(max(cnts, key=cv2.contourArea)))
    if hull and main / hull < 0.75:
        return None, "ragged outline"
    return m.astype(bool), "clean"


def subject_box(cut):
    """The bounding box of the largest shape in the cutout, clean or not."""
    if cut is None:
        return None
    import cv2

    a = (np.array(cut.split()[-1]) > 140).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(a, 8)
    if n < 2:
        return None
    k = int(np.argmax(stats[1:, cv2.CC_STAT_AREA])) + 1
    x, y, w, h = stats[k, :4]
    if w * h < 0.01 * a.size:
        return None
    return (int(x), int(y), int(x + w), int(y + h))


# ---------------------------------------------------------------- sparkles

CLUSTER = (116, 116 * 114 / 134)   # width, height in frame units (frame = 1000 wide)
SINGLE = (48, 48 * 87 / 59)


def place_sparkles(photo, subj, main_w, main_h, photo_box, avoid):
    """Two spots on the main photo for the sparkle cluster and the single
    sparkle: on darker, quieter parts of the photo (white needs something to
    show against), next to the subject rather than on it, and clear of the
    tapes, the labels and the second piece. Coordinates are in frame units
    of the main piece (1000 wide). Returns [(x, y), (x, y)] top-left corners."""
    g = np.asarray(photo.convert("L"), dtype=np.float32) / 255.0
    ph, pw = g.shape
    px0, py0, px1, py1 = photo_box   # in main-piece units

    def to_photo(x, y):
        return ((x - px0) / (px1 - px0) * pw, (y - py0) / (py1 - py0) * ph)

    def stats(x, y, w, h):
        a0, b0 = to_photo(x, y)
        a1, b1 = to_photo(x + w, y + h)
        win = g[max(0, int(b0)):int(b1), max(0, int(a0)):int(a1)]
        if win.size == 0:
            return 1.0, 1.0
        return float(win.mean()), float(win.std())

    def hits(x, y, w, h):
        for ax0, ay0, ax1, ay1 in avoid:
            if x < ax1 and x + w > ax0 and y < ay1 and y + h > ay0:
                return True
        return False

    sb = None
    if subj:
        a0 = (subj[0] / pw * (px1 - px0) + px0, subj[1] / ph * (py1 - py0) + py0)
        a1 = (subj[2] / pw * (px1 - px0) + px0, subj[3] / ph * (py1 - py0) + py0)
        sb = (a0[0], a0[1], a1[0], a1[1])

    def score(x, y, w, h):
        if x < px0 or y < py0 or x + w > px1 or y + h > py1 or hits(x, y, w, h):
            return None
        lum, sd = stats(x, y, w, h)
        s = max(0.0, min(1.0, (0.86 - lum) / 0.5))      # white shows on darker ground
        s -= max(0.0, sd - 0.12) * 2.0                   # and on quiet ground
        if sb:
            cx, cy = x + w / 2, y + h / 2
            dx = max(sb[0] - cx, 0, cx - sb[2])
            dy = max(sb[1] - cy, 0, cy - sb[3])
            d = math.hypot(dx, dy)
            inside = dx == 0 and dy == 0
            s += 0.5 * math.exp(-d / 90) - (0.6 if inside else 0)
        return s

    picks = []
    for (w, h), min_gap in ((CLUSTER, 0), (SINGLE, 330)):
        best = None
        for y in np.arange(py0, py1 - h, 12):
            for x in np.arange(px0, px1 - w, 12):
                if picks:
                    c0 = (picks[0][0] + CLUSTER[0] / 2, picks[0][1] + CLUSTER[1] / 2)
                    if math.hypot(x + w / 2 - c0[0], y + h / 2 - c0[1]) < min_gap:
                        continue
                s = score(x, y, w, h)
                if s is not None and (best is None or s > best[0]):
                    best = (s, float(x), float(y))
        if best is None:
            return None
        picks.append((round(best[1], 1), round(best[2], 1)))
    return picks


# ---------------------------------------------------------------- one hut

def make(hut, photo_entry, force_kind=None):
    hid = hut["id"]
    src = Image.open(os.path.join(PUBLIC, photo_entry["full"])).convert("RGB")
    sign = 1 if seed_of(hid, "tilt") % 2 else -1
    angle = 2.0 * sign

    main, photo_box, _ = torn_piece(src, (0, 0, src.width, src.height), MAIN_W, angle, seed_of(hid) % 10**6)

    cut = cutout(src)
    mask, why = clean_mask(cut) if cut is not None else (None, "rembg not installed")
    kind = force_kind or ("sticker" if mask is not None else "zoom")

    if kind == "sticker":
        rgba = src.convert("RGBA")
        rgba.putalpha(Image.fromarray((mask * 255).astype(np.uint8)))
        # 1.5x first, so the white edge stays smooth at the size it is shown
        big = rgba.resize((int(rgba.width * 1.5), int(rgba.height * 1.5)), Image.LANCZOS)
        second = sticker(big, outline=14, angle=-4 * sign)
        if second.width > 640:
            second = second.resize((640, round(640 * second.height / second.width)), Image.LANCZOS)
        # A long, low hut would come out as a thin strip at the usual width,
        # so it gets more width, up to 68% of the frame; a tall one less, so it
        # doesn't hang far below the photo.
        aspect = second.width / second.height
        second_w = min(min(680, max(560, 300 * aspect)), 400 * aspect)
    else:
        sb = subject_box(cut)
        cx, cy = (((sb[0] + sb[2]) / 2, (sb[1] + sb[3]) / 2) if sb else (src.width / 2, src.height / 2))
        w = src.width * 0.5
        h = w * 3 / 4
        x0 = min(max(0, cx - w / 2), src.width - w)
        y0 = min(max(0, cy - h / 2), src.height - h)
        second, _, _ = torn_piece(src, (int(x0), int(y0), int(x0 + w), int(y0 + h)), 420, 5.0 * sign,
                                  seed_of(hid, "zoom") % 10**6, border=15)
        second_w = 440

    # ---- the frame, 1000 units wide; the page turns these into percentages
    mw, mh = main.size
    Hm = 1000 * mh / mw
    H2 = second_w * second.height / second.width
    Hf = Hm + 0.55 * H2
    s_left = 1000 - second_w + 20
    s_top = Hf - H2
    pb = tuple(v * 1000 / mw for v in photo_box)

    rnd = random.Random(seed_of(hid, "tape"))
    first = rnd.choice(TAPES)
    third = rnd.choice([t for t in TAPES if t != first])
    tapes = [
        {"kind": first, "x": 30, "y": 14, "w": 205, "h": 52, "rot": -31 + rnd.uniform(-4, 4)},
    ]
    if kind == "zoom":
        tapes.append({"kind": third, "x": 1000 - 40 - 180, "y": 5, "w": 180, "h": 49, "rot": 24 + rnd.uniform(-4, 4)})
        tapes.append({"kind": CLEAR, "x": s_left + second_w * 0.3, "y": s_top - 6, "w": 160, "h": 45, "rot": 8 + rnd.uniform(-3, 3)})
    else:
        tapes.append({"kind": CLEAR, "x": 1000 - 40 - 174, "y": 5, "w": 174, "h": 49, "rot": 24 + rnd.uniform(-4, 4)})

    label_top = Hm - 175
    avoid = [
        (0, 0, 290, 230),                            # top-left tape
        (720, 0, 1000, 220),                         # top-right tape
        (0, label_top - 20, 430, Hm),                # the paper labels
        (s_left - 20, s_top - 30, 1000, Hm),         # the second piece
    ]
    spark = place_sparkles(src, subject_box(cut), mw, mh, pb, avoid)

    return {
        "kind": kind,
        "why": why,
        "images": {"main": main, "second": second},
        "entry": {
            "main": {"w": mw, "h": mh},
            "second": {"kind": kind, "w": second.width, "h": second.height,
                       "x": round(s_left, 1), "y": round(s_top, 1), "width": second_w},
            "frame_h": round(Hf, 1),
            "main_h": round(Hm, 1),
            "label_top": round(label_top, 1),
            "tapes": [{k: (round(v, 1) if isinstance(v, float) else v) for k, v in t.items()} for t in tapes],
            "sparkles": ({"cluster": spark[0], "single": spark[1]} if spark else None),
        },
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--ids-file", help="JSON file with an \"ids\" list (data/hut_pages.json)")
    ap.add_argument("--all", action="store_true", help="every hut with a photo")
    ap.add_argument("--force", action="store_true", help="remake huts that already have a collage")
    ap.add_argument("--check", action="store_true", help="say what would happen, write nothing")
    ap.add_argument("--zoom", action="append", default=[], help="hut id that gets the close-up even with a clean cutout")
    args = ap.parse_args()

    huts = {h["id"]: h for h in json.load(open(os.path.join(PUBLIC, "huts.json"), encoding="utf-8"))}
    photos = json.load(open(os.path.join(PUBLIC, "photos.json"), encoding="utf-8"))["photos"]
    ids = list(args.ids)
    if args.ids_file:
        ids += json.load(open(args.ids_file, encoding="utf-8"))["ids"]
    if args.all:
        ids += sorted(photos)
    if not ids:
        ap.error("give hut ids, --ids-file or --all")

    data = json.load(open(DATA, encoding="utf-8")) if os.path.exists(DATA) else {}
    os.makedirs(OUT_DIR, exist_ok=True)
    made = 0
    for hid in dict.fromkeys(ids):
        hut, ph = huts.get(hid), photos.get(hid)
        name = hut["name"] if hut else hid
        if not hut:
            print(f"  {hid}: not in huts.json, skipped")
            continue
        if not ph or not ph.get("full"):
            print(f"  {name}: no photo, no collage")
            continue
        if any(ph.get("license", "").startswith(x) for x in NO_COLLAGE):
            print(f"  {name}: {ph['license']} photo, shown plain")
            continue
        if hid in data and not args.force:
            print(f"  {name}: has a collage, kept")
            continue
        if args.check:
            print(f"  {name}: would make a collage")
            continue
        r = make(hut, ph, "zoom" if hid in args.zoom else None)
        main_path = f"collages/{hid}-main.webp"
        second_path = f"collages/{hid}-{r['kind']}.webp"
        for old in ("sticker", "zoom"):
            p = os.path.join(PUBLIC, "collages", f"{hid}-{old}.webp")
            if os.path.exists(p):
                os.remove(p)
        r["images"]["main"].save(os.path.join(PUBLIC, main_path), "WEBP", quality=QUALITY, method=6)
        r["images"]["second"].save(os.path.join(PUBLIC, second_path), "WEBP", quality=QUALITY + 4, method=6)
        e = r["entry"]
        e["main"]["src"] = main_path
        e["second"]["src"] = second_path
        data[hid] = e
        made += 1
        size = (os.path.getsize(os.path.join(PUBLIC, main_path)) + os.path.getsize(os.path.join(PUBLIC, second_path))) // 1024
        print(f"  {name}: {r['kind']} ({r['why']}), {size} KB, sparkles {'placed' if e['sparkles'] else 'left out'}")

    if made and not args.check:
        with open(DATA, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(data.items())), f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"{made} made, {len(data)} in {os.path.relpath(DATA, ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
