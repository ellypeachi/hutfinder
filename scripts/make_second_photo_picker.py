#!/usr/bin/env python3
"""Write data/second-photo-picker.html: a page for choosing each hut's second
collage photo (inside the hut, or the landscape around it) from Wikimedia Commons.

The page looks the photos up on Commons itself when it is opened in a browser,
so this script needs no network: it only fills in the huts and their main
photos. Open the file, pick, click "Download for Claude", and attach the
downloaded second_photos.json in the chat.

    python3 scripts/make_second_photo_picker.py                     the huts in data/hut_pages.json
    python3 scripts/make_second_photo_picker.py --all                every hut with a main photo
    python3 scripts/make_second_photo_picker.py w127908485 w83122419 just these
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'second-photo-picker.html'
TYPES = {'schutzhuette': 'Schutzhütte', 'alm': 'Alm', 'jausenstation': 'Jausenstation'}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    huts = json.loads((ROOT / 'public' / 'huts.json').read_text(encoding='utf-8'))
    photos = json.loads((ROOT / 'public' / 'photos.json').read_text(encoding='utf-8'))['photos']
    saved_path = ROOT / 'data' / 'second_photos.json'
    saved = json.loads(saved_path.read_text(encoding='utf-8')) if saved_path.exists() else {}
    pages = ROOT / 'data' / 'hut_pages.json'
    if args:
        ids, label = args, 'the huts named on the command line'
    elif '--all' in sys.argv or not pages.exists():
        ids, label = [h['id'] for h in huts], 'every hut with a photo'
    else:
        ids, label = json.loads(pages.read_text(encoding='utf-8'))['ids'], 'the huts in data/hut_pages.json'
    by_id = {h['id']: h for h in huts}
    rows = []
    for hid in ids:
        h, ph = by_id.get(hid), photos.get(hid)
        if not h or not ph or not ph.get('file'):
            continue
        s = saved.get(hid)
        rows.append({
            'id': hid, 'name': h['name'], 'type': TYPES.get(h.get('type'), h.get('type')), 'region': h.get('region'),
            'elevation': h.get('elevation'),
            'main': {'file': ph['file'], 'thumb': ph.get('thumb')},
            'saved': ({k: s.get(k) for k in ('file', 'page', 'credit', 'license', 'license_url')} if s else None),
        })
    template = (Path(__file__).parent / 'second_photo_picker_template.html').read_text(encoding='utf-8')
    data = json.dumps({'label': label, 'huts': rows}, ensure_ascii=False).replace('</', '<\\/')
    OUT.write_text(template.replace('/*DATA*/null', data), encoding='utf-8')
    print(f'Wrote {OUT.relative_to(ROOT)} with {len(rows)} huts.')


if __name__ == '__main__':
    main()
