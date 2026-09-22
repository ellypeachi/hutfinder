/* English — the source language, and the fallback for any key another
   language hasn't got yet. Keys are grouped by where they show up.

   {name} is filled in by t("key", { name: … }). A value written as
   { one, other } is chosen by the count passed as `count`. */
export const en = {
  // ---------- header ----------
  "site.tagline": "Find and book mountain huts in Austria.",
  "search.aria": "Search huts by name",
  "search.placeholder": "Search by name…",
  "status.loading": "Loading huts…",
  // split in two so the folder name can stay in a <code> tag
  "status.errorBefore": "Couldn't load huts.json — check it's in the ",
  "status.errorAfter": " folder.",
  "skip.results": "Skip to hut results",
  "skip.map": "Skip to the map",

  // ---------- hut vocabulary ----------
  "type.schutzhuette": "Schutzhütte",
  "type.alm": "Alm",
  "type.jausenstation": "Jausenstation",
  "warden.bewirtschaftet": "Serviced",
  "warden.bewartet": "Attended",
  "warden.selbstversorger": "Self-service",
  "assoc.alpine_club": "Alpine club",
  "assoc.naturfreunde": "Naturfreunde",
  "assoc.private": "Private",
  "bucket.dorm": "Dormitory",
  "bucket.shared": "Shared room",
  "bucket.priv": "Private room",
  "bucketPlural.dorm": "dorms",
  "bucketPlural.shared": "shared rooms",
  "bucketPlural.priv": "private rooms",
  "region.other": "Other/Unknown",

  // ---------- tags on a card ----------
  "tag.beds": { one: "{n} bed", other: "{n} beds" },
  "tag.noOvernight": "No overnight",
  "tag.usuallyServiced": "Usually serviced",
  "tag.shower": "Shower",
  "tag.winterRoom": "Winter room",
  "tag.dogsWelcome": "Dogs welcome",
  "tag.noDogs": "No dogs",

  // ---------- availability ----------
  "avail.free": "Free {range}",
  "avail.fewest": " · fewest across your nights",
  "avail.full": "Full",
  "avail.beds": { one: "{n} bed", other: "{n} beds" },
  "avail.nextFree": "Next free: {date} ({n} beds)",
  "avail.none": "No open dates in the next months",
  "avail.notLoaded": "availability.json didn’t load — run fetch_availability.py",
  "avail.asOf": "availability as of {time}",
  "avail.nightsPrefix": "{n} nights · ",

  // ---------- booking and contact ----------
  "book.online": "Book online →",
  "book.aria": "Book {hut} online (opens in a new tab)",
  "call.label": "Call {phone}",
  "call.aria": "Call {hut}, {phone}",
  "contact.website": "Website",
  "contact.websiteAria": "{hut} website, {host} (opens in a new tab)",
  "contact.email": "Email",
  "contact.emailAria": "Email {hut}, {email}",
  "band.notBookable": "Not bookable online",
  "band.notBookableNoContact": "Not bookable online · no contact details listed",

  // ---------- hut pop-up ----------
  "detail.description": "Description",
  "detail.readMore": "Read more",
  "detail.showLess": "Show less",
  "detail.photoCredit": "Photo:",
  "detail.halfBoard": " · half board €{n}",
  "detail.dogsWelcome": " · dogs welcome",
  "detail.noDogs": " · no dogs",
  "detail.priceList": "price list",
  "detail.priceListAria": "{hut} price list, PDF (opens in a new tab)",
  "detail.closeAria": "Close {hut}",

  // ---------- filters ----------
  "filter.available": "Available (nights)",
  "filter.region": "Region",
  "filter.roomType": "Room type",
  "filter.roomTypeNote": "A hut with dorms and private rooms counts under both.",
  "filter.booking": "Booking",
  "filter.type": "Type",
  "filter.elevation": "Elevation",
  "filter.warden": "Warden",
  "filter.association": "Association",
  "filter.amenities": "Amenities",
  "pill.all": "All",
  "pill.any": "Any",
  "pill.unlisted": "Unlisted",
  "pill.bookableOnline": "Bookable online",
  "pill.hasShower": "Has shower",
  "label.roomTypeUnlisted": "Room type unlisted",
  "label.assocUnlisted": "Association unlisted",
  "elev.e1": "< {n} m",
  "elev.e2": "{a}–{b} m",
  "elev.e3": "{a}–{b} m",
  "elev.e4": "{a}–{b} m",
  "elev.e5": "{n} m +",
  "elev.unknown": "Elevation unknown",
  "more.button": "More filters",
  "more.applied": { one: "{n} filter applied", other: "{n} filters applied" },
  "more.closeAria": "Close more filters",
  "more.done": "Done",
  "more.clear": "Clear",
  "more.show": { one: "Show {n} hut", other: "Show {n} huts" },
  "chip.removeAria": "Remove filter {label}",
  "chip.query": "“{q}”",
  // joins two filter values in a sentence: "Tirol or Salzburg"
  "word.or": " or ",
  "clear.filters": "Clear filters",
  "clear.dates": "Clear dates",

  // ---------- the count above the results ----------
  "count.unlistedHuts": "{n} unlisted huts",
  "count.withSpace": "{n} huts with space",
  "count.huts": "{n} huts",
  "count.ofHuts": " of {n} huts",
  "count.unlistedTail": " · {n} unlisted",
  "count.roomFirst": " · {n} with {rooms} first",
  "count.noneKnown": " · none known to have {rooms}",

  // ---------- results ----------
  "unlisted.heading": { one: "Unlisted · {n} hut", other: "Unlisted · {n} huts" },
  "unlisted.noteDatesRoom":
    "Bed availability unknown. They may have {rooms} free too. Call or check the hut’s website to ask.",
  "unlisted.noteDates":
    "Bed availability unknown. Call or check the hut’s website to ask about your dates.",
  "unlisted.noteRoom":
    "Room types unknown. They may have {rooms} too. Call or check the hut’s website to ask.",
  "list.showingFirst": "Showing the first {limit} — narrow the filters to see the other {n}.",
  "list.elevationNote": "* elevation estimated from coordinates",
  "list.backToFilters": "↑ Back to filters",

  // ---------- nothing found ----------
  "empty.noAvail": "Availability data didn't load",
  "empty.nothingFreeNights": "Nothing free for all {n} nights",
  "empty.nothingFreeNight": "Nothing free that night",
  "empty.noMatch": "No huts match",
  "empty.noAvailNote":
    "The bed counts are missing, so nothing can be shown as available. This is a data problem, not an empty search.",
  "empty.searchingFor": "Searching for: {list}",
  "empty.nothingToShow": "There is nothing to show.",
  "empty.tryOneNight": "Try 1 night",
  "empty.tryNights": "Try {n} nights",
  "empty.drop": { one: "Drop {label} · {n} hut", other: "Drop {label} · {n} huts" },
  "empty.nights": { one: "1 night", other: "{n} consecutive nights" },

  // ---------- map and view ----------
  "view.aria": "View",
  "view.list": "List",
  "view.split": "Split",
  "view.map": "Map",
  "map.aria": "Map of matching huts",
  "map.srNote":
    "Map of the matching huts. Pins can be panned and zoomed with the arrow keys and the plus and minus keys, but cannot be opened from the keyboard — use the hut list, where every hut opens the same details.",
  "legend.bookable": "bookable online",
  "legend.bookableShort": "bookable",
  "legend.contact": "contact the hut directly",
  "legend.contactShort": "contact hut",
  "top.aria": "Back to the top of the page",
  "top.title": "Back to top",

  // ---------- the calendar ----------
  "date.checkIn": "Check in",
  "date.checkOut": "Check out",
  "date.add": "Add date",
  "date.clear": "Clear",
  "date.dialogAria": "Choose your dates",
  "date.prevMonth": "Previous month",
  "date.nextMonth": "Next month",
  "date.pickCheckIn": "Pick your check-in day",
  "date.pickCheckOut": "Now pick check-out — up to {n} nights",
  "date.dayAria": "{mode} {day} {month} {year}",
  "date.nights": { one: "{n} night", other: "{n} nights" },
  "date.checkInPending": "Check-in {date} · pick a check-out date",
  "date.noDates": "No dates — showing all huts",

  // ---------- footer ----------
  "footer.imprint": "Imprint",
  "footer.privacy": "Privacy",
  "footer.osmBefore": "Hut data ©",
  "footer.osmAfter": "contributors",
};
