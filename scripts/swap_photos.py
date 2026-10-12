#!/usr/bin/env python3
"""Swap a hut's main photo and its second photo.

The second photo (data/second_photos.json, from the second-photo picker)
becomes the hut's main photo: the one on its card, in its pop-up and at the
centre of its collage. The old main photo becomes the second photo.

  - public/photos.json gets the new main photo, with its credit and licence,
    and public/photos/ the card (320 px) and full (840 px) WebP files, named
    the way download_photos.py names them, so that script keeps them.
  - data/photo_picks.json records the new main photo as a hand pick, so a
    later fetch_photos.py run keeps it too.
  - data/second_photos.json and data/second_photos/<id>.webp get the old main.

    python3 scripts/swap_photos.py "Bergerseehütte" w39216603 --check
    python3 scripts/swap_photos.py "Bergerseehütte" w39216603

Then remake those huts' collages with make_collages.py --force.
"""
import datetime
import hashlib
import json
import shutil
import sys
import unicodedata
import urllib.parse
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTOS_JSON = ROOT / 'public' / 'photos.json'
PHOTO_DIR = ROOT / 'public' / 'photos'
PICKS = ROOT / 'data' / 'photo_picks.json'
SECOND = ROOT / 'data' / 'second_photos.json'
SIZES = {'card': 320, 'full': 840}   # as in download_photos.py
QUALITY = 78
META = ('file', 'page', 'credit', 'license', 'license_url')


def fold(s):
    return unicodedata.normalize('NFC', s).casefold().replace(' ', '').replace('-', '')


def thumb_url(file_title, width):
    """Wikimedia's thumbnail URL for a file, in the form fetch_photos.py stores."""
    name = file_title.split(':', 1)[1].replace(' ', '_')
    h = hashlib.md5(name.encode('utf-8')).hexdigest()
    q = urllib.parse.quote(name)
    return f'https://thumb.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{width}px-{q}'


def file_names(hut_id, file_title):   # as in download_photos.py
    tag = hashlib.sha1(file_title.encode('utf-8')).hexdigest()[:8]
    return {k: f'{hut_id}-{tag}-{k}.webp' for k in SIZES}


def name_key(s):
    """Roughly how the photo picker sorts names: accents ignored."""
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().casefold()


def with_pick(picks, hid, entry):
    """photo_picks.json with this hut's pick set: changed where it is, or a new
    entry put in name order, so the file's diff shows only that hut."""
    if hid in picks:
        picks[hid] = entry
        return picks
    out, placed = {}, False
    for k, v in picks.items():
        if not placed and not k.startswith('_') and name_key(v.get('_name', k)) > name_key(entry['_name']):
            out[hid] = entry
            placed = True
        out[k] = v
    if not placed:
        out[hid] = entry
    return out


def write_photos_json(data):   # as in download_photos.py: one hut per line
    photos = data['photos']
    lines = [f'  {json.dumps(k)}: {json.dumps(photos[k], ensure_ascii=False)}' for k in sorted(photos)]
    PHOTOS_JSON.write_text(
        '{\n'
        f'"generated": {json.dumps(data.get("generated", ""))},\n'
        f'"source": {json.dumps(data.get("source", ""), ensure_ascii=False)},\n'
        '"photos": {\n' + ',\n'.join(lines) + '\n}\n}\n', encoding='utf-8')


def main():
    check = '--check' in sys.argv
    wanted = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not wanted:
        sys.exit(__doc__)
    huts = json.loads((ROOT / 'public' / 'huts.json').read_text(encoding='utf-8'))
    data = json.loads(PHOTOS_JSON.read_text(encoding='utf-8'))
    photos = data['photos']
    picks = json.loads(PICKS.read_text(encoding='utf-8'))
    seconds = json.loads(SECOND.read_text(encoding='utf-8')) if SECOND.exists() else {}
    today = datetime.date.today().isoformat()

    by_id = {h['id']: h for h in huts}
    done = []
    for w in wanted:
        hits = [w] if w in by_id else [h['id'] for h in huts if fold(h['name']) == fold(w) and h['id'] in photos]
        if len(hits) != 1:
            print(f'  {w}: {"no hut with a photo by that name" if not hits else "several huts by that name: " + ", ".join(hits)}')
            continue
        hid = hits[0]
        name = by_id[hid]['name']
        old, new = photos.get(hid), seconds.get(hid)
        if not old or not old.get('full'):
            print(f'  {name}: has no main photo to swap')
            continue
        if not new or not new.get('src'):
            print(f'  {name}: has no second photo yet')
            continue
        print(f'  {name}: main {new["file"]}  ⇄  second {old["file"]}')
        if check:
            continue

        # The new main photo, in the two sizes the app uses.
        names = file_names(hid, new['file'])
        img = ImageOps.exif_transpose(Image.open(ROOT / new['src'])).convert('RGB')
        for k, width in SIZES.items():
            out = img.copy()
            out.thumbnail((width, width * 4), Image.LANCZOS)
            out.save(PHOTO_DIR / names[k], 'WEBP', quality=QUALITY, method=6)
        # The old main photo becomes the second one: its 840 px file is the source.
        src = f'data/second_photos/{hid}.webp'
        old_full = ROOT / 'public' / old['full']
        shutil.copyfile(old_full, ROOT / src)
        for k in SIZES:
            if old.get(k) and old[k] not in (f'photos/{n}' for n in names.values()):
                (ROOT / 'public' / old[k]).unlink(missing_ok=True)

        photos[hid] = {
            'file': new['file'], 'thumb': thumb_url(new['file'], 500), 'large': thumb_url(new['file'], 1280),
            'credit': new.get('credit'), 'license': new.get('license'), 'license_url': new.get('license_url'),
            'page': new.get('page'), 'how': 'pick',
            'card': f'photos/{names["card"]}', 'full': f'photos/{names["full"]}',
        }
        seconds[hid] = {'_name': name, **{k: old.get(k) for k in META}, 'src': src, '_checked': today}
        entry = {'_name': name, 'file': new['file'], '_checked': today, '_note': 'swapped with the second photo'}
        picks = with_pick(picks, hid, entry)
        done.append(hid)

    if check or not done:
        print(f'{len(done)} swapped.' if not check else 'Nothing written (--check).')
        return
    write_photos_json(data)
    PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    SECOND.write_text(json.dumps(dict(sorted(seconds.items())), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(done)} swapped. Now: python3 scripts/make_collages.py ' + ' '.join(done) + ' --force')


if __name__ == '__main__':
    main()
