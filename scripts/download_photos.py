#!/usr/bin/env python3
"""
download_photos.py — keep the hut photos on our own server.

fetch_photos.py picks the photos and writes public/photos.json with
Wikimedia thumbnail URLs. If the app loaded those URLs, every visitor's
browser would send its IP address to Wikimedia in the USA, which the privacy
policy says doesn't happen. So this script downloads each photo once, makes
two WebP sizes, saves them in public/photos/ and records them in photos.json
as "card" and "full". The app only shows a photo that has both fields, so a
photo that failed to download is left out, never loaded from Wikimedia.

  card  320px wide, for the 96px card thumbnail (sharp on 3x screens)
  full  840px wide (smaller if the source is), for the 420px pop-up

Run it after every fetch_photos.py run, which writes photos.json without
the two fields:
    python3 scripts/fetch_photos.py
    python3 scripts/download_photos.py --check   report only, writes nothing
    python3 scripts/download_photos.py

Photos already in public/photos/ are not downloaded again. A file's name
includes a short hash of the Commons file, so a new pick gets a new name,
and files no longer in photos.json are deleted. A full first run is about
435 downloads, one at a time, and takes a few minutes.

Needs Pillow:  pip3 install Pillow
Undo:          git restore public/photos.json public/photos
"""

import hashlib
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_photos import UA  # the same User-Agent Wikimedia already knows us by

ROOT = Path(__file__).resolve().parent.parent
PHOTOS_JSON = ROOT / 'public' / 'photos.json'
PHOTO_DIR = ROOT / 'public' / 'photos'

SIZES = {'card': 320, 'full': 840}   # px wide
QUALITY = 78                         # WebP; no visible loss at these sizes
PAUSE = 0.3                          # seconds between downloads


def source_url(photo):
    """The Wikimedia thumbnail to download: 960px when the original is that
    wide (Wikimedia serves a fixed set of widths and refuses wider than the
    original), otherwise the 500px one fetch_photos.py stored."""
    thumb = photo['thumb']
    if photo.get('width', 0) >= 960 and '/500px-' in thumb:
        return thumb.replace('/500px-', '/960px-')
    return thumb


def fetch(url, attempts=4):
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
        except OSError:
            pass
        time.sleep(2 * 2 ** i)
    raise RuntimeError('no answer after several tries')


def file_names(hut_id, photo):
    tag = hashlib.sha1(photo['file'].encode('utf-8')).hexdigest()[:8]
    return {k: f'{hut_id}-{tag}-{k}.webp' for k in SIZES}


def write_photos_json(data):
    # Same layout as fetch_photos.py: one hut per line, so git diffs stay readable.
    photos = data['photos']
    lines = [f'  {json.dumps(k)}: {json.dumps(photos[k], ensure_ascii=False)}' for k in sorted(photos)]
    PHOTOS_JSON.write_text(
        '{\n'
        f'"generated": {json.dumps(data.get("generated", ""))},\n'
        f'"source": {json.dumps(data.get("source", ""), ensure_ascii=False)},\n'
        '"photos": {\n' + ',\n'.join(lines) + '\n}\n}\n', encoding='utf-8')


def main():
    check = '--check' in sys.argv
    try:
        from PIL import Image, ImageOps
    except ImportError:
        sys.exit('This needs Pillow. Install it with:  pip3 install Pillow')
    if not PHOTOS_JSON.exists():
        sys.exit('Run this from the hutfinder folder, after fetch_photos.py.')

    data = json.loads(PHOTOS_JSON.read_text(encoding='utf-8'))
    photos = data['photos']

    wanted = set()
    todo = []
    for hut_id, photo in photos.items():
        names = file_names(hut_id, photo)
        wanted.update(names.values())
        if all((PHOTO_DIR / n).exists() for n in names.values()):
            for k, n in names.items():
                photo[k] = f'photos/{n}'
        else:
            for k in SIZES:
                photo.pop(k, None)
            todo.append((hut_id, photo, names))
    stale = sorted(f for f in PHOTO_DIR.glob('*.webp') if f.name not in wanted) if PHOTO_DIR.exists() else []

    print(f'{len(photos)} photos in photos.json: {len(photos) - len(todo)} already stored, '
          f'{len(todo)} to download, {len(stale)} old files to delete.')
    if check:
        print('--check: nothing written.')
        return

    PHOTO_DIR.mkdir(exist_ok=True)
    failed = []
    for i, (hut_id, photo, names) in enumerate(todo, 1):
        try:
            img = Image.open(io.BytesIO(fetch(source_url(photo))))
            img = ImageOps.exif_transpose(img).convert('RGB')
            for k, width in SIZES.items():
                out = img.copy()
                out.thumbnail((width, width * 4), Image.LANCZOS)  # only ever shrinks
                out.save(PHOTO_DIR / names[k], 'WEBP', quality=QUALITY, method=6)
                photo[k] = f'photos/{names[k]}'
        except Exception as e:  # one bad photo shouldn't stop the run
            failed.append((hut_id, photo['file'], str(e)))
            for k in SIZES:
                photo.pop(k, None)
                (PHOTO_DIR / names[k]).unlink(missing_ok=True)
        if i % 25 == 0 or i == len(todo):
            print(f'  {i}/{len(todo)}')
        time.sleep(PAUSE)

    for f in stale:
        f.unlink()
    write_photos_json(data)

    stored = sum(1 for p in photos.values() if all(k in p for k in SIZES))
    size_mb = sum(f.stat().st_size for f in PHOTO_DIR.glob('*.webp')) / 1e6
    print(f'\n{stored} of {len(photos)} photos stored in public/photos/ ({size_mb:.1f} MB). '
          f'Deleted {len(stale)} old files.')
    if failed:
        print(f'{len(failed)} failed and will show no photo until the next run:')
        for hut_id, name, err in failed:
            print(f'  {hut_id}  {name}  ({err})')


if __name__ == '__main__':
    main()
