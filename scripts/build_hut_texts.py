#!/usr/bin/env python3
"""
build_hut_texts.py — write public/hut_texts.json, the huts' own descriptions
in every language the site shows.

Where each language comes from:
  de, en, fr, it   the hut itself, via hut-reservation.org (build_hrs_catalog.py)
  nl, cs           our translations, data/note_translations.json

A translation is only used while the text it was made from is still the text
the hut is showing: each entry carries src_sha, the SHA-256 of that source. If
the hut edits its description, the fingerprints stop matching, the translation
is left out (the site falls back to the hut's own German or English) and the
hut is listed here as stale, ready to be redone. A wrong opening time in a
language nobody on the team reads is worse than a paragraph in German.

Run from the project root, after merge_hrs.py:

    python3 scripts/build_hut_texts.py --check    # report, write nothing
    python3 scripts/build_hut_texts.py            # write public/hut_texts.json
    python3 scripts/build_hut_texts.py --stamp    # record src_sha for new
                                                  # translations, then write

--stamp takes the CURRENT source text as the one each new translation was made
from, so only run it right after adding translations made from that text.

Reads  data/hrs_huts.json, data/note_translations.json
Writes public/hut_texts.json  (and data/note_translations.json with --stamp)
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HRS = ROOT / "data" / "hrs_huts.json"
TRANS = ROOT / "data" / "note_translations.json"
OUT = ROOT / "public" / "hut_texts.json"

# ours, in the order the site falls back through them
OURS = ("nl", "cs")
# the hut's own, most complete first: German is usually the original
THEIRS = ("de", "en", "fr", "it")


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def source_of(langs):
    """The text a translation is made from, and its language."""
    for code in ("de", "en"):
        if langs.get(code):
            return code, langs[code]
    return None, None


def main():
    check = "--check" in sys.argv
    stamp = "--stamp" in sys.argv

    records = json.loads(HRS.read_text(encoding="utf-8"))
    trans = json.loads(TRANS.read_text(encoding="utf-8")) if TRANS.exists() else {}

    texts, stale, missing, stamped = {}, [], [], 0
    per_lang = dict.fromkeys(THEIRS + OURS, 0)

    for rec in records:
        hid = rec.get("hr_hut_id")
        notes = rec.get("notes")
        if not hid or not notes:
            continue
        if isinstance(notes, str):
            # a record from before the catalog kept every language
            notes = {"en": notes}
        langs = {k: v for k, v in notes.items() if k in THEIRS and v}
        if not langs:
            continue

        src_lang, src_text = source_of(langs)
        entry = dict(langs)
        done = []
        t = trans.get(str(hid)) or {}
        for code in OURS:
            text = (t.get(code) or "").strip()
            if not text:
                continue
            if stamp and not t.get("src_sha"):
                t["src_sha"] = sha(src_text)
                t["src_lang"] = src_lang
                trans[str(hid)] = t
                stamped += 1
            if t.get("src_sha") != sha(src_text):
                stale.append((hid, rec.get("name")))
                break
            entry[code] = text
            done.append(code)
        if done:
            entry["translated"] = done
        else:
            missing.append((hid, rec.get("name")))

        for code in entry:
            if code in per_lang:
                per_lang[code] += 1
        texts[str(hid)] = entry

    print(f"{len(texts)} huts with a description")
    for code in THEIRS + OURS:
        print(f"  {code}: {per_lang[code]}")
    if stale:
        print(f"\n{len(stale)} translations no longer match the hut's text — redo these:")
        for hid, name in stale[:20]:
            print(f"  {hid:5} {name}")
        if len(stale) > 20:
            print(f"  … and {len(stale) - 20} more")
    if missing:
        print(f"\n{len(missing)} huts have no translation yet"
              + (f" (first: {missing[0][1]})" if missing else ""))

    if check:
        print("\n--check: nothing written")
        return

    if stamp and stamped:
        TRANS.write_text(json.dumps(trans, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        print(f"\nStamped {stamped} new translations with the current source text")

    OUT.write_text(
        json.dumps(
            {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "texts": texts},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"\nWrote {OUT}  ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
