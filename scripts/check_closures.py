#!/usr/bin/env python3
"""
Weekly closure check: is a hut closed where we show free beds?

The booking calendar can say a hut has free beds while the hut itself says it
is closed (Freschenhaus, Nov 2026: the winter break on its website, and in the
booking form's own message). This reads, for every hut we currently show with
an open night:
  - its website: the home page, plus up to two of its own pages whose link
    looks like opening times or news,
  - its message in the booking form ("note" in public/availability.json, read
    by fetch_availability.py five times a day),
and picks out sentences with a closure word (Winterpause, geschlossen,
Sanierung, closed, ...).

It doesn't change anything on the site: words like "geschlossen" are on almost
every hut page (rest days, "closed outside opening hours"), so a person
decides. What it writes is a report of what is new since the last run, for a
GitHub issue; data/closure_check.json remembers what was reported, so each
sentence comes up once.

The fix, once checked, goes in data/overrides.json (then apply_overrides.py):
  "closed": [["2026-12-01", "2027-01-15"]]    no free beds shown those nights
  "winter_room_online": false                 the winter-room bookings aren't a bed

Usage:
  python3 scripts/check_closures.py --report closure-report.md
      writes the report (empty file if nothing new) and updates the state
  python3 scripts/check_closures.py --check
      prints the report, saves nothing
"""

import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUTS = ROOT / "public" / "huts.json"
AVAIL = ROOT / "public" / "availability.json"
SLUGS = ROOT / "public" / "hut_slugs.json"
STATE = ROOT / "data" / "closure_check.json"
SITE = "https://www.hutfinder.at"
HEADERS = {
    "User-Agent": "hutfinder/0.1 (weekly opening-times check; https://www.hutfinder.at)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
}
PAUSE = 0.5
MAX_SNIPPETS = 3      # per page
MAX_PER_HUT = 4
MAX_BODY = 60000      # a GitHub issue takes 65,536 characters

# Closure words. \b keeps "anschließend" and the like out.
CLOSURE = re.compile(
    r"\b(winter\s?pause|winterschlaf|winterruhe|wintersperre|winterschlie(?:ß|ss)ung|saisonpause|"
    r"betriebsurlaub|betriebspause|geschlossen|schlie(?:ß|ss)(?:t|en|ung)|gesperrt|"
    r"generalsanierung|sanierung|umbau|renovierung|keine übernachtung\w*|nicht bewirtschaftet|unbewirtschaftet|"
    r"closed|closure|closing|renovation|chius[oa]|chiusura)\b",
    re.I,
)
# Links on a hut's own site worth reading too.
SUBPAGE = re.compile(r"öffnungszeit|oeffnungszeit|offnungszeit|aktuell|news|neuigkeit|winterraum|opening|saison|season", re.I)


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read(2_000_000)
        charset = r.headers.get_content_charset() or "utf-8"
        return r.geturl(), raw.decode(charset, errors="replace")


def text_of(page):
    page = re.sub(r"(?is)<(script|style|svg|head)\b.*?</\1>", " ", page)
    page = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h\d|tr|section)>", ". ", page)
    page = re.sub(r"<[^>]+>", " ", page)
    return re.sub(r"\s+", " ", html.unescape(page)).strip()


def links_of(base, page):
    """Up to two links on the same site that look like opening times or news."""
    host = urllib.parse.urlparse(base).netloc
    found = []
    for href, label in re.findall(r'(?is)<a\b[^>]*href="([^"#]+)"[^>]*>(.*?)</a>', page):
        url = urllib.parse.urljoin(base, href)
        if urllib.parse.urlparse(url).netloc != host or url.rstrip("/") == base.rstrip("/"):
            continue
        if SUBPAGE.search(href) or SUBPAGE.search(text_of(label)):
            if url not in found:
                found.append(url)
        if len(found) == 2:
            break
    return found


def snippets(text):
    """Sentences with a closure word, the word marked in bold."""
    out = []
    for m in CLOSURE.finditer(text):
        cut = text.rfind(". ", 0, m.start())
        start = max(cut + 2 if cut >= 0 else 0, m.start() - 160)
        if start > 0 and text[start - 1].isalnum():  # don't start mid-word
            start = text.find(" ", start) + 1 or start
        end = text.find(". ", m.end())
        end = min(end + 1 if end >= 0 else len(text), m.end() + 200)
        s = text[start:end].strip(" .")
        # A lone word is a menu button ("Schließen"), not news.
        if len(s.split()) >= 3 and all(s not in o and o not in s for o in out):
            out.append(s)
        if len(out) == MAX_SNIPPETS:
            break
    return out


def key(s):
    return hashlib.sha1(re.sub(r"\W+", " ", s.lower()).strip().encode()).hexdigest()[:12]


def bold(s):
    return CLOSURE.sub(lambda m: f"**{m.group(0)}**", s.replace("*", "\\*"))


def quote(s):
    return "> " + bold(s).replace("\n", "\n> ")


def main():
    check = "--check" in sys.argv
    out_path = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None
    huts = json.loads(HUTS.read_text(encoding="utf-8"))
    avail = json.loads(AVAIL.read_text(encoding="utf-8"))["huts"]
    slugs = json.loads(SLUGS.read_text(encoding="utf-8")).get("slugs", {})
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    seen = state.get("seen", {})
    today = date.today().isoformat()

    # Only huts we currently show with an open night: a closure elsewhere changes nothing on the site.
    todo = []
    for h in huts:
        rec = avail.get(str(h.get("hr_hut_id")))
        nights = sorted(d for d in {**(rec or {}).get("days", {}), **(rec or {}).get("wr", {})} if d >= today)
        if nights:
            todo.append((h, rec, nights[0]))
    print(f"{len(todo)} huts with an open night")

    # Keep what was reported for huts not checked this time, so it doesn't come up again when they reopen.
    new_seen, sections, unreadable = dict(seen), [], []
    for h, rec, first in todo:
        found = []  # (source label, snippet)
        note = (rec.get("note") or {})
        note_text = note.get("de") or note.get("en") or next(iter(note.values()), "")
        for s in snippets(note_text):
            found.append(("Booking form", s))
        site = h.get("website")
        if site:
            try:
                url, page = get(site)
                pages = [(url, page)]
                for sub in links_of(url, page):
                    time.sleep(PAUSE)
                    try:
                        pages.append(get(sub))
                    except Exception:
                        pass
                for u, p in pages:
                    label = "Website" if u == url else f"Website ({urllib.parse.urlparse(u).path or '/'})"
                    for s in snippets(text_of(p)):
                        found.append((label, s))
            except Exception as e:
                unreadable.append(f"{h['name']} ({site}: {str(e)[:60]})")
            time.sleep(PAUSE)

        # The same sentence on the home page and a news page counts once.
        unique, done = [], set()
        for src, s in found:
            if key(s) not in done and not any(s in t or t in s for _, t in unique):
                unique.append((src, s))
                done.add(key(s))
        found = unique
        keys = {key(s) for _, s in found}
        new_seen[h["id"]] = sorted(keys)
        fresh = [(src, s) for src, s in found if key(s) not in set(seen.get(h["id"], []))][:MAX_PER_HUT]
        if not fresh:
            continue
        slug = slugs.get(h["id"])
        page = f"{SITE}/en/hut/{slug}/" if slug else SITE
        what = "winter room" if first in rec.get("wr", {}) else "free beds"
        lines = [
            f"### [{h['name']}]({page}) · `{h['id']}`",
            f"We show {what} from {date.fromisoformat(first):%d.%m.%Y}. "
            f"[Website]({site}) · [Booking form]({h.get('hr_booking_url')})" if site else
            f"We show {what} from {date.fromisoformat(first):%d.%m.%Y}. [Booking form]({h.get('hr_booking_url')})",
            "",
        ]
        for src, s in fresh:
            lines += [f"{src}:", quote(s), ""]
        sections.append("\n".join(lines))
        print(f"  ! {h['name']}: {len(fresh)} new")

    report = ""
    if sections:
        title = f"# Closure check {today}: {len(sections)} hut{'s' if len(sections) != 1 else ''} to look at"
        intro = (
            "Huts we show with free beds whose website or booking-form message mentions a closure, "
            "new since the last check. Most are harmless (rest days, \"closed outside opening hours\"). "
            "Where a hut really is closed, add it to `data/overrides.json` and run `python3 apply_overrides.py`:\n\n"
            "```json\n\"<hut id>\": { \"_name\": \"…\", \"_source\": \"…\", \"_checked\": \"" + today + "\",\n"
            "  \"closed\": [[\"2026-12-01\", \"2027-01-15\"]], \"closed_source\": \"verified\" }\n```\n"
            "`\"winter_room_online\": false` instead, when what the booking form sells in winter isn't a bed. "
            "The next availability refresh then stops showing those nights."
        )
        body = [title, "", intro, ""]
        for s in sections:
            if sum(len(x) for x in body) + len(s) > MAX_BODY:
                body.append(f"_…and {len(sections) - sections.index(s)} more huts: run the check locally with `--check`._")
                break
            body += [s, ""]
        if unreadable:
            body += ["<details><summary>" + f"{len(unreadable)} websites couldn't be read</summary>", "",
                     *[f"- {u}" for u in unreadable], "", "</details>"]
        report = "\n".join(body)

    if check:
        print("\n" + (report or "Nothing new."))
        return
    if out_path:
        Path(out_path).write_text(report, encoding="utf-8")
    STATE.write_text(json.dumps({
        "_note": "What scripts/check_closures.py last reported, per hut: fingerprints of the sentences, so each comes up once.",
        "checked": today,
        "seen": new_seen,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(sections)} huts with something new; {len(unreadable)} websites unreadable.")


if __name__ == "__main__":
    main()
