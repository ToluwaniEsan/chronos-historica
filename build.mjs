// Assembles the page from src/ plus vendored Leaflet CSS and Natural Earth land data.
// Usage: node build.mjs [vendorDir]
// Outputs:
//   index.html              standalone website (GitHub Pages serves this)
//   chronos-historica.html  body-only version for the Claude artifact host, which adds its own skeleton
import { readFileSync, writeFileSync } from 'node:fs';
const vendor = process.argv[2] || 'vendor';
const read = p => readFileSync(p, 'utf8');
const css = read(`${vendor}/leaflet.css`).replace(/url\([^)]*\)/g, 'none');
const land = JSON.stringify(JSON.parse(read(`${vendor}/land-50m.json`)));
if (/<\/script/i.test(land)) throw new Error('land data contains </script');

const html = read('src/index.html')
  .replace('/*__LEAFLET_CSS__*/', () => css)
  .replace('/*__DATA_JS__*/', () => read('src/data.js'))
  .replace('/*__APP_JS__*/', () => read('src/app.js'))
  .replace('/*__LAND_TOPO__*/', () => land);
writeFileSync('chronos-historica.html', html);

// Standalone document: everything before the app shell belongs in <head>.
const split = html.indexOf('<div class="app">');
const head = html.slice(0, split), body = html.slice(split);
const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0b0f15"/><path d="M8 2 L14 8 L8 14 L2 8 Z" fill="#dcab4e"/></svg>');
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="A map and timeline from 2500 BCE to 2026 CE setting biblical eras, epigraphic synchronisms, secular events and twelve thinkers side by side.">
<meta name="theme-color" content="#111720">
<link rel="icon" href="${favicon}">
${head}</head>
<body>
${body}</body>
</html>
`;
writeFileSync('index.html', standalone);
console.log('built', (standalone.length / 1024).toFixed(0) + ' KB');
