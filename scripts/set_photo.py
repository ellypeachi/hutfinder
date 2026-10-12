#!/usr/bin/env python3
"""Give a hut a photo from a file on disk, with its credit and licence.

For a photo downloaded by hand from Wikimedia Commons, when the photo picker
can't fetch it. The credit and licence are what the file's Commons page says
under "Licensing"; there is no default.

    python3 scripts/set_photo.py "Anna-Schutzhaus" main ~/Downloads/Anna-Schutzhaus.jpg \\
        --file "File:Anna-Schutzhaus.jpg" --credit "Christian Philipp" \\
        --license "CC BY-SA 3.0" --license-url https://creativecommons.org/licenses/by-sa/3.0/

  main    becomes the hut's main photo (card, pop-up, collage centre), saved
          the way download_photos.py saves photos and recorded as a hand pick
          in data/photo_picks.json. --old-to-second keeps the old main photo
          as the second one instead of dropping it.
  second  becomes the hut's second photo, in data/second_photos/.

Add --check to see what would change. Remake the hut's collage afterwards
with make_collages.py --force.
"""
import argparse
import datetime
import json
import shutil
import sys
import urllib.parse
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import swap_photos as sw  # noqa: E402  (the file layout and helpers are shared)

ROOT = sw.ROOT
USABLE = ('CC BY', 'CC0', 'Public domain', 'Copyrighted free use')   # as in add_second_photos.py


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('hut', help='hut id or exact name')
    ap.add_argument('slot', choices=['main', 'second'])
    ap.add_argument('image')
    ap.add_argument('--file', required=True, help='the Commons file name, "File:…"')
    ap.add_argument('--credit', required=True)
    ap.add_argument('--license', required=True)
    ap.add_argument('--license-url', required=True)
    ap.add_argument('--old-to-second', action='store_true')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    if not a.file.startswith('File:'):
        sys.exit('--file must be the Commons file name, starting with "File:"')
    # Every hut page shows its photos as a collage, which is a changed version
    # of them, so only licences that allow that and ask nothing more than a
    # credit (and share-alike) will do. The GFDL wants its whole text along.
    if not a.license.startswith(USABLE) or 'NC' in a.license or 'ND' in a.license:
        sys.exit(f'{a.license}: a collage can’t use a photo under this licence. Pick another photo.')

    huts = json.loads((ROOT / 'public' / 'huts.json').read_text(encoding='utf-8'))
    data = json.loads(sw.PHOTOS_JSON.read_text(encoding='utf-8'))
    photos = data['photos']
    picks = json.loads(sw.PICKS.read_text(encoding='utf-8'))
    seconds = json.loads(sw.SECOND.read_text(encoding='utf-8')) if sw.SECOND.exists() else {}
    hits = [h for h in huts if h['id'] == a.hut or sw.fold(h['name']) == sw.fold(a.hut)]
    if len(hits) != 1:
        sys.exit(f'{a.hut}: {"no such hut" if not hits else "several huts by that name"}')
    hut = hits[0]
    hid, name = hut['id'], hut['name']
    today = datetime.date.today().isoformat()
    meta = {'file': a.file, 'page': 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(a.file.replace(' ', '_')),
            'credit': a.credit, 'license': a.license, 'license_url': a.license_url}
    img = ImageOps.exif_transpose(Image.open(Path(a.image).expanduser())).convert('RGB')
    old = photos.get(hid)
    print(f'{name}: {a.slot} photo {a.file} ({a.credit}, {a.license}), {img.width}×{img.height}'
          + (f'; old main {old["file"]} becomes the second' if a.slot == 'main' and a.old_to_second and old else ''))
    if a.check:
        print('Nothing written (--check).')
        return

    if a.slot == 'second':
        rel = f'data/second_photos/{hid}.webp'
        out = img.copy()
        out.thumbnail((840, 840 * 4), Image.LANCZOS)
        out.save(ROOT / rel, 'WEBP', quality=85, method=6)
        seconds[hid] = {'_name': name, **meta, 'src': rel, '_checked': today}
    else:
        names = sw.file_names(hid, a.file)
        for k, width in sw.SIZES.items():
            out = img.copy()
            out.thumbnail((width, width * 4), Image.LANCZOS)
            out.save(sw.PHOTO_DIR / names[k], 'WEBP', quality=sw.QUALITY, method=6)
        if old and old.get('full'):
            if a.old_to_second:
                rel = f'data/second_photos/{hid}.webp'
                shutil.copyfile(ROOT / 'public' / old['full'], ROOT / rel)
                seconds[hid] = {'_name': name, **{k: old.get(k) for k in sw.META}, 'src': rel, '_checked': today}
            for k in sw.SIZES:
                if old.get(k) and old[k] not in (f'photos/{n}' for n in names.values()):
                    (ROOT / 'public' / old[k]).unlink(missing_ok=True)
        photos[hid] = {
            'file': a.file, 'thumb': sw.thumb_url(a.file, 500), 'large': sw.thumb_url(a.file, 1280),
            'credit': a.credit, 'license': a.license, 'license_url': a.license_url, 'page': meta['page'],
            'how': 'pick', 'card': f'photos/{names["card"]}', 'full': f'photos/{names["full"]}',
        }
        picks = sw.with_pick(picks, hid, {'_name': name, 'file': a.file, '_checked': today,
                                          '_note': 'downloaded by hand; credit from its Commons page'})
        sw.write_photos_json(data)
        sw.PICKS.write_text(json.dumps(picks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sw.SECOND.write_text(json.dumps(dict(sorted(seconds.items())), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('Done. Remake the collage: python3 scripts/make_collages.py ' + hid + ' --force')


if __name__ == '__main__':
    main()
