#!/usr/bin/env python3
"""
fetch_photos.py — choose one photo per hut from Wikimedia Commons.

Writes public/photos.json: one freely licensed photo per hut, with the credit
line its licence asks for. Hut photos on other sites (Alpenverein pages, HRS,
hut websites, bergwelten) are copyrighted, so this uses Commons only. The
images themselves stay on Wikimedia's servers: we store thumbnail URLs.

How the photo for a hut is chosen:
  1. A hand pick in data/photo_picks.json always wins. "file": null there
     means "no good photo, show the fallback".
  2. Otherwise the Wikidata image (P18), if it was taken in the last
     FRESH_YEARS years and passes the checks below.
  3. Otherwise a recent photo from the hut's Commons category that passes
     the checks: among the photos taken within RECENT_WINDOW years of the
     newest one, the one whose file name is most plainly "<hut name>", so
     "Feilalm 2024.jpg" beats "Wasserstelle auf der Feilalm 2024.jpg".
  4. Otherwise nothing, and the card shows the fallback.

Checks: a JPEG, PNG or WebP; landscape but not a panorama; at least
MIN_WIDTH px wide; taken in OLDEST_YEAR or later; a licence we can use; and
no filename words that suggest a map, a sign, an interior, people, an old
photo or a view *from* the hut. Photos that fail still appear in the picker,
labelled with the reason, so you can pick them by hand if they're fine.

Usage (run from the hutfinder folder; needs network):
    python3 scripts/fetch_photos.py --dry-run --limit 20   try 20 huts, write nothing
    python3 scripts/fetch_photos.py --limit 20 --picker    try 20 huts, write only the picker
    python3 scripts/fetch_photos.py                        write public/photos.json
    python3 scripts/fetch_photos.py --picker               also write data/photo-picker.html,
                                                           a page for choosing photos for the
                                                           bookable huts

A full run makes roughly 400 requests to Commons, one at a time, and takes
five to ten minutes. Wikimedia asks bots to go slowly, so please keep it that
way. If more than MAX_SKIPPED of the categories fail to load, nothing is
written, so a bad run can't quietly drop photos from photos.json.
"""

import datetime
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUTS = ROOT / 'public' / 'huts.json'
PICKS = ROOT / 'data' / 'photo_picks.json'
OUT = ROOT / 'public' / 'photos.json'
PICKER = ROOT / 'data' / 'photo-picker.html'

# Wikimedia's API etiquette asks for a User-Agent that says who we are.
UA = 'huettenfinder/1.0 (hut photo sync; https://www.hutfinder.at)'

OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]
WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

# ----------------------------------------------------------------- tuning
FRESH_YEARS = 8          # a Wikidata image taken within this many years is kept
MIN_WIDTH = 800          # px; card thumbnails need far less, the detail view more
MAX_ASPECT = 2.2         # wider than this is a panorama; it crops badly to a card
OLDEST_YEAR = 2000       # older photos no longer show the hut as it is
RECENT_WINDOW = 2        # years; see rule 3
THUMB_W = 500            # card thumbnail
LARGE_W = 1280           # detail view
# 500 and 1280 are among Wikimedia's standard thumbnail widths, which are
# cached on their side. Odd widths get rendered on demand and may be refused.
MAX_FILES_PER_CATEGORY = 150
PAUSE = 0.4              # seconds between Commons requests
MAX_SKIPPED = 0.05       # share of categories allowed to fail before we refuse to write

# Filename words that usually mean "not the hut from outside". Matched
# case-insensitively against the file name. Tune freely.
FLAG_WORDS = [
    ('map or plan', r'karte\b|\bmap\b|lageplan|\bplan\b|grundriss|diagram'),
    ('sign', r'schild\b|wegweiser|\bsign|tafel\b|plaque|stempel|\bstamp\b|logo|wappen'),
    ('interior', r'\binnen|interior|gaststube|gastraum|\bstube\b|zimmer|lager\b|\bdorm|k(ü|ue)che|kitchen|speisekarte|\bmenu\b'),
    ('people', r'gruppenfoto|group photo|portr(ä|ae)t'),
    # a year before 2000 in the name, but not an altitude like "1850 m"
    ('an old photo', r'(?<!\w)1[89]\d\d(?!\w)(?!\s*m\b)(?!\s*m\.)'),
    ('view from the hut', r'(blick|ausblick|aussicht) (von|vom|ab)\b|\bview (up |down )?from\b|\bfrom the\b|panorama'),
    ('a wide view', r'\blage\b|(ü|ue)berblick|\boverview\b'),
    ('webcam', r'webcam'),
]
USABLE_MIME = {'image/jpeg', 'image/png', 'image/webp'}

dry_run = '--dry-run' in sys.argv
make_picker = '--picker' in sys.argv
limit = None
if '--limit' in sys.argv:
    try:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])
    except (IndexError, ValueError):
        sys.exit('--limit needs a number')


# ------------------------------------------------------------------- http
def http_json(url, params=None, post=None, attempts=5):
    """GET (or POST form data) and parse JSON, backing off when throttled."""
    if params:
        url = url + '?' + urllib.parse.urlencode(params)
    data = urllib.parse.urlencode(post).encode('utf-8') if post else None
    last = None
    for attempt in range(attempts):
        req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
        try:
            raw = urllib.request.urlopen(req, timeout=120).read()
            body = json.loads(raw)
            err = body.get('error') if isinstance(body, dict) else None
            if err and err.get('code') == 'maxlag':
                raise RuntimeError('server lagged (maxlag)')
            return body
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503, 504):
                raise
        except (ValueError, RuntimeError, urllib.error.URLError) as e:
            # ValueError: not JSON, usually a "too many requests" page
            last = e
        wait = 5 * (attempt + 1)
        print(f'  throttled or failed ({last}); waiting {wait}s', file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f'giving up on {url[:80]}: {last}')


def overpass_tags(huts):
    """OSM tags for exactly the huts in huts.json, keyed by our id (w123 / n456)."""
    ways = [h['id'][1:] for h in huts if h['id'].startswith('w')]
    nodes = [h['id'][1:] for h in huts if h['id'].startswith('n')]
    parts = []
    if ways:
        parts.append(f'way(id:{",".join(ways)});')
    if nodes:
        parts.append(f'node(id:{",".join(nodes)});')
    query = f'[out:json][timeout:120];({"".join(parts)});out tags;'
    last = None
    for url in OVERPASS_ENDPOINTS:
        try:
            els = http_json(url, post={'data': query}, attempts=2)['elements']
            return {f"{e['type'][0]}{e['id']}": e.get('tags', {}) for e in els}
        except Exception as e:  # noqa: BLE001 — try the next mirror
            last = e
            print(f'  Overpass mirror failed ({url}): {e}', file=sys.stderr)
    raise RuntimeError(f'all Overpass mirrors failed: {last}')


def wikidata_claims(qids):
    """qid -> {'image': 'File:…' or None, 'category': 'Category:…' or None}"""
    out = {}
    qids = sorted(qids)
    for i in range(0, len(qids), 50):
        body = http_json(WIKIDATA_API, {
            'action': 'wbgetentities', 'format': 'json', 'props': 'claims',
            'ids': '|'.join(qids[i:i + 50])})
        for qid, ent in body.get('entities', {}).items():
            claims = ent.get('claims', {})

            def first(prop):
                for c in claims.get(prop, []):
                    v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
                    if isinstance(v, str) and v.strip():
                        return v.strip()
                return None

            img, cat = first('P18'), first('P373')
            out[qid] = {'image': file_title(img) if img else None,
                        'category': 'Category:' + cat if cat else None}
        time.sleep(PAUSE)
    return out


IMAGEINFO = {
    'prop': 'imageinfo',
    'iiprop': 'url|size|mime|timestamp|extmetadata',
    'iiurlwidth': str(THUMB_W),
    'iiextmetadatafilter': 'DateTimeOriginal|LicenseShortName|LicenseUrl|Artist|Attribution',
}


def commons_query(params, max_requests=None):
    """Query Commons, following continuation. Returns (pages by title, aliases).

    aliases maps a title we asked for to the title Commons answered with
    (normalised spelling, or the new name of a renamed file).
    """
    base = {'action': 'query', 'format': 'json', 'formatversion': '2', 'maxlag': '5'}
    base.update(params)
    pages, aliases, cont, n = {}, {}, {}, 0
    while True:
        body = http_json(COMMONS_API, {**base, **cont})
        n += 1
        q = body.get('query', {})
        for key in ('normalized', 'redirects'):
            for m in q.get(key, []):
                aliases[m['from']] = m['to']
        for p in q.get('pages', []):
            have = pages.get(p['title'])
            if have is None:
                pages[p['title']] = p
            elif p.get('imageinfo') and not have.get('imageinfo'):
                have['imageinfo'] = p['imageinfo']
        time.sleep(PAUSE)
        if 'continue' not in body or (max_requests and n >= max_requests):
            break
        cont = body['continue']
    return pages, aliases


# --------------------------------------------------------------- helpers
def file_title(name):
    """'Foo_bar.jpg' / 'File:foo bar.jpg' / a Commons URL -> 'File:Foo bar.jpg'"""
    name = urllib.parse.unquote(str(name)).strip()
    m = re.search(r'commons\.wikimedia\.org/wiki/(File:[^?#]+)', name)
    if m:
        name = m.group(1)
    name = re.sub(r'^(file|datei|image|bild):', '', name, flags=re.I)
    name = name.replace('_', ' ').strip()
    return 'File:' + name[:1].upper() + name[1:] if name else None


def plain(value):
    """Commons metadata is HTML; reduce it to one line of text."""
    text = value or ''
    # hidden copies ("Unknown author<span style="display: none;">Unknown author</span>")
    text = re.sub(r'<(\w+)[^>]*display:\s*none[^>]*>.*?</\1>', '', text, flags=re.S)
    text = re.sub(r'<(br|/p|/div|/dd|/li)\b[^>]*>', ' ', text, flags=re.I)
    text = html.unescape(re.sub(r'<[^>]+>', '', text))
    text = re.sub(r'\s+', ' ', text).strip()
    return re.sub(r'\(\s+', '(', re.sub(r'\s+\)', ')', text))


MONTHS = {m: i for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
     'september', 'october', 'november', 'december'], 1)}


def parse_date(text):
    """'2020-09-18 10:11:41', '2020:09:18', 'Taken on 8 June 2024, 10:18' -> ISO date (or year)."""
    m = re.search(r'\b((?:19|20)\d\d)[-:](\d\d)(?:[-:](\d\d))?(?:[ T](\d\d:\d\d(?::\d\d)?))?', text)
    if m:
        return '-'.join(g for g in m.groups()[:3] if g) + (' ' + m.group(4) if m.group(4) else '')
    m = re.search(r'\b(\d{1,2}) (%s) ((?:19|20)\d\d)(?:, (\d\d:\d\d(?::\d\d)?))?' % '|'.join(MONTHS), text, flags=re.I)
    if m:
        d = f'{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}'
        return d + (' ' + m.group(4) if m.group(4) else '')
    m = re.search(r'\b(%s) ((?:19|20)\d\d)\b' % '|'.join(MONTHS), text, flags=re.I)
    if m:
        return f'{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}'
    m = re.search(r'\b(1[89]\d\d|20\d\d)\b', text)
    return m.group(1) if m else ''


def fold(text):
    text = text.lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        text = text.replace(a, b)
    return text


FILLER = {'jpg', 'jpeg', 'png', 'webp', 'bild', 'foto', 'photo', 'img', 'dsc', 'the', 'und',
          'der', 'die', 'das', 'dem', 'den', 'des', 'im', 'am', 'an', 'auf', 'bei', 'mit',
          'von', 'vom', 'zur', 'zum', 'and', 'of', 'at', 'hut', 'huette', 'haus', 'alm',
          'sommer', 'summer', 'winter', 'herbst'}


def name_score(title, hut_name):
    """Higher when the file name is plainly the hut's name: 'Feilalm 2024.jpg'."""
    name_words = set(re.findall(r'[a-z]+', fold(hut_name)))
    words = re.findall(r'[a-z]+', fold(title[5:].rsplit('.', 1)[0]))
    extra = [w for w in words if w not in name_words and w not in FILLER and len(w) > 2]
    has_name = ''.join(sorted(name_words)) and all(w in words for w in name_words if len(w) > 2)
    return (3 if has_name else 0) - len(extra)


def meta(ii, key):
    return plain((ii.get('extmetadata', {}).get(key) or {}).get('value'))


def describe(page, p18_title):
    """Turn a Commons page into a candidate dict, with reasons it may not fit."""
    ii = (page.get('imageinfo') or [None])[0]
    if not ii:
        return None
    title = page['title']
    w, h = ii.get('width') or 0, ii.get('height') or 0
    date, date_kind = parse_date(meta(ii, 'DateTimeOriginal')), 'taken'
    if not date:
        date, date_kind = (ii.get('timestamp') or '')[:10], 'uploaded'
    licence = meta(ii, 'LicenseShortName')
    # the author's own attribution text if they gave one, else the author
    credit = meta(ii, 'Attribution') or meta(ii, 'Artist')
    credit = re.sub(r'\s*\(talk\)', '', credit)
    credit = re.sub(r'^I,\s*', '', credit)
    credit = re.sub(r'\b(User|Benutzer):', '', credit).strip()
    if len(credit) > 80:
        credit = credit[:77].rstrip() + '…'

    reasons = []
    if ii.get('mime') not in USABLE_MIME:
        reasons.append(f"not a photo ({ii.get('mime')})")
    if w < MIN_WIDTH:
        reasons.append(f'small ({w}px)')
    if h > w:
        reasons.append('portrait')
    elif h and w / h > MAX_ASPECT:
        reasons.append('panorama shape')
    if date_kind == 'taken' and date[:4].isdigit() and int(date[:4]) < OLDEST_YEAR:
        reasons.append(f'taken in {date[:4]}')
    if not licence:
        reasons.append('no licence info')
    elif re.fullmatch(r'GFDL[\s\d.]*', licence, flags=re.I):
        reasons.append('GFDL only')
    fname = title[5:].lower()
    for label, pattern in FLAG_WORDS:
        if re.search(pattern, fname, flags=re.I):
            reasons.append(f'name suggests {label}')
    if date_kind == 'taken' and any(r.startswith('taken in') for r in reasons):
        reasons = [r for r in reasons if r != 'name suggests an old photo']

    # Commons appends utm_ tracking parameters to its URLs; drop them.
    orig = (ii.get('url') or '').split('?')[0]
    thumb = (ii.get('thumburl') or '').split('?')[0] or orig
    if w > LARGE_W and ii.get('thumburl'):
        large = thumb.replace(f'/{THUMB_W}px-', f'/{LARGE_W}px-')
    else:
        large = orig
    return {
        'file': title,
        'thumb': thumb,
        'large': large,
        'width': w,
        'height': h,
        'date': date,
        'date_kind': date_kind,
        'credit': credit or 'Wikimedia Commons',
        'license': licence,
        'license_url': meta(ii, 'LicenseUrl') or None,
        'page': (ii.get('descriptionurl') or '').split('?')[0] or 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')),
        'wikidata': title == p18_title,
        'reasons': reasons,
    }


def year(c):
    return int(c['date'][:4]) if c and c['date'][:4].isdigit() else 0


def choose(cands, p18, pick, hut_name):
    """Apply the rules in the docstring. Returns (candidate or None, how)."""
    if pick is not None:
        return pick, 'picked'
    usable = [c for c in cands if not c['reasons']]
    fresh_from = datetime.date.today().year - FRESH_YEARS
    if p18 and not p18['reasons'] and p18['date_kind'] == 'taken' and year(p18) >= fresh_from:
        return p18, 'wikidata'
    if usable:
        newest_year = max(year(c) for c in usable)
        recent = [c for c in usable if year(c) >= newest_year - RECENT_WINDOW]
        best = max(recent, key=lambda c: (name_score(c['file'], hut_name), c['date_kind'] == 'taken', c['date']))
        return best, 'recent'
    return None, 'none'


PUBLIC_KEYS = ('file', 'thumb', 'large', 'width', 'height', 'date', 'date_kind',
               'credit', 'license', 'license_url', 'page')


# ------------------------------------------------------------------ main
def main():
    if not HUTS.exists():
        sys.exit('Run this from the hutfinder folder.')
    data = json.loads(HUTS.read_text(encoding='utf-8'))
    huts = data if isinstance(data, list) else data.get('huts', [])
    picks = json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}
    picks = {k: v for k, v in picks.items() if not k.startswith('_')}

    print(f'{len(huts)} huts, {len(picks)} hand picks')
    print('Fetching OSM tags...')
    tags = overpass_tags(huts)

    # -------------------------------------------- work out links per hut
    links = {}
    for h in huts:
        t = tags.get(h['id'], {})
        qid = (t.get('wikidata') or '').split(';')[0].strip() or None
        osm_file = osm_cat = None
        wc = (t.get('wikimedia_commons') or '').split(';')[0].strip()
        if wc.lower().startswith('category:'):
            osm_cat = 'Category:' + wc.split(':', 1)[1].replace('_', ' ').strip()
        elif wc:
            osm_file = file_title(wc)
        img = t.get('image') or ''
        if not osm_file and re.search(r'commons\.wikimedia\.org/wiki/File:|^File:', img, flags=re.I):
            osm_file = file_title(img)
        links[h['id']] = {'qid': qid, 'osm_file': osm_file, 'osm_cat': osm_cat}

    todo = [h for h in huts if any(links[h['id']].values()) or h['id'] in picks]
    if limit:
        todo = todo[:limit]
    print(f'  {len(todo)} huts link to Wikidata or Commons, or have a hand pick')

    print('Fetching Wikidata images and categories...')
    claims = wikidata_claims({links[h['id']]['qid'] for h in todo if links[h['id']]['qid']})

    for h in todo:
        lk = links[h['id']]
        c = claims.get(lk['qid'], {}) if lk['qid'] else {}
        lk['p18'] = c.get('image') or lk['osm_file']
        lk['category'] = c.get('category') or lk['osm_cat']
        pick = picks.get(h['id'])
        lk['pick'] = file_title(pick['file']) if pick and pick.get('file') else None

    # ------------------------------------------------ single files first
    singles = sorted({t for h in todo for t in (links[h['id']]['p18'], links[h['id']]['pick']) if t})
    print(f'Fetching details for {len(singles)} Wikidata images and picks...')
    pages, aliases = {}, {}
    for i in range(0, len(singles), 50):
        p, a = commons_query({'titles': '|'.join(singles[i:i + 50]), 'redirects': '1', **IMAGEINFO})
        pages.update(p)
        aliases.update(a)

    def resolve(title):
        seen = 0
        while title in aliases and seen < 5:
            title, seen = aliases[title], seen + 1
        return title

    # ---------------------------------------------------------- categories
    cats = sorted({links[h['id']]['category'] for h in todo if links[h['id']]['category']})
    print(f'Fetching {len(cats)} Commons categories (this is the slow part)...')
    cat_files, skipped = {}, []
    for n, cat in enumerate(cats, 1):
        if n % 25 == 0:
            print(f'  {n}/{len(cats)}')
        try:
            p, _ = commons_query({'generator': 'categorymembers', 'gcmtitle': cat,
                                  'gcmtype': 'file', 'gcmlimit': '50', **IMAGEINFO},
                                 max_requests=MAX_FILES_PER_CATEGORY // 50 + 2)
        except RuntimeError as e:
            print(f'  skipped {cat}: {e}', file=sys.stderr)
            skipped.append(cat)
            continue
        pages.update(p)
        cat_files[cat] = list(p)

    # ------------------------------------------------------------- choose
    photos, rows, how_count, missing_picks = {}, [], {}, []
    for h in todo:
        lk = links[h['id']]
        p18_title = resolve(lk['p18']) if lk['p18'] else None
        titles = list(dict.fromkeys(
            [t for t in [p18_title] if t] + cat_files.get(lk['category'], [])))
        cands = [c for c in (describe(pages[t], p18_title) for t in titles if t in pages) if c]
        p18 = next((c for c in cands if c['wikidata']), None)

        pick_c = None
        pick_entry = picks.get(h['id'])
        if lk['pick']:
            pt = resolve(lk['pick'])
            pick_c = describe(pages[pt], p18_title) if pt in pages else None
            if pick_c is None:
                missing_picks.append(f"  {h['name']}: {lk['pick']} not found on Commons, choosing automatically")
            elif pick_c['file'] not in {c['file'] for c in cands}:
                cands.insert(0, pick_c)
        if pick_entry is not None and not lk['pick']:
            chosen, how = None, 'picked-none'
        else:
            chosen, how = choose(cands, p18, pick_c, h['name'])
        how_count[how] = how_count.get(how, 0) + 1
        if chosen:
            photos[h['id']] = {k: chosen[k] for k in PUBLIC_KEYS}
            photos[h['id']]['how'] = how

        if make_picker and h.get('hr_booking_url'):
            # usable first, then dated by EXIF before upload-dated, newest first
            cands.sort(key=lambda c: c['date'], reverse=True)
            cands.sort(key=lambda c: (bool(c['reasons']), c['date_kind'] != 'taken'))
            rows.append({
                'id': h['id'], 'name': h['name'], 'elevation': h.get('elevation'),
                'region': h.get('region'), 'website': h.get('website'),
                'category': lk['category'], 'auto': None if how.startswith('picked') else (chosen or {}).get('file'),
                'how': how, 'candidates': cands[:24]})

    if make_picker and not limit:
        # bookable huts with no Commons link at all still get a row, so they
        # can be given a photo by pasting a Commons file name
        have = {r['id'] for r in rows}
        for h in huts:
            if h.get('hr_booking_url') and h['id'] not in have:
                rows.append({'id': h['id'], 'name': h['name'], 'elevation': h.get('elevation'),
                             'region': h.get('region'), 'website': h.get('website'),
                             'category': None, 'auto': None, 'how': 'none', 'candidates': []})
    rows.sort(key=lambda r: r['name'])

    # --------------------------------------------------------------- report
    print(f'\n{len(photos)} of {len(huts)} huts get a photo')
    labels = {'picked': 'your pick', 'picked-none': 'you chose no photo',
              'wikidata': 'Wikidata image, recent', 'recent': 'recent photo from its category',
              'none': 'nothing usable'}
    for how, n in sorted(how_count.items(), key=lambda kv: -kv[1]):
        print(f'  {n:4}  {labels.get(how, how)}')
    for line in missing_picks:
        print(line)
    for hid, p in list(photos.items())[:8]:
        name = next(h['name'] for h in huts if h['id'] == hid)
        print(f"  e.g. {name}: {p['file'][5:]} ({p['date'][:4]}, {p['license']}, {p['how']})")

    if dry_run:
        print('\nDry run: nothing written.')
        return
    if cats and len(skipped) > MAX_SKIPPED * len(cats):
        sys.exit(f'\n{len(skipped)} of {len(cats)} categories failed to load, so nothing was written. '
                 'Wait a while and run it again.')

    if limit:
        print('\n--limit: not writing public/photos.json, since it would only hold a few huts.')
    else:
        write_photos(photos)

    if make_picker:
        write_picker(rows, json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {})
        print(f'Wrote {PICKER.relative_to(ROOT)} ({len(rows)} bookable huts). Open it in your browser.')


def write_photos(photos):
    # one hut per line, so git diffs show exactly which photos changed
    lines = [f'  {json.dumps(k)}: {json.dumps(photos[k], ensure_ascii=False)}' for k in sorted(photos)]
    OUT.write_text(
        '{\n'
        f'"generated": "{datetime.date.today().isoformat()}",\n'
        '"source": "Wikimedia Commons; see each photo\'s licence and credit",\n'
        '"photos": {\n' + ',\n'.join(lines) + '\n}\n}\n', encoding='utf-8')
    print(f'\nWrote {OUT.relative_to(ROOT)}')


def write_picker(rows, picks_file):
    template = (Path(__file__).parent / 'photo_picker_template.html').read_text(encoding='utf-8')
    payload = json.dumps({'huts': rows, 'picks': picks_file,
                          'generated': datetime.date.today().isoformat()}, ensure_ascii=False)
    PICKER.write_text(template.replace('/*DATA*/null', payload.replace('</', '<\\/')), encoding='utf-8')


if __name__ == '__main__':
    main()
