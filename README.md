# Chronos Historica

A spatio-temporal comparative engine: a map and timeline from 2500 BCE to 2026 CE that sets biblical eras, 16 epigraphic synchronisms, secular geopolitical events and 12 thinkers and pioneers side by side, applying the same historiographical tests to each.

## Views

- **Map**: markers for every entity active in the current focus window, historical routes, and a synchronized feed.
- **Matrix**: manuscript-gap spectrum, a 12-figure comparison table, and the five criteria of authenticity.
- **Figures**: a catalog of the twelve figures, each with evidence, lineage, mortality and modern-impact dossiers.
- **Diagnostics**: 16 assertions run against the live data and interface on every load.

## Building

The site is one self-contained file, `index.html`, assembled from the sources:

```
src/data.js     data model (biblical, secular, intersections, figures, matrix, routes)
src/app.js      map, scrubber, feed, inspector, views, diagnostics
src/index.html  markup and styles
vendor/         Leaflet stylesheet and Natural Earth land outlines (world-atlas 2.0.2)
```

```bash
node build.mjs vendor
```

This writes `index.html` (the website) and `chronos-historica.html` (a body-only copy for hosts that supply their own document skeleton).

## Credits

Map engine: [Leaflet](https://leafletjs.com) 1.9.4. Coastlines: [Natural Earth](https://www.naturalearthdata.com) via world-atlas. Museum accession numbers are carried from the original specification and should be verified before citation.
