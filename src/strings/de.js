/* Deutsch — österreichisches Deutsch, per du, mit den Begriffen, die der
   Alpenverein und hut-reservation.org selbst verwenden (Matratzenlager,
   Winterraum, Selbstversorger, bewirtschaftet).

   Zahlen, Monatsnamen und Datumsformate kommen aus Intl mit de-AT, stehen
   also nicht hier: Jänner statt Januar, 1.524 statt 1,524. */
export const de = {
  // ---------- Kopf ----------
  "site.tagline": "Hütten in Österreich finden und buchen.",
  "search.aria": "Hütten nach Namen suchen",
  "search.placeholder": "Nach Namen suchen…",
  "status.loading": "Hütten werden geladen…",
  "status.errorBefore": "huts.json konnte nicht geladen werden — liegt die Datei im Ordner ",
  "status.errorAfter": "?",
  "skip.results": "Zu den Hütten springen",
  "skip.map": "Zur Karte springen",

  // ---------- Hütten-Vokabular ----------
  "type.schutzhuette": "Schutzhütte",
  "type.alm": "Alm",
  "type.jausenstation": "Jausenstation",
  "warden.bewirtschaftet": "Bewirtschaftet",
  "warden.bewartet": "Bewartet",
  "warden.selbstversorger": "Selbstversorger",
  "assoc.alpine_club": "Alpenverein",
  "assoc.naturfreunde": "Naturfreunde",
  "assoc.private": "Privat",
  "bucket.dorm": "Matratzenlager",
  "bucket.shared": "Mehrbettzimmer",
  "bucket.priv": "Privatzimmer",
  "bucketPlural.dorm": "Matratzenlager",
  "bucketPlural.shared": "Mehrbettzimmer",
  "bucketPlural.priv": "Privatzimmer",
  "region.other": "Andere/Unbekannt",

  // ---------- Tags auf der Karte ----------
  "tag.beds": { one: "{n} Bett", other: "{n} Betten" },
  "tag.noOvernight": "Keine Übernachtung",
  "tag.usuallyServiced": "Meist bewirtschaftet",
  "tag.shower": "Dusche",
  "tag.winterRoom": "Winterraum",
  "tag.dogsWelcome": "Hunde willkommen",
  "tag.noDogs": "Keine Hunde",

  // ---------- Verfügbarkeit ----------
  "avail.free": "Frei {range}",
  "avail.fewest": " · Minimum über deine Nächte",
  "avail.full": "Voll",
  "avail.beds": { one: "{n} Bett", other: "{n} Betten" },
  "avail.nextFree": "Nächste freie Nacht: {date} ({n} Betten)",
  "avail.none": "In den nächsten Monaten nichts frei",
  "avail.notLoaded": "availability.json wurde nicht geladen — führe fetch_availability.py aus",
  "avail.asOf": "Verfügbarkeit vom {time}",
  "avail.nightsPrefix": "{n} Nächte · ",

  // ---------- Buchen und Kontakt ----------
  "book.online": "Online buchen →",
  "book.aria": "{hut} online buchen (öffnet in einem neuen Tab)",
  "call.label": "{phone} anrufen",
  "call.aria": "{hut} anrufen, {phone}",
  "contact.website": "Website",
  "contact.websiteAria": "Website von {hut}, {host} (öffnet in einem neuen Tab)",
  "contact.email": "E-Mail",
  "contact.emailAria": "E-Mail an {hut}, {email}",
  "band.notBookable": "Online nicht buchbar",
  "band.notBookableNoContact": "Online nicht buchbar · keine Kontaktdaten hinterlegt",

  // ---------- Hütten-Fenster ----------
  "detail.description": "Beschreibung",
  "detail.readMore": "Mehr lesen",
  "detail.showLess": "Weniger",
  "detail.photoCredit": "Foto:",
  "detail.halfBoard": " · Halbpension €{n}",
  "detail.dogsWelcome": " · Hunde willkommen",
  "detail.noDogs": " · keine Hunde",
  "detail.priceList": "Preisliste",
  "detail.priceListAria": "Preisliste von {hut}, PDF (öffnet in einem neuen Tab)",
  "detail.closeAria": "{hut} schließen",
  // Die Zeile unter einem Text, den wir übersetzt haben
  "detail.translatedNote": "Übersetzt",
  "detail.sourceNote": "Text der Hütte, auf {language}",
  "detail.showOriginal": "Text der Hütte anzeigen",
  "detail.showTranslation": "Übersetzung anzeigen",
  "language.de": "Deutsch",
  "language.en": "Englisch",
  "language.fr": "Französisch",
  "language.it": "Italienisch",

  // ---------- Filter ----------
  "filter.available": "Frei (Nächte)",
  "filter.region": "Region",
  "filter.roomType": "Schlafplatz",
  "filter.roomTypeNote": "Eine Hütte mit Lager und Privatzimmern zählt bei beiden.",
  "filter.booking": "Buchung",
  "filter.type": "Hüttenart",
  "filter.elevation": "Höhe",
  "filter.warden": "Bewirtschaftung",
  "filter.association": "Verein",
  "filter.amenities": "Ausstattung",
  "pill.all": "Alle",
  "pill.any": "Egal",
  "pill.unlisted": "Ohne Angabe",
  "pill.bookableOnline": "Online buchbar",
  "pill.hasShower": "Mit Dusche",
  "label.roomTypeUnlisted": "Schlafplatz ohne Angabe",
  "label.assocUnlisted": "Verein ohne Angabe",
  "elev.e1": "< {n} m",
  "elev.e2": "{a}–{b} m",
  "elev.e3": "{a}–{b} m",
  "elev.e4": "{a}–{b} m",
  "elev.e5": "{n} m +",
  "elev.unknown": "Höhe unbekannt",
  "more.button": "Mehr Filter",
  "more.applied": { one: "{n} Filter aktiv", other: "{n} Filter aktiv" },
  "more.closeAria": "Mehr Filter schließen",
  "more.done": "Fertig",
  "more.clear": "Zurücksetzen",
  "more.show": { one: "{n} Hütte zeigen", other: "{n} Hütten zeigen" },
  "chip.removeAria": "Filter {label} entfernen",
  "chip.query": "„{q}“",
  "word.or": " oder ",
  "clear.filters": "Filter zurücksetzen",
  "clear.dates": "Zeitraum zurücksetzen",

  // ---------- Die Zahl über den Ergebnissen ----------
  "count.unlistedHuts": "{n} Hütten ohne Angabe",
  "count.withSpace": "{n} Hütten mit Platz",
  "count.huts": "{n} Hütten",
  "count.ofHuts": " von {n} Hütten",
  "count.unlistedTail": " · {n} ohne Angabe",
  "count.roomFirst": " · {n} mit {rooms} zuerst",
  "count.noneKnown": " · keine bekannt mit {rooms}",

  // ---------- Ergebnisse ----------
  "unlisted.heading": { one: "Ohne Angabe · {n} Hütte", other: "Ohne Angabe · {n} Hütten" },
  "unlisted.noteDatesRoom":
    "Freie Betten unbekannt. Vielleicht haben sie auch {rooms} frei. Ruf an oder schau auf der Website der Hütte nach.",
  "unlisted.noteDates":
    "Freie Betten unbekannt. Ruf an oder schau auf der Website der Hütte nach, ob deine Termine frei sind.",
  "unlisted.noteRoom":
    "Schlafplätze unbekannt. Vielleicht haben sie auch {rooms}. Ruf an oder schau auf der Website der Hütte nach.",
  "list.showingFirst":
    "Die ersten {limit} werden gezeigt — grenze die Filter ein, um die anderen {n} zu sehen.",
  "list.elevationNote": "* Höhe aus den Koordinaten geschätzt",
  "list.backToFilters": "↑ Zurück zu den Filtern",

  // ---------- Nichts gefunden ----------
  "empty.noAvail": "Verfügbarkeiten wurden nicht geladen",
  "empty.nothingFreeNights": "Nichts frei für alle {n} Nächte",
  "empty.nothingFreeNight": "In dieser Nacht ist nichts frei",
  "empty.noMatch": "Keine Hütte passt",
  "empty.noAvailNote":
    "Die Bettenzahlen fehlen, deshalb kann nichts als frei angezeigt werden. Das ist ein Datenproblem, keine leere Suche.",
  "empty.searchingFor": "Gesucht: {list}",
  "empty.nothingToShow": "Es gibt nichts zu zeigen.",
  "empty.tryOneNight": "1 Nacht probieren",
  "empty.tryNights": "{n} Nächte probieren",
  "empty.drop": { one: "{label} weglassen · {n} Hütte", other: "{label} weglassen · {n} Hütten" },
  "empty.nights": { one: "1 Nacht", other: "{n} Nächte am Stück" },

  // ---------- Karte und Ansicht ----------
  "view.aria": "Ansicht",
  "view.list": "Liste",
  "view.split": "Geteilt",
  "view.map": "Karte",
  "map.aria": "Karte der passenden Hütten",
  "map.srNote":
    "Karte der passenden Hütten. Die Pins lassen sich mit den Pfeiltasten und den Plus- und Minustasten verschieben und zoomen, aber nicht mit der Tastatur öffnen — nimm dafür die Hüttenliste, dort öffnet jede Hütte dieselben Details.",
  "legend.bookable": "online buchbar",
  "legend.bookableShort": "buchbar",
  "legend.contact": "Hütte direkt kontaktieren",
  "legend.contactShort": "Hütte anrufen",
  "top.aria": "Zurück zum Seitenanfang",
  "top.title": "Nach oben",

  // ---------- Der Kalender ----------
  "date.checkIn": "Anreise",
  "date.checkOut": "Abreise",
  "date.add": "Datum wählen",
  "date.clear": "Zurücksetzen",
  "date.dialogAria": "Zeitraum wählen",
  "date.prevMonth": "Voriger Monat",
  "date.nextMonth": "Nächster Monat",
  "date.pickCheckIn": "Wähle deinen Anreisetag",
  "date.pickCheckOut": "Jetzt die Abreise wählen — bis zu {n} Nächte",
  "date.dayAria": "{mode} {day}. {month} {year}",
  "date.nights": { one: "{n} Nacht", other: "{n} Nächte" },
  "date.checkInPending": "Anreise {date} · wähle die Abreise",
  "date.noDates": "Kein Zeitraum — alle Hütten werden gezeigt",

  // ---------- Sprachmenü ----------
  "lang.label": "Sprache",
  "lang.aria": "Sprache: {name}",

  // ---------- Fuß ----------
  "footer.imprint": "Impressum",
  "footer.privacy": "Datenschutz",
  "footer.osmBefore": "Hüttendaten ©",
  "footer.osmAfter": "Mitwirkende",
};
