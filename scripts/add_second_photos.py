#!/usr/bin/env python3
"""Take in the second_photos.json downloaded from data/second-photo-picker.html.

For each hut it records the pick in data/second_photos.json (file, credit,
licence, Commons page) and saves the photo to data/second_photos/<id>.webp,
840 px wide like the main photos. The photo isn't served on its own, only as
the second piece of the hut's collage, so it lives in data/, not public/.
"file": null means "no second photo": the collage keeps its cut-out or
close-up.

Then remake those huts' collages:
    python3 scripts/add_second_photos.py ~/Downloads/second_photos.json --check
    python3 scripts/add_second_photos.py ~/Downloads/second_photos.json
    python3 scripts/make_collages.py <the ids it prints> --force
"""
import base64
import datetime
import io
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'second_photos.json'
DIR = ROOT / 'data' / 'second_photos'
WIDTH = 840
USABLE = ('CC BY', 'CC0', 'Public domain', 'Copyrighted free use')


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    picks = json.loads(Path(args[0]).expanduser().read_text(encoding='utf-8'))['picks']
    saved = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    today = datetime.date.today().isoformat()
    changed = []
    for hid, p in picks.items():
        name = p.get('_name', hid)
        if not p.get('file'):
            print(f'  {name}: no second photo')
            if not check:
                saved[hid] = {'_name': name, 'file': None, '_checked': today}
            changed.append(hid)
            continue
        lic = p.get('license') or ''
        if not lic.startswith(USABLE) or 'NC' in lic or 'ND' in lic:
            print(f'  {name}: skipped, licence "{lic}" can\'t be used')
            continue
        entry = {k: p.get(k) for k in ('file', 'page', 'credit', 'license', 'license_url')}
        if not p.get('image'):
            print(f'  {name}: {p["file"]} — the photo itself is missing from the file, so the collage stays as it is')
            if not check:
                saved[hid] = {'_name': name, **entry, '_checked': today}
            continue
        raw = base64.b64decode(p['image'].split(',', 1)[1])
        im = Image.open(io.BytesIO(raw)).convert('RGB')
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(WIDTH * im.height / im.width)), Image.LANCZOS)
        rel = f'data/second_photos/{hid}.webp'
        print(f'  {name}: {p["file"]} ({lic}, {im.width}×{im.height})')
        if not check:
            DIR.mkdir(exist_ok=True)
            im.save(ROOT / rel, 'WEBP', quality=85, method=6)
            saved[hid] = {'_name': name, **entry, 'src': rel, '_checked': today}
        changed.append(hid)
    if check:
        print(f'{len(changed)} huts would change. Nothing written (--check).')
        return
    OUT.write_text(json.dumps(dict(sorted(saved.items())), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(changed)} huts updated in {OUT.relative_to(ROOT)}.')
    if changed:
        print('Now: python3 scripts/make_collages.py ' + ' '.join(changed) + ' --force')


if __name__ == '__main__':
    main()
