# Hüttenfinder

[Hüttenfinder](https://www.hutfinder.at) helps people find Austrian alpine huts
by live bed availability, then book directly. It covers 1,524 huts. Unlike
other hut directories, it's booking-first: filter by free beds, region and
room type, then go straight to the booking page.

## Running locally

```bash
npm install
npm run dev
```

Add `-- --host` to open the dev server on a phone on the same wifi.

```bash
npm run build   # production build into dist/
npm run lint
```

Stack: React 19, Vite 8, react-leaflet 5, plain CSS. Map tiles come from
basemap.at inside Austria and OpenStreetMap outside it.

## Deploying

Pushing to `main` puts the site live: `deploy.yml` builds and publishes to
GitHub Pages on every push. A separate workflow, `refresh-availability.yml`,
commits an updated `public/availability.json` a few times a day.

See [CLAUDE.md](./CLAUDE.md) for a fuller map of the codebase and working
conventions.
