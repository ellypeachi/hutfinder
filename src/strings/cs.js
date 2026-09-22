/* Čeština — vykání, jak píší české horské a rezervační weby, se slovníkem,
   který používá alpenverein.cz: horská chata, noclehárna, zimní místnost.

   Typy chat zůstávají německy (Schutzhütte, Alm, Jausenstation) — tak jsou
   označené na chatě i na mapě.

   Věty s {rooms} jsou napsané tak, aby nepotřebovaly skloňování: místo
   „s {rooms}“ je v nich „v této kategorii“. Čeština by jinak potřebovala
   pro každý pád jiný tvar. */
export const cs = {
  // ---------- hlavička ----------
  "site.tagline": "Najděte a rezervujte chaty v Rakousku.",
  "search.aria": "Hledat chaty podle názvu",
  "search.placeholder": "Hledat podle názvu…",
  "status.loading": "Načítají se chaty…",
  "status.errorBefore": "huts.json se nepodařilo načíst — je soubor ve složce ",
  "status.errorAfter": "?",
  "skip.results": "Přejít na seznam chat",
  "skip.map": "Přejít na mapu",

  // ---------- slovník ----------
  "type.schutzhuette": "Schutzhütte",
  "type.alm": "Alm",
  "type.jausenstation": "Jausenstation",
  "warden.bewirtschaftet": "Obsluhovaná",
  "warden.bewartet": "Částečně obsluhovaná",
  "warden.selbstversorger": "Samoobslužná",
  "assoc.alpine_club": "Alpský spolek",
  "assoc.naturfreunde": "Naturfreunde",
  "assoc.private": "Soukromá",
  "bucket.dorm": "Noclehárna",
  "bucket.shared": "Vícelůžkový pokoj",
  "bucket.priv": "Soukromý pokoj",
  "bucketPlural.dorm": "noclehárny",
  "bucketPlural.shared": "vícelůžkové pokoje",
  "bucketPlural.priv": "soukromé pokoje",
  "region.other": "Jiné/Neznámé",

  // ---------- štítky na kartě ----------
  "tag.beds": { one: "{n} lůžko", few: "{n} lůžka", other: "{n} lůžek" },
  "tag.noOvernight": "Bez noclehu",
  "tag.usuallyServiced": "Většinou obsluhovaná",
  "tag.shower": "Sprcha",
  "tag.winterRoom": "Zimní místnost",
  "tag.dogsWelcome": "Psi vítáni",
  "tag.noDogs": "Bez psů",

  // ---------- dostupnost ----------
  "avail.free": "Volno {range}",
  "avail.fewest": " · nejméně ze všech vašich nocí",
  "avail.full": "Obsazeno",
  "avail.beds": { one: "{n} lůžko", few: "{n} lůžka", other: "{n} lůžek" },
  "avail.nextFree": "Nejbližší volná noc: {date} ({n} lůžek)",
  "avail.none": "V nejbližších měsících nic volného",
  "avail.notLoaded": "availability.json se nenačetl — spusťte fetch_availability.py",
  "avail.asOf": "dostupnost k {time}",
  "avail.nightsPrefix": "{n} nocí · ",

  // ---------- rezervace a kontakt ----------
  "book.online": "Rezervovat online →",
  "book.aria": "Rezervovat {hut} online (otevře se nová karta)",
  "call.label": "Zavolat {phone}",
  "call.aria": "Zavolat {hut}, {phone}",
  "contact.website": "Web",
  "contact.websiteAria": "Web chaty {hut}, {host} (otevře se nová karta)",
  "contact.email": "E-mail",
  "contact.emailAria": "Napsat chatě {hut}, {email}",
  "band.notBookable": "Nelze rezervovat online",
  "band.notBookableNoContact": "Nelze rezervovat online · není uveden kontakt",

  // ---------- okno chaty ----------
  "detail.description": "Popis",
  "detail.readMore": "Číst dál",
  "detail.showLess": "Méně",
  "detail.photoCredit": "Foto:",
  "detail.halfBoard": " · polopenze €{n}",
  "detail.dogsWelcome": " · psi vítáni",
  "detail.noDogs": " · bez psů",
  "detail.priceList": "ceník",
  "detail.priceListAria": "Ceník chaty {hut}, PDF (otevře se nová karta)",
  "detail.closeAria": "Zavřít {hut}",
  "detail.translatedNote": "Přeloženo",
  "detail.sourceNote": "Text chaty, v {language}",
  "detail.showOriginal": "zobrazit text chaty",
  "detail.showTranslation": "zobrazit překlad",
  "language.de": "němčině",
  "language.en": "angličtině",
  "language.fr": "francouzštině",
  "language.it": "italštině",

  // ---------- filtry ----------
  "filter.available": "Volno (noci)",
  "filter.region": "Region",
  "filter.roomType": "Nocleh",
  "filter.roomTypeNote": "Chata s noclehárnou i soukromými pokoji se počítá do obou.",
  "filter.booking": "Rezervace",
  "filter.type": "Typ chaty",
  "filter.elevation": "Nadmořská výška",
  "filter.warden": "Obsluha",
  "filter.association": "Spolek",
  "filter.amenities": "Vybavení",
  "pill.all": "Vše",
  "pill.any": "Nezáleží",
  "pill.unlisted": "Neuvedeno",
  "pill.bookableOnline": "Rezervace online",
  "pill.hasShower": "Se sprchou",
  "label.roomTypeUnlisted": "Nocleh neuveden",
  "label.assocUnlisted": "Spolek neuveden",
  "elev.e1": "< {n} m",
  "elev.e2": "{a}–{b} m",
  "elev.e3": "{a}–{b} m",
  "elev.e4": "{a}–{b} m",
  "elev.e5": "{n} m +",
  "elev.unknown": "Výška neznámá",
  "more.button": "Další filtry",
  "more.applied": {
    one: "{n} aktivní filtr",
    few: "{n} aktivní filtry",
    other: "{n} aktivních filtrů",
  },
  "more.closeAria": "Zavřít další filtry",
  "more.done": "Hotovo",
  "more.clear": "Vymazat",
  "more.show": {
    one: "Zobrazit {n} chatu",
    few: "Zobrazit {n} chaty",
    other: "Zobrazit {n} chat",
  },
  "chip.removeAria": "Odebrat filtr {label}",
  "chip.query": "„{q}“",
  "word.or": " nebo ",
  "clear.filters": "Zrušit filtry",
  "clear.dates": "Zrušit termín",

  // ---------- počet nad výsledky ----------
  "count.unlistedHuts": "{n} chat bez údajů",
  "count.withSpace": "{n} chat s volnem",
  "count.huts": "{n} chat",
  "count.ofHuts": " z {n} chat",
  "count.unlistedTail": " · {n} bez údajů",
  "count.roomFirst": " · {n} v této kategorii nejdřív",
  "count.noneKnown": " · žádná známá v této kategorii",

  // ---------- výsledky ----------
  "unlisted.heading": {
    one: "Bez údajů · {n} chata",
    few: "Bez údajů · {n} chaty",
    other: "Bez údajů · {n} chat",
  },
  "unlisted.noteDatesRoom":
    "Volná lůžka neznámá. Možná mají volno i v této kategorii. Zavolejte nebo se podívejte na web chaty.",
  "unlisted.noteDates":
    "Volná lůžka neznámá. Zavolejte nebo se podívejte na web chaty, jestli je ve vašem termínu volno.",
  "unlisted.noteRoom":
    "Typy noclehu neznámé. Možná mají i tuto kategorii. Zavolejte nebo se podívejte na web chaty.",
  "list.showingFirst": "Zobrazuje se prvních {limit} — zužte filtry, ať uvidíte zbylých {n}.",
  "list.elevationNote": "* výška odhadnutá ze souřadnic",
  "list.backToFilters": "↑ Zpět na filtry",

  // ---------- nic nenalezeno ----------
  "empty.noAvail": "Dostupnost se nenačetla",
  "empty.nothingFreeNights": "Na všechny {n} noci není nic volné",
  "empty.nothingFreeNight": "Tu noc není nic volné",
  "empty.noMatch": "Žádná chata neodpovídá",
  "empty.noAvailNote":
    "Chybí počty lůžek, takže nelze nic zobrazit jako volné. To je problém s daty, ne prázdné hledání.",
  "empty.searchingFor": "Hledáno: {list}",
  "empty.nothingToShow": "Není co zobrazit.",
  "empty.tryOneNight": "Zkusit 1 noc",
  "empty.tryNights": "Zkusit {n} nocí",
  "empty.drop": {
    one: "Vynechat {label} · {n} chata",
    few: "Vynechat {label} · {n} chaty",
    other: "Vynechat {label} · {n} chat",
  },
  "empty.nights": { one: "1 noc", few: "{n} noci po sobě", other: "{n} nocí po sobě" },

  // ---------- mapa a zobrazení ----------
  "view.aria": "Zobrazení",
  "view.list": "Seznam",
  "view.split": "Kombinace",
  "view.map": "Mapa",
  "map.aria": "Mapa odpovídajících chat",
  "map.srNote":
    "Mapa odpovídajících chat. Body se dají posouvat a přibližovat šipkami a klávesami plus a minus, ale klávesnicí je nelze otevřít — použijte seznam chat, kde každá chata otevře stejné údaje.",
  "legend.bookable": "rezervace online",
  "legend.bookableShort": "online",
  "legend.contact": "zavolat přímo chatě",
  "legend.contactShort": "zavolat",
  "top.aria": "Zpět na začátek stránky",
  "top.title": "Nahoru",

  // ---------- kalendář ----------
  "date.checkIn": "Příjezd",
  "date.checkOut": "Odjezd",
  "date.add": "Vybrat datum",
  "date.clear": "Vymazat",
  "date.dialogAria": "Vyberte termín",
  "date.prevMonth": "Předchozí měsíc",
  "date.nextMonth": "Další měsíc",
  "date.pickCheckIn": "Vyberte den příjezdu",
  "date.pickCheckOut": "Teď vyberte odjezd — až {n} nocí",
  "date.dayAria": "{mode} {day}. {month} {year}",
  "date.nights": { one: "{n} noc", few: "{n} noci", other: "{n} nocí" },
  "date.checkInPending": "Příjezd {date} · vyberte odjezd",
  "date.noDates": "Bez termínu — zobrazují se všechny chaty",

  // ---------- nabídka jazyků ----------
  "lang.label": "Jazyk",
  "lang.aria": "Jazyk: {name}",

  // ---------- patička ----------
  "footer.imprint": "Tiráž",
  "footer.privacy": "Soukromí",
  "footer.osmBefore": "Data chat ©",
  "footer.osmAfter": "přispěvatelé",
};
