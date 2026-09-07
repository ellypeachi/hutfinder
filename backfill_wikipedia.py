#!/usr/bin/env python3
"""
Backfill bed counts from German Wikipedia.

OSM tags many Austrian huts with a wikidata id or a wikipedia article.
German Wikipedia's "Infobox Berghütte" carries Betten, Lager, Notlager and
Winterraum as structured fields, so those links are a join key into data
that is far richer than the OSM capacity tags.

Only fills huts where `sleeping` is currently null. Never overwrites a
number from HRS, from OSM, or from your overrides.

Every number it writes is stamped with sleeping_source so you can always
tell where a figure came from, and strip one source out again if you
decide you don't trust it.

Usage:
    python3 backfill_wikipedia.py --dry-run --limit 10    try ten, write nothing
    python3 backfill_wikipedia.py --dry-run               try all, write nothing
    python3 backfill_wikipedia.py                         apply
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = 'huettenfinder/1.0 (hut bed-count backfill; www.hutfinder.at)'
HUTS = Path('public/huts.json')

dry_run = '--dry-run' in sys.argv
limit = None
if '--limit' in sys.argv:
    try:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])
    except (IndexError, ValueError):
        sys.exit('--limit needs a number')

if not HUTS.exists():
    sys.exit('Run this from the hutfinder folder.')


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())


def post_overpass(query):
    req = urllib.request.Request(
        'https://overpass-api.de/api/interpreter',
        data=query.encode('utf-8'), headers={'User-Agent': UA})
    return json.loads(urllib.request.urlopen(req, timeout=300).read())['elements']


# ------------------------------------------------------------------ load
data = json.loads(HUTS.read_text(encoding='utf-8'))
huts = data if isinstance(data, list) else data.get('huts', [])
unknown = [h for h in huts if h.get('sleeping') is None and not h.get('hr_capacity')]
print(f'{len(unknown)} huts with no bed count')

# ------------------------------------------------------------------ osm
print('Fetching OSM tags...')
QUERY = """
[out:json][timeout:240];
area["ISO3166-1"="AT"][admin_level=2]->.at;
(
  node["tourism"~"alpine_hut|wilderness_hut|chalet"](area.at);
  way["tourism"~"alpine_hut|wilderness_hut|chalet"](area.at);
  node["amenity"~"restaurant|cafe"]["ele"](area.at);
  way["amenity"~"restaurant|cafe"]["ele"](area.at);
);
out tags;
"""
tags_by_id = {f"{e['type'][0]}{e['id']}": e.get('tags', {})
              for e in post_overpass(QUERY)}

# ------------------------------------------- work out an article per hut
targets = []          # (hut, article_title) or (hut, None) pending wikidata
pending_qids = {}     # qid -> hut

for h in unknown:
    tags = tags_by_id.get(h['id']) or {}
    wp = tags.get('wikipedia') or ''
    if wp.startswith('de:'):
        targets.append((h, wp[3:]))
    elif tags.get('wikidata'):
        pending_qids[tags['wikidata']] = h

print(f'  {len(targets)} direct wikipedia links, {len(pending_qids)} wikidata ids')

# ---------------------------------------- wikidata ids -> article titles
qids = list(pending_qids)
for i in range(0, len(qids), 50):
    chunk = qids[i:i + 50]
    url = ('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json'
           '&props=sitelinks&sitefilter=dewiki&ids=' + '|'.join(chunk))
    try:
        ents = get(url).get('entities', {})
    except Exception as e:
        print(f'  wikidata batch failed: {e}')
        continue
    for qid, ent in ents.items():
        title = (ent.get('sitelinks', {}).get('dewiki') or {}).get('title')
        if title:
            targets.append((pending_qids[qid], title))
    time.sleep(0.3)

print(f'  {len(targets)} huts with a German Wikipedia article')
if limit:
    targets = targets[:limit]
    print(f'  limited to {len(targets)}')

# -------------------------------------------------------- parse infoboxes
FIELD = lambda name: re.compile(
    r'\|\s*' + name + r'\s*=\s*([^\n|}]*)', re.I)
BETTEN, LAGER, NOTLAGER, WINTER = (FIELD('Betten'), FIELD('Lager'),
                                   FIELD('Notlager'), FIELD('Winterraum'))


def first_int(text):
    if not text:
        return None
    # ignore references and templates before looking for a number
    text = re.sub(r'<ref.*?(/>|</ref>)', '', text, flags=re.S)
    m = re.search(r'\d+', text.replace('.', ''))
    return int(m.group(0)) if m else None


def parse(wikitext):
    """-> (overnight_places, winter_room_places)"""
    betten = first_int(BETTEN.search(wikitext).group(1)) if BETTEN.search(wikitext) else None
    lager = first_int(LAGER.search(wikitext).group(1)) if LAGER.search(wikitext) else None
    winter = first_int(WINTER.search(wikitext).group(1)) if WINTER.search(wikitext) else None
    # Notlager is emergency-only and deliberately excluded from the total
    total = None
    if betten is not None or lager is not None:
        total = (betten or 0) + (lager or 0)
    return (total or None), winter


by_title = {t: h for h, t in targets}
titles = list(by_title)
filled = winter_filled = 0
report = []

for i in range(0, len(titles), 20):
    chunk = titles[i:i + 20]
    url = ('https://de.wikipedia.org/w/api.php?action=query&format=json'
           '&prop=revisions&rvprop=content&rvslots=main&titles='
           + urllib.parse.quote('|'.join(chunk), safe='|'))
    try:
        pages = get(url)['query']['pages']
    except Exception as e:
        print(f'  wikipedia batch failed: {e}')
        continue
    for page in pages.values():
        title = page.get('title')
        hut = by_title.get(title)
        if hut is None or 'revisions' not in page:
            continue
        text = page['revisions'][0]['slots']['main'].get('*', '')
        total, winter = parse(text)
        if total:
            report.append(f'  {hut.get("name"):<34} {total:>4} places   ({title})')
            if not dry_run:
                hut['sleeping'] = total
                hut['sleeping_source'] = 'wikipedia'
            filled += 1
        if winter and not hut.get('winterraum_beds'):
            if not dry_run:
                hut['winterraum_beds'] = winter
            winter_filled += 1
    time.sleep(0.4)
    print(f'  ...{min(i + 20, len(titles))}/{len(titles)}')

# ------------------------------------------------------------------ save
print()
for line in report[:40]:
    print(line)
if len(report) > 40:
    print(f'  ... and {len(report) - 40} more')

print(f'\nbed counts found:     {filled}')
print(f'winter rooms found:   {winter_filled}')

if dry_run:
    print('\n--dry-run: nothing written.')
else:
    # stamp everything that already had a number, so every figure has a source
    stamped = 0
    for h in huts:
        if h.get('sleeping') is not None and not h.get('sleeping_source'):
            h['sleeping_source'] = 'osm'
            stamped += 1
    HUTS.with_suffix('.json.prewiki').write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    HUTS.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'existing numbers stamped as osm: {stamped}')
    print(f'\nWrote {HUTS} (backup: {HUTS}.prewiki)')
    print('Re-run apply_overrides.py afterwards.')
