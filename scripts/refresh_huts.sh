#!/bin/bash
# refresh_huts.sh — refresh public/huts.json from every source, in the order
# the file was built up: OSM attributes, elevations and hut-reservation.org
# (1 Sep), the ÖAV register and Wikipedia beds (7 Sep), contacts (22 Sep),
# and your hand-verified overrides always last.
#
# It refreshes the existing file in place. Never re-run scripts/import_osm.py:
# it writes data/huts.json (not public/), and the region boundaries it needs
# (data/bundeslaender.geojson) were never saved in the repo, so a fresh import
# would lose every region, the estimated elevations, the warden labels and the
# bed fixes.
#
# After each step it shows what changed and asks before going on. Answer
# anything but y to stop. Undo everything with:
#     git restore public/huts.json data/
#
# Not included:
#   - data/hrs_catalog.json, the hut-reservation.org hut list. It was saved by
#     hand from https://www.hut-reservation.org/api/v1/manage/hutsList while
#     logged in. Save it again first only if you want huts added since.
#   - Warden info from the ÖAV register. That came from a one-off patch
#     (patch_warden.py), not a step that can be re-run.
#   - Photos (scripts/fetch_photos.py, then scripts/download_photos.py) and
#     availability (the GitHub bot does that on its own).
#
# Run from the project folder:   bash scripts/refresh_huts.sh

set -u
cd "$(dirname "$0")/.." || exit 1

UNDO="Undo everything with:  git restore public/huts.json data/"

if ! git diff --quiet -- public/huts.json data/; then
  echo "public/huts.json or data/ has changes that aren't committed."
  echo "Commit or restore them first, so 'git restore' can always take you back."
  exit 1
fi
if ! python3 -c "import requests, rapidfuzz" 2>/dev/null; then
  echo "Missing Python packages. Run this once, then try again:"
  echo "    pip3 install requests rapidfuzz"
  exit 1
fi

cleanup() {  # backups the scripts write next to huts.json; git is the backup
  rm -f public/huts.json.bak public/huts.json.osmbak public/huts.json.hrsbak public/huts.json.prewiki
}

run() {  # one script; if it fails, stop the whole refresh
  echo
  echo "=== python3 $*"
  if ! python3 "$@"; then
    echo
    echo "That step failed, so nothing after it ran."
    echo "$UNDO"
    cleanup
    exit 1
  fi
}

ask() {  # show what has changed so far, then go on only on y
  echo
  echo "--- changed so far:"
  git --no-pager diff --stat -- public/huts.json data/
  read -r -p "$1 [y/N] " answer
  case "$answer" in
    y|Y) ;;
    *) echo "Stopped. $UNDO"; cleanup; exit 0 ;;
  esac
}

# 1. OSM attributes. This OVERWRITES association, shower, dogs and winter-room
#    beds with what OSM says, so it has to run before the sources that outrank
#    OSM (hut-reservation.org, the ÖAV register) put their values back.
run scripts/enrich_osm_attrs.py
ask "1/7 OSM attributes done. Go on to elevations?"

# 2. Elevations. Only fills huts that have none.
run scripts/fill_elevation.py
ask "2/7 Elevations done. Go on to hut-reservation.org?"

# 3. hut-reservation.org: re-fetch each hut's details, re-match, merge.
run scripts/build_hrs_catalog.py --refresh
run scripts/match_huts.py
echo
echo "Matches marked \"review\" above are not used until someone checks them"
echo "and sets \"verified\": true in data/hr_mapping.json."
ask "3/7 Matching done. Merge hut-reservation.org into huts.json?"
run scripts/merge_hrs.py
ask "Merged. Go on to the ÖAV register?"

# 4. ÖAV register: beds, shower and winter room outrank OSM.
run fetch_alpenverein.py
run merge_alpenverein.py --dry-run
ask "4/7 That's what the ÖAV merge would change. Apply it?"
run merge_alpenverein.py

# 5. Wikipedia: beds, only where still empty. After ÖAV, so it only looks at
#    the real remaining gap.
run backfill_wikipedia.py --dry-run
ask "5/7 Apply the Wikipedia beds above?"
run backfill_wikipedia.py

# 6. Contacts: phone, website, email, only where still empty, after
#    hut-reservation.org and ÖAV have added theirs.
run scripts/backfill_contacts.py --check
ask "6/7 Apply the contacts above?"
run scripts/backfill_contacts.py

# 7. Your hand-verified overrides, always last.
run apply_overrides.py --check
ask "7/7 Apply your overrides?"
run apply_overrides.py

cleanup
echo
echo "Done. What changed:"
git --no-pager diff --stat -- public/huts.json data/
echo
echo "Check it with npm run dev, then commit public/huts.json and data/."
echo "$UNDO"
