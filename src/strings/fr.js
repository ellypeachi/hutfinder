/* Français — vouvoiement, comme les sites des clubs alpins, avec leur
   vocabulaire : refuge, dortoir, gardé et non gardé.

   Les types de cabane gardent leur nom allemand (Schutzhütte, Alm,
   Jausenstation) : c'est ce qui est écrit sur la cabane et sur la carte.
   Espace insécable avant « : » et à l'intérieur des guillemets. */
export const fr = {
  // ---------- en-tête ----------
  "site.tagline": "Trouvez et réservez des refuges en Autriche.",
  "search.aria": "Rechercher un refuge par nom",
  "search.placeholder": "Rechercher par nom…",
  "status.loading": "Chargement des refuges…",
  "status.errorBefore": "Impossible de charger huts.json — vérifiez qu'il est dans le dossier ",
  "status.errorAfter": ".",
  "skip.results": "Aller aux refuges",
  "skip.map": "Aller à la carte",

  // ---------- vocabulaire des refuges ----------
  "type.schutzhuette": "Schutzhütte",
  "type.alm": "Alm",
  "type.jausenstation": "Jausenstation",
  "warden.bewirtschaftet": "Gardé",
  "warden.bewartet": "Partiellement gardé",
  "warden.selbstversorger": "Non gardé",
  "assoc.alpine_club": "Club alpin",
  "assoc.naturfreunde": "Naturfreunde",
  "assoc.private": "Privé",
  "bucket.dorm": "Dortoir",
  "bucket.shared": "Chambre partagée",
  "bucket.priv": "Chambre privée",
  "bucketPlural.dorm": "dortoirs",
  "bucketPlural.shared": "chambres partagées",
  "bucketPlural.priv": "chambres privées",
  "region.other": "Autre/Inconnu",

  // ---------- étiquettes d'une fiche ----------
  "tag.beds": { one: "{n} lit", other: "{n} lits" },
  "tag.noOvernight": "Pas de nuitée",
  "tag.usuallyServiced": "Généralement gardé",
  "tag.shower": "Douche",
  "tag.winterRoom": "Refuge d'hiver",
  "tag.dogsWelcome": "Chiens acceptés",
  "tag.noDogs": "Chiens non acceptés",

  // ---------- disponibilité ----------
  "avail.free": "Libre {range}",
  "avail.fewest": " · minimum sur vos nuits",
  "avail.full": "Complet",
  "avail.beds": { one: "{n} lit", other: "{n} lits" },
  "avail.nextFree": "Prochaine nuit libre : {date} ({n} lits)",
  "avail.none": "Rien de libre dans les prochains mois",
  "avail.notLoaded": "availability.json n'a pas été chargé — lancez fetch_availability.py",
  "avail.asOf": "disponibilité au {time}",
  "avail.nightsPrefix": "{n} nuits · ",

  // ---------- réserver et contacter ----------
  "book.online": "Réserver en ligne →",
  "book.aria": "Réserver {hut} en ligne (ouvre un nouvel onglet)",
  "call.label": "Appeler {phone}",
  "call.aria": "Appeler {hut}, {phone}",
  "contact.website": "Site web",
  "contact.websiteAria": "Site de {hut}, {host} (ouvre un nouvel onglet)",
  "contact.email": "E-mail",
  "contact.emailAria": "Écrire à {hut}, {email}",
  "band.notBookable": "Pas réservable en ligne",
  "band.notBookableNoContact": "Pas réservable en ligne · aucun contact indiqué",

  // ---------- la fenêtre d'un refuge ----------
  "detail.description": "Description",
  "detail.readMore": "Lire la suite",
  "detail.showLess": "Réduire",
  "detail.photoCredit": "Photo :",
  "detail.halfBoard": " · demi-pension {n} €",
  "detail.dogsWelcome": " · chiens acceptés",
  "detail.noDogs": " · chiens non acceptés",
  "detail.priceList": "tarifs",
  "detail.priceListAria": "Tarifs de {hut}, PDF (ouvre un nouvel onglet)",
  "detail.closeAria": "Fermer {hut}",
  "detail.translatedNote": "Traduit",
  "detail.sourceNote": "Texte du refuge, en {language}",
  "detail.showOriginal": "afficher le texte du refuge",
  "detail.showTranslation": "afficher la traduction",
  "language.de": "allemand",
  "language.en": "anglais",
  "language.fr": "français",
  "language.it": "italien",

  // ---------- filtres ----------
  "filter.available": "Libre (nuits)",
  "filter.region": "Région",
  "filter.roomType": "Couchage",
  "filter.roomTypeNote": "Un refuge avec dortoir et chambres privées compte dans les deux.",
  "filter.booking": "Réservation",
  "filter.type": "Type",
  "filter.elevation": "Altitude",
  "filter.warden": "Gardiennage",
  "filter.association": "Association",
  "filter.amenities": "Équipements",
  "pill.all": "Tous",
  "pill.any": "Peu importe",
  "pill.unlisted": "Non indiqué",
  "pill.bookableOnline": "Réservable en ligne",
  "pill.hasShower": "Avec douche",
  "label.roomTypeUnlisted": "Couchage non indiqué",
  "label.assocUnlisted": "Association non indiquée",
  "elev.e1": "< {n} m",
  "elev.e2": "{a}–{b} m",
  "elev.e3": "{a}–{b} m",
  "elev.e4": "{a}–{b} m",
  "elev.e5": "{n} m +",
  "elev.unknown": "Altitude inconnue",
  "more.button": "Plus de filtres",
  "more.applied": { one: "{n} filtre actif", other: "{n} filtres actifs" },
  "more.closeAria": "Fermer les filtres",
  "more.done": "Terminé",
  "more.clear": "Effacer",
  "more.show": { one: "Voir {n} refuge", other: "Voir {n} refuges" },
  "chip.removeAria": "Retirer le filtre {label}",
  "chip.query": "« {q} »",
  "word.or": " ou ",
  "clear.filters": "Effacer les filtres",
  "clear.dates": "Effacer les dates",

  // ---------- le nombre au-dessus des résultats ----------
  "count.unlistedHuts": "{n} refuges non indiqués",
  "count.withSpace": "{n} refuges avec de la place",
  "count.huts": "{n} refuges",
  "count.ofHuts": " sur {n} refuges",
  "count.unlistedTail": " · {n} non indiqués",
  "count.roomFirst": " · {n} avec des {rooms} d'abord",
  "count.noneKnown": " · aucun connu avec des {rooms}",

  // ---------- résultats ----------
  "unlisted.heading": { one: "Non indiqué · {n} refuge", other: "Non indiqué · {n} refuges" },
  "unlisted.noteDatesRoom":
    "Lits libres inconnus. Ils ont peut-être aussi des {rooms} libres. Appelez le refuge ou regardez son site.",
  "unlisted.noteDates":
    "Lits libres inconnus. Appelez le refuge ou regardez son site pour vos dates.",
  "unlisted.noteRoom":
    "Couchages inconnus. Ils ont peut-être aussi des {rooms}. Appelez le refuge ou regardez son site.",
  "list.showingFirst": "Les {limit} premiers sont affichés — affinez les filtres pour voir les {n} autres.",
  "list.elevationNote": "* altitude estimée à partir des coordonnées",
  "list.backToFilters": "↑ Retour aux filtres",

  // ---------- rien trouvé ----------
  "empty.noAvail": "Les disponibilités n'ont pas été chargées",
  "empty.nothingFreeNights": "Rien de libre pour les {n} nuits",
  "empty.nothingFreeNight": "Rien de libre cette nuit-là",
  "empty.noMatch": "Aucun refuge ne correspond",
  "empty.noAvailNote":
    "Les nombres de lits manquent, rien ne peut donc être affiché comme libre. C'est un problème de données, pas une recherche vide.",
  "empty.searchingFor": "Recherche : {list}",
  "empty.nothingToShow": "Il n'y a rien à afficher.",
  "empty.tryOneNight": "Essayer 1 nuit",
  "empty.tryNights": "Essayer {n} nuits",
  "empty.drop": { one: "Retirer {label} · {n} refuge", other: "Retirer {label} · {n} refuges" },
  "empty.nights": { one: "1 nuit", other: "{n} nuits d'affilée" },

  // ---------- carte et affichage ----------
  "view.aria": "Affichage",
  "view.list": "Liste",
  "view.split": "Mixte",
  "view.map": "Carte",
  "map.aria": "Carte des refuges correspondants",
  "map.srNote":
    "Carte des refuges correspondants. Les repères se déplacent et se zooment avec les flèches et les touches plus et moins, mais ne s'ouvrent pas au clavier — utilisez la liste, où chaque refuge ouvre les mêmes détails.",
  "legend.bookable": "réservable en ligne",
  "legend.bookableShort": "réservable",
  "legend.contact": "appeler le refuge",
  "legend.contactShort": "appeler",
  "top.aria": "Retour en haut de la page",
  "top.title": "Haut de page",

  // ---------- le calendrier ----------
  "date.checkIn": "Arrivée",
  "date.checkOut": "Départ",
  "date.add": "Choisir une date",
  "date.clear": "Effacer",
  "date.dialogAria": "Choisissez vos dates",
  "date.prevMonth": "Mois précédent",
  "date.nextMonth": "Mois suivant",
  "date.pickCheckIn": "Choisissez votre jour d'arrivée",
  "date.pickCheckOut": "Choisissez le départ — jusqu'à {n} nuits",
  "date.dayAria": "{mode} {day} {month} {year}",
  "date.nights": { one: "{n} nuit", other: "{n} nuits" },
  "date.checkInPending": "Arrivée {date} · choisissez le départ",
  "date.noDates": "Aucune date — tous les refuges sont affichés",

  // ---------- menu des langues ----------
  "lang.label": "Langue",
  "lang.aria": "Langue : {name}",

  // ---------- pied de page ----------
  "footer.faq": "FAQ",
  "footer.imprint": "Mentions légales",
  "footer.privacy": "Confidentialité",
  "footer.osmBefore": "Données des refuges ©",
  "footer.osmAfter": "contributeurs",
};
