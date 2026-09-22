/* Nederlands — informeel (je/jij), zoals de NKBV schrijft, met de woorden die
   zij gebruiken: berghut, slaapzaal, winterruimte, bewaakt en onbewaakt.

   De namen van de huttypes blijven Duits (Schutzhütte, Alm, Jausenstation):
   zo staan ze ook op de hut zelf en op de wandelkaart. */
export const nl = {
  // ---------- kop ----------
  "site.tagline": "Vind en boek berghutten in Oostenrijk.",
  "search.aria": "Berghutten op naam zoeken",
  "search.placeholder": "Zoek op naam…",
  "status.loading": "Hutten worden geladen…",
  "status.errorBefore": "huts.json kon niet geladen worden — staat het bestand in de map ",
  "status.errorAfter": "?",
  "skip.results": "Naar de hutten",
  "skip.map": "Naar de kaart",

  // ---------- huttenwoorden ----------
  "type.schutzhuette": "Schutzhütte",
  "type.alm": "Alm",
  "type.jausenstation": "Jausenstation",
  "warden.bewirtschaftet": "Bewaakt",
  "warden.bewartet": "Deels bewaakt",
  "warden.selbstversorger": "Onbewaakt",
  "assoc.alpine_club": "Alpenvereniging",
  "assoc.naturfreunde": "Naturfreunde",
  "assoc.private": "Particulier",
  "bucket.dorm": "Slaapzaal",
  "bucket.shared": "Meerpersoonskamer",
  "bucket.priv": "Privékamer",
  "bucketPlural.dorm": "slaapzalen",
  "bucketPlural.shared": "meerpersoonskamers",
  "bucketPlural.priv": "privékamers",
  "region.other": "Anders/Onbekend",

  // ---------- labels op een kaartje ----------
  "tag.beds": { one: "{n} bed", other: "{n} bedden" },
  "tag.noOvernight": "Geen overnachting",
  "tag.usuallyServiced": "Meestal bewaakt",
  "tag.shower": "Douche",
  "tag.winterRoom": "Winterruimte",
  "tag.dogsWelcome": "Honden welkom",
  "tag.noDogs": "Geen honden",

  // ---------- beschikbaarheid ----------
  "avail.free": "Vrij {range}",
  "avail.fewest": " · minimum over je nachten",
  "avail.full": "Vol",
  "avail.beds": { one: "{n} bed", other: "{n} bedden" },
  "avail.nextFree": "Eerstvolgende vrije nacht: {date} ({n} bedden)",
  "avail.none": "De komende maanden niets vrij",
  "avail.notLoaded": "availability.json is niet geladen — voer fetch_availability.py uit",
  "avail.asOf": "beschikbaarheid van {time}",
  "avail.nightsPrefix": "{n} nachten · ",

  // ---------- boeken en contact ----------
  "book.online": "Online boeken →",
  "book.aria": "{hut} online boeken (opent in een nieuw tabblad)",
  "call.label": "{phone} bellen",
  "call.aria": "{hut} bellen, {phone}",
  "contact.website": "Website",
  "contact.websiteAria": "Website van {hut}, {host} (opent in een nieuw tabblad)",
  "contact.email": "E-mail",
  "contact.emailAria": "E-mail naar {hut}, {email}",
  "band.notBookable": "Niet online te boeken",
  "band.notBookableNoContact": "Niet online te boeken · geen contactgegevens bekend",

  // ---------- het venster van een hut ----------
  "detail.description": "Beschrijving",
  "detail.readMore": "Lees meer",
  "detail.showLess": "Minder",
  "detail.photoCredit": "Foto:",
  "detail.halfBoard": " · halfpension €{n}",
  "detail.dogsWelcome": " · honden welkom",
  "detail.noDogs": " · geen honden",
  "detail.priceList": "prijslijst",
  "detail.priceListAria": "Prijslijst van {hut}, PDF (opent in een nieuw tabblad)",
  "detail.closeAria": "{hut} sluiten",
  "detail.translatedNote": "Vertaald",
  "detail.sourceNote": "Tekst van de hut, in het {language}",
  "detail.showOriginal": "toon de tekst van de hut",
  "detail.showTranslation": "toon de vertaling",
  "language.de": "Duits",
  "language.en": "Engels",
  "language.fr": "Frans",
  "language.it": "Italiaans",

  // ---------- filters ----------
  "filter.available": "Vrij (nachten)",
  "filter.region": "Regio",
  "filter.roomType": "Slaapplek",
  "filter.roomTypeNote": "Een hut met slaapzalen én privékamers telt bij allebei.",
  "filter.booking": "Boeken",
  "filter.type": "Soort hut",
  "filter.elevation": "Hoogte",
  "filter.warden": "Bewaking",
  "filter.association": "Vereniging",
  "filter.amenities": "Voorzieningen",
  "pill.all": "Alles",
  "pill.any": "Maakt niet uit",
  "pill.unlisted": "Niet vermeld",
  "pill.bookableOnline": "Online te boeken",
  "pill.hasShower": "Met douche",
  "label.roomTypeUnlisted": "Slaapplek niet vermeld",
  "label.assocUnlisted": "Vereniging niet vermeld",
  "elev.e1": "< {n} m",
  "elev.e2": "{a}–{b} m",
  "elev.e3": "{a}–{b} m",
  "elev.e4": "{a}–{b} m",
  "elev.e5": "{n} m +",
  "elev.unknown": "Hoogte onbekend",
  "more.button": "Meer filters",
  "more.applied": { one: "{n} filter actief", other: "{n} filters actief" },
  "more.closeAria": "Meer filters sluiten",
  "more.done": "Klaar",
  "more.clear": "Wissen",
  "more.show": { one: "{n} hut tonen", other: "{n} hutten tonen" },
  "chip.removeAria": "Filter {label} verwijderen",
  "chip.query": "“{q}”",
  "word.or": " of ",
  "clear.filters": "Filters wissen",
  "clear.dates": "Datums wissen",

  // ---------- het aantal boven de resultaten ----------
  "count.unlistedHuts": "{n} niet vermelde hutten",
  "count.withSpace": "{n} hutten met plek",
  "count.huts": "{n} hutten",
  "count.ofHuts": " van {n} hutten",
  "count.unlistedTail": " · {n} niet vermeld",
  "count.roomFirst": " · {n} met {rooms} eerst",
  "count.noneKnown": " · geen bekend met {rooms}",

  // ---------- resultaten ----------
  "unlisted.heading": { one: "Niet vermeld · {n} hut", other: "Niet vermeld · {n} hutten" },
  "unlisted.noteDatesRoom":
    "Vrije bedden onbekend. Misschien hebben ze ook {rooms} vrij. Bel of kijk op de website van de hut.",
  "unlisted.noteDates":
    "Vrije bedden onbekend. Bel of kijk op de website van de hut of jouw datums vrij zijn.",
  "unlisted.noteRoom":
    "Slaapplekken onbekend. Misschien hebben ze ook {rooms}. Bel of kijk op de website van de hut.",
  "list.showingFirst": "De eerste {limit} worden getoond — verfijn de filters voor de andere {n}.",
  "list.elevationNote": "* hoogte geschat op basis van de coördinaten",
  "list.backToFilters": "↑ Terug naar de filters",

  // ---------- niets gevonden ----------
  "empty.noAvail": "Beschikbaarheid is niet geladen",
  "empty.nothingFreeNights": "Niets vrij voor alle {n} nachten",
  "empty.nothingFreeNight": "Die nacht is niets vrij",
  "empty.noMatch": "Geen enkele hut past",
  "empty.noAvailNote":
    "De aantallen bedden ontbreken, dus er kan niets als vrij getoond worden. Dat is een dataprobleem, geen lege zoekopdracht.",
  "empty.searchingFor": "Gezocht: {list}",
  "empty.nothingToShow": "Er is niets te tonen.",
  "empty.tryOneNight": "1 nacht proberen",
  "empty.tryNights": "{n} nachten proberen",
  "empty.drop": { one: "{label} weglaten · {n} hut", other: "{label} weglaten · {n} hutten" },
  "empty.nights": { one: "1 nacht", other: "{n} nachten achter elkaar" },

  // ---------- kaart en weergave ----------
  "view.aria": "Weergave",
  "view.list": "Lijst",
  "view.split": "Gedeeld",
  "view.map": "Kaart",
  "map.aria": "Kaart met de passende hutten",
  "map.srNote":
    "Kaart met de passende hutten. De pins kun je met de pijltjestoetsen en de plus- en mintoetsen verschuiven en zoomen, maar niet met het toetsenbord openen — gebruik daarvoor de huttenlijst, daar opent elke hut dezelfde details.",
  "legend.bookable": "online te boeken",
  "legend.bookableShort": "te boeken",
  "legend.contact": "hut zelf bellen",
  "legend.contactShort": "hut bellen",
  "top.aria": "Terug naar boven",
  "top.title": "Naar boven",

  // ---------- de kalender ----------
  "date.checkIn": "Aankomst",
  "date.checkOut": "Vertrek",
  "date.add": "Datum kiezen",
  "date.clear": "Wissen",
  "date.dialogAria": "Kies je datums",
  "date.prevMonth": "Vorige maand",
  "date.nextMonth": "Volgende maand",
  "date.pickCheckIn": "Kies je aankomstdag",
  "date.pickCheckOut": "Kies nu het vertrek — tot {n} nachten",
  "date.dayAria": "{mode} {day} {month} {year}",
  "date.nights": { one: "{n} nacht", other: "{n} nachten" },
  "date.checkInPending": "Aankomst {date} · kies de vertrekdatum",
  "date.noDates": "Geen datums — alle hutten worden getoond",

  // ---------- taalmenu ----------
  "lang.label": "Taal",
  "lang.aria": "Taal: {name}",

  // ---------- voet ----------
  "footer.imprint": "Colofon",
  "footer.privacy": "Privacy",
  "footer.osmBefore": "Huttendata ©",
  "footer.osmAfter": "bijdragers",
};
